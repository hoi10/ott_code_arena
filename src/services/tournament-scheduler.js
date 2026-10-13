const tournamentRepository = require("../repositories/tournament.repository");
const gameEngine = require("../game-engine/engine");
const { runBot } = require("../bot-runner/runner");
const { classifyGameError } = require("./tournament-error");

// Maximum automatic retries for a game that fails for an infrastructure reason.
const MAX_GAME_ATTEMPTS = Number(process.env.TOURNAMENT_MAX_GAME_ATTEMPTS) || 3;
// Delay before a failed game is retried, to avoid hammering the runner.
const RETRY_DELAY_MS = Number(process.env.TOURNAMENT_RETRY_DELAY_MS) || 4000;

const runningTournaments = new Set();
const activeRuns = new Map();
const retryTimers = new Map();

function scheduleRetry(tournamentId, delay = RETRY_DELAY_MS) {
  if (retryTimers.has(tournamentId)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(tournamentId);
    processTournament(tournamentId);
  }, delay);
  timer.unref?.();
  retryTimers.set(tournamentId, timer);
}

// Runs a single claimed game to completion using the shared game engine and the
// immutable per-entry bot snapshots. Returns the persisted outcome.
async function executeGame(game) {
  const botA = {
    id: game.firstEntry.botId,
    sourceCode: game.firstEntry.snapshotSourceCode,
    language: game.firstEntry.snapshotLanguage,
    protocolVersion: game.firstEntry.snapshotProtocolVersion,
    isActive: true,
  };
  const botB = {
    id: game.secondEntry.botId,
    sourceCode: game.secondEntry.snapshotSourceCode,
    language: game.secondEntry.snapshotLanguage,
    protocolVersion: game.secondEntry.snapshotProtocolVersion,
    isActive: true,
  };

  const outcome = await gameEngine.runGame({ botA, botB, runBot });

  // The engine reports the winner as the bot id; map it back to the entry.
  const winnerBotId = outcome.winnerId != null ? Number(outcome.winnerId) : null;
  const winnerEntryId =
    winnerBotId === game.firstEntry.botId
      ? game.firstEntry.id
      : winnerBotId === game.secondEntry.botId
        ? game.secondEntry.id
        : null;
  const isDraw = winnerEntryId === null;

  await tournamentRepository.completeGame(game.id, {
    winnerEntryId,
    isDraw,
    winReason: outcome.reason ?? null,
    turns: outcome.turns ?? null,
    result: {
      firstEntryId: game.firstEntry.id,
      secondEntryId: game.secondEntry.id,
      turns: outcome.turns ?? null,
      winReason: outcome.reason ?? null,
    },
  });

  return { status: "completed", isDraw };
}

async function runPendingGame(gameId) {
  const game = await tournamentRepository.claimGame(gameId);
  if (!game) return { status: "claimed-elsewhere" };

  try {
    return await executeGame(game);
  } catch (error) {
    const classification = classifyGameError(error);

    if (
      classification.kind === "infrastructure" &&
      game.attempts < MAX_GAME_ATTEMPTS
    ) {
      await tournamentRepository.requeueGame(game.id, {
        errorCode: classification.code,
        errorMessage: String(error.message || error).slice(0, 500),
      });
      return { status: "retry", code: classification.code };
    }

    // Exhausted retries, a bot-side failure that escaped the engine, or an
    // unclassifiable error: record a terminal, observable failed state. It is
    // never scored as a win or a loss.
    await tournamentRepository.failGame(game.id, {
      errorCode: classification.code,
      errorMessage: String(error.message || error).slice(0, 500),
    });
    return { status: "failed", code: classification.code };
  }
}

// Drives one tournament through its rounds. Each round must reach a terminal
// state (every game completed or finally failed) before the next round starts.
async function processTournament(tournamentId) {
  if (runningTournaments.has(tournamentId)) {
    return activeRuns.get(tournamentId);
  }
  runningTournaments.add(tournamentId);

  const run = (async () => {
    try {
      const tournament = await tournamentRepository.findById(tournamentId);
      if (!tournament || tournament.status !== "running") return;

      const currentRound = tournament.rounds.find(
        (round) => round.status !== "completed"
      );
      if (!currentRound) {
        await tournamentRepository.setStatus(tournamentId, "completed", {
          endedAt: new Date(),
        });
        return;
      }

      const pendingGame = await tournamentRepository.findPendingGameInRound(
        currentRound.id
      );
      if (pendingGame) {
        const result = await runPendingGame(pendingGame.id);
        if (result.status === "retry") {
          scheduleRetry(tournamentId);
          return;
        }
        // Continue immediately with the next game in this round.
        scheduleRetry(tournamentId, 0);
        return;
      }

      // No pending games remain in this round. If everything is terminal, the
      // round is done and we can advance; otherwise keep waiting (a retry timer
      // will re-drive us).
      const tally = await tournamentRepository.countGamesByStatus(
        currentRound.id
      );
      const outstanding = (tally.pending ?? 0) + (tally.running ?? 0);
      if (outstanding > 0) {
        return;
      }

      await tournamentRepository.completeRound(currentRound.id);
      scheduleRetry(tournamentId, 0);
    } catch (error) {
      console.error(`Không thể xử lý giải đấu ${tournamentId}:`, error);
    } finally {
      runningTournaments.delete(tournamentId);
      activeRuns.delete(tournamentId);
    }
  })();

  activeRuns.set(tournamentId, run);
  return run;
}

const tournamentScheduler = {
  MAX_GAME_ATTEMPTS,

  schedule(tournamentId) {
    const existing = retryTimers.get(tournamentId);
    if (existing) clearTimeout(existing);
    retryTimers.delete(tournamentId);
    processTournament(tournamentId);
  },

  async resumeActiveTournaments() {
    const tournaments = await tournamentRepository.listActiveForResume();
    for (const tournament of tournaments) {
      await tournamentRepository.requeueStaleRunningGames(tournament.id);
      this.schedule(tournament.id);
    }
  },

  stop() {
    for (const timer of retryTimers.values()) clearTimeout(timer);
    retryTimers.clear();
  },
};

module.exports = tournamentScheduler;

