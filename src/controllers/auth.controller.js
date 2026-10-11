const authService = require("../services/auth.service");
const { registerSchema, loginSchema } = require("../validators/auth.validator");

const authController = {
  async register(req, res, next) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const user = await authService.register(validatedData);

      return res.status(201).json({
        success: true,
        message: "Đăng ký thành công.",
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData);

      return res.status(200).json({
        success: true,
        message: "Đăng nhập thành công.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;