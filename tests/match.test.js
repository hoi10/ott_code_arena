const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const botRepositoryPath = require.resolve("../src/repositories/bot.repository");
const matchRepositoryPath = require.resolve("../src/repositories/match.repository");
const matchManagerPath = require.resolve("../src/game-engine/match-manager");
const matchServicePath = require.resolve("../src/services/match.service");

const originalCacheEntries = new Map(
  [botRepositoryPath, matchRepositoryPath, matchManagerPath, matchServicePath]
    .map((filePath) => [filePath, require.cache[filePath]])
);
const calls = [];
const match = {
  id: 5,
  status: "running",
  result: { finished: false, currentPlayerId: "2" },
  participants: [
    { id: 1, botId: 11, bot: { id: 11, userId: 7, isPublic: false } },
    { id: 2, botId: 22, bot: { id: 22, userId: 9, isPublic: true } },
  ],
};
const botRepository = {
  async findActiveBotsByIds(ids) {
    return ids.map((id) => availableBots.get(id)).filter(Boolean);
  },
  async findByIdAndUserId(id, userId) {
    const bot = availableBots.get(id);
    return bot?.userId === userId ? bot : null;
  },
};
const matchRepository = {
  async findById() {
    return match;
  },
  async updateParticipantBot(matchId, participantId, botId) {
    calls.push({ matchId, participantId, botId });
    const participant = match.participants.find((entry) => entry.id === participantId);
    participant.botId = botId;
    participant.bot = availableBots.get(botId);
  },
};
const matchManager = {
  async createMatch(botIds) {
    calls.push({ createdBotIds: botIds });
    return { id: 5 };
  },
  async runMatch() {
    return match;
  },
};
const availableBots = new Map();

function installMock(filePath, exports) {
  const entry = new Module(filePath);
  entry.filename = filePath;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filePath] = entry;
}

installMock(botRepositoryPath, botRepository);
installMock(matchRepositoryPath, matchRepository);
installMock(matchManagerPath, matchManager);
delete require.cache[matchServicePath];
const matchService = require(matchServicePath);

test("creates matches with an owned bot and a public opponent bot", async () => {
  availableBots.set(11, { id: 11, userId: 7, isPublic: false, isActive: true });
  availableBots.set(22, { id: 22, userId: 9, isPublic: true, isActive: true });
  const result = await matchService.createMatch(7, { botIds: [11, 22] });

  assert.equal(result.id, 5);
  assert.deepEqual(calls.at(-1), { createdBotIds: [11, 22] });
});

test("rejects an opponent bot that is private", async () => {
  availableBots.set(22, { id: 22, userId: 9, isPublic: false, isActive: true });

  await assert.rejects(
    () => matchService.createMatch(7, { botIds: [11, 22] }),
    { message: "MATCH_OPPONENT_BOT_NOT_PUBLIC" }
  );
});

test("switches an owned bot only during the opponent's turn", async () => {
  const stateBeforeSwitch = structuredClone(match.result);
  availableBots.set(33, { id: 33, userId: 7, isActive: true });
  const updated = await matchService.changeBot(5, 7, 1, 33);

  assert.equal(updated.participants[0].botId, 33);
  assert.deepEqual(calls.at(-1), { matchId: 5, participantId: 1, botId: 33 });
  assert.deepEqual(match.result, stateBeforeSwitch);

  match.result.currentPlayerId = "1";
  await assert.rejects(
    () => matchService.changeBot(5, 7, 1, 11),
    { message: "BOT_SWITCH_ONLY_DURING_OPPONENT_TURN" }
  );
  match.result.currentPlayerId = "2";
});

test("refuses to assign a bot already used by the opposing participant", async () => {
  match.participants[1].botId = 33;
  availableBots.set(33, { id: 33, userId: 7, isActive: true });

  await assert.rejects(
    () => matchService.changeBot(5, 7, 1, 33),
    { message: "BOT_ALREADY_ASSIGNED_TO_MATCH" }
  );

  match.participants[1].botId = 22;
  match.participants[1].bot = { id: 22, userId: 9, isPublic: true };
});

test.after(() => {
  for (const [filePath, entry] of originalCacheEntries) {
    if (entry) require.cache[filePath] = entry;
    else delete require.cache[filePath];
  }
});
