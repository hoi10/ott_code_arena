"use strict";

const fs = require("fs");
const vm = require("vm");

try {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const sandbox = Object.create(null);
  sandbox.input = payload.input;
  sandbox.result = undefined;
  sandbox.console = Object.freeze({
    log: (...args) => process.stderr.write(`${args.join(" ")}\n`),
    error: (...args) => process.stderr.write(`${args.join(" ")}\n`),
    warn: (...args) => process.stderr.write(`${args.join(" ")}\n`),
  });

  vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  const wrapped = `(function(input) {\n${payload.sourceCode}\n})(input)`;
  const script = new vm.Script(`result = ${wrapped}`);
  script.runInContext(sandbox, { timeout: payload.timeoutMs });

  process.stdout.write(JSON.stringify(sandbox.result === undefined ? null : sandbox.result));
} catch (error) {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
}
