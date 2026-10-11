const { z } = require("zod");

const createSubmissionSchema = z
  .object({
    botId: z.number().int().positive().optional().nullable(),
    sourceCode: z.string().min(1).max(100000).optional(),
    language: z.enum(["javascript"]).default("javascript"),
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