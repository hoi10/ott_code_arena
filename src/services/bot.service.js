const botRepository = require("../repositories/bot.repository");
const gameRules = require("../game-engine/game-rules");
const gameEngine = require("../game-engine/engine");
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
      protocolVersion: data.protocolVersion ?? 2,
      isPublic: data.isPublic ?? false,
      userId,
    });
  },

  async testBot(sourceCode, language = "javascript", testState = null, protocolVersion = 2) {
    const state = testState
      ? gameRules.createTestState(testState)
      : gameRules.createInitialState({ participantIds: ["1", "2"] });
    const playerId = testState ? "1" : state.currentPlayerId;
    const opponentId = state.players.find(
      (player) => player.id !== String(playerId)
    ).id;
    const turnResult = await gameEngine.runTurn({
      state,
      participants: [
        {
          id: String(playerId),
          bot: { id: "test-bot", sourceCode, language, protocolVersion, isActive: true },
        },
        {
          id: String(opponentId),
          bot: { id: "test-opponent", sourceCode: "", language: "javascript", protocolVersion: 2, isActive: true },
        },
      ],
      runBot,
    });

    return {
      valid: turnResult.record.valid,
      reason: turnResult.record.reason ?? null,
      action: turnResult.proposedAction,
      error: turnResult.record.error,
      input: gameRules.createBotInput(state, playerId, protocolVersion),
      stateBefore: state,
      stateAfter: turnResult.state,
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
