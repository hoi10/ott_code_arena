const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const DEFAULT_TIMEOUT_MS = 3000;
const MAX_OUTPUT_BYTES = 64 * 1024;

function runBot(sourceCode, input = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;

    if (typeof sourceCode !== "string" || !sourceCode.trim()) {
      return reject(new Error("SOURCE_CODE_REQUIRED"));
    }

    const child = spawn(
      process.execPath,
      [
        "--disable-proto=throw",
        "-e",
        `
"use strict";
const vm = require("vm");
const fs = require("fs");

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);
  const sandbox = Object.create(null);

  sandbox.input = payload.input;
  sandbox.result = undefined;
  sandbox.console = Object.freeze({
    log: (...args) => {},
    error: (...args) => {},
    warn: (...args) => {}
  });

  vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false }
  });

  const wrapped = "(function(input) {\\n" + payload.sourceCode +
    "\\n})(input)";

  const script = new vm.Script("result = " + wrapped);
  script.runInContext(sandbox, { timeout: payload.timeoutMs });

  process.stdout.write(JSON.stringify({ success: true, result: sandbox.result }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: String(error && error.message ? error.message : error)
  }));
  process.exitCode = 1;
}
`,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          PATH: process.env.PATH || "",
          NODE_ENV: "production",
        },
        cwd: os.tmpdir(),
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    let outputBytes = 0;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("BOT_EXECUTION_TIMEOUT"));
    }, timeoutMs + 1000);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) reject(error);
      else resolve(result);
    }

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;

      if (outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error("BOT_OUTPUT_LIMIT_EXCEEDED"));
        return;
      }

      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4096) {
        stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
      }
    });

    child.on("error", (error) => {
      finish(error);
    });

    child.on("close", () => {
      if (settled) return;

      let parsed;

      try {
        parsed = JSON.parse(stdout);
      } catch {
        return finish(
          new Error(stderr || "BOT_EXECUTION_FAILED")
        );
      }

      if (!parsed.success) {
        return finish(new Error(parsed.error || "BOT_EXECUTION_FAILED"));
      }

      finish(null, parsed.result);
    });

    child.stdin.on("error", () => {});

    child.stdin.end(
      JSON.stringify({
        sourceCode,
        input,
        timeoutMs,
      })
    );
  });
}

module.exports = {
  runBot,
};