const { z } = require("zod");

const createMatchSchema = z.object({
  botIds: z
    .array(z.number().int().positive())
    .length(2, "A match must contain exactly 2 bots")
    .refine((ids) => ids[0] !== ids[1], {
      message: "A bot cannot compete against itself",
    }),
});

const listMatchesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z
    .enum(["pending", "running", "completed", "cancelled"])
    .optional(),
});

const changeBotSchema = z.object({
  participantId: z.number().int().positive(),
  botId: z.number().int().positive(),
});

const matchIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

module.exports = {
  createMatchSchema,
  listMatchesSchema,
  changeBotSchema,
  matchIdSchema,
};