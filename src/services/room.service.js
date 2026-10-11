const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const roomRepository = require("../repositories/room.repository");
const botRepository = require("../repositories/bot.repository");
const roomScheduler = require("./room-scheduler");

const PAUSE_LIMIT_MS = 30_000;
const VIEWER_TOKEN_TTL = "12h";
const REMATCH_RESPONSE_WINDOW_MS = 10_000;

function safeRoom(room, userId, { includePassword = false } = {}) {
  if (!room) return room;
  const { passwordHash, password, ...publicRoom } = room;
  const currentPlayer = room.players?.find(
    (player) => player.userId === userId && !player.leftAt
  );
  const activePauseElapsed =
    currentPlayer &&
    room.status === "paused" &&
    room.pausedByUserId === userId &&
    room.pauseStartedAt
      ? Math.max(0, Date.now() - room.pauseStartedAt.getTime())
      : 0;
  return {
    ...publicRoom,
    ...(includePassword ? { password } : {}),
    isHost: room.hostUserId === userId,
    isPlayer: Boolean(currentPlayer),
    pauseRemainingMs: currentPlayer
      ? Math.max(
          0,
          PAUSE_LIMIT_MS - currentPlayer.pauseUsedMs - activePauseElapsed
        )
      : null,
    players: room.players?.map(({ userId: playerUserId, ...player }) => ({
      ...player,
      isCurrentUser: playerUserId === userId && !player.leftAt,
      bot: player.bot
        ? { ...player.bot, sourceCode: undefined }
        : player.bot,
    })),
    match: room.match
      ? {
          ...room.match,
          participants: room.match.participants.map((participant) => ({
            ...participant,
            bot: participant.bot
              ? { ...participant.bot, sourceCode: undefined }
              : participant.bot,
          })),
        }
      : null,
  };
}

function requireJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET_NOT_CONFIGURED");
  }
  return process.env.JWT_SECRET;
}

async function requireActiveBot(userId) {
  const bots = await botRepository.findByUserId(userId);
  if (!bots.some((bot) => bot.isActive)) {
    throw new Error("ROOM_REQUIRES_ACTIVE_BOT");
  }
}

