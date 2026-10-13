const { z } = require("zod");

const testPieceSchema = z.object({
  side: z.enum(["own", "opponent"]),
  type: z.enum(["bua", "keo", "bao"]),
  x: z.number().int().min(0).max(8),
  y: z.number().int().min(0).max(8),
});

const createSubmissionSchema = z
  .object({
    botId: z.number().int().positive().optional().nullable(),
    sourceCode: z.string().min(1).max(100000).optional(),
    language: z.enum(["javascript", "cpp", "python"]).default("javascript"),
    protocolVersion: z.union([z.literal(1), z.literal(2)]).default(2),
    testState: z.object({
      pieces: z.array(testPieceSchema).max(81),
    }).optional(),
  })
  .refine(
    (data) =>
      (data.botId !== undefined && data.botId !== null) ||
      (typeof data.sourceCode === "string" && data.sourceCode.trim().length > 0),
    {
      message: "Provide a botId or sourceCode",
      path: ["sourceCode"],
    }
  );

const listSubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createSubmissionSchema,
  listSubmissionsSchema,
};
