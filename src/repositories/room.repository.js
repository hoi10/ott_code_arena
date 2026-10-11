const prisma = require("../config/database");
const gameRules = require("../game-engine/game-rules");

const roomInclude = {
  hostUser: { select: { id: true, username: true } },
  players: {
    orderBy: { slot: "asc" },
    include: {
      user: { select: { id: true, username: true } },
      bot: { select: { id: true, name: true, language: true, isActive: true } },
    },
  },
  match: {
    include: {
      participants: {
        orderBy: { id: "asc" },
        include: {
          bot: {
            include: {
              user: { select: { id: true, username: true } },
            },
          },
        },
      },
    },
  },
};

const roomListInclude = {
  players: { select: { slot: true } },
};

async function lockUserAndFindActiveRoom(tx, userId) {
  const users = await tx.$queryRaw`
    SELECT id FROM User WHERE id = ${userId} FOR UPDATE
  `;
  if (users.length === 0) throw new Error("USER_NOT_FOUND");

  return tx.roomPlayer.findFirst({
    where: { userId, leftAt: null },
    select: { roomId: true },
  });
}

async function createMatchForRoom(tx, room) {
  const match = await tx.match.create({
    data: {
      status: "running",
      startedAt: new Date(),
      room: { connect: { id: room.id } },
      participants: {
        create: room.players.map((player) => ({ botId: player.botId })),
      },
    },
    include: {
      participants: { select: { id: true, botId: true } },
    },
  });
  const state = gameRules.createInitialState({
    participantIds: match.participants.map((participant) => participant.id),
  });
  await tx.match.update({
    where: { id: match.id },
    data: { result: state },
  });
  return match;
}

