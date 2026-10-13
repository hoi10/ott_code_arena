// Classifies an error thrown while running a tournament game so the scheduler
// can decide whether to retry.
//
// The game engine already absorbs every bot fault (invalid move, timeout,
// crash, bad protocol output) as an ordinary lost turn inside `runTurn`, so a
// completed game never throws for a bot reason. Errors that actually escape
// `runGame` are therefore infrastructure/setup problems (spawn failure, worker
// death, corrupted state, persistence errors) and are safe to retry. This
// module keeps that policy explicit and guards against future regressions.

const BOT_ERROR_PATTERN =
  /^(BOT_EXECUTION_|BOT_OUTPUT_|BOT_INPUT_|BOT_LANGUAGE_|SOURCE_CODE_|EMPTY_BOT_RESULT|INVALID_BOT_|BOT_TIMEOUT)/;

const INFRA_ERROR_CODES = new Set([
  "MATCH_STATE_INVALID",
  "MATCH_STATE_NOT_INITIALIZED",
  "MATCH_COORDINATE_SYSTEM_UNSUPPORTED",
  "MATCH_ALREADY_FINISHED",
  "MATCH_REQUIRES_TWO_PARTICIPANTS",
  "MATCH_REQUIRES_TWO_DIFFERENT_PARTICIPANTS",
  "INVALID_MATCH_BOTS",
  "ACTIVE_BOT_NOT_FOUND",
  "BOT_RUNNER_REQUIRED",
]);

function extractCode(error) {
  if (!error) return "UNKNOWN";
  const message = String(error.message || error);
  const token = message.split(/[:\s]/)[0];
  return token || "UNKNOWN";
}

function classifyGameError(error) {
  const code = extractCode(error);

  if (BOT_ERROR_PATTERN.test(code)) {
    return { kind: "bot", code };
  }
  if (INFRA_ERROR_CODES.has(code)) {
    return { kind: "infrastructure", code };
  }
  // An unclassifiable failure is never treated as a loss and never retried
  // automatically; the host can requeue it explicitly.
  return { kind: "unknown", code };
}

module.exports = {
  classifyGameError,
};
