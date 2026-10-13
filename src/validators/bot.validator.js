const { z } = require("zod");

const botLanguageSchema = z.enum(["javascript", "cpp", "python"]);
const protocolVersionSchema = z.union([z.literal(1), z.literal(2)]);

const createBotSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  sourceCode: z.string().min(1).max(100000),
  language: botLanguageSchema.default("javascript"),
  protocolVersion: protocolVersionSchema.default(2),
  isPublic: z.boolean().default(false),
});

const updateBotSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    sourceCode: z.string().min(1).max(100000).optional(),
    language: botLanguageSchema.optional(),
    protocolVersion: protocolVersionSchema.optional(),
    isActive: z.boolean().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const testBotSchema = z.object({
  sourceCode: z.string().min(1).max(100000),
  language: botLanguageSchema.default("javascript"),
  protocolVersion: protocolVersionSchema.default(2),
});

module.exports = {
  createBotSchema,
  updateBotSchema,
  testBotSchema,
};
