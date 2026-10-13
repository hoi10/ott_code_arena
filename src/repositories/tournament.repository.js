const prisma = require("../config/database");

const tournamentInclude = {
  hostUser: { select: { id: true, username: true } },
  entries: {
    orderBy: { seed: "asc" },
    include: {
      user: { select: { id: true, username: true } },
      bot: { select: { id: true, name: true, language: true, isActive: true, userId: true } },
    },
  },
  rounds: {
    orderBy: { roundNumber: "asc" },
    include: {
      matches: {
        orderBy: { id: "asc" },
        include: {
          entryA: {
            include: {
              user: { select: { id: true, username: true } },
              bot: { select: { id: true, name: true } },
            },
          },
          entryB: {
            include: {
              user: { select: { id: true, username: true } },
              bot: { select: { id: true, name: true } },
            },
          },
          games: {
            orderBy: { legNumber: "asc" },
            include: {
              firstEntry: {
                include: {
                  user: { select: { id: true, username: true } },
                  bot: { select: { id: true, name: true } },
                },
              },
              secondEntry: {
                include: {
                  user: { select: { id: true, username: true } },
                  bot: { select: { id: true, name: true } },
                },
              },
              winnerEntry: {
                select: { id: true, user: { select: { username: true } } },
              },
            },
          },
        },
      },
    },
  },
};

const listInclude = {
  hostUser: { select: { id: true, username: true } },
  _count: { select: { entries: true } },
};

