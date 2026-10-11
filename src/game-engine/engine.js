const gameRules = require("./game-rules");

async function runTurn({ state, participants, runBot }) {
  if (!state || state.finished) {
    throw new Error("MATCH_ALREADY_FINISHED");
  }
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error("MATCH_REQUIRES_TWO_PARTICIPANTS");
  }
  if (typeof runBot !== "function") {
    throw new Error("BOT_RUNNER_REQUIRED");
  }

  const currentParticipant = participants.find(
    (participant) => String(participant.id) === state.currentPlayerId
  );
  if (!currentParticipant?.bot?.isActive) {
    throw new Error("ACTIVE_BOT_NOT_FOUND");
  }

  let action;
  let error;
  try {
    action = await runBot(
      currentParticipant.bot.sourceCode,
      gameRules.createBotInput(state, currentParticipant.id)
    );
  } catch (runError) {
    error = runError;
  }

  const result = gameRules.applyTurn(
    state,
    currentParticipant.id,
    action,
    error
  );

  return {
    ...result,
    botId: currentParticipant.bot.id,
  };
}

async function runGame({ botA, botB, runBot, initialState } = {}) {
  if (!botA || !botB || botA.id === botB.id) {
    throw new Error("INVALID_MATCH_BOTS");
  }

  const participants = [
    { id: String(botA.id), bot: botA },
    { id: String(botB.id), bot: botB },
  ];
  let state =
    initialState ??
    gameRules.createInitialState({
      participantIds: participants.map((participant) => participant.id),
    });

  while (!state.finished) {
    ({ state } = await runTurn({ state, participants, runBot }));
  }

  return {
    status: "completed",
    winnerId: state.winnerId,
    reason: state.winReason,
    turns: state.turn,
    history: state.history,
    finalState: state,
  };
}

module.exports = {
  runTurn,
  runGame,
};
