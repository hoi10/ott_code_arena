const prisma = require("../config/database");

const ONLINE_WINDOW_MS = 30_000;

function onlineSince() {
  return new Date(Date.now() - ONLINE_WINDOW_MS);
}

function userSummary() {
  return {
    id: true,
    username: true,
    presenceSessions: {
      where: { lastSeenAt: { gte: onlineSince() } },
      select: { id: true },
      take: 1,
    },
  };
}

const friendRepository = {
  async searchUsers(query, currentUserId) {
    return prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        username: { contains: query },
      },
      select: userSummary(),
      orderBy: { username: "asc" },
      take: 20,
    });
  },

  async findUserByUsername(username) {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
  },

  async listFriends(userId) {
    const requests = await prisma.friendRequest.findMany({
      where: {
        status: "accepted",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    const friendIds = requests.map((request) =>
      request.senderId === userId ? request.receiverId : request.senderId
    );
    if (friendIds.length === 0) return [];

    const friends = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: userSummary(),
      orderBy: { username: "asc" },
    });
    return friends.map(({ presenceSessions, ...friend }) => ({
      ...friend,
      online: presenceSessions.length > 0,
    }));
  },

  async listFriendRequests(userId) {
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { receiverId: userId, status: "pending" },
        include: { sender: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.friendRequest.findMany({
        where: { senderId: userId, status: "pending" },
        include: { receiver: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      incoming: incoming.map(({ sender, id, createdAt }) => ({
        id,
        user: sender,
        createdAt,
      })),
      outgoing: outgoing.map(({ receiver, id, createdAt }) => ({
        id,
        user: receiver,
        createdAt,
      })),
    };
  },

  async createFriendRequest(senderId, receiverId) {
    return prisma.$transaction(async (tx) => {
      const userIds = [senderId, receiverId].sort(
        (first, second) => first - second
      );
      for (const userId of userIds) {
        const users = await tx.$queryRaw`
          SELECT id FROM User WHERE id = ${userId} FOR UPDATE
        `;
        if (users.length === 0) throw new Error("USER_NOT_FOUND");
      }
      const existing = await tx.friendRequest.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
      });
      if (existing?.status === "accepted") {
        throw new Error("FRIEND_ALREADY_EXISTS");
      }
      if (existing?.status === "pending") {
        throw new Error(
          existing.senderId === senderId
            ? "FRIEND_REQUEST_ALREADY_SENT"
            : "FRIEND_REQUEST_ALREADY_RECEIVED"
        );
      }
      if (existing) {
        return tx.friendRequest.update({
          where: { id: existing.id },
          data: { senderId, receiverId, status: "pending" },
        });
      }
      return tx.friendRequest.create({
        data: { senderId, receiverId },
      });
    });
  },

  async respondFriendRequest(requestId, userId, accept) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.friendRequest.updateMany({
        where: { id: requestId, receiverId: userId, status: "pending" },
        data: { status: accept ? "accepted" : "declined" },
      });
      if (result.count !== 1) throw new Error("FRIEND_REQUEST_NOT_FOUND");
      return { accepted: accept };
    });
  },

  async removeFriend(userId, friendId) {
    const result = await prisma.friendRequest.deleteMany({
      where: {
        status: "accepted",
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
    if (result.count !== 1) throw new Error("FRIEND_NOT_FOUND");
    return { removed: true };
  },

  async areFriends(firstUserId, secondUserId) {
    return Boolean(
      await prisma.friendRequest.findFirst({
        where: {
          status: "accepted",
          OR: [
            { senderId: firstUserId, receiverId: secondUserId },
            { senderId: secondUserId, receiverId: firstUserId },
          ],
        },
        select: { id: true },
      })
    );
  },

  async isOnline(userId) {
    return Boolean(
      await prisma.userPresence.findFirst({
        where: { userId, lastSeenAt: { gte: onlineSince() } },
        select: { id: true },
      })
    );
  },

  async touchPresence(userId, sessionId) {
    return prisma.userPresence.upsert({
      where: { userId_sessionId: { userId, sessionId } },
      create: { userId, sessionId, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  },

  async createInvitation(data) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.socialInvitation.findFirst({
        where: {
          senderId: data.senderId,
          receiverId: data.receiverId,
          kind: data.kind,
          status: "pending",
          expiresAt: { gt: new Date() },
          ...(data.roomId ? { roomId: data.roomId } : {}),
        },
        select: { id: true },
      });
      if (existing) throw new Error("SOCIAL_INVITATION_ALREADY_PENDING");
      return tx.socialInvitation.create({ data });
    });
  },

  async getInvitation(id) {
    return prisma.socialInvitation.findUnique({ where: { id } });
  },

  async respondInvitation(id, receiverId, accept) {
    const result = await prisma.socialInvitation.updateMany({
      where: {
        id,
        receiverId,
        kind: "duel",
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      data: { status: accept ? "accepted" : "declined" },
    });
    if (result.count !== 1) throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    return { accepted: accept };
  },

  async completeInvitation(id, senderId, roomId) {
    const result = await prisma.socialInvitation.updateMany({
      where: {
        id,
        senderId,
        kind: "duel",
        status: "accepted",
      },
      data: { status: "completed", roomId },
    });
    if (result.count !== 1) throw new Error("DUEL_INVITATION_UNAVAILABLE");
    return { completed: true };
  },

  async expireAcceptedChallenge(id, senderId) {
    const result = await prisma.socialInvitation.updateMany({
      where: {
        id,
        senderId,
        kind: "duel",
        status: "accepted",
      },
      data: { status: "expired" },
    });
    if (result.count !== 1) {
      throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    }
    return { expired: true };
  },

  async expireElapsedAcceptedChallenges(senderId, now) {
    return prisma.socialInvitation.updateMany({
      where: {
        senderId,
        kind: "duel",
        status: "accepted",
        expiresAt: { lte: now },
      },
      data: { status: "expired" },
    });
  },

  async getNotifications(userId) {
    const now = new Date();
    await prisma.socialInvitation.updateMany({
      where: {
        receiverId: userId,
        status: "pending",
        expiresAt: { lte: now },
      },
      data: { status: "expired" },
    });
    const [friendRequests, incoming, acceptedChallenges, completedChallenges] =
      await Promise.all([
      prisma.friendRequest.findMany({
        where: { receiverId: userId, status: "pending" },
        include: { sender: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.socialInvitation.findMany({
        where: {
          receiverId: userId,
          status: "pending",
          expiresAt: { gt: now },
        },
        include: {
          sender: { select: { id: true, username: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.socialInvitation.findMany({
        where: {
          senderId: userId,
          kind: "duel",
          status: "accepted",
        },
        include: { receiver: { select: { id: true, username: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.socialInvitation.findMany({
        where: {
          receiverId: userId,
          kind: "duel",
          status: "completed",
          roomId: { not: null },
        },
        include: {
          sender: { select: { id: true, username: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return {
      friendRequests: friendRequests.map(({ id, sender, createdAt }) => ({
        id,
        sender,
        createdAt,
      })),
      invitations: incoming.map(
        ({ id, sender, kind, room, expiresAt }) => ({
          id,
          sender,
          kind,
          room,
          expiresAt,
        })
      ),
      acceptedChallenges: acceptedChallenges.map(
        ({ id, receiver, updatedAt }) => ({
          id,
          receiver,
          updatedAt,
        })
      ),
      completedChallenges: completedChallenges.map(
        ({ id, sender, room, updatedAt }) => ({
          id,
          sender,
          room,
          updatedAt,
        })
      ),
    };
  },

  async consumeCompletedChallenge(id, receiverId) {
    const result = await prisma.socialInvitation.updateMany({
      where: {
        id,
        receiverId,
        kind: "duel",
        status: "completed",
        roomId: { not: null },
      },
      data: { status: "notified" },
    });
    if (result.count !== 1) {
      throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    }
    return { consumed: true };
  },

  async createRoomInvitation(senderId, receiverId, roomId, expiresAt) {
    return prisma.socialInvitation.create({
      data: {
        senderId,
        receiverId,
        roomId,
        kind: "room",
        expiresAt,
      },
    });
  },

  async getRoomInvitation(id, receiverId) {
    return prisma.socialInvitation.findFirst({
      where: { id, receiverId, kind: "room", status: "pending" },
    });
  },

  async markRoomInvitation(id, receiverId, status) {
    const result = await prisma.socialInvitation.updateMany({
      where: {
        id,
        receiverId,
        kind: "room",
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      data: { status },
    });
    if (result.count !== 1) throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
    return { accepted: status === "accepted" };
  },

  async cleanupStalePresence(cutoff) {
    return prisma.userPresence.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });
  },

  async expireInvitations(now) {
    return prisma.socialInvitation.updateMany({
      where: { status: "pending", expiresAt: { lte: now } },
      data: { status: "expired" },
    });
  },
};

module.exports = friendRepository;