const roomService = {
  async createRoom(userId, {
    name,
    password,
    visibility,
    challengeInvitationId,
  }) {
    if (await roomRepository.findActiveRoomForUser(userId)) {
      throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
    }
    if (challengeInvitationId) {
      const friendService = require("./friend.service");
      await friendService.createRoomFromChallenge(userId, challengeInvitationId);
    }
    await requireActiveBot(userId);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const room = await roomRepository.create({
        name,
        password,
        passwordHash,
        visibility,
        hostUserId: userId,
        challengeInvitationId,
      });
      return safeRoom(room, userId, { includePassword: true });
    } catch (error) {
      if (error.code === "P2002") throw new Error("ROOM_NAME_ALREADY_EXISTS");
      throw error;
    }
  },

  async listPublicRooms() {
    return (await roomRepository.listPublic()).map((room) => safeRoom(room));
  },

  async listLivePublicRooms() {
    return (await roomRepository.listLivePublic()).map((room) => safeRoom(room));
  },

  async searchRooms(name) {
    return (await roomRepository.searchByName(name)).map((room) => safeRoom(room));
  },

  async listUserRooms(userId) {
    return (await roomRepository.listForUser(userId)).map((room) =>
      safeRoom(room, userId)
    );
  },

  async joinRoom(roomId, userId, password) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.players.some((player) => player.userId === userId && !player.leftAt)) {
      return safeRoom(room, userId, { includePassword: true });
    }
    const activeRoom = await roomRepository.findActiveRoomForUser(userId);
    if (activeRoom && activeRoom.id !== roomId) {
      throw new Error("ROOM_PLAYER_ALREADY_IN_ROOM");
    }
    if (room.status !== "waiting") throw new Error("ROOM_NOT_ACCEPTING_PLAYERS");
    await requireActiveBot(userId);
    if (!(await bcrypt.compare(password, room.passwordHash))) {
      throw new Error("ROOM_PASSWORD_INCORRECT");
    }

    try {
      const joined = await roomRepository.addPlayer(roomId, userId);
      if (!joined) throw new Error("ROOM_FULL_OR_NOT_ACCEPTING_PLAYERS");
      return safeRoom(joined, userId, { includePassword: true });
    } catch (error) {
      if (error.code === "P2002") {
        throw new Error("ROOM_FULL_OR_NOT_ACCEPTING_PLAYERS");
      }
      throw error;
    }
  },

  async getRoom(roomId, userId, viewerToken) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const isPlayer = room.players.some(
      (player) => player.userId === userId && !player.leftAt
    );
    if (!isPlayer && !this.verifyViewerToken(viewerToken, roomId)) {
      throw new Error("ROOM_VIEW_ACCESS_DENIED");
    }
    return safeRoom(room, userId, { includePassword: true });
  },

  async touchPresence(roomId, userId, viewerToken, sessionId) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const isPlayer = room.players.some(
      (player) => player.userId === userId && !player.leftAt
    );
    if (!isPlayer && !this.verifyViewerToken(viewerToken, roomId)) {
      throw new Error("ROOM_VIEW_ACCESS_DENIED");
    }
    return roomRepository.touchPresence(
      roomId,
      sessionId,
      isPlayer ? userId : null
    );
  },

  async leaveViewer(roomId, viewerToken, sessionId) {
    if (!this.verifyViewerToken(viewerToken, roomId)) {
      throw new Error("ROOM_VIEW_ACCESS_DENIED");
    }
    return roomRepository.removePresence(roomId, sessionId);
  },

  async createViewerSession(roomId, password) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (!(await bcrypt.compare(password, room.passwordHash))) {
      throw new Error("ROOM_PASSWORD_INCORRECT");
    }
    const token = jwt.sign(
      { purpose: "room-viewer", roomId },
      requireJwtSecret(),
      { expiresIn: VIEWER_TOKEN_TTL }
    );
    return { token, expiresIn: VIEWER_TOKEN_TTL };
  },

  verifyViewerToken(token, roomId) {
    if (!token) return false;
    try {
      const payload = jwt.verify(token, requireJwtSecret());
      return payload.purpose === "room-viewer" && payload.roomId === roomId;
    } catch {
      return false;
    }
  },

  async setReady(roomId, userId, { botId, isReady }) {
    const room = await roomRepository.updateReady(
      roomId,
      userId,
      botId,
      isReady
    );
    if (!room) throw new Error("ROOM_NOT_FOUND_OR_NOT_WAITING");
    return safeRoom(room, userId);
  },

  async startRoom(roomId, userId) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostUserId !== userId) throw new Error("ROOM_HOST_ONLY");
    if (room.players.length !== 2) throw new Error("ROOM_REQUIRES_TWO_PLAYERS");
    if (room.players.some((player) => !player.isReady || !player.botId)) {
      throw new Error("ROOM_PLAYERS_NOT_READY");
    }
    const started = await roomRepository.startRoom(roomId);
    if (!started) throw new Error("ROOM_NOT_FOUND_OR_NOT_WAITING");
    roomScheduler.schedule(roomId);
    return safeRoom(started, userId);
  },

  async pauseRoom(roomId, userId) {
    const room = await roomRepository.beginPause(roomId, userId);
    await roomScheduler.pause(room);
    return safeRoom(room, userId);
  },

  async resumeRoom(roomId, userId) {
    const room = await roomRepository.finishPause(roomId, userId);
    roomScheduler.resume(roomId);
    return safeRoom(room, userId);
  },

  async changeBot(roomId, userId, botId) {
    return safeRoom(
      await roomRepository.changePlayerBot(roomId, userId, botId),
      userId
    );
  },

  async leaveRoom(roomId, userId) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (
      room.hostUserId === userId &&
      ["waiting", "completed", "failed"].includes(room.status)
    ) {
      return this.dissolveRoom(roomId, userId);
    }
    return roomRepository.leaveRoom(roomId, userId);
  },

  async dissolveRoom(roomId, userId) {
    const room = await roomRepository.findById(roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostUserId !== userId) throw new Error("ROOM_HOST_ONLY");
    await roomScheduler.cancelRoom(roomId);
    try {
      return await roomRepository.deleteRoomAndStopMatch(roomId);
    } catch (error) {
      await roomScheduler.restoreRoomAutomation(roomId);
      throw error;
    }
  },

  async requestRematch(roomId, userId) {
    const room = await roomRepository.requestRematch(
      roomId,
      userId,
      new Date(Date.now() + REMATCH_RESPONSE_WINDOW_MS)
    );
    return safeRoom(room, userId);
  },

  async respondRematch(roomId, userId, accept) {
    const result = await roomRepository.respondRematch(roomId, userId, accept);
    if (result.expired) throw new Error("ROOM_REMATCH_EXPIRED");
    return {
      room: safeRoom(result.room, userId),
      started: result.started,
      returnedToLobby: result.returnedToLobby ?? false,
      left: result.left ?? false,
    };
  },
};

module.exports = roomService;
