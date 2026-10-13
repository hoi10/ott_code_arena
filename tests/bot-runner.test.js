const test = require("node:test");
const assert = require("node:assert/strict");
const { runBot } = require("../src/bot-runner/runner");
const gameRules = require("../src/game-engine/game-rules");
const { parseBotOutput } = require("../src/bot-runner/protocol");

function makeInput() {
  return {
    protocolVersion: 1,
    playerId: "A",
    legalMoves: [{
      pieceId: "A-1",
      to: { x: 2, y: 2, name: "c3" },
      capturePieceId: null,
      captureType: null,
    }],
    pieces: { own: [], opponent: [] },
    target: { x: 8, y: 8 },
    home: { x: 0, y: 0 },
    turn: 0,
    boardSize: 9,
    rules: {},
  };
}

const pythonBot = `
import json
import sys

data = json.load(sys.stdin)
move = data["legalMoves"][0] if data["legalMoves"] else None
print(json.dumps(None if move is None else {"pieceId": move["pieceId"], "to": {"x": move["to"]["x"], "y": move["to"]["y"]}}))
`;

const cppBot = `
#include <iostream>
#include <string>

int main() {
  std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  const auto pieceKey = input.find("\\\"pieceId\\\"");
  const auto pieceStart = input.find('\\\"', pieceKey + 10) + 1;
  const auto pieceEnd = input.find('\\\"', pieceStart);
  const auto xKey = input.find("\\\"x\\\"", pieceEnd);
  const auto xStart = input.find(':', xKey) + 1;
  const auto xEnd = input.find(',', xStart);
  const auto yKey = input.find("\\\"y\\\"", xEnd);
  const auto yStart = input.find(':', yKey) + 1;
  const auto yEnd = input.find_first_of("},", yStart);
  std::cout << "{\\\"pieceId\\\":\\\"" << input.substr(pieceStart, pieceEnd - pieceStart)
            << "\\\",\\\"to\\\":{"
            << "\\\"x\\\":" << input.substr(xStart, xEnd - xStart)
            << ",\\\"y\\\":" << input.substr(yStart, yEnd - yStart) << "}}";
}
`;

test("executes JavaScript with the documented legal-move input", async () => {
  const state = gameRules.createInitialState({
    participantIds: ["player", "opponent"],
  });
  const playerId = state.currentPlayerId;
  const input = gameRules.createBotInput(state, playerId);
  const result = await runBot(
    "return input.legalMoves.length ? { pieceId: input.legalMoves[0].pieceId, to: input.legalMoves[0].to } : null;",
    input
  );

  assert.equal(gameRules.validateMove(result, state, playerId).valid, true);
});

test("executes Python and C++ through the same stdin/stdout protocol", async () => {
  for (const [language, sourceCode] of [["python", pythonBot], ["cpp", cppBot]]) {
    const result = await runBot(sourceCode, makeInput(), { language });
    assert.deepEqual(result, { pieceId: "A-1", to: { x: 2, y: 2 } });
  }
});

test("accepts null when the bot has no move", async () => {
  const input = { ...makeInput(), legalMoves: [] };
  assert.equal(await runBot("return null;", input), null);
});

test("rejects missing input fields and invalid protocol output", async () => {
  await assert.rejects(() => runBot("return null;", {}), /BOT_INPUT_INVALID/);
  assert.throws(() => parseBotOutput("not json", makeInput()), /INVALID_BOT_RESULT_JSON/);
  assert.throws(
    () => parseBotOutput('{"pieceId":"missing","to":{"x":1,"y":1}}', makeInput()),
    /BOT_OUTPUT_ILLEGAL_MOVE/
  );
  assert.throws(
    () => parseBotOutput('{"pieceId":"A-1","to":{"x":2}}', makeInput()),
    /BOT_OUTPUT_SCHEMA_INVALID/
  );
});

test("maps compile, runtime, timeout, empty and oversized output errors", async () => {
  await assert.rejects(
    () => runBot("print('broken'", makeInput(), { language: "python" }),
    /BOT_EXECUTION_FAILED/
  );
  await assert.rejects(
    () => runBot("raise RuntimeError('broken')", makeInput(), { language: "python" }),
    /BOT_EXECUTION_FAILED/
  );
  await assert.rejects(
    () => runBot("int main() { return 0;", makeInput(), { language: "cpp" }),
    /BOT_COMPILATION_FAILED/
  );
  await assert.rejects(
    () => runBot("while True: pass", makeInput(), { language: "python", timeoutMs: 100 }),
    /BOT_EXECUTION_TIMEOUT/
  );
  await assert.rejects(
    () => runBot("print('log'); print('{}')", makeInput(), { language: "python" }),
    /INVALID_BOT_RESULT_JSON/
  );
  assert.deepEqual(
    await runBot("import sys; print('debug', file=sys.stderr); print('null')", makeInput(), { language: "python" }),
    null
  );
  await assert.rejects(
    () => runBot("print('x' * 1000)", makeInput(), { language: "python", maxOutputBytes: 32 }),
    /BOT_OUTPUT_LIMIT_EXCEEDED/
  );
  await assert.rejects(() => runBot("", makeInput()), /SOURCE_CODE_REQUIRED/);
});

test("rejects unsupported languages before execution", async () => {
  await assert.rejects(
    () => runBot("program", makeInput(), { language: "ruby" }),
    /BOT_LANGUAGE_UNSUPPORTED/
  );
});

test("does not expose host APIs or network access to JavaScript", async () => {
  await assert.rejects(
    () => runBot("return typeof require;", makeInput()),
    /BOT_OUTPUT_SCHEMA_INVALID|BOT_OUTPUT_ILLEGAL_MOVE/
  );
  await assert.rejects(
    () => runBot("return process.env.JWT_SECRET || null;", makeInput()),
    /BOT_EXECUTION_FAILED|BOT_OUTPUT_SCHEMA_INVALID/
  );
});

test("blocks file, network and child-process access for Python", async () => {
  await assert.rejects(
    () => runBot("print(open('/etc/passwd').read())", makeInput(), { language: "python" }),
    /BOT_EXECUTION_FAILED|EMPTY_BOT_RESULT/
  );
  await assert.rejects(
    () => runBot("import socket; socket.create_connection(('example.com', 80))", makeInput(), { language: "python" }),
    /BOT_EXECUTION_FAILED|BOT_EXECUTION_TIMEOUT/
  );
  await assert.rejects(
    () => runBot("import subprocess; subprocess.run(['/bin/echo', 'no'])", makeInput(), { language: "python" }),
    /BOT_EXECUTION_FAILED/
  );
});
