const matchRepository = require("../repositories/match.repository");
const botRepository = require("../repositories/bot.repository");
const matchManager = require("../game-engine/match-manager");

const matchService = {
  async getMatches(userId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      matchRepository.findMany({ skip, take: limit, status, userId }),
      matchRepository.count({ status, userId }),
    ]);

    return {
      matches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getMatchById(matchId) {
    const match = await matchRepository.findById(matchId);

    if (!match) {
      throw new Error("MATCH_NOT_FOUND");
    }

    return match;
  },

  async createMatch(userId, { botIds }) {
    if (!Array.isArray(botIds) || botIds.length !== 2) {
      throw new Error("MATCH_REQUIRES_TWO_BOTS");
    }

    if (new Set(botIds).size !== 2) {
      throw new Error("MATCH_REQUIRES_TWO_DIFFERENT_BOTS");
    }

    const bots = await botRepository.findActiveBotsByIds(botIds);

    if (bots.length !== 2) {
      throw new Error("MATCH_BOTS_NOT_FOUND_OR_INACTIVE");
    }

    if (!bots.some((bot) => bot.userId === userId)) {
      throw new Error("MATCH_REQUIRES_OWNED_BOT");
    }

    const unavailableOpponent = bots.some(
      (bot) => bot.userId !== userId && !bot.isPublic
    );
    if (unavailableOpponent) {
      throw new Error("MATCH_OPPONENT_BOT_NOT_PUBLIC");
    }

    return matchManager.createMatch(botIds);
  },

  async runMatch(matchId, userId) {
    const match = await matchRepository.findById(matchId);

    if (!match) {
      throw new Error("MATCH_NOT_FOUND");
    }

    if (!["pending", "running"].includes(match.status)) {
      throw new Error("MATCH_NOT_RUNNING");
    }

    if (!match.participants.some((participant) => participant.bot.userId === userId)) {
      throw new Error("MATCH_ACCESS_DENIED");
    }

    return matchManager.runMatch(matchId);
  },

  async changeBot(matchId, userId, participantId, botId) {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new Error("MATCH_NOT_FOUND");
    if (!["pending", "running"].includes(match.status) || match.result?.finished) {
      throw new Error("MATCH_NOT_RUNNING");
    }

    const participant = match.participants.find(
      (entry) => entry.id === participantId
    );
    if (!participant) throw new Error("MATCH_PARTICIPANT_NOT_FOUND");
    if (participant.bot.userId !== userId) {
      throw new Error("MATCH_ACCESS_DENIED");
    }
    if (match.result?.currentPlayerId === String(participantId)) {
      throw new Error("BOT_SWITCH_ONLY_DURING_OPPONENT_TURN");
    }

    const bot = await botRepository.findByIdAndUserId(botId, userId);
    if (!bot || !bot.isActive) throw new Error("BOT_NOT_FOUND_OR_INACTIVE");
    if (match.participants.some(
      (entry) => entry.id !== participantId && entry.botId === botId
    )) {
      throw new Error("BOT_ALREADY_ASSIGNED_TO_MATCH");
    }

    await matchRepository.updateParticipantBot(matchId, participantId, botId);
    return matchRepository.findById(matchId);
  },
};

module.exports = matchService;