const test = require("node:test");
const assert = require("node:assert/strict");
const { runTurn } = require("../src/game-engine/engine");

function makeState() {
  return {
    boardSize: 9,
    turn: 0,
    currentPlayerId: "1",
    finished: false,
    winnerId: null,
    winReason: null,
    players: [
      {
        id: "1",
        home: { x: 0, y: 0, name: "a1" },
        target: { x: 8, y: 8, name: "i9" },
      },
      {
        id: "2",
        home: { x: 8, y: 8, name: "i9" },
        target: { x: 0, y: 0, name: "a1" },
      },
    ],
    pieces: [
      { id: "1-1", ownerId: "1", type: "bua", x: 1, y: 1 },
      { id: "1-2", ownerId: "1", type: "keo", x: 2, y: 1 },
      { id: "1-3", ownerId: "1", type: "bao", x: 1, y: 2 },
      { id: "2-1", ownerId: "2", type: "bua", x: 7, y: 7 },
      { id: "2-2", ownerId: "2", type: "keo", x: 6, y: 7 },
      { id: "2-3", ownerId: "2", type: "bao", x: 7, y: 6 },
    ],
    history: [],
  };
}

test("runs the currently assigned bot with the legal-move input", async () => {
  let observedSource;
  let observedInput;
  const result = await runTurn({
    state: makeState(),
    participants: [
      { id: 1, bot: { id: 101, isActive: true, sourceCode: "first bot code" } },
      { id: 2, bot: { id: 202, isActive: true, sourceCode: "second bot code" } },
    ],
    runBot: async (sourceCode, input) => {
      observedSource = sourceCode;
      observedInput = input;
      return { pieceId: "1-1", to: { x: 2, y: 2 } };
    },
  });

  assert.equal(observedSource, "first bot code");
  assert.equal(observedInput.playerId, "1");
  assert.ok(observedInput.legalMoves.length > 0);
  assert.equal(result.record.valid, true);
  assert.equal(result.state.currentPlayerId, "2");
  assert.equal(result.botId, 101);
});

test("a bot execution failure loses the turn without changing the board", async () => {
  const state = makeState();
  const result = await runTurn({
    state,
    participants: [
      { id: 1, bot: { id: 101, isActive: true, sourceCode: "broken" } },
      { id: 2, bot: { id: 202, isActive: true, sourceCode: "valid" } },
    ],
    runBot: async () => {
      throw new Error("BOT_EXECUTION_TIMEOUT");
    },
  });

  assert.equal(result.record.valid, false);
  assert.equal(result.record.reason, "BOT_EXECUTION_FAILED");
  assert.match(result.record.error, /BOT_EXECUTION_TIMEOUT/);
  assert.deepEqual(result.state.pieces, state.pieces);
  assert.equal(result.state.currentPlayerId, "2");
});

test("uses the replacement bot for its owner's next turn", async () => {
  const state = makeState();
  state.currentPlayerId = "2";
  let observedSource;
  const participants = [
    { id: 1, bot: { id: 103, isActive: true, sourceCode: "switched bot" } },
    { id: 2, bot: { id: 202, isActive: true, sourceCode: "opponent bot" } },
  ];
  const opponentTurn = await runTurn({
    state,
    participants,
    runBot: async (sourceCode) => {
      observedSource = sourceCode;
      return { pieceId: "2-1", to: { x: 6, y: 6 } };
    },
  });

  assert.equal(observedSource, "opponent bot");
  assert.equal(opponentTurn.state.currentPlayerId, "1");
  const nextTurn = await runTurn({
    state: opponentTurn.state,
    participants,
    runBot: async (sourceCode) => {
      observedSource = sourceCode;
      return { pieceId: "1-1", to: { x: 2, y: 2 } };
    },
  });

  assert.equal(observedSource, "switched bot");
  assert.equal(nextTurn.botId, 103);
});
