const MAX_RESULT_LENGTH = 65536;

function parseBotResult(rawOutput) {
  if (typeof rawOutput !== "string" || !rawOutput.trim()) {
    throw new Error("EMPTY_BOT_RESULT");
  }

  if (rawOutput.length > MAX_RESULT_LENGTH) {
    throw new Error("BOT_RESULT_TOO_LARGE");
  }

  let parsed;

  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error("INVALID_BOT_RESULT_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_BOT_RESULT_FORMAT");
  }

  if (typeof parsed.success !== "boolean") {
    throw new Error("INVALID_BOT_RESULT_FORMAT");
  }

  if (!parsed.success) {
    return {
      success: false,
      error:
        typeof parsed.error === "string"
          ? parsed.error.slice(0, 1000)
          : "BOT_EXECUTION_FAILED",
    };
  }

  return {
    success: true,
    result: parsed.result ?? null,
  };
}

module.exports = {
  parseBotResult,
};