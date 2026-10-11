const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Module = require("node:module");

const roomRepositoryPath = require.resolve("../src/repositories/room.repository");
const botRepositoryPath = require.resolve("../src/repositories/bot.repository");
const schedulerPath = require.resolve("../src/services/room-scheduler");
const roomServicePath = require.resolve("../src/services/room.service");
const originalCacheEntries = new Map(
  [roomRepositoryPath, botRepositoryPath, schedulerPath, roomServicePath].map(
    (filePath) => [filePath, require.cache[filePath]]
  )
);

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "room-service-test-secret-with-at-least-32-characters";

const fixture = {
  id: 3,
  name: "Phòng thử",
  password: "room-password-123",
  passwordHash: "stored-password-hash",
  visibility: "private",
  status: "running",
  hostUserId: 7,
  pausedByUserId: null,
  players: [
    {
      userId: 7,
      slot: 0,
      pauseUsedMs: 0,
      leftAt: null,
      user: { id: 7, username: "host" },
      bot: { id: 11, name: "Bot chủ", sourceCode: "private host code" },
    },
    {
      userId: 9,
      slot: 1,
      pauseUsedMs: 0,
      leftAt: null,
      user: { id: 9, username: "guest" },
      bot: { id: 22, name: "Bot khách", sourceCode: "private guest code" },
    },
  ],
  match: {
    id: 40,
    result: { pieces: [], history: [] },
    participants: [
      {
        id: 100,
        botId: 11,
        bot: { id: 11, name: "Bot chủ", sourceCode: "private host code" },
      },
      {
        id: 101,
        botId: 22,
        bot: { id: 22, name: "Bot khách", sourceCode: "private guest code" },
      },
    ],
  },
};

const roomRepository = {
  touchedPresence: null,
  deletedRoom: false,
  createdRoom: null,
  activeRoomForUser: null,
  async create(data) {
    roomRepository.createdRoom = data;
    return { ...fixture, ...data };
  },
  async findActiveRoomForUser() {
    return roomRepository.activeRoomForUser;
  },
  async findById() {
    return fixture;
  },
  async touchPresence(roomId, sessionId, userId) {
    roomRepository.touchedPresence = { roomId, sessionId, userId };
  },
  async removePresence(roomId, sessionId) {
    roomRepository.removedPresence = { roomId, sessionId };
  },
  async requestRematch(roomId, userId, expiresAt) {
    roomRepository.requestedRematch = { roomId, userId, expiresAt };
    return {
      ...fixture,
      status: "completed",
      rematchStatus: "pending",
      players: fixture.players.map((player) => ({
        ...player,
        rematchAccepted: player.userId === userId,
      })),
    };
  },
  async respondRematch(roomId, userId, accept) {
    roomRepository.respondedRematch = { roomId, userId, accept };
    roomRepository.leftOnDecline = accept ? null : userId;
    return {
      room: accept
        ? {
            ...fixture,
            status: "waiting",
            match: null,
            rematchStatus: "none",
            players: fixture.players.map((player) => ({
              ...player,
              botId: null,
              isReady: false,
              rematchAccepted: false,
            })),
          }
        : {
            ...fixture,
            status: "completed",
            rematchStatus: "declined",
            players: fixture.players.map((player) => ({
              ...player,
              leftAt: player.userId === userId ? new Date() : null,
            })),
          },
      started: false,
      returnedToLobby: accept,
      left: !accept,
    };
  },
  async leaveRoom(roomId, userId) {
    roomRepository.leftRoom = { roomId, userId };
    return { deleted: false };
  },
  async deleteRoomAndStopMatch(roomId) {
    roomRepository.deletedRoom = roomId;
    return { deleted: true };
  },
  async listPublic() {
    return [fixture];
  },
  async listLivePublic() {
    return [fixture];
  },
  async searchByName(name) {
    roomRepository.lastSearchName = name;
    return [
      fixture,
      {
        ...fixture,
        id: 4,
        name: "Phòng công khai",
        visibility: "public",
        status: "waiting",
        match: null,
      },
    ];
  },
};
const botRepository = {
  async findByUserId() {
    return [{ isActive: true }];
  },
};
const scheduler = {
  cancelledRoom: null,
  scheduledRoom: null,
  async cancelRoom(roomId) {
    scheduler.cancelledRoom = roomId;
  },
  schedule(roomId) {
    scheduler.scheduledRoom = roomId;
  },
};

