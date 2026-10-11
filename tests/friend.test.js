const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const repositoryPath = require.resolve("../src/repositories/friend.repository");
const roomRepositoryPath = require.resolve("../src/repositories/room.repository");
const botRepositoryPath = require.resolve("../src/repositories/bot.repository");
const servicePath = require.resolve("../src/services/friend.service");
const originalEntries = new Map(
  [repositoryPath, roomRepositoryPath, botRepositoryPath, servicePath].map(
    (path) => [path, require.cache[path]]
  )
);

const store = {
  invitations: new Map(),
  nextInvitationId: 99,
  lastPresence: null,
  async searchUsers() {
    return [{ id: 4, username: "player", presenceSessions: [{ id: 1 }] }];
  },
  async listFriends() {
    return [];
  },
  async listFriendRequests() {
    return { incoming: [], outgoing: [] };
  },
  async findUserByUsername(username) {
    return username === "missing"
      ? null
      : { id: username === "host" ? 7 : 4, username };
  },
  async createFriendRequest(senderId, receiverId) {
    store.friendRequest = { senderId, receiverId };
  },
  async respondFriendRequest(requestId, userId, accept) {
    return { requestId, userId, accepted: accept };
  },
  async removeFriend() {
    return { removed: true };
  },
  async areFriends() {
    return true;
  },
  async isOnline() {
    return true;
  },
  async touchPresence(userId, sessionId) {
    store.lastPresence = { userId, sessionId };
  },
  async createInvitation(data) {
    const invitation = {
      id: store.nextInvitationId++,
      status: "pending",
      ...data,
    };
    store.invitations.set(invitation.id, invitation);
    return invitation;
  },
  async getInvitation(id) {
    return store.invitations.get(id);
  },
  async expireAcceptedChallenge(id, senderId) {
    const invitation = store.invitations.get(id);
    if (
      !invitation ||
      invitation.senderId !== senderId ||
      invitation.status !== "accepted"
    ) {
      throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    }
    invitation.status = "expired";
    return { expired: true };
  },
  async respondInvitation(id, receiverId, accept) {
    store.invitations.get(id).status = accept ? "accepted" : "declined";
    return { accepted: accept };
  },
  async getRoomInvitation(id) {
    return store.invitations.get(id);
  },
  async markRoomInvitation(id, receiverId, status) {
    store.invitations.get(id).status = status;
    return { accepted: status === "accepted" };
  },
  async getNotifications() {
    return { friendRequests: [], invitations: [], acceptedChallenges: [] };
  },
  async cleanupStalePresence() {},
  async expireInvitations() {},
};

const roomRepository = {
  async findActiveRoomForUser() {
    return null;
  },
  async findById(id) {
    return {
      id,
      hostUserId: 7,
      status: "waiting",
      players: [{ userId: 7 }],
    };
  },
  async acceptRoomInvitation(id, userId) {
    return { id: 17, userId };
  },
};

const botRepository = {
  bots: [{ isActive: true }],
  botsByUserId: new Map(),
  async findByUserId(userId) {
    return botRepository.botsByUserId.get(userId) ?? botRepository.bots;
  },
};

function installMock(filePath, exports) {
  const entry = new Module(filePath);
  entry.filename = filePath;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filePath] = entry;
}

installMock(repositoryPath, store);
installMock(roomRepositoryPath, roomRepository);
installMock(botRepositoryPath, botRepository);
delete require.cache[servicePath];
const friendService = require(servicePath);

test("friend search reports online status without exposing presence records", async () => {
  const users = await friendService.searchUsers("play", 7);
  assert.deepEqual(users, [{ id: 4, username: "player", online: true }]);
});

test("friend requests use username and reject self requests", async () => {
  assert.deepEqual(await friendService.sendFriendRequest(7, "friend"), {
    sent: true,
  });
  assert.deepEqual(store.friendRequest, { senderId: 7, receiverId: 4 });
  await assert.rejects(
    () => friendService.sendFriendRequest(7, "missing"),
    { message: "USER_NOT_FOUND" }
  );
  await assert.rejects(
    () => friendService.sendFriendRequest(7, "host"),
    { message: "FRIEND_CANNOT_ADD_SELF" }
  );
});

test("duel challenges expire ten seconds after creation and can be accepted", async () => {
  const response = await friendService.sendChallenge(7, 4);
  assert.equal(response.invitationId, 99);
  assert.ok(response.expiresAt.getTime() > Date.now() + 9_000);
  assert.ok(response.expiresAt.getTime() <= Date.now() + 10_000);
  assert.deepEqual(await friendService.respondChallenge(99, 4, true), {
    accepted: true,
  });
  assert.equal(store.invitations.get(99).status, "accepted");
});

test("a friend without an active bot cannot accept a duel challenge", async () => {
  botRepository.botsByUserId.set(4, []);
  const { invitationId } = await friendService.sendChallenge(7, 4);

  await assert.rejects(
    () => friendService.respondChallenge(invitationId, 4, true),
    { message: "ROOM_REQUIRES_ACTIVE_BOT" }
  );
  assert.equal(store.invitations.get(invitationId).status, "pending");
  botRepository.botsByUserId.delete(4);
});

test("sender without an active bot can expire an accepted duel challenge", async () => {
  botRepository.botsByUserId.set(7, []);
  const { invitationId } = await friendService.sendChallenge(7, 4);
  await friendService.respondChallenge(invitationId, 4, true);

  assert.deepEqual(
    await friendService.expireChallengeWithoutBot(7, invitationId),
    { expired: true }
  );
  assert.equal(store.invitations.get(invitationId).status, "expired");
  botRepository.botsByUserId.delete(7);
});

test("sender with an active bot cannot expire an accepted duel challenge this way", async () => {
  botRepository.bots = [{ isActive: true }];
  const { invitationId } = await friendService.sendChallenge(7, 4);
  await friendService.respondChallenge(invitationId, 4, true);

  await assert.rejects(
    () => friendService.expireChallengeWithoutBot(7, invitationId),
    { message: "DUEL_INVITATION_CANNOT_EXPIRE" }
  );
  assert.equal(store.invitations.get(invitationId).status, "accepted");
});

test("accepted duel challenges remain available after their response deadline", async () => {
  const { invitationId } = await friendService.sendChallenge(7, 4);
  await friendService.respondChallenge(invitationId, 4, true);
  store.invitations.get(invitationId).expiresAt = new Date(Date.now() - 1);

  await friendService.getNotifications(7);

  assert.equal(store.invitations.get(invitationId).status, "accepted");
  assert.equal(await friendService.createRoomFromChallenge(7, invitationId), 4);
});

test("room invitations expire after ten seconds and join without a password", async () => {
  const response = await friendService.sendRoomInvitation(17, 7, 4);
  assert.ok(response.expiresAt.getTime() > Date.now() + 9_000);
  assert.ok(response.expiresAt.getTime() <= Date.now() + 10_000);
  const joined = await friendService.respondRoomInvitation(100, 4, true);
  assert.deepEqual(joined, { accepted: true, roomId: 17 });
});

test.after(() => {
  for (const [path, entry] of originalEntries) {
    if (entry) require.cache[path] = entry;
    else delete require.cache[path];
  }
});
