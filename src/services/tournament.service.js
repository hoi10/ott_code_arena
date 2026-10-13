const tournamentRepository = require("../repositories/tournament.repository");
const botRepository = require("../repositories/bot.repository");
const roundRobin = require("./tournament-round-robin");
const scoring = require("./tournament-scoring");
const tournamentScheduler = require("./tournament-scheduler");

const MIN_PARTICIPANTS = 3;
const SUPPORTED_LANGUAGES = new Set(["javascript", "cpp", "python"]);

function toTournamentId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("TOURNAMENT_ID_INVALID");
  }
  return id;
}

function requireHost(tournament, userId) {
  if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
  if (tournament.hostUserId !== userId) {
    throw new Error("TOURNAMENT_HOST_ONLY");
  }
}

// Shape a tournament for API responses: never expose snapshot source code and
// attach a computed standings table plus match progress.
function presentTournament(tournament) {
  if (!tournament) return tournament;

  const entries = tournament.entries ?? [];
  const games = (tournament.rounds ?? []).flatMap((round) =>
    round.matches.flatMap((match) =>
      match.games.map((game) => ({
        id: game.id,
        legNumber: game.legNumber,
        status: game.status,
        winnerEntryId: game.winnerEntryId,
        isDraw: game.isDraw,
        winReason: game.winReason,
        turns: game.turns,
        attempts: game.attempts,
        errorCode: game.errorCode,
        firstEntryId: game.firstEntryId,
        secondEntryId: game.secondEntryId,
        matchId: match.id,
        roundNumber: round.roundNumber,
      }))
    )
  );

  const safeEntries = entries.map((entry) => {
    const { snapshotSourceCode, ...safeEntry } = entry;
    return safeEntry;
  });

  const standings = scoring.computeStandings({ entries: safeEntries, games });

  const progress = games.reduce(
    (acc, game) => {
      acc.total += 1;
      acc[game.status] = (acc[game.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  return {
    ...tournament,
    entries: safeEntries,
    progress,
    standings,
  };
}

const tournamentService = {
  MIN_PARTICIPANTS,

  async createTournament(userId, { name, description }) {
    const tournament = await tournamentRepository.create({
      name,
      description: description ?? null,
      hostUserId: userId,
    });
    return presentTournament(tournament);
  },

  async listTournaments({ page = 1, limit = 20, status, scope } = {}) {
    const skip = (page - 1) * limit;
    const filters = {
      skip,
      take: limit,
      status,
      ...(scope === "hosting" ? {} : {}),
    };
    const [tournaments, total] = await Promise.all([
      tournamentRepository.findMany(filters),
      tournamentRepository.count(filters),
    ]);

    return {
      tournaments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getTournament(tournamentId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
    return presentTournament(tournament);
  },

  async updateTournament(tournamentId, userId, data) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (tournament.status !== "draft") {
      throw new Error("TOURNAMENT_NOT_EDITABLE");
    }
    const updated = await tournamentRepository.updateMeta(tournament.id, data);
    return presentTournament(updated);
  },

  // A participant registers themselves with one of their own active bots. The
  // existing permission model only lets a user use a bot they own, so the host
  // cannot enroll another account or select someone else's bot. A user appears
  // at most once and so does a bot (enforced by unique keys and pre-checked
  // here for a clear message).
  async addParticipant(tournamentId, userId, botId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
    if (tournament.status !== "draft") {
      throw new Error("TOURNAMENT_NOT_EDITABLE");
    }

    const bot = await botRepository.findByIdAndUserId(botId, userId);
    if (!bot || !bot.isActive) {
      throw new Error("BOT_NOT_FOUND_OR_INACTIVE");
    }
    if (!SUPPORTED_LANGUAGES.has(bot.language)) {
      throw new Error("BOT_LANGUAGE_UNSUPPORTED");
    }

    try {
      await tournamentRepository.addEntry(tournament.id, userId, bot);
    } catch (error) {
      if (error.code === "P2002") {
        throw new Error("TOURNAMENT_ENTRY_ALREADY_EXISTS");
      }
      throw error;
    }

    const refreshed = await tournamentRepository.findById(tournament.id);
    return presentTournament(refreshed);
  },

  // The host manages the roster and can remove any participant while the
  // tournament is still a draft.
  async removeParticipant(tournamentId, userId, entryId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (tournament.status !== "draft") {
      throw new Error("TOURNAMENT_NOT_EDITABLE");
    }
    await tournamentRepository.removeEntry(tournament.id, entryId);
    const refreshed = await tournamentRepository.findById(tournament.id);
    return presentTournament(refreshed);
  },

  async lockRoster(tournamentId, userId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (tournament.status !== "draft") {
      throw new Error("TOURNAMENT_NOT_LOCKABLE");
    }

    const entryIds = tournament.entries.map((entry) => entry.id);
    if (entryIds.length < MIN_PARTICIPANTS) {
      throw new Error("TOURNAMENT_MIN_PARTICIPANTS");
    }

    // Re-verify ownership, language and runnability of every snapshot at lock.
    for (const entry of tournament.entries) {
      if (!SUPPORTED_LANGUAGES.has(entry.snapshotLanguage)) {
        throw new Error("TOURNAMENT_BOT_INVALID");
      }
      if (!entry.snapshotSourceCode || !entry.snapshotSourceCode.trim()) {
        throw new Error("TOURNAMENT_BOT_INVALID");
      }
      if (entry.bot.userId !== entry.userId) {
        throw new Error("TOURNAMENT_BOT_INVALID");
      }
    }

    const rounds = roundRobin.generateRounds(entryIds);
    const locked = await tournamentRepository.lockAndBuildSchedule(
      tournament.id,
      rounds
    );
    return presentTournament(locked);
  },

  async startTournament(tournamentId, userId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (tournament.status !== "ready") {
      throw new Error("TOURNAMENT_NOT_STARTABLE");
    }
    if (tournament.entries.length < MIN_PARTICIPANTS) {
      throw new Error("TOURNAMENT_MIN_PARTICIPANTS");
    }

    const started = await tournamentRepository.setStatus(tournament.id, "running", {
      startedAt: new Date(),
    });
    tournamentScheduler.schedule(tournament.id);
    return presentTournament(started);
  },

  async cancelTournament(tournamentId, userId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (!["draft", "ready"].includes(tournament.status)) {
      throw new Error("TOURNAMENT_NOT_CANCELLABLE");
    }
    const cancelled = await tournamentRepository.setStatus(
      tournament.id,
      "cancelled",
      { endedAt: new Date() }
    );
    return presentTournament(cancelled);
  },

  // Host-triggered retry for games that exhausted their automatic retries.
  async retryFailedGames(tournamentId, userId) {
    const tournament = await tournamentRepository.findById(
      toTournamentId(tournamentId)
    );
    requireHost(tournament, userId);
    if (!["running", "ready"].includes(tournament.status)) {
      throw new Error("TOURNAMENT_NOT_RETRYABLE");
    }
    await tournamentRepository.resetFailedGames(tournament.id);
    if (tournament.status === "running") {
      tournamentScheduler.schedule(tournament.id);
    }
    const refreshed = await tournamentRepository.findById(tournament.id);
    return presentTournament(refreshed);
  },

  // Backend recovery entry point invoked after a restart.
  resumeRunningTournaments() {
    return tournamentScheduler.resumeActiveTournaments();
  },
};

module.exports = tournamentService;

