const { randomInt: secureRandomInt } = require("crypto");

const BOARD_SIZE = 9;
const PIECES_PER_PLAYER = 9;
const MAX_TURNS = 1000;
const PIECE_TYPES = ["bua", "keo", "bao"];
const CAPTURES = {
  bua: "keo",
  keo: "bao",
  bao: "bua",
};

function positionName(x, y) {
  return `${String.fromCharCode(97 + x)}${y + 1}`;
}

function shuffle(values, randomInt = secureRandomInt) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function createPlayerPieces(playerId, corner, randomInt = secureRandomInt) {
  const start = corner === "a1" ? 0 : BOARD_SIZE - 4;
  const cells = [];

  for (let y = start; y < start + 4; y += 1) {
    for (let x = start; x < start + 4; x += 1) {
      if (positionName(x, y) !== corner) cells.push({ x, y });
    }
  }

  const types = shuffle([
    ...PIECE_TYPES,
    ...Array.from({ length: PIECES_PER_PLAYER - PIECE_TYPES.length }, () =>
      PIECE_TYPES[randomInt(PIECE_TYPES.length)]
    ),
  ], randomInt);
  const positions = shuffle(cells, randomInt).slice(0, PIECES_PER_PLAYER);

  return positions.map((position, index) => ({
    id: `${playerId}-${index + 1}`,
    ownerId: String(playerId),
    type: types[index],
    ...position,
  }));
}

function createInitialState({ participantIds, randomInt = secureRandomInt } = {}) {
  if (!Array.isArray(participantIds) || participantIds.length !== 2) {
    throw new Error("MATCH_REQUIRES_TWO_PARTICIPANTS");
  }

  const [playerAId, playerBId] = participantIds.map(String);
  if (playerAId === playerBId) {
    throw new Error("MATCH_REQUIRES_TWO_DIFFERENT_PARTICIPANTS");
  }

  const firstPlayerIndex = randomInt(2);
  const players = [
    {
      id: playerAId,
      home: { x: 0, y: 0, name: "a1" },
      target: { x: 8, y: 8, name: "i9" },
    },
    {
      id: playerBId,
      home: { x: 8, y: 8, name: "i9" },
      target: { x: 0, y: 0, name: "a1" },
    },
  ];

  return {
    boardSize: BOARD_SIZE,
    turn: 0,
    currentPlayerId: players[firstPlayerIndex].id,
    finished: false,
    winnerId: null,
    winReason: null,
    players,
    pieces: [
      ...createPlayerPieces(playerAId, "a1", randomInt),
      ...createPlayerPieces(playerBId, "i9", randomInt),
    ],
    history: [],
  };
}

function getLegalMoves(state, playerId) {
  const ownerId = String(playerId);
  const ownPieces = state.pieces.filter((piece) => piece.ownerId === ownerId);
  const occupied = new Map(
    state.pieces.map((piece) => [`${piece.x},${piece.y}`, piece])
  );
  const moves = [];

  for (const piece of ownPieces) {
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;

        const x = piece.x + deltaX;
        const y = piece.y + deltaY;
        if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) continue;

        const occupant = occupied.get(`${x},${y}`);
        if (occupant?.ownerId === ownerId) continue;
        if (occupant && CAPTURES[piece.type] !== occupant.type) continue;

        moves.push({
          pieceId: piece.id,
          to: { x, y, name: positionName(x, y) },
          capturePieceId: occupant?.id ?? null,
          captureType: occupant?.type ?? null,
        });
      }
    }
  }

  return moves;
}

function createBotInput(state, playerId) {
  const player = state.players.find((entry) => entry.id === String(playerId));
  if (!player) throw new Error("PLAYER_NOT_FOUND");

  return {
    playerId: player.id,
    turn: state.turn,
    boardSize: BOARD_SIZE,
    home: structuredClone(player.home),
    target: structuredClone(player.target),
    pieces: {
      own: structuredClone(
        state.pieces.filter((piece) => piece.ownerId === player.id)
      ),
      opponent: structuredClone(
        state.pieces.filter((piece) => piece.ownerId !== player.id)
      ),
    },
    legalMoves: getLegalMoves(state, player.id),
    rules: {
      types: [...PIECE_TYPES],
      captures: { ...CAPTURES },
      movement: "one square in any of the eight directions",
      invalidMove: "the piece stays in place and the turn passes",
    },
  };
}