const roomRepository = {
  async create({
    name,
    password,
    passwordHash,
    visibility,
    hostUserId,
    challengeInvitationId,
  }) {
    return prisma.$transaction(async (tx) => {
      let invitedUserId = null;
      if (challengeInvitationId) {
        const invitation = await tx.socialInvitation.findFirst({
          where: {
            id: challengeInvitationId,
            senderId: hostUserId,
            kind: "duel",
            status: "accepted",
          },
          select: { receiverId: true },
        });
        if (!invitation) throw new Error("DUEL_INVITATION_UNAVAILABLE");
        invitedUserId = invitation.receiverId;
      }

      const userIds = [...new Set([hostUserId, invitedUserId].filter(Boolean))].sort(
        (first, second) => first - second
      );
      const activeRooms = [];
      for (const userId of userIds) {
        activeRooms.push(await lockUserAndFindActiveRoom(tx, userId));
      }
      if (activeRooms.some(Boolean)) throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");

      const room = await tx.room.create({
        data: {
          name,
          password,
          passwordHash,
          visibility,
          hostUserId,
          players: {
            create: [
              { userId: hostUserId, slot: 0 },
              ...(invitedUserId ? [{ userId: invitedUserId, slot: 1 }] : []),
            ],
          },
        },
        include: roomInclude,
      });
      if (challengeInvitationId) {
        await tx.socialInvitation.update({
          where: { id: challengeInvitationId },
          data: { status: "completed", roomId: room.id },
        });
      }
      return room;
    });
  },

  async findActiveRoomForUser(userId) {
    return prisma.roomPlayer.findFirst({
      where: { userId, leftAt: null },
      select: { room: { select: { id: true, name: true } } },
    }).then((player) => player?.room ?? null);
  },

  async findById(id) {
    return prisma.room.findUnique({ where: { id }, include: roomInclude });
  },

  async touchPresence(roomId, sessionId, userId) {
    return prisma.$transaction(async (tx) => {
      const rooms = await tx.$queryRaw`
        SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
      `;
      if (rooms.length === 0) throw new Error("ROOM_NOT_FOUND");
      const now = new Date();
      return tx.roomPresence.upsert({
        where: { roomId_sessionId: { roomId, sessionId } },
        create: { roomId, sessionId, userId, lastSeenAt: now },
        update: { userId, lastSeenAt: now },
      });
    });
  },

  async removePresence(roomId, sessionId) {
    return prisma.roomPresence.deleteMany({
      where: { roomId, sessionId },
    });
  },

  async deleteStalePresence(cutoff) {
    return prisma.roomPresence.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });
  },

  async deleteRoomAndStopMatch(roomId) {
    return prisma.$transaction(async (tx) => {
      const rooms = await tx.$queryRaw`
        SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
      `;
      if (rooms.length === 0) throw new Error("ROOM_NOT_FOUND");
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { id: true, match: { select: { id: true, status: true } } },
      });
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (room.match && ["pending", "running"].includes(room.match.status)) {
        await tx.match.update({
          where: { id: room.match.id },
          data: { status: "failed", endedAt: new Date() },
        });
      }
      await tx.room.delete({ where: { id: roomId } });
      return { deleted: true };
    });
  },

  async searchByName(name) {
    return prisma.room.findMany({
      where: {
        name: { contains: name },
        status: { in: ["waiting", "running", "paused", "completed", "failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: roomListInclude,
    });
  },

  async listPublic() {
    return prisma.room.findMany({
      where: {
        visibility: "public",
        status: { in: ["waiting", "running", "paused", "completed", "failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: roomListInclude,
    });
  },

  async listLivePublic() {
    return prisma.room.findMany({
      where: {
        visibility: "public",
        status: { in: ["waiting", "running", "paused"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: roomListInclude,
    });
  },

  async listForUser(userId) {
    return prisma.room.findMany({
      where: {
        status: { in: ["waiting", "running", "paused", "completed", "failed"] },
        players: { some: { userId, leftAt: null } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: roomListInclude,
    });
  },

  async findAutomated() {
    return prisma.room.findMany({
      where: { status: { in: ["running", "paused"] } },
      include: roomInclude,
    });
  },

  async addPlayer(roomId, userId) {
    return prisma.$transaction(async (tx) => {
      const activeRoom = await lockUserAndFindActiveRoom(tx, userId);
      if (activeRoom) {
        if (activeRoom.roomId !== roomId) {
          throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
        }
        return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
      }

      const locked = await tx.room.updateMany({
        where: { id: roomId, status: "waiting" },
        data: { revision: { increment: 1 } },
      });
      if (locked.count !== 1) return null;

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });
      if (!room) return null;
      if (room.players.some((player) => player.slot === 1 && !player.leftAt)) {
        return null;
      }
      const guestSeat = room.players.find((player) => player.slot === 1);
      if (guestSeat) {
        await tx.roomPlayer.update({
          where: { id: guestSeat.id },
          data: {
            userId,
            leftAt: null,
            botId: null,
            isReady: false,
            rematchAccepted: false,
          },
        });
      } else {
        await tx.roomPlayer.create({
          data: { roomId, userId, slot: 1 },
        });
      }
      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async acceptRoomInvitation(invitationId, userId) {
    return prisma.$transaction(async (tx) => {
      const invitation = await tx.socialInvitation.findFirst({
        where: {
          id: invitationId,
          receiverId: userId,
          kind: "room",
          status: "pending",
          expiresAt: { gt: new Date() },
        },
      });
      if (!invitation?.roomId) {
        throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
      }

      const activeRoom = await lockUserAndFindActiveRoom(tx, userId);
      if (activeRoom && activeRoom.roomId !== invitation.roomId) {
        throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
      }
      if (activeRoom?.roomId === invitation.roomId) {
        const updated = await tx.socialInvitation.updateMany({
          where: {
            id: invitationId,
            receiverId: userId,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
          data: { status: "accepted" },
        });
        if (updated.count !== 1) {
          throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
        }
        return tx.room.findUnique({
          where: { id: invitation.roomId },
          include: roomInclude,
        });
      }

      const locked = await tx.room.updateMany({
        where: { id: invitation.roomId, status: "waiting" },
        data: { revision: { increment: 1 } },
      });
      if (locked.count !== 1) throw new Error("ROOM_NOT_ACCEPTING_PLAYERS");

      const room = await tx.room.findUnique({
        where: { id: invitation.roomId },
        include: { players: true },
      });
      if (
        !room ||
        room.players.some((player) => player.slot === 1 && !player.leftAt)
      ) {
        throw new Error("ROOM_FULL_OR_NOT_ACCEPTING_PLAYERS");
      }

      const updated = await tx.socialInvitation.updateMany({
        where: {
          id: invitationId,
          receiverId: userId,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        data: { status: "accepted" },
      });
      if (updated.count !== 1) {
        throw new Error("SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE");
      }

      const guestSeat = room.players.find((player) => player.slot === 1);
      if (guestSeat) {
        await tx.roomPlayer.update({
          where: { id: guestSeat.id },
          data: {
            userId,
            leftAt: null,
            botId: null,
            isReady: false,
            rematchAccepted: false,
          },
        });
      } else {
        await tx.roomPlayer.create({
          data: { roomId: invitation.roomId, userId, slot: 1 },
        });
      }
      return tx.room.findUnique({
        where: { id: invitation.roomId },
        include: roomInclude,
      });
    });
  },

  async updateReady(roomId, userId, botId, isReady) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.room.updateMany({
        where: { id: roomId, status: "waiting" },
        data: { revision: { increment: 1 } },
      });
      if (locked.count !== 1) return null;

      const player = await tx.roomPlayer.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (!player) return null;

      const bot = await tx.bot.findFirst({
        where: { id: botId, userId, isActive: true },
      });
      if (!bot) throw new Error("ROOM_BOT_NOT_FOUND_OR_INACTIVE");

      await tx.roomPlayer.update({
        where: { id: player.id },
        data: { botId, isReady },
      });
      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async startRoom(roomId) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.room.updateMany({
        where: { id: roomId, status: "waiting" },
        data: { revision: { increment: 1 } },
      });
      if (locked.count !== 1) return null;

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: { orderBy: { slot: "asc" }, include: { bot: true } } },
      });
      if (!room || room.players.length !== 2) {
        throw new Error("ROOM_REQUIRES_TWO_PLAYERS");
      }
      if (room.players.some((player) => !player.isReady || !player.botId)) {
        throw new Error("ROOM_PLAYERS_NOT_READY");
      }
      if (room.players.some((player) => !player.bot?.isActive || player.bot.userId !== player.userId)) {
        throw new Error("ROOM_BOT_NOT_FOUND_OR_INACTIVE");
      }

      await createMatchForRoom(tx, room);
      await tx.room.update({
        where: { id: roomId },
        data: { status: "running" },
      });

      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async requestRematch(roomId, userId, expiresAt) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.room.updateMany({
        where: {
          id: roomId,
          status: "completed",
          rematchStatus: { not: "pending" },
        },
        data: { revision: { increment: 1 } },
      });
      if (locked.count !== 1) throw new Error("ROOM_REMATCH_UNAVAILABLE");

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: { orderBy: { slot: "asc" }, include: { bot: true } } },
      });
      if (!room || room.players.length !== 2) {
        throw new Error("ROOM_REMATCH_UNAVAILABLE");
      }
      if (!room.players.some((player) => player.userId === userId && !player.leftAt)) {
        throw new Error("ROOM_ACCESS_DENIED");
      }
      if (room.players.some((player) => player.leftAt || !player.bot?.isActive)) {
        throw new Error("ROOM_REMATCH_UNAVAILABLE");
      }

      await tx.roomPlayer.updateMany({
        where: { roomId },
        data: { rematchAccepted: false },
      });
      await tx.roomPlayer.update({
        where: { roomId_userId: { roomId, userId } },
        data: { rematchAccepted: true },
      });
      await tx.room.update({
        where: { id: roomId },
        data: {
          rematchStatus: "pending",
          rematchExpiresAt: expiresAt,
        },
      });
      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async respondRematch(roomId, userId, accept) {
    return prisma.$transaction(async (tx) => {
      const rooms = await tx.$queryRaw`
        SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
      `;
      if (rooms.length === 0) throw new Error("ROOM_NOT_FOUND");

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: { orderBy: { slot: "asc" }, include: { bot: true } } },
      });
      if (
        !room ||
        room.status !== "completed" ||
        room.rematchStatus !== "pending"
      ) {
        throw new Error("ROOM_REMATCH_UNAVAILABLE");
      }
      if (!room.rematchExpiresAt || room.rematchExpiresAt <= new Date()) {
        await tx.room.update({
          where: { id: roomId },
          data: { rematchStatus: "expired", rematchExpiresAt: null },
        });
        return {
          room: await tx.room.findUnique({ where: { id: roomId }, include: roomInclude }),
          started: false,
          expired: true,
        };
      }

      const player = room.players.find(
        (entry) => entry.userId === userId && !entry.leftAt
      );
      if (!player) throw new Error("ROOM_ACCESS_DENIED");
      if (!accept) {
        await tx.room.update({
          where: { id: roomId },
          data: { rematchStatus: "declined", rematchExpiresAt: null },
        });
        await tx.roomPlayer.updateMany({
          where: { roomId },
          data: { rematchAccepted: false },
        });
        if (player.userId === room.hostUserId) {
          await tx.room.delete({ where: { id: roomId } });
          return { room: null, started: false, left: true };
        }
        await tx.roomPlayer.update({
          where: { id: player.id },
          data: { leftAt: new Date() },
        });
        await tx.roomPresence.deleteMany({
          where: { roomId, userId },
        });
        return {
          room: await tx.room.findUnique({ where: { id: roomId }, include: roomInclude }),
          started: false,
          left: true,
        };
      }

      await tx.roomPlayer.update({
        where: { id: player.id },
        data: { rematchAccepted: true },
      });
      const players = await tx.roomPlayer.findMany({
        where: { roomId },
        orderBy: { slot: "asc" },
        include: { bot: true },
      });
      if (players.length !== 2 || players.some((entry) => !entry.rematchAccepted)) {
        return {
          room: await tx.room.findUnique({ where: { id: roomId }, include: roomInclude }),
          started: false,
        };
      }
      if (players.some((entry) => entry.leftAt || !entry.bot?.isActive)) {
        throw new Error("ROOM_REMATCH_UNAVAILABLE");
      }

      await tx.match.updateMany({
        where: { roomId },
        data: { roomId: null },
      });
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: "waiting",
          rematchStatus: "none",
          rematchExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      await tx.roomPlayer.updateMany({
        where: { roomId },
        data: { botId: null, isReady: false, rematchAccepted: false },
      });
      return {
        room: await tx.room.findUnique({ where: { id: roomId }, include: roomInclude }),
        started: false,
        returnedToLobby: true,
      };
    });
  },

  async expireRematchInvitations(now) {
    return prisma.room.updateMany({
      where: {
        status: "completed",
        rematchStatus: "pending",
        rematchExpiresAt: { lte: now },
      },
      data: { rematchStatus: "expired", rematchExpiresAt: null },
    });
  },

  async beginPause(roomId, userId) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (room.status !== "running") throw new Error("ROOM_NOT_RUNNING");

      const player = room.players.find((entry) => entry.userId === userId);
      if (!player) throw new Error("ROOM_ACCESS_DENIED");
      if (player.pauseUsedMs >= 30_000) throw new Error("ROOM_PAUSE_BUDGET_EXHAUSTED");

      const updated = await tx.room.updateMany({
        where: { id: roomId, status: "running" },
        data: {
          status: "paused",
          pausedByUserId: userId,
          pauseStartedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("ROOM_NOT_RUNNING");
      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async finishPause(roomId, userId) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (room.status !== "paused" || !room.pauseStartedAt) {
        throw new Error("ROOM_NOT_PAUSED");
      }

      if (userId && !room.players.some((player) => player.userId === userId)) {
        throw new Error("ROOM_ACCESS_DENIED");
      }

      const updated = await tx.room.updateMany({
        where: { id: roomId, status: "paused", revision: room.revision },
        data: {
          status: "running",
          pausedByUserId: null,
          pauseStartedAt: null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("ROOM_NOT_PAUSED");

      const pauseOwner = room.players.find(
        (player) => player.userId === room.pausedByUserId
      );
      if (pauseOwner) {
        const elapsed = Math.min(
          30_000,
          Math.max(0, Date.now() - room.pauseStartedAt.getTime())
        );
        await tx.roomPlayer.update({
          where: { id: pauseOwner.id },
          data: { pauseUsedMs: Math.min(30_000, pauseOwner.pauseUsedMs + elapsed) },
        });
      }

      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async changePlayerBot(roomId, userId, botId) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          players: true,
          match: { include: { participants: true } },
        },
      });
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (room.status !== "paused" || !room.match) {
        throw new Error("ROOM_BOT_CHANGE_REQUIRES_PAUSE");
      }

      const player = room.players.find((entry) => entry.userId === userId);
      if (!player) throw new Error("ROOM_ACCESS_DENIED");
      const bot = await tx.bot.findFirst({
        where: { id: botId, userId, isActive: true },
      });
      if (!bot) throw new Error("ROOM_BOT_NOT_FOUND_OR_INACTIVE");
      if (room.players.some((entry) => entry.id !== player.id && entry.botId === botId)) {
        throw new Error("BOT_ALREADY_ASSIGNED_TO_MATCH");
      }

      const participant = room.match.participants.find(
        (entry) => entry.botId === player.botId
      );
      if (!participant) throw new Error("MATCH_PARTICIPANT_NOT_FOUND");

      await tx.matchParticipant.update({
        where: { id: participant.id },
        data: { botId },
      });
      await tx.roomPlayer.update({
        where: { id: player.id },
        data: { botId },
      });
      return tx.room.findUnique({ where: { id: roomId }, include: roomInclude });
    });
  },

  async markCompleted(roomId) {
    return prisma.room.updateMany({
      where: { id: roomId, status: { in: ["running", "paused"] } },
      data: {
        status: "completed",
        pausedByUserId: null,
        pauseStartedAt: null,
        revision: { increment: 1 },
      },
    });
  },

  async markFailed(roomId) {
    return prisma.room.updateMany({
      where: { id: roomId, status: { in: ["running", "paused"] } },
      data: {
        status: "failed",
        pausedByUserId: null,
        pauseStartedAt: null,
        revision: { increment: 1 },
      },
    });
  },

  async leaveRoom(roomId, userId) {
    return prisma.$transaction(async (tx) => {
      const rooms = await tx.$queryRaw`
        SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
      `;
      if (rooms.length === 0) throw new Error("ROOM_NOT_FOUND");
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { players: true },
      });
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const player = room.players.find((entry) => entry.userId === userId);
      if (!player) throw new Error("ROOM_ACCESS_DENIED");

      if (room.status === "waiting") {
        if (player.userId === room.hostUserId) {
          await tx.room.delete({ where: { id: roomId } });
          return { deleted: true };
        }
        await tx.roomPlayer.delete({ where: { id: player.id } });
        return { deleted: false };
      }
      if (!["completed", "failed"].includes(room.status)) {
        throw new Error("ROOM_LEAVE_ONLY_AFTER_MATCH");
      }

      if (!player.leftAt) {
        await tx.roomPlayer.update({
          where: { id: player.id },
          data: { leftAt: new Date() },
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: { rematchStatus: "declined", rematchExpiresAt: null },
      });
      const updatedPlayers = await tx.roomPlayer.findMany({
        where: { roomId },
      });
      if (
        updatedPlayers.length === 2 &&
        updatedPlayers.every((entry) => entry.leftAt)
      ) {
        await tx.room.delete({ where: { id: roomId } });
        return { deleted: true };
      }
      return { deleted: false };
    });
  },

  async deleteRoom(roomId) {
    return prisma.room.delete({ where: { id: roomId } });
  },
};

module.exports = roomRepository;
