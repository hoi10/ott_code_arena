const fs = require("fs");
const path = require("path");
const { runSandboxed } = require("../sandbox");

async function runJavaScript({ sourceCode, input, timeoutMs, maxOutputBytes, workdir }) {
  const workerPath = path.join(workdir, "javascript-worker.js");
  await fs.promises.copyFile(path.join(__dirname, "..", "javascript-worker.js"), workerPath);
  return runSandboxed({
    command: process.execPath,
    args: [workerPath],
    workdir,
    stdin: JSON.stringify({ sourceCode, input, timeoutMs }),
    timeoutMs: timeoutMs + 1000,
    maxOutputBytes,
  });
}

module.exports = { runJavaScript };
