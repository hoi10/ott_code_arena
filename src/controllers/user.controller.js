const userService = require("../services/user.service");
const {
  updateProfileSchema,
  changePasswordSchema,
} = require("../validators/user.validator");

const userController = {
  async getProfile(req, res, next) {
    try {
      const user = await userService.getProfile(req.user.id);

      return res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const validatedData = updateProfileSchema.parse(req.body);

      const user = await userService.updateProfile(
        req.user.id,
        validatedData
      );

      return res.status(200).json({
        success: true,
        message: "Đã cập nhật hồ sơ thành công.",
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserStats(req, res, next) {
    try {
      const stats = await userService.getUserStats(req.user.id);

      return res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req, res, next) {
    try {
      const validatedData = changePasswordSchema.parse(req.body);
      await userService.changePassword(req.user.id, validatedData);

      return res.status(200).json({
        success: true,
        message: "Đã cập nhật mật khẩu thành công.",
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = userController;