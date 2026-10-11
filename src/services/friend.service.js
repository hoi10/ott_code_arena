const friendRepository = require("../repositories/friend.repository");
const roomRepository = require("../repositories/room.repository");
const botRepository = require("../repositories/bot.repository");

const ONLINE_WINDOW_MS = 30_000;
const INVITATION_WINDOW_MS = 10_000;
const SOCIAL_CLEANUP_INTERVAL_MS = 60_000;
let lastSocialCleanupAt = 0;

const friendService = {
  async searchUsers(query, userId) {
    return (await friendRepository.searchUsers(query, userId)).map(
      ({ presenceSessions, ...user }) => ({
        ...user,
        online: presenceSessions.length > 0,
      })
    );
  },

  async listFriends(userId) {
    return friendRepository.listFriends(userId);
  },

  async listRequests(userId) {
    return friendRepository.listFriendRequests(userId);
  },

  async sendFriendRequest(userId, username) {
    const receiver = await friendRepository.findUserByUsername(username);
    if (!receiver) throw new Error("USER_NOT_FOUND");
    if (receiver.id === userId) throw new Error("FRIEND_CANNOT_ADD_SELF");
    await friendRepository.createFriendRequest(userId, receiver.id);
    return { sent: true };
  },

  async respondFriendRequest(requestId, userId, accept) {
    return friendRepository.respondFriendRequest(requestId, userId, accept);
  },

  async removeFriend(userId, friendId) {
    if (userId === friendId) throw new Error("FRIEND_NOT_FOUND");
    return friendRepository.removeFriend(userId, friendId);
  },

  async heartbeat(userId, sessionId) {
    return friendRepository.touchPresence(userId, sessionId);
  },

  async sendChallenge(userId, friendId) {
    if (userId === friendId) throw new Error("FRIEND_CANNOT_CHALLENGE_SELF");
    if (!(await friendRepository.areFriends(userId, friendId))) {
      throw new Error("FRIEND_REQUIRED");
    }
    if (!(await friendRepository.isOnline(friendId))) {
      throw new Error("FRIEND_NOT_ONLINE");
    }
    if (
      (await roomRepository.findActiveRoomForUser(userId)) ||
      (await roomRepository.findActiveRoomForUser(friendId))
    ) {
      throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
    }

    const invitation = await friendRepository.createInvitation({
      senderId: userId,
      receiverId: friendId,
      kind: "duel",
      expiresAt: new Date(Date.now() + INVITATION_WINDOW_MS),
    });
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
  },

  async respondChallenge(invitationId, userId, accept) {
    const invitation = await friendRepository.getInvitation(invitationId);
    if (
      !invitation ||
      invitation.receiverId !== userId ||
      invitation.kind !== "duel" ||
      invitation.status !== "pending" ||
      invitation.expiresAt <= new Date()
    ) {
      throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    }
    if (accept) {
      if (!(await friendRepository.areFriends(userId, invitation.senderId))) {
        throw new Error("FRIEND_REQUIRED");
      }
      const bots = await botRepository.findByUserId(userId);
      if (!bots.some((bot) => bot.isActive)) {
        throw new Error("ROOM_REQUIRES_ACTIVE_BOT");
      }
      if (
        (await roomRepository.findActiveRoomForUser(userId)) ||
        (await roomRepository.findActiveRoomForUser(invitation.senderId))
      ) {
        throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
      }
    }
    return friendRepository.respondInvitation(invitationId, userId, accept);
  },

  async consumeCompletedChallenge(invitationId, userId) {
    return friendRepository.consumeCompletedChallenge(invitationId, userId);
  },

  async sendRoomInvitation(roomId, senderId, receiverId) {
    if (senderId === receiverId) throw new Error("FRIEND_CANNOT_CHALLENGE_SELF");
    if (!(await friendRepository.areFriends(senderId, receiverId))) {
      throw new Error("FRIEND_REQUIRED");
    }
    if (!(await friendRepository.isOnline(receiverId))) {
      throw new Error("FRIEND_NOT_ONLINE");
    }
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostUserId !== senderId) throw new Error("ROOM_HOST_ONLY");
    if (room.status !== "waiting") throw new Error("ROOM_NOT_ACCEPTING_PLAYERS");
    if (room.players.some((player) => player.slot === 1 && !player.leftAt)) {
      throw new Error("ROOM_FULL_OR_NOT_ACCEPTING_PLAYERS");
    }
    if (await roomRepository.findActiveRoomForUser(receiverId)) {
      throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
    }

    const invitation = await friendRepository.createInvitation({
      senderId,
      receiverId,
      roomId,
      kind: "room",
      expiresAt: new Date(Date.now() + INVITATION_WINDOW_MS),
    });
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
  },

  async respondRoomInvitation(invitationId, userId, accept) {
    const invitation = await friendRepository.getRoomInvitation(
      invitationId,
      userId
    );
    if (!invitation || invitation.expiresAt <= new Date()) {
      throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    }
    if (!accept) {
      return friendRepository.markRoomInvitation(
        invitationId,
        userId,
        "declined"
      );
    }
    if (!(await friendRepository.areFriends(userId, invitation.senderId))) {
      throw new Error("FRIEND_REQUIRED");
    }
    const bots = await botRepository.findByUserId(userId);
    if (!bots.some((bot) => bot.isActive)) {
      throw new Error("ROOM_REQUIRES_ACTIVE_BOT");
    }
    const room = await roomRepository.acceptRoomInvitation(invitationId, userId);
    return { accepted: true, roomId: room.id };
  },

  async createRoomFromChallenge(userId, invitationId) {
    const invitation = await friendRepository.getInvitation(invitationId);
    if (
      !invitation ||
      invitation.senderId !== userId ||
      invitation.kind !== "duel" ||
      invitation.status !== "accepted"
    ) {
      throw new Error("DUEL_INVITATION_UNAVAILABLE");
    }
    if (
      (await roomRepository.findActiveRoomForUser(userId)) ||
      (await roomRepository.findActiveRoomForUser(invitation.receiverId))
    ) {
      throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
    }
    return invitation.receiverId;
  },

  async expireChallengeWithoutBot(userId, invitationId) {
    const invitation = await friendRepository.getInvitation(invitationId);
    if (
      !invitation ||
      invitation.senderId !== userId ||
      invitation.kind !== "duel" ||
      invitation.status !== "accepted"
    ) {
      throw new Error("DUEL_INVITATION_UNAVAILABLE");
    }
    const bots = await botRepository.findByUserId(userId);
    if (bots.some((bot) => bot.isActive)) {
      throw new Error("DUEL_INVITATION_CANNOT_EXPIRE");
    }
    return friendRepository.expireAcceptedChallenge(invitationId, userId);
  },

  async getNotifications(userId) {
    if (Date.now() - lastSocialCleanupAt >= SOCIAL_CLEANUP_INTERVAL_MS) {
      await Promise.all([
        friendRepository.cleanupStalePresence(
          new Date(Date.now() - ONLINE_WINDOW_MS)
        ),
        friendRepository.expireInvitations(new Date()),
      ]);
      lastSocialCleanupAt = Date.now();
    }
    return friendRepository.getNotifications(userId);
  },
};

module.exports = friendService;
