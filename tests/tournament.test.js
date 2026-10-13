const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const tournamentRepositoryPath = require.resolve("../src/repositories/tournament.repository");
const botRepositoryPath = require.resolve("../src/repositories/bot.repository");
const schedulerPath = require.resolve("../src/services/tournament-scheduler");
const servicePath = require.resolve("../src/services/tournament.service");

const originalCacheEntries = new Map(
  [tournamentRepositoryPath, botRepositoryPath, schedulerPath, servicePath].map(
    (filePath) => [filePath, require.cache[filePath]]
  )
);

function installMock(filePath, exports) {
  const entry = new Module(filePath);
  entry.filename = filePath;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filePath] = entry;
}

const state = {
  tournament: null,
  scheduled: [],
  botLookup: new Map(),
};

function makeDraft(entryCount) {
  return {
    id: 1,
    name: "Giải mẫu",
    description: null,
    status: "draft",
    hostUserId: 100,
    entries: Array.from({ length: entryCount }, (_, index) => {
      const botId = (index + 1) * 10;
      return {
        id: index + 1,
        seed: index + 1,
        userId: index + 1,
        botId,
        snapshotSourceCode: `code-${botId}`,
        snapshotLanguage: "javascript",
        snapshotProtocolVersion: 2,
        bot: { id: botId, name: `bot${botId}`, userId: index + 1, isActive: true },
        user: { id: index + 1, username: `player${index + 1}` },
      };
    }),
    rounds: [],
  };
}

const tournamentRepository = {
  tournamentInclude: {},
  listInclude: {},
  async create({ name, description, hostUserId }) {
    return { id: 1, name, description, status: "draft", hostUserId, entries: [], rounds: [] };
  },
  async findById() {
    return state.tournament;
  },
  async findMany() {
    return state.tournament ? [state.tournament] : [];
  },
  async count() {
    return state.tournament ? 1 : 0;
  },
  async updateMeta(id, data) {
    Object.assign(state.tournament, data);
    return state.tournament;
  },
  async setStatus(id, status, extra = {}) {
    Object.assign(state.tournament, { status }, extra);
    return state.tournament;
  },
  async addEntry(tournamentId, userId, bot) {
    const entry = {
      id: state.tournament.entries.length + 1,
      seed: state.tournament.entries.length + 1,
      userId,
      botId: bot.id,
      snapshotSourceCode: bot.sourceCode,
      snapshotLanguage: bot.language,
      snapshotProtocolVersion: bot.protocolVersion ?? 2,
      bot: { id: bot.id, name: bot.name, userId, isActive: true },
      user: { id: userId, username: `player${userId}` },
    };
    state.tournament.entries.push(entry);
    return entry;
  },
  async removeEntry(tournamentId, entryId) {
    state.tournament.entries = state.tournament.entries.filter(
      (entry) => entry.id !== entryId
    );
    return { removed: true };
  },
  async lockAndBuildSchedule(tournamentId, rounds) {
    state.tournament.status = "ready";
    state.tournament.rounds = rounds.map((pairs, index) => ({
      roundNumber: index + 1,
      status: "pending",
      matches: pairs.map(([entryAId, entryBId], mIndex) => ({
        id: index * 100 + mIndex,
        entryAId,
        entryBId,
        games: [
          { id: (index * 100 + mIndex) * 10 + 1, legNumber: 1, status: "pending", firstEntryId: entryAId, secondEntryId: entryBId },
          { id: (index * 100 + mIndex) * 10 + 2, legNumber: 2, status: "pending", firstEntryId: entryBId, secondEntryId: entryAId },
        ],
      })),
    }));
    return state.tournament;
  },
  async resetFailedGames() {
    return { count: 0 };
  },
};

const botRepository = {
  async findByIdAndUserId(id, userId) {
    return state.botLookup.get(`${id}:${userId}`) ?? null;
  },
};

const tournamentScheduler = {
  MAX_GAME_ATTEMPTS: 3,
  schedule(tournamentId) {
    state.scheduled.push(tournamentId);
  },
  async resumeActiveTournaments() {},
  stop() {},
};

installMock(tournamentRepositoryPath, tournamentRepository);
installMock(botRepositoryPath, botRepository);
installMock(schedulerPath, tournamentScheduler);
delete require.cache[servicePath];
const tournamentService = require(servicePath);

test.beforeEach(() => {
  state.tournament = makeDraft(0);
  state.scheduled = [];
  state.botLookup = new Map();
});

test("a signed-in user can create a tournament and becomes its host", async () => {
  const tournament = await tournamentService.createTournament(100, {
    name: "Giải đầu mùa",
    description: "Mô tả",
  });
  assert.equal(tournament.hostUserId, 100);
  assert.equal(tournament.status, "draft");
});

