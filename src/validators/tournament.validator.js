const { z } = require("zod");

const createTournamentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
});

const updateTournamentSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const listTournamentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(["draft", "ready", "running", "completed", "cancelled"])
    .optional(),
});

const addParticipantSchema = z.object({
  botId: z.number().int().positive(),
});

const participantIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    entryId: z.number().int().positive(),
  }),
});

module.exports = {
  createTournamentSchema,
  updateTournamentSchema,
  listTournamentsSchema,
  addParticipantSchema,
  participantIdSchema,
};
