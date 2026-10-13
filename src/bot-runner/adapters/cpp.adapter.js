const fs = require("fs");
const path = require("path");
const { runSandboxed } = require("../sandbox");

async function runCpp({ sourceCode, input, timeoutMs, maxOutputBytes, workdir }) {
  const compilerPath = process.env.BOT_CPP_COMPILER || "g++";
  const sourcePath = path.join(workdir, "bot.cpp");
  const executablePath = path.join(workdir, "bot-executable");
  await fs.promises.writeFile(sourcePath, sourceCode, { mode: 0o600 });

  const compilation = await runSandboxed({
    command: compilerPath,
    args: ["-std=c++17", "-O2", "-pipe", sourcePath, "-o", executablePath],
    workdir,
    stdin: "",
    timeoutMs: Math.min(timeoutMs * 4, 10000),
    maxOutputBytes,
    writable: true,
  });

  if (compilation.code !== 0) {
    const detail = compilation.stderr.trim().slice(0, 2000);
    throw new Error(detail ? `BOT_COMPILATION_FAILED: ${detail}` : "BOT_COMPILATION_FAILED");
  }

  return runSandboxed({
    command: executablePath,
    workdir,
    stdin: JSON.stringify(input),
    timeoutMs,
    maxOutputBytes,
  });
}

module.exports = { runCpp };
