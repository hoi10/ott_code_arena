const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/game-engine/game-rules");

function makeState(overrides = {}) {
  return {
    boardSize: 9,
    turn: 0,
    currentPlayerId: "A",
    finished: false,
    winnerId: null,
    winReason: null,
    players: [
      {
        id: "A",
        home: { x: 0, y: 0, name: "a1" },
        target: { x: 8, y: 8, name: "i9" },
      },
      {
        id: "B",
        home: { x: 8, y: 8, name: "i9" },
        target: { x: 0, y: 0, name: "a1" },
      },
    ],
    pieces: [
      { id: "A-1", ownerId: "A", type: "bua", x: 3, y: 3 },
      { id: "B-1", ownerId: "B", type: "keo", x: 4, y: 4 },
      { id: "B-2", ownerId: "B", type: "bao", x: 5, y: 5 },
      { id: "B-3", ownerId: "B", type: "bua", x: 6, y: 6 },
    ],
    history: [],
    ...overrides,
  };
}

test("initializes nine random pieces per side with every type and empty homes", () => {
  const state = rules.createInitialState({
    participantIds: [11, 22],
    randomInt: (max) => max - 1,
  });

  assert.equal(state.boardSize, 9);
  assert.equal(state.pieces.length, 18);
  assert.ok(["11", "22"].includes(state.currentPlayerId));

  for (const player of state.players) {
    const pieces = state.pieces.filter((piece) => piece.ownerId === player.id);
    assert.equal(pieces.length, 9);
    assert.deepEqual(
      new Set(pieces.map((piece) => piece.type)),
      new Set(rules.PIECE_TYPES)
    );
    assert.ok(!pieces.some((piece) => piece.x === player.home.x && piece.y === player.home.y));

    for (const piece of pieces) {
      const start = player.home.name === "a1" ? 0 : 5;
      assert.ok(piece.x >= start && piece.x < start + 4);
      assert.ok(piece.y >= start && piece.y < start + 4);
    }
  }

  assert.equal(new Set(state.pieces.map((piece) => `${piece.x},${piece.y}`)).size, 18);
});

test("allows one-square movement in all eight directions", () => {
  const state = makeState({
    pieces: [{ id: "A-1", ownerId: "A", type: "bua", x: 3, y: 3 }],
  });

  assert.equal(rules.getLegalMoves(state, "A").length, 8);
  assert.deepEqual(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A"),
    { valid: true, piece: state.pieces[0], occupant: undefined }
  );
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 5, y: 3 } }, state, "A").reason,
    "MOVE_OUT_OF_RANGE"
  );
});

test("enforces rock-paper-scissors captures and blocks", () => {
  const state = makeState();

  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").valid,
    true
  );

  state.pieces[0].type = "keo";
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").reason,
    "OPPONENT_PIECE_BLOCKS_DESTINATION"
  );

  state.pieces[0].type = "bua";
  state.pieces.find((piece) => piece.id === "B-1").type = "keo";
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").valid,
    true
  );

  state.pieces[0].type = "keo";
  state.pieces.find((piece) => piece.id === "B-1").type = "bao";
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").valid,
    true
  );

  state.pieces[0].type = "bao";
  state.pieces.find((piece) => piece.id === "B-1").type = "bua";
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").valid,
    true
  );

  state.pieces[0].type = "bua";
  state.pieces.find((piece) => piece.id === "B-1").type = "bao";
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: 4, y: 4 } }, state, "A").reason,
    "OPPONENT_PIECE_BLOCKS_DESTINATION"
  );
});

test("friendly pieces block and invalid moves consume the turn without moving", () => {
  const state = makeState({
    pieces: [
      { id: "A-1", ownerId: "A", type: "bua", x: 3, y: 3 },
      { id: "A-2", ownerId: "A", type: "keo", x: 4, y: 4 },
      { id: "B-1", ownerId: "B", type: "keo", x: 7, y: 7 },
      { id: "B-2", ownerId: "B", type: "bao", x: 6, y: 7 },
      { id: "B-3", ownerId: "B", type: "bua", x: 7, y: 6 },
    ],
  });

  const result = rules.applyTurn(
    state,
    "A",
    { pieceId: "A-1", to: { x: 4, y: 4 } }
  );
  assert.equal(result.record.valid, false);
  assert.equal(result.record.reason, "FRIENDLY_PIECE_BLOCKS_DESTINATION");
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.currentPlayerId, "B");
  assert.deepEqual(result.state.pieces[0], state.pieces[0]);
});

test("capturing the last piece of one type does not end the match", () => {
  const result = rules.applyTurn(
    makeState(),
    "A",
    { pieceId: "A-1", to: { x: 4, y: 4 } }
  );

  assert.equal(result.record.valid, true);
  assert.equal(result.record.capturedPiece.id, "B-1");
  assert.equal(result.state.finished, false);
  assert.equal(result.state.winnerId, null);
  assert.equal(result.state.winReason, null);
  assert.equal(result.state.currentPlayerId, "B");
});

test("wins only after capturing every opposing piece", () => {
  const state = makeState({
    pieces: [
      { id: "A-1", ownerId: "A", type: "bua", x: 3, y: 3 },
      { id: "B-1", ownerId: "B", type: "keo", x: 4, y: 4 },
    ],
  });
  const result = rules.applyTurn(
    state,
    "A",
    { pieceId: "A-1", to: { x: 4, y: 4 } }
  );

  assert.equal(result.state.finished, true);
  assert.equal(result.state.winnerId, "A");
  assert.equal(result.state.winReason, "all_opponent_pieces_captured");
});

test("wins when a piece reaches the opponent home", () => {
  const state = makeState({
    pieces: [
      { id: "A-1", ownerId: "A", type: "bua", x: 7, y: 7 },
      { id: "B-1", ownerId: "B", type: "keo", x: 5, y: 5 },
      { id: "B-2", ownerId: "B", type: "bao", x: 6, y: 5 },
      { id: "B-3", ownerId: "B", type: "bua", x: 5, y: 6 },
    ],
  });

  const result = rules.applyTurn(
    state,
    "A",
    { pieceId: "A-1", to: { x: 8, y: 8 } }
  );
  assert.equal(result.state.winnerId, "A");
  assert.equal(result.state.winReason, "reached_opponent_home");
});

test("rejects movement outside the board and out-of-turn decisions", () => {
  const state = makeState();
  assert.equal(
    rules.validateMove({ pieceId: "A-1", to: { x: -1, y: 3 } }, state, "A").reason,
    "INVALID_DESTINATION"
  );
  assert.throws(
    () => rules.applyTurn(state, "B", null),
    { message: "NOT_PLAYERS_TURN" }
  );
});
