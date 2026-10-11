const DEFAULT_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 5000;
const MAX_SOURCE_LENGTH = 100000;
const MAX_INPUT_LENGTH = 100000;

function validateBotInput(sourceCode, input, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    throw new Error("SOURCE_CODE_REQUIRED");
  }

  if (sourceCode.length > MAX_SOURCE_LENGTH) {
    throw new Error("SOURCE_CODE_TOO_LARGE");
  }

  const serializedInput = JSON.stringify(input ?? {});

  if (serializedInput.length > MAX_INPUT_LENGTH) {
    throw new Error("BOT_INPUT_TOO_LARGE");
  }

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error("INVALID_BOT_TIMEOUT");
  }

  return {
    sourceCode,
    input: input ?? {},
    timeoutMs,
  };
}

module.exports = {
  validateBotInput,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_SOURCE_LENGTH,
  MAX_INPUT_LENGTH,
};