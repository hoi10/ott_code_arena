const test = require("node:test");
const assert = require("node:assert/strict");
const { runBot } = require("../src/bot-runner/runner");
const gameRules = require("../src/game-engine/game-rules");

test("executes submitted code with the documented legal-move input", async () => {
  const state = gameRules.createInitialState({
    participantIds: ["player", "opponent"],
  });
  const playerId = state.currentPlayerId;
  const botInput = gameRules.createBotInput(state, playerId);
  const result = await runBot(
    "return input.legalMoves.length ? { pieceId: input.legalMoves[0].pieceId, to: input.legalMoves[0].to } : null;",
    botInput
  );

  assert.equal(gameRules.validateMove(result, state, playerId).valid, true);
});

test("reports syntax errors rather than masking them as successful runs", async () => {
  await assert.rejects(
    () => runBot("return {", {}),
    /BOT_EXECUTION_FAILED|Unexpected end|Unexpected token/
  );
});
