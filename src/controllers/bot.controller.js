const botService = require("../services/bot.service");
const {
  createBotSchema,
  updateBotSchema,
  testBotSchema,
} = require("../validators/bot.validator");

const botController = {
  async getMyBots(req, res, next) {
    try {
      const bots = await botService.getMyBots(req.user.id);

      return res.status(200).json({
        success: true,
        data: { bots },
      });
    } catch (error) {
      next(error);
    }
  },

  async getPublicBots(req, res, next) {
    try {
      const bots = await botService.getPublicBots(req.user.id);
      return res.status(200).json({
        success: true,
        data: { bots },
      });
    } catch (error) {
      next(error);
    }
  },

  async getBotById(req, res, next) {
    try {
      const botId = Number(req.params.id);

      if (!Number.isSafeInteger(botId) || botId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã bot không hợp lệ.",
        });
      }

      const bot = await botService.getBotById(botId, req.user.id);

      return res.status(200).json({
        success: true,
        data: { bot },
      });
    } catch (error) {
      next(error);
    }
  },

  async createBot(req, res, next) {
    try {
      const validatedData = createBotSchema.parse(req.body);
      const bot = await botService.createBot(req.user.id, validatedData);

      return res.status(201).json({
        success: true,
        message: "Đã tạo bot thành công.",
        data: { bot },
      });
    } catch (error) {
      next(error);
    }
  },

  async testBot(req, res, next) {
    try {
      const { sourceCode } = testBotSchema.parse(req.body);
      const result = await botService.testBot(sourceCode);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error.message?.startsWith("BOT_")) {
        return res.status(422).json({
          success: false,
          message: `Không thể chạy bot. Nguyên nhân: ${describeBotError(error.message)}`,
        });
      }
      next(error);
    }
  },

  async updateBot(req, res, next) {
    try {
      const botId = Number(req.params.id);

      if (!Number.isSafeInteger(botId) || botId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã bot không hợp lệ.",
        });
      }

      const validatedData = updateBotSchema.parse(req.body);
      const bot = await botService.updateBot(
        botId,
        req.user.id,
        validatedData
      );

      return res.status(200).json({
        success: true,
        message: "Đã cập nhật bot thành công.",
        data: { bot },
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteBot(req, res, next) {
    try {
      const botId = Number(req.params.id);

      if (!Number.isSafeInteger(botId) || botId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã bot không hợp lệ.",
        });
      }

      await botService.deleteBot(botId, req.user.id);

      return res.status(200).json({
        success: true,
        message: "Đã xóa bot thành công.",
      });
    } catch (error) {
      next(error);
    }
  },
};

function describeBotError(errorCode) {
  return {
    BOT_EXECUTION_TIMEOUT: "bot chạy quá thời gian cho phép",
    BOT_OUTPUT_LIMIT_EXCEEDED: "kết quả bot trả về vượt quá giới hạn",
    BOT_EXECUTION_FAILED: "đã xảy ra lỗi khi thực thi mã",
    SOURCE_CODE_REQUIRED: "chưa có mã nguồn",
    SOURCE_CODE_TOO_LARGE: "mã nguồn vượt quá dung lượng cho phép",
    BOT_INPUT_TOO_LARGE: "dữ liệu bàn cờ vượt quá giới hạn",
  }[errorCode] || "mã bot không thể thực thi";
}

module.exports = botController;