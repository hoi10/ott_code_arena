const { z } = require("zod");

const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  password: z.string().min(4).max(72),
  visibility: z.enum(["public", "private"]),
  challengeInvitationId: z.number().int().positive().optional(),
});

const joinRoomSchema = z.object({
  password: z.string().min(1).max(72),
});

const readyRoomSchema = z.object({
  botId: z.number().int().positive(),
  isReady: z.boolean(),
});

const changeRoomBotSchema = z.object({
  botId: z.number().int().positive(),
});

const viewerSessionSchema = z.object({
  password: z.string().min(1).max(72),
});

const roomSearchSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const roomPresenceSchema = z.object({
  sessionId: z.string().uuid(),
});

const rematchResponseSchema = z.object({
  accept: z.boolean(),
});

module.exports = {
  createRoomSchema,
  joinRoomSchema,
  readyRoomSchema,
  changeRoomBotSchema,
  viewerSessionSchema,
  roomSearchSchema,
  roomPresenceSchema,
  rematchResponseSchema,
};