test("only the host can update the tournament", async () => {
  state.tournament = makeDraft(1);
  await assert.rejects(
    () => tournamentService.updateTournament(1, 999, { name: "X" }),
    { message: "TOURNAMENT_HOST_ONLY" }
  );
  const updated = await tournamentService.updateTournament(1, 100, { name: "Tên mới" });
  assert.equal(updated.name, "Tên mới");
});

test("a participant registers themselves; only the host can remove", async () => {
  state.tournament = makeDraft(1);
  state.botLookup.set("10:1", {
    id: 10, name: "bot10", userId: 1, isActive: true, language: "javascript", sourceCode: "x",
  });
  // Self-registration is allowed for the bot owner (not host-restricted).
  const updated = await tournamentService.addParticipant(1, 1, 10);
  assert.equal(updated.entries.length, 2);
  // Removing a participant is host-only.
  await assert.rejects(
    () => tournamentService.removeParticipant(1, 999, 1),
    { message: "TOURNAMENT_HOST_ONLY" }
  );
});

test("cannot register a bot the user does not own or that is inactive", async () => {
  state.tournament = makeDraft(1);
  await assert.rejects(
    () => tournamentService.addParticipant(1, 100, 10),
    { message: "BOT_NOT_FOUND_OR_INACTIVE" }
  );
  state.botLookup.set("10:1", {
    id: 10, userId: 1, isActive: false, language: "javascript", sourceCode: "x",
  });
  await assert.rejects(
    () => tournamentService.addParticipant(1, 100, 10),
    { message: "BOT_NOT_FOUND_OR_INACTIVE" }
  );
});

test("cannot lock a roster with fewer than three participants", async () => {
  state.tournament = makeDraft(2);
  await assert.rejects(
    () => tournamentService.lockRoster(1, 100),
    { message: "TOURNAMENT_MIN_PARTICIPANTS" }
  );
});

test("locking three participants builds a round-robin schedule", async () => {
  state.tournament = makeDraft(3);
  const locked = await tournamentService.lockRoster(1, 100);
  assert.equal(locked.status, "ready");
  assert.equal(locked.rounds.length, 3);

  const matches = locked.rounds.flatMap((round) => round.matches);
  assert.equal(matches.length, 3, "three pairs");
  const legs = matches.flatMap((match) => match.games);
  assert.equal(legs.length, 6, "six legs");

  for (const match of matches) {
    assert.equal(match.games.length, 2);
    assert.equal(match.games[0].firstEntryId, match.entryAId);
    assert.equal(match.games[1].firstEntryId, match.entryBId);
  }
});

test("cannot edit the roster after locking", async () => {
  state.tournament = makeDraft(3);
  await tournamentService.lockRoster(1, 100);
  await assert.rejects(
    () => tournamentService.addParticipant(1, 100, 10),
    { message: "TOURNAMENT_NOT_EDITABLE" }
  );
  await assert.rejects(
    () => tournamentService.updateTournament(1, 100, { name: "Y" }),
    { message: "TOURNAMENT_NOT_EDITABLE" }
  );
});

test("cannot start a tournament that is not locked", async () => {
  state.tournament = makeDraft(3);
  await assert.rejects(
    () => tournamentService.startTournament(1, 100),
    { message: "TOURNAMENT_NOT_STARTABLE" }
  );
});

test("starting a ready tournament schedules it", async () => {
  state.tournament = makeDraft(3);
  await tournamentService.lockRoster(1, 100);
  const started = await tournamentService.startTournament(1, 100);
  assert.equal(started.status, "running");
  assert.deepEqual(state.scheduled, [1]);
});

test("only the host can start or cancel", async () => {
  state.tournament = makeDraft(3);
  await tournamentService.lockRoster(1, 100);
  await assert.rejects(
    () => tournamentService.startTournament(1, 999),
    { message: "TOURNAMENT_HOST_ONLY" }
  );
  await assert.rejects(
    () => tournamentService.cancelTournament(1, 999),
    { message: "TOURNAMENT_HOST_ONLY" }
  );
});

test("cannot cancel a running tournament", async () => {
  state.tournament = makeDraft(3);
  await tournamentService.lockRoster(1, 100);
  await tournamentService.startTournament(1, 100);
  await assert.rejects(
    () => tournamentService.cancelTournament(1, 100),
    { message: "TOURNAMENT_NOT_CANCELLABLE" }
  );
});

test("presented tournament never exposes snapshot source code", async () => {
  state.tournament = makeDraft(3);
  const tournament = await tournamentService.getTournament(1);
  for (const entry of tournament.entries) {
    assert.equal(entry.snapshotSourceCode, undefined);
  }
  assert.ok(Array.isArray(tournament.standings));
});

test.after(() => {
  for (const [filePath, entry] of originalCacheEntries) {
    if (entry) require.cache[filePath] = entry;
    else delete require.cache[filePath];
  }
});