function installMock(filePath, exports) {
  const entry = new Module(filePath);
  entry.filename = filePath;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filePath] = entry;
}

installMock(roomRepositoryPath, roomRepository);
installMock(botRepositoryPath, botRepository);
installMock(schedulerPath, scheduler);
delete require.cache[roomServicePath];
const roomService = require(roomServicePath);

test("room responses reveal the room password to authorized players without exposing hashes or bot code", async () => {
  const room = await roomService.getRoom(3, 7);
  const serializedRoom = JSON.stringify(room);

  assert.equal(room.isHost, true);
  assert.equal(room.isPlayer, true);
  assert.equal(room.players[0].isCurrentUser, true);
  assert.equal(room.password, "room-password-123");
  assert.equal(room.passwordHash, undefined);
  assert.equal(room.players[0].userId, undefined);
  assert.equal(room.match.participants[0].bot.sourceCode, undefined);
  assert.doesNotMatch(serializedRoom, /stored-password-hash|private (host|guest) code/);
});

test("room listings do not expose plaintext room passwords", async () => {
  const rooms = await roomService.listPublicRooms();
  const serializedRooms = JSON.stringify(rooms);

  assert.equal(rooms[0].password, undefined);
  assert.doesNotMatch(serializedRooms, /room-password-123|stored-password-hash/);
});

test("room creation stores and returns the plaintext password for room members", async () => {
  const room = await roomService.createRoom(7, {
    name: "Phòng mới",
    password: "plain-room-password",
    visibility: "private",
  });

  assert.equal(roomRepository.createdRoom.password, "plain-room-password");
  assert.notEqual(roomRepository.createdRoom.passwordHash, "plain-room-password");
  assert.equal(room.password, "plain-room-password");
  assert.equal(room.passwordHash, undefined);
});

test("a player cannot create a room while already in another room", async () => {
  roomRepository.activeRoomForUser = { id: 8, name: "Phòng hiện tại" };
  await assert.rejects(
    () =>
      roomService.createRoom(7, {
        name: "Phòng mới",
        password: "room-password",
        visibility: "public",
      }),
    { message: "ROOM_PLAYER_ALREADY_IN_ROOM" }
  );
  roomRepository.activeRoomForUser = null;
});

test("a player cannot join a different room while already in a room", async () => {
  roomRepository.activeRoomForUser = { id: 8, name: "Phòng hiện tại" };
  await assert.rejects(
    () => roomService.joinRoom(4, 12, "correct-password"),
    { message: "ROOM_PLAYER_ALREADY_IN_ROOM" }
  );
  roomRepository.activeRoomForUser = null;
});

