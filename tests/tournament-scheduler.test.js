const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const repositoryPath = require.resolve("../src/repositories/tournament.repository");
const enginePath = require.resolve("../src/game-engine/engine");
const runnerPath = require.resolve("../src/bot-runner/runner");
const schedulerPath = require.resolve("../src/services/tournament-scheduler");

const originalCacheEntries = new Map(
  [repositoryPath, enginePath, runnerPath, schedulerPath].map(
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

function makeBot(botId) {
  return {
    id: botId,
    snapshotSourceCode: `code-${botId}`,
    snapshotLanguage: "javascript",
    snapshotProtocolVersion: 2,
  };
}

// A tiny in-memory model of the tournament tables to exercise the scheduler.
function buildModel(roundsPlan) {
  const games = new Map();
  const rounds = [];
  let matchId = 0;

  roundsPlan.forEach((matchIds, roundIndex) => {
    const matches = matchIds.map((id) => {
      matchId += 1;
      const match = { id: matchId, entryAId: id, entryBId: id + 100, games: [] };
      match.games.push({
        id: matchId * 10 + 1, legNumber: 1, status: "pending", attempts: 0,
        firstEntry: { botId: id, ...makeBot(id) },
        secondEntry: { botId: id + 100, ...makeBot(id + 100) },
      });
      match.games.push({
        id: matchId * 10 + 2, legNumber: 2, status: "pending", attempts: 0,
        firstEntry: { botId: id + 100, ...makeBot(id + 100) },
        secondEntry: { botId: id, ...makeBot(id) },
      });
      for (const g of match.games) games.set(g.id, g);
      return match;
    });
    rounds.push({ id: roundIndex + 1, roundNumber: roundIndex + 1, status: "pending", matches });
  });

  return {
    games,
    rounds,
    completions: [],
    failures: [],
    requeues: [],
    completedRounds: [],
    tournamentStatus: "running",
    engineImpl: null,
  };
}

function makeRepository(model) {
  return {
    async findById() {
      return { id: 1, status: "running", rounds: model.rounds };
    },
    async findPendingGameInRound(roundId) {
      const round = model.rounds.find((r) => r.id === roundId);
      if (!round) return null;
      for (const match of round.matches) {
        for (const g of match.games) {
          if (g.status === "pending") {
            return { ...g, match: { round, entryA: {}, entryB: {} } };
          }
        }
      }
      return null;
    },
    async countGamesByStatus(roundId) {
      const round = model.rounds.find((r) => r.id === roundId);
      const tally = {};
      for (const match of round.matches) {
        for (const g of match.games) {
          tally[g.status] = (tally[g.status] ?? 0) + 1;
          tally.total = (tally.total ?? 0) + 1;
        }
      }
      return tally;
    },
    async claimGame(gameId) {
      const game = model.games.get(gameId);
      if (!game || game.status !== "pending") return null;
      game.status = "running";
      game.attempts += 1;
      return { ...game };
    },
    async completeGame(gameId, data) {
      const game = model.games.get(gameId);
      if (game.status !== "running") return false;
      game.status = "completed";
      game.winnerEntryId = data.winnerEntryId;
      game.isDraw = data.isDraw;
      model.completions.push({ gameId, ...data });
      return true;
    },
    async failGame(gameId, data) {
      const game = model.games.get(gameId);
      if (game.status !== "running") return false;
      game.status = "failed";
      model.failures.push({ gameId, ...data });
      return true;
    },
    async requeueGame(gameId) {
      const game = model.games.get(gameId);
      if (game.status !== "running") return { count: 0 };
      game.status = "pending";
      model.requeues.push(gameId);
      return { count: 1 };
    },
    async completeRound(roundId) {
      const round = model.rounds.find((r) => r.id === roundId);
      round.status = "completed";
      model.completedRounds.push(roundId);
      return { count: 1 };
    },
    async setStatus(id, status, extra) {
      model.tournamentStatus = status;
      return { id, status, ...extra };
    },
    async listActiveForResume() {
      return [];
    },
  };
}

async function settle() {
  // Let chained microtask-driven retries drain.
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function withInstantTimers(fn) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    queueMicrotask(() => callback());
    return { unref() {} };
  };
  try {
    await fn();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

test("completes every game in a round before advancing", async () => {
  const model = buildModel([[1, 2]]);
  installMock(repositoryPath, makeRepository(model));
  installMock(runnerPath, { runBot: async () => ({ pieceId: "x", to: { x: 0, y: 0 } }) });
  installMock(enginePath, {
    runGame: async ({ botA }) => ({
      status: "completed",
      winnerId: String(botA.id),
      reason: "reached_opponent_home",
      turns: 5,
    }),
  });
  delete require.cache[schedulerPath];
  const scheduler = require(schedulerPath);

  await withInstantTimers(async () => {
    await scheduler.schedule(1);
    await settle();
    scheduler.stop();
  });

  assert.equal(model.completions.length, 4, "all four games completed once");
  assert.equal(model.failures.length, 0);
  assert.equal(model.completedRounds.length, 1);
  assert.equal(model.tournamentStatus, "completed");
  for (const game of model.games.values()) {
    assert.equal(game.status, "completed");
  }
});

test("runs rounds in order and does not start round two early", async () => {
  const model = buildModel([[1], [2]]);
  let engineCalls = 0;
  installMock(repositoryPath, makeRepository(model));
  installMock(runnerPath, { runBot: async () => ({ pieceId: "x", to: { x: 0, y: 0 } }) });
  installMock(enginePath, {
    runGame: async ({ botA }) => {
      engineCalls += 1;
      if (engineCalls === 1) {
        throw new Error("MATCH_STATE_INVALID");
      }
      return {
        status: "completed",
        winnerId: String(botA.id),
        reason: "reached_opponent_home",
        turns: 3,
      };
    },
  });
  delete require.cache[schedulerPath];
  const scheduler = require(schedulerPath);

  await withInstantTimers(async () => {
    await scheduler.schedule(1);
    await settle();
    scheduler.stop();
  });

  // 4 games total, but the first was retried once -> 5 engine calls.
  assert.equal(engineCalls, 5);
  assert.equal(model.requeues.length, 1, "infra failure was requeued once");
  assert.equal(model.completions.length, 4);
  assert.deepEqual(model.completedRounds, [1, 2], "rounds advanced in order");
  assert.equal(model.tournamentStatus, "completed");
});

test("a game failing past the retry budget becomes terminal failed, not a loss", async () => {
  const model = buildModel([[1]]);
  installMock(repositoryPath, makeRepository(model));
  installMock(runnerPath, { runBot: async () => ({ pieceId: "x", to: { x: 0, y: 0 } }) });
  installMock(enginePath, {
    runGame: async () => {
      throw new Error("ACTIVE_BOT_NOT_FOUND");
    },
  });
  delete require.cache[schedulerPath];
  const scheduler = require(schedulerPath);

  await withInstantTimers(async () => {
    await scheduler.schedule(1);
    await settle();
    scheduler.stop();
  });

  assert.equal(model.failures.length, 2);
  assert.equal(model.completions.length, 0);
  for (const game of model.games.values()) {
    assert.equal(game.status, "failed");
  }
  assert.equal(model.completedRounds.length, 1);
  assert.equal(model.tournamentStatus, "completed");
});

test("duplicate completion of an already-finished game is ignored", async () => {
  const model = buildModel([[1]]);
  const repository = makeRepository(model);
  let completeCalls = 0;
  const originalComplete = repository.completeGame.bind(repository);
  repository.completeGame = async (gameId, data) => {
    completeCalls += 1;
    return originalComplete(gameId, data);
  };
  installMock(repositoryPath, repository);
  installMock(runnerPath, { runBot: async () => ({ pieceId: "x", to: { x: 0, y: 0 } }) });
  installMock(enginePath, {
    runGame: async ({ botA }) => ({
      status: "completed",
      winnerId: String(botA.id),
      reason: "reached_opponent_home",
      turns: 2,
    }),
  });
  delete require.cache[schedulerPath];
  const scheduler = require(schedulerPath);

  await withInstantTimers(async () => {
    await scheduler.schedule(1);
    await settle();
    scheduler.stop();
  });

  assert.equal(completeCalls, 2, "one completion per game, never repeated");
  assert.equal(model.completions.length, 2);
});

test.after(() => {
  for (const [filePath, entry] of originalCacheEntries) {
    if (entry) require.cache[filePath] = entry;
    else delete require.cache[filePath];
  }
});

