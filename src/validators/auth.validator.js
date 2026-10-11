const { z } = require("zod");

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/),

    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((value) => value.toLowerCase()),

    password: z
      .string()
      .min(8)
      .max(72),
  });

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),

  password: z.string().min(1).max(72),
});

module.exports = {
  registerSchema,
  loginSchema,
};