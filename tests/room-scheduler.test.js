const test = require("node:test");
const assert = require("node:assert/strict");

test("waits at least five seconds after a completed bot turn", async (context) => {
  const repositoryPath = require.resolve("../src/repositories/room.repository");
  const matchManagerPath = require.resolve("../src/game-engine/match-manager");
  const schedulerPath = require.resolve("../src/services/room-scheduler");
  const previousRepository = require.cache[repositoryPath];
  const previousMatchManager = require.cache[matchManagerPath];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const scheduledTimers = [];
  const scheduledIntervals = [];
  let roomReads = 0;
  let stalePresenceCleanupCount = 0;
  let rematchExpiryCount = 0;

  const roomRepository = {
    async findById() {
      roomReads += 1;
      return { id: "room-1", status: "running", match: { id: "match-1" } };
    },
    async markFailed() {},
    async deleteStalePresence() {
      stalePresenceCleanupCount += 1;
    },
    async expireRematchInvitations() {
      rematchExpiryCount += 1;
    },
  };
  const matchManager = {
    async runMatch() {
      return { status: "running" };
    },
  };

  require.cache[repositoryPath] = {
    id: repositoryPath,
    filename: repositoryPath,
    loaded: true,
    exports: roomRepository,
  };
  require.cache[matchManagerPath] = {
    id: matchManagerPath,
    filename: matchManagerPath,
    loaded: true,
    exports: matchManager,
  };
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    scheduledTimers.push(timer);
    return timer;
  };
  global.clearTimeout = () => {};
  global.setInterval = (callback, delay) => {
    const interval = { callback, delay, unref() {} };
    scheduledIntervals.push(interval);
    return interval;
  };
  global.clearInterval = () => {};

  const roomScheduler = require(schedulerPath);
  context.after(() => {
    roomScheduler.stop();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    delete require.cache[schedulerPath];
    if (previousRepository) require.cache[repositoryPath] = previousRepository;
    else delete require.cache[repositoryPath];
    if (previousMatchManager) require.cache[matchManagerPath] = previousMatchManager;
    else delete require.cache[matchManagerPath];
  });

  roomScheduler.schedule("room-1");
  assert.equal(scheduledTimers[0].delay, 0);

  scheduledTimers[0].callback();
  await new Promise((resolve) => originalSetTimeout(resolve, 0));

  assert.equal(roomReads, 2);
  assert.equal(scheduledTimers[1].delay, 5000);

  roomScheduler.startCleanup();
  assert.equal(scheduledIntervals[0].delay, 5000);
  scheduledIntervals[0].callback();
  await new Promise((resolve) => originalSetTimeout(resolve, 0));
  assert.equal(stalePresenceCleanupCount, 1);
  assert.equal(rematchExpiryCount, 1);
  assert.equal(roomRepository.findRoomsWithoutRecentPresence, undefined);
  assert.equal(roomRepository.deleteRoomIfNoRecentPresence, undefined);
});