test("room access requires either player membership or a room viewer token", async () => {
  await assert.rejects(
    () => roomService.getRoom(3, null),
    { message: "ROOM_VIEW_ACCESS_DENIED" }
  );

  const viewerToken = jwt.sign(
    { purpose: "room-viewer", roomId: 3 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const room = await roomService.getRoom(3, null, viewerToken);

  assert.equal(room.isPlayer, false);
  assert.equal(room.isHost, false);
  assert.equal(room.password, "room-password-123");
});

test("room presence requires player or viewer access and records the session", async () => {
  await assert.rejects(
    () => roomService.touchPresence(3, null, null, "session-id"),
    { message: "ROOM_VIEW_ACCESS_DENIED" }
  );

  const viewerToken = jwt.sign(
    { purpose: "room-viewer", roomId: 3 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  await roomService.touchPresence(3, null, viewerToken, "viewer-session");
  assert.deepEqual(roomRepository.touchedPresence, {
    roomId: 3,
    sessionId: "viewer-session",
    userId: null,
  });

  await roomService.touchPresence(3, 7, null, "player-session");
  assert.deepEqual(roomRepository.touchedPresence, {
    roomId: 3,
    sessionId: "player-session",
    userId: 7,
  });
});

test("room host can dissolve an active room and stop its scheduler", async () => {
  const result = await roomService.dissolveRoom(3, 7);

  assert.deepEqual(result, { deleted: true });
  assert.equal(scheduler.cancelledRoom, 3);
  assert.equal(roomRepository.deletedRoom, 3);
  await assert.rejects(
    () => roomService.dissolveRoom(3, 9),
    { message: "ROOM_HOST_ONLY" }
  );
});

test("room host can dissolve a waiting room before bot selection is complete", async () => {
  fixture.status = "waiting";
  roomRepository.deletedRoom = false;

  const result = await roomService.leaveRoom(3, 7);

  assert.deepEqual(result, { deleted: true });
  assert.equal(roomRepository.deletedRoom, 3);
  fixture.status = "running";
});

test("guest can leave a waiting room before selecting a bot", async () => {
  fixture.status = "waiting";
  roomRepository.leftRoom = null;

  const result = await roomService.leaveRoom(3, 9);

  assert.deepEqual(result, { deleted: false });
  assert.deepEqual(roomRepository.leftRoom, { roomId: 3, userId: 9 });
  fixture.status = "running";
});

test("rematch invitations expire after ten seconds", async () => {
  fixture.status = "completed";
  const invitation = await roomService.requestRematch(3, 7);
  assert.equal(invitation.rematchStatus, "pending");
  assert.equal(invitation.players[0].rematchAccepted, true);
  assert.equal(invitation.players[1].rematchAccepted, false);
  assert.equal(roomRepository.requestedRematch.roomId, 3);
  assert.ok(
    roomRepository.requestedRematch.expiresAt.getTime() > Date.now() + 9_000
  );
  assert.ok(
    roomRepository.requestedRematch.expiresAt.getTime() <= Date.now() + 10_000
  );
  fixture.status = "running";
});

test("accepting a rematch returns both players to bot selection and ready state", async () => {
  fixture.status = "completed";
  const response = await roomService.respondRematch(3, 9, true);
  assert.equal(response.started, false);
  assert.equal(response.room.status, "waiting");
  assert.equal(response.room.match, null);
  assert.ok(response.room.players.every((player) => !player.isReady));
  assert.ok(response.room.players.every((player) => player.botId === null));
  assert.equal(response.returnedToLobby, true);
  assert.equal(response.left, false);
  assert.deepEqual(roomRepository.respondedRematch, {
    roomId: 3,
    userId: 9,
    accept: true,
  });
  assert.equal(scheduler.scheduledRoom, null);
  fixture.status = "running";
});

test("declining a rematch immediately leaves the room", async () => {
  fixture.status = "completed";
  scheduler.scheduledRoom = null;
  const response = await roomService.respondRematch(3, 9, false);
  assert.equal(response.started, false);
  assert.equal(response.left, true);
  assert.equal(response.room.isPlayer, false);
  assert.equal(roomRepository.leftOnDecline, 9);
  assert.equal(scheduler.scheduledRoom, null);
  fixture.status = "running";
});

test("viewer can explicitly remove its own room presence", async () => {
  const viewerToken = jwt.sign(
    { purpose: "room-viewer", roomId: 3 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  await roomService.leaveViewer(3, viewerToken, "viewer-session");
  assert.deepEqual(roomRepository.removedPresence, {
    roomId: 3,
    sessionId: "viewer-session",
  });
  await assert.rejects(
    () => roomService.leaveViewer(3, null, "viewer-session"),
    { message: "ROOM_VIEW_ACCESS_DENIED" }
  );
});

test("public live-room listings include only response-safe room data", async () => {
  const [room] = await roomService.listLivePublicRooms();

  assert.equal(room.id, fixture.id);
  assert.equal(room.password, undefined);
  assert.equal(room.passwordHash, undefined);
  assert.equal(room.isPlayer, false);
  assert.equal(room.players[0].userId, undefined);
  assert.equal(room.players[0].bot.sourceCode, undefined);
});

test("room search returns matching private and public rooms", async () => {
  const rooms = await roomService.searchRooms("Phòng");

  assert.equal(roomRepository.lastSearchName, "Phòng");
  assert.deepEqual(
    rooms.map(({ visibility }) => visibility),
    ["private", "public"]
  );
  assert.ok(rooms.every((room) => room.password === undefined));
  assert.ok(rooms.every((room) => room.passwordHash === undefined));
});

test.after(() => {
  for (const [filePath, originalEntry] of originalCacheEntries) {
    if (originalEntry) require.cache[filePath] = originalEntry;
    else delete require.cache[filePath];
  }
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
