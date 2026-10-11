const util = require("util");

const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = process.env.LOG_LEVEL || "INFO";
const threshold = LEVELS[currentLevel.toUpperCase()] ?? LEVELS.INFO;

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const details = meta ? ` ${util.inspect(meta, { depth: 3, colors: false })}` : "";

  return `[${timestamp}] [${level}] ${message}${details}`;
}

function log(level, message, meta) {
  if (LEVELS[level] > threshold) {
    return;
  }

  const output = formatMessage(level, message, meta);

  if (level === "ERROR") {
    console.error(output);
  } else if (level === "WARN") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

const logger = {
  error(message, meta) {
    log("ERROR", message, meta);
  },

  warn(message, meta) {
    log("WARN", message, meta);
  },

  info(message, meta) {
    log("INFO", message, meta);
  },

  debug(message, meta) {
    log("DEBUG", message, meta);
  },
};

module.exports = logger;