const tournamentRepository = {
  tournamentInclude,
  listInclude,

  async create({ name, description, hostUserId }) {
    return prisma.tournament.create({
      data: {
        name,
        description: description ?? null,
        hostUserId,
        status: "draft",
      },
      include: tournamentInclude,
    });
  },

  async findById(id) {
    return prisma.tournament.findUnique({
      where: { id },
      include: tournamentInclude,
    });
  },

  async findMany({ skip = 0, take = 20, status, hostUserId, userId } = {}) {
    const where = {
      ...(status ? { status } : {}),
      ...(hostUserId ? { hostUserId } : {}),
      ...(userId ? { entries: { some: { userId } } } : {}),
    };
    return prisma.tournament.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: listInclude,
    });
  },

  async count({ status, hostUserId, userId } = {}) {
    const where = {
      ...(status ? { status } : {}),
      ...(hostUserId ? { hostUserId } : {}),
      ...(userId ? { entries: { some: { userId } } } : {}),
    };
    return prisma.tournament.count({ where });
  },

  async updateMeta(id, { name, description }) {
    return prisma.tournament.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      include: tournamentInclude,
    });
  },

  async setStatus(id, status, extra = {}) {
    return prisma.tournament.update({
      where: { id },
      data: { status, ...extra },
      include: tournamentInclude,
    });
  },

  async addEntry(tournamentId, userId, bot, seed) {
    return prisma.$transaction(async (tx) => {
      // Guard: only mutate the roster while the tournament is still a draft.
      const claimed = await tx.tournament.updateMany({
        where: { id: tournamentId, status: "draft" },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("TOURNAMENT_NOT_EDITABLE");

      const existing = await tx.tournamentEntry.count({ where: { tournamentId } });
      const entry = await tx.tournamentEntry.create({
        data: {
          tournamentId,
          userId,
          botId: bot.id,
          seed: seed ?? existing + 1,
          snapshotSourceCode: bot.sourceCode,
          snapshotLanguage: bot.language ?? "javascript",
          snapshotProtocolVersion: bot.protocolVersion ?? 2,
        },
      });
      return tx.tournamentEntry.findUnique({
        where: { id: entry.id },
        include: {
          user: { select: { id: true, username: true } },
          bot: { select: { id: true, name: true, language: true, isActive: true } },
        },
      });
    });
  },

  async removeEntry(tournamentId, entryId) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.tournament.updateMany({
        where: { id: tournamentId, status: "draft" },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("TOURNAMENT_NOT_EDITABLE");

      const deleted = await tx.tournamentEntry.deleteMany({
        where: { id: entryId, tournamentId },
      });
      if (deleted.count !== 1) throw new Error("TOURNAMENT_ENTRY_NOT_FOUND");
      return { removed: true };
    });
  },

  // Lock the roster and materialise the full round-robin schedule in one
  // transaction. The status guard guarantees a second lock cannot create a
  // duplicate schedule.
  async lockAndBuildSchedule(tournamentId, rounds) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.tournament.updateMany({
        where: { id: tournamentId, status: "draft" },
        data: { status: "ready", lockedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("TOURNAMENT_NOT_LOCKABLE");

      for (let index = 0; index < rounds.length; index += 1) {
        const round = await tx.tournamentRound.create({
          data: { tournamentId, roundNumber: index + 1, status: "pending" },
        });

        for (const [entryAId, entryBId] of rounds[index]) {
          // Canonical order (smaller id first) keeps the unique pair key stable
          // regardless of which side the generator emitted first.
          const [a, b] =
            entryAId < entryBId ? [entryAId, entryBId] : [entryBId, entryAId];

          const match = await tx.tournamentMatch.create({
            data: {
              tournamentId,
              roundId: round.id,
              entryAId: a,
              entryBId: b,
              status: "pending",
            },
          });

          // Two side-swapped legs: leg 1 A-first, leg 2 B-first.
          await tx.tournamentGame.createMany({
            data: [
              {
                matchId: match.id,
                legNumber: 1,
                firstEntryId: entryAId,
                secondEntryId: entryBId,
                status: "pending",
              },
              {
                matchId: match.id,
                legNumber: 2,
                firstEntryId: entryBId,
                secondEntryId: entryAId,
                status: "pending",
              },
            ],
          });
        }
      }

      return tx.tournament.findUnique({
        where: { id: tournamentId },
        include: tournamentInclude,
      });
    });
  },

  async findRoundById(roundId) {
    return prisma.tournamentRound.findUnique({
      where: { id: roundId },
      include: {
        matches: {
          orderBy: { id: "asc" },
          include: {
            games: {
              orderBy: { legNumber: "asc" },
              include: {
                firstEntry: true,
                secondEntry: true,
                winnerEntry: { select: { id: true } },
              },
            },
          },
        },
      },
    });
  },

  async completeRound(roundId) {
    return prisma.tournamentRound.updateMany({
      where: { id: roundId, status: { not: "completed" } },
      data: { status: "completed" },
    });
  },

  async findPendingGameInRound(roundId) {
    return prisma.tournamentGame.findFirst({
      where: { match: { roundId }, status: "pending" },
      orderBy: { id: "asc" },
      include: {
        match: { include: { entryA: true, entryB: true, round: true } },
        firstEntry: true,
        secondEntry: true,
      },
    });
  },

  async countGamesByStatus(roundId) {
    const games = await prisma.tournamentGame.findMany({
      where: { match: { roundId } },
      select: { status: true },
    });
    return games.reduce((acc, game) => {
      acc[game.status] = (acc[game.status] ?? 0) + 1;
      acc.total = (acc.total ?? 0) + 1;
      return acc;
    }, {});
  },

  // Claim a pending game for execution. Returns null when another worker has
  // already claimed it (the optimistic status guard prevents double runs).
  async claimGame(gameId) {
    const claimed = await prisma.tournamentGame.updateMany({
      where: { id: gameId, status: "pending" },
      data: {
        status: "running",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return null;
    return prisma.tournamentGame.findUnique({
      where: { id: gameId },
      include: {
        match: { include: { round: true, entryA: true, entryB: true } },
        firstEntry: true,
        secondEntry: true,
      },
    });
  },

  // Persist a single final result. The status guard means a duplicate worker or
  // replayed request cannot award points twice.
  async completeGame(gameId, { winnerEntryId, isDraw, winReason, turns, result }) {
    const updated = await prisma.tournamentGame.updateMany({
      where: { id: gameId, status: "running" },
      data: {
        status: "completed",
        winnerEntryId: winnerEntryId ?? null,
        isDraw: Boolean(isDraw),
        winReason: winReason ?? null,
        turns: turns ?? null,
        result: result ?? null,
        endedAt: new Date(),
      },
    });
    return updated.count === 1;
  },

  // Mark a game as failed after infrastructure retries are exhausted. This is a
  // terminal, observable state that never counts as a win or loss.
  async failGame(gameId, { errorCode, errorMessage }) {
    const updated = await prisma.tournamentGame.updateMany({
      where: { id: gameId, status: "running" },
      data: {
        status: "failed",
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
        endedAt: new Date(),
      },
    });
    return updated.count === 1;
  },

  // Return a claimed game to the pending queue for another retry attempt.
  async requeueGame(gameId, { errorCode, errorMessage }) {
    return prisma.tournamentGame.updateMany({
      where: { id: gameId, status: "running" },
      data: {
        status: "pending",
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
      },
    });
  },

  // Reset previously failed games (retry budget already spent) so the host can
  // retry them explicitly. Does not touch completed games.
  async resetFailedGames(tournamentId) {
    return prisma.tournamentGame.updateMany({
      where: { status: "failed", match: { tournamentId } },
      data: {
        status: "pending",
        attempts: 0,
        errorCode: null,
        errorMessage: null,
      },
    });
  },

  // On boot, any game left in "running" has no persisted result (results are
  // only written on completion), so it is safe to requeue for a fresh attempt.
  async requeueStaleRunningGames(tournamentId) {
    return prisma.tournamentGame.updateMany({
      where: { status: "running", match: { tournamentId } },
      data: { status: "pending" },
    });
  },

  async listActiveForResume() {
    return prisma.tournament.findMany({
      where: { status: "running" },
      select: { id: true },
    });
  },
};

module.exports = tournamentRepository;
