const { z } = require("zod");

const updateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
};