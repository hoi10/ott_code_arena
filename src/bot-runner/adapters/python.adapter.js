const fs = require("fs");
const path = require("path");
const { runSandboxed } = require("../sandbox");

async function runPython({ sourceCode, input, timeoutMs, maxOutputBytes, workdir }) {
  const pythonPath = process.env.BOT_PYTHON_PATH || "python3";
  const sourcePath = path.join(workdir, "bot.py");
  await fs.promises.writeFile(sourcePath, sourceCode, { mode: 0o600 });
  return runSandboxed({
    command: pythonPath,
    args: [sourcePath],
    workdir,
    stdin: JSON.stringify(input),
    timeoutMs,
    maxOutputBytes,
  });
}

module.exports = { runPython };
