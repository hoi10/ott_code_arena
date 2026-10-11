const matchRepository = require("../repositories/match.repository");
const botRepository = require("../repositories/bot.repository");
const gameEngine = require("./engine");
const gameRules = require("./game-rules");
const { runBot } = require("../bot-runner/runner");

const matchManager = {
  async createMatch(botIds) {
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

    const match = await matchRepository.createWithParticipants(botIds);
    const state = gameRules.createInitialState({
      participantIds: match.participants.map((participant) => participant.id),
    });

    return matchRepository.updateResult(match.id, {
      status: "pending",
      winnerId: null,
      result: state,
      startedAt: null,
      endedAt: null,
    });
  },

  async runMatch(matchId) {
    const match = await matchRepository.findById(matchId);

    if (!match) {
      throw new Error("MATCH_NOT_FOUND");
    }

    if (!["pending", "running"].includes(match.status)) {
      throw new Error("MATCH_NOT_RUNNING");
    }

    if (match.participants.length !== 2) {
      throw new Error("MATCH_REQUIRES_TWO_BOTS");
    }

    const [participantA, participantB] = match.participants;
    const botA = participantA.bot;
    const botB = participantB.bot;

    if (!botA?.isActive || !botB?.isActive) {
      throw new Error("MATCH_BOTS_NOT_FOUND_OR_INACTIVE");
    }

    try {
      if (!match.result || !Array.isArray(match.result.pieces)) {
        throw new Error("MATCH_STATE_NOT_INITIALIZED");
      }

      const turnResult = await gameEngine.runTurn({
        state: match.result,
        participants: match.participants,
        runBot,
      });
      const { state } = turnResult;
      const isFinished = state.finished;

      for (const participant of match.participants) {
        const pieceCount = state.pieces.filter(
          (piece) => piece.ownerId === String(participant.id)
        ).length;
        await matchRepository.updateParticipantScoreById(
          participant.id,
          pieceCount,
          state.winnerId === String(participant.id)
        );
      }

      return matchRepository.updateResult(matchId, {
        status: isFinished ? "completed" : "running",
        winnerId: isFinished
          ? match.participants.find(
              (participant) => String(participant.id) === state.winnerId
            )?.botId ?? null
          : null,
        result: state,
        startedAt: match.startedAt ?? new Date(),
        endedAt: isFinished ? new Date() : null,
      });
    } catch (error) {
      await matchRepository.updateResult(matchId, {
        status: "failed",
        winnerId: null,
        result: {
          error: error.message || "MATCH_EXECUTION_FAILED",
        },
        startedAt: match.startedAt ?? new Date(),
        endedAt: new Date(),
      });

      throw error;
    }
  },
};

module.exports = matchManager;