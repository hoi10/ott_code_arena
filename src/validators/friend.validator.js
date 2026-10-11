const { z } = require("zod");

const usernameSchema = z.object({
  username: z.string().trim().min(1).max(50),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(50),
});

const responseSchema = z.object({
  accept: z.boolean(),
});

const presenceSchema = z.object({
  sessionId: z.string().uuid(),
});

const roomInvitationSchema = z.object({
  friendId: z.number().int().positive(),
});

module.exports = {
  usernameSchema,
  searchSchema,
  responseSchema,
  presenceSchema,
  roomInvitationSchema,
};