function validateMove(action, state, playerId) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { valid: false, reason: "INVALID_ACTION_FORMAT" };
  }

  if (typeof action.pieceId !== "string") {
    return { valid: false, reason: "INVALID_PIECE_ID" };
  }

  const piece = state.pieces.find(
    (entry) => entry.id === action.pieceId && entry.ownerId === String(playerId)
  );
  if (!piece) return { valid: false, reason: "PIECE_NOT_FOUND" };

  const destination = action.to;
  if (
    !destination ||
    !Number.isInteger(destination.x) ||
    !Number.isInteger(destination.y) ||
    destination.x < 0 ||
    destination.y < 0 ||
    destination.x >= BOARD_SIZE ||
    destination.y >= BOARD_SIZE
  ) {
    return { valid: false, reason: "INVALID_DESTINATION" };
  }

  const distanceX = Math.abs(destination.x - piece.x);
  const distanceY = Math.abs(destination.y - piece.y);
  if (Math.max(distanceX, distanceY) !== 1) {
    return { valid: false, reason: "MOVE_OUT_OF_RANGE" };
  }

  const occupant = state.pieces.find(
    (entry) => entry.x === destination.x && entry.y === destination.y
  );

  if (occupant?.ownerId === piece.ownerId) {
    return { valid: false, reason: "FRIENDLY_PIECE_BLOCKS_DESTINATION" };
  }

  if (occupant && CAPTURES[piece.type] !== occupant.type) {
    return { valid: false, reason: "OPPONENT_PIECE_BLOCKS_DESTINATION" };
  }

  return { valid: true, piece, occupant };
}

function applyTurn(state, playerId, action, error) {
  if (state.finished) throw new Error("MATCH_ALREADY_FINISHED");
  if (state.currentPlayerId !== String(playerId)) {
    throw new Error("NOT_PLAYERS_TURN");
  }

  const validation = error
    ? { valid: false, reason: "BOT_EXECUTION_FAILED" }
    : validateMove(action, state, playerId);
  const nextState = structuredClone(state);
  const record = {
    turn: state.turn + 1,
    playerId: String(playerId),
    action: validation.valid ? structuredClone(action) : null,
    valid: validation.valid,
    reason: validation.reason ?? null,
    error: error ? String(error.message || error).slice(0, 500) : null,
    capturedPiece: null,
  };

  if (validation.valid) {
    const piece = nextState.pieces.find((entry) => entry.id === action.pieceId);
    const occupantIndex = nextState.pieces.findIndex(
      (entry) => entry.x === action.to.x && entry.y === action.to.y
    );

    if (occupantIndex !== -1) {
      [record.capturedPiece] = nextState.pieces.splice(occupantIndex, 1);
    }

    piece.x = action.to.x;
    piece.y = action.to.y;

    const player = nextState.players.find((entry) => entry.id === piece.ownerId);
    if (piece.x === player.target.x && piece.y === player.target.y) {
      nextState.finished = true;
      nextState.winnerId = player.id;
      nextState.winReason = "reached_opponent_home";
    }
  }

  nextState.turn += 1;
  nextState.history.push(record);

  if (!nextState.finished) {
    const remainingPieces = nextState.pieces.filter(
      (piece) => piece.ownerId !== String(playerId)
    );
    const opponent = nextState.players.find(
      (player) => player.id !== String(playerId)
    );
    const hasLostAllPieces = remainingPieces.length === 0;

    if (hasLostAllPieces) {
      nextState.finished = true;
      nextState.winnerId = String(playerId);
      nextState.winReason = "all_opponent_pieces_captured";
    } else if (nextState.turn >= MAX_TURNS) {
      nextState.finished = true;
      nextState.winnerId = null;
      nextState.winReason = "turn_limit";
    } else {
      nextState.currentPlayerId = opponent.id;
    }
  }

  return { state: nextState, validation, record };
}

module.exports = {
  BOARD_SIZE,
  PIECES_PER_PLAYER,
  MAX_TURNS,
  PIECE_TYPES,
  CAPTURES,
  positionName,
  createInitialState,
  createBotInput,
  getLegalMoves,
  validateMove,
  applyTurn,
};
