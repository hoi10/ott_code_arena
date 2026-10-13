const PROTOCOL_VERSION = 1;

function validateBotInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("BOT_INPUT_INVALID");
  }

  if (
    input.protocolVersion !== PROTOCOL_VERSION ||
    typeof input.playerId !== "string" ||
    !Number.isInteger(input.turn) ||
    !Number.isInteger(input.boardSize) ||
    !input.home ||
    !input.target ||
    !input.pieces ||
    !Array.isArray(input.pieces.own) ||
    !Array.isArray(input.pieces.opponent) ||
    !input.rules ||
    typeof input.rules !== "object" ||
    !Array.isArray(input.legalMoves)
  ) {
    throw new Error("BOT_INPUT_INVALID");
  }

  return input;
}

function parseBotOutput(stdout, input) {
  if (typeof stdout !== "string" || !stdout.trim()) {
    throw new Error("EMPTY_BOT_RESULT");
  }

  let output;
  try {
    output = JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error("INVALID_BOT_RESULT_JSON", { cause: error });
  }

  if (output === null) return null;

  if (
    typeof output !== "object" ||
    Array.isArray(output) ||
    typeof output.pieceId !== "string" ||
    !output.to ||
    !Number.isInteger(output.to.x) ||
    !Number.isInteger(output.to.y)
  ) {
    throw new Error("BOT_OUTPUT_SCHEMA_INVALID");
  }

  const isLegalMove = input.legalMoves.some(
    (move) =>
      move &&
      move.pieceId === output.pieceId &&
      move.to &&
      move.to.x === output.to.x &&
      move.to.y === output.to.y
  );

  if (!isLegalMove) {
    throw new Error("BOT_OUTPUT_ILLEGAL_MOVE");
  }

  return {
    pieceId: output.pieceId,
    to: { x: output.to.x, y: output.to.y },
  };
}

module.exports = {
  PROTOCOL_VERSION,
  validateBotInput,
  parseBotOutput,
};
