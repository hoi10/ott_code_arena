const botRepository = require("../repositories/bot.repository");
const gameRules = require("../game-engine/game-rules");
const { runBot } = require("../bot-runner/runner");

const botService = {
  async getMyBots(userId) {
    return botRepository.findByUserId(userId);
  },

  async getBotById(botId, userId) {
    const bot = await botRepository.findById(botId);

    if (!bot) {
      throw new Error("BOT_NOT_FOUND");
    }

    if (bot.userId !== userId) {
      throw new Error("BOT_ACCESS_DENIED");
    }

    return bot;
  },

  async getPublicBots(userId) {
    return botRepository.findPublicBots(userId);
  },

  async createBot(userId, data) {
    return botRepository.create({
      name: data.name,
      description: data.description ?? null,
      sourceCode: data.sourceCode,
      language: data.language ?? "javascript",
      isPublic: data.isPublic ?? false,
      userId,
    });
  },

  async testBot(sourceCode) {
    const state = gameRules.createInitialState({
      participantIds: ["1", "2"],
    });
    const playerId = state.currentPlayerId;
    const action = await runBot(
      sourceCode,
      gameRules.createBotInput(state, playerId)
    );
    const validation = gameRules.validateMove(action, state, playerId);

    return {
      valid: validation.valid,
      reason: validation.reason ?? null,
      action,
    };
  },

  async updateBot(botId, userId, data) {
    const bot = await botRepository.findByIdAndUserId(botId, userId);

    if (!bot) {
      throw new Error("BOT_NOT_FOUND");
    }

    return botRepository.update(botId, data);
  },

  async deleteBot(botId, userId) {
    const bot = await botRepository.findByIdAndUserId(botId, userId);

    if (!bot) {
      throw new Error("BOT_NOT_FOUND");
    }

    if (await botRepository.countMatchParticipants(botId)) {
      throw new Error("BOT_ALREADY_IN_MATCH");
    }

    return botRepository.delete(botId);
  },
};

module.exports = botService;