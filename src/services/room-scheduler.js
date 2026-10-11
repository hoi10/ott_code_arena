const roomRepository = require("../repositories/room.repository");
const matchManager = require("../game-engine/match-manager");

const TURN_INTERVAL_MS = 5000;
const PAUSE_LIMIT_MS = 30_000;
const turnTimers = new Map();
const pauseTimers = new Map();
const runningRooms = new Set();
const activeRuns = new Map();
const cancelledRooms = new Set();
let cleanupTimer = null;
let cleanupRunning = false;

function scheduleTurn(roomId, delay = TURN_INTERVAL_MS) {
  if (cancelledRooms.has(roomId) || turnTimers.has(roomId)) return;
  const timer = setTimeout(() => {
    turnTimers.delete(roomId);
    runNextTurn(roomId);
  }, delay);
  timer.unref?.();
  turnTimers.set(roomId, timer);
}

function schedulePauseExpiry(room) {
  clearPauseTimer(room.id);
  const elapsed = Math.max(0, Date.now() - room.pauseStartedAt.getTime());
  const pauseOwner = room.players.find(
    (player) => player.userId === room.pausedByUserId
  );
  const remaining = Math.max(
    0,
    PAUSE_LIMIT_MS - (pauseOwner?.pauseUsedMs ?? PAUSE_LIMIT_MS) - elapsed
  );
  const timer = setTimeout(() => {
    pauseTimers.delete(room.id);
    expirePause(room.id);
  }, remaining);
  timer.unref?.();
  pauseTimers.set(room.id, timer);
}

function clearPauseTimer(roomId) {
  const timer = pauseTimers.get(roomId);
  if (timer) clearTimeout(timer);
  pauseTimers.delete(roomId);
}

async function runNextTurn(roomId) {
  if (runningRooms.has(roomId)) return activeRuns.get(roomId);
  runningRooms.add(roomId);
  const run = (async () => {
    try {
      const room = await roomRepository.findById(roomId);
      if (!room || room.status !== "running" || !room.match) return;

      const match = await matchManager.runMatch(room.match.id);
      if (match.status === "completed") {
        await roomRepository.markCompleted(roomId);
        clearPauseTimer(roomId);
        return;
      }
      if (match.status === "failed") {
        await roomRepository.markFailed(roomId);
        clearPauseTimer(roomId);
        return;
      }

      const refreshed = await roomRepository.findById(roomId);
      if (refreshed?.status === "running") scheduleTurn(roomId);
    } catch (error) {
      console.error(`Không thể tự chạy trận trong phòng ${roomId}:`, error);
      try {
        await roomRepository.markFailed(roomId);
      } catch (markError) {
        console.error(`Không thể cập nhật trạng thái phòng ${roomId}:`, markError);
      }
    } finally {
      runningRooms.delete(roomId);
      activeRuns.delete(roomId);
    }
  })();
  activeRuns.set(roomId, run);
  return run;
}

async function expirePause(roomId) {
  try {
    await roomRepository.finishPause(roomId, null);
    scheduleTurn(roomId, 0);
  } catch (error) {
    if (error.message !== "ROOM_NOT_PAUSED") {
      console.error(`Không thể tự tiếp tục trận trong phòng ${roomId}:`, error);
    }
  }
}

async function cleanupEmptyRooms() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 30_000);
    await Promise.all([
      roomRepository.deleteStalePresence(staleBefore),
      roomRepository.expireRematchInvitations(now),
    ]);
  } finally {
    cleanupRunning = false;
  }
}

const roomScheduler = {
  schedule(roomId) {
    cancelledRooms.delete(roomId);
    scheduleTurn(roomId, 0);
  },

  async pause(room) {
    const timer = turnTimers.get(room.id);
    if (timer) clearTimeout(timer);
    turnTimers.delete(room.id);
    await activeRuns.get(room.id);
    schedulePauseExpiry(room);
  },

  resume(roomId) {
    cancelledRooms.delete(roomId);
    clearPauseTimer(roomId);
    scheduleTurn(roomId, 0);
  },

  async cancelRoom(roomId) {
    cancelledRooms.add(roomId);
    const timer = turnTimers.get(roomId);
    if (timer) clearTimeout(timer);
    turnTimers.delete(roomId);
    clearPauseTimer(roomId);
    await activeRuns.get(roomId);
  },

  async restoreRoomAutomation(roomId) {
    const room = await roomRepository.findById(roomId);
    if (!room) return;
    cancelledRooms.delete(roomId);
    if (room.status === "paused" && room.pauseStartedAt) {
      schedulePauseExpiry(room);
    } else if (room.status === "running") {
      scheduleTurn(roomId, 0);
    }
  },

  async resumeActiveRooms() {
    const rooms = await roomRepository.findAutomated();
    for (const room of rooms) {
      if (room.status === "paused" && room.pauseStartedAt) {
        schedulePauseExpiry(room);
      } else {
        scheduleTurn(room.id, 0);
      }
    }
  },

  stop() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
    for (const roomId of runningRooms) cancelledRooms.add(roomId);
    for (const timer of turnTimers.values()) clearTimeout(timer);
    for (const timer of pauseTimers.values()) clearTimeout(timer);
    turnTimers.clear();
    pauseTimers.clear();
  },

  startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      void cleanupEmptyRooms().catch((error) => {
        console.error("Không thể dọn phòng không có người:", error);
      });
    }, 5000);
    cleanupTimer.unref?.();
  },
};

module.exports = roomScheduler;
