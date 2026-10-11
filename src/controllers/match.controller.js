const matchService = require("../services/match.service");
const {
  createMatchSchema,
  listMatchesSchema,
  changeBotSchema,
} = require("../validators/match.validator");

function hideBotSource(match) {
  if (!match?.participants) return match;
  return {
    ...match,
    participants: match.participants.map((participant) => ({
      ...participant,
      bot: participant.bot
        ? { ...participant.bot, sourceCode: undefined }
        : participant.bot,
    })),
  };
}

const matchController = {
  async getMatches(req, res, next) {
    try {
      const query = listMatchesSchema.parse(req.query);
      const result = await matchService.getMatches(req.user.id, query);

      return res.status(200).json({
        success: true,
        data: {
          ...result,
          matches: result.matches.map(hideBotSource),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getMatchById(req, res, next) {
    try {
      const matchId = Number(req.params.id);

      if (!Number.isSafeInteger(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã trận đấu không hợp lệ.",
        });
      }

      const match = await matchService.getMatchById(matchId);

      return res.status(200).json({
        success: true,
        data: { match: hideBotSource(match) },
      });
    } catch (error) {
      next(error);
    }
  },

  async createMatch(req, res, next) {
    try {
      const validatedData = createMatchSchema.parse(req.body);

      const match = await matchService.createMatch(
        req.user.id,
        validatedData
      );

      return res.status(201).json({
        success: true,
        message: "Đã tạo trận đấu thành công.",
        data: { match: hideBotSource(match) },
      });
    } catch (error) {
      next(error);
    }
  },

  async runMatch(req, res, next) {
    try {
      const matchId = Number(req.params.id);

      if (!Number.isSafeInteger(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã trận đấu không hợp lệ.",
        });
      }

      const match = await matchService.runMatch(matchId, req.user.id);

      return res.status(200).json({
        success: true,
        message: match.status === "completed" ? "Trận đấu đã kết thúc." : "Đã hoàn thành lượt đi.",
        data: { match: hideBotSource(match) },
      });
    } catch (error) {
      next(error);
    }
  },

  async changeBot(req, res, next) {
    try {
      const matchId = Number(req.params.id);
      if (!Number.isSafeInteger(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã trận đấu không hợp lệ.",
        });
      }

      const { participantId, botId } = changeBotSchema.parse(req.body);
      const match = await matchService.changeBot(
        matchId,
        req.user.id,
        participantId,
        botId
      );

      return res.status(200).json({
        success: true,
        message: "Đã đổi bot cho lượt đi tiếp theo.",
        data: { match: hideBotSource(match) },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = matchController;