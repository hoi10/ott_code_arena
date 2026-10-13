const { withTempDirectory } = require("./sandbox");
const { validateBotInput, parseBotOutput } = require("./protocol");
const { runJavaScript } = require("./adapters/javascript.adapter");
const { runPython } = require("./adapters/python.adapter");
const { runCpp } = require("./adapters/cpp.adapter");

const DEFAULT_TIMEOUT_MS = Number(process.env.BOT_TIMEOUT_MS) || 3000;
const MAX_TIMEOUT_MS = Number(process.env.BOT_MAX_TIMEOUT_MS) || 5000;
const MAX_OUTPUT_BYTES = Number(process.env.BOT_MAX_OUTPUT_BYTES) || 64 * 1024;
const MAX_SOURCE_LENGTH = Number(process.env.BOT_MAX_SOURCE_LENGTH) || 100000;
const MAX_INPUT_LENGTH = Number(process.env.BOT_MAX_INPUT_LENGTH) || 100000;
const MAX_MEMORY_MB = Number(process.env.BOT_MAX_MEMORY_MB) || 128;
const MAX_PROCESSES = Number(process.env.BOT_MAX_PROCESSES) || 16;

const adapters = {
  javascript: runJavaScript,
  python: runPython,
  cpp: runCpp,
};

async function runBot(sourceCode, input = {}, options = {}) {
  const language = options.language ?? "javascript";
  const adapter = adapters[language];
  if (!adapter) throw new Error("BOT_LANGUAGE_UNSUPPORTED");
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    throw new Error("SOURCE_CODE_REQUIRED");
  }
  if (sourceCode.length > MAX_SOURCE_LENGTH) {
    throw new Error("SOURCE_CODE_TOO_LARGE");
  }

  validateBotInput(input);
  const serializedInput = JSON.stringify(input);
  if (serializedInput.length > MAX_INPUT_LENGTH) {
    throw new Error("BOT_INPUT_TOO_LARGE");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("INVALID_BOT_TIMEOUT");
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new Error("INVALID_BOT_OUTPUT_LIMIT");
  }

  return withTempDirectory(async (workdir) => {
    const processResult = await adapter({
      sourceCode,
      input,
      timeoutMs,
      maxOutputBytes,
      maxMemoryMb: MAX_MEMORY_MB,
      maxProcesses: MAX_PROCESSES,
      workdir,
    });

    if (processResult.code !== 0) {
      const detail = processResult.stderr.trim().slice(0, 2000);
      if (detail.includes("Script execution timed out")) {
        throw new Error("BOT_EXECUTION_TIMEOUT");
      }
      throw new Error(detail ? `BOT_EXECUTION_FAILED: ${detail}` : "BOT_EXECUTION_FAILED");
    }

    return parseBotOutput(processResult.stdout, input);
  });
}

module.exports = {
  runBot,
};
