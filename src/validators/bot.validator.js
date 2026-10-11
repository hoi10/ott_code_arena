const { z } = require("zod");

const createBotSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  sourceCode: z.string().min(1).max(100000),
  language: z.literal("javascript").default("javascript"),
  isPublic: z.boolean().default(false),
});

const updateBotSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    sourceCode: z.string().min(1).max(100000).optional(),
    language: z.literal("javascript").optional(),
    isActive: z.boolean().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const testBotSchema = z.object({
  sourceCode: z.string().min(1).max(100000),
});

module.exports = {
  createBotSchema,
  updateBotSchema,
  testBotSchema,
};