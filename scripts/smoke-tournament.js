// Live end-to-end smoke test for Tournament Mode against the dev database.
// Creates temporary users/bots, drives the full lifecycle, then cleans up.
// Run with: node scripts/smoke-tournament.js
require("dotenv").config();

const prisma = require("../src/config/database");
const tournamentService = require("../src/services/tournament.service");

const BOT_SOURCE = `
const DELTAS = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const CAPTURES = { bua: "keo", keo: "bao", bao: "bua" };
function play(input) {
  const size = input.boardSize;
  const target = input.target;
  const occupied = new Map();
  for (const p of input.pieces.opponent) occupied.set(p.x + "," + p.y, p.type);
  for (const p of input.pieces.own) occupied.set(p.x + "," + p.y, "own");
  const dist = (x, y) => Math.max(Math.abs(target.x - x), Math.abs(target.y - y));
  let best = null;
  let bestScore = Infinity;
  for (const piece of input.pieces.own) {
    for (const [dx, dy] of DELTAS) {
      const nx = piece.x + dx;
      const ny = piece.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const cell = occupied.get(nx + "," + ny);
      if (cell === "own") continue;
      if (cell && CAPTURES[piece.type] !== cell) continue;
      const score = dist(nx, ny);
      if (score < bestScore) {
        bestScore = score;
        best = { pieceId: piece.id, to: { x: nx, y: ny } };
      }
    }
  }
  return best;
}
return play(input);
`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✔ ${message}`);
}

async function main() {
  const stamp = Date.now();
  const createdUserIds = [];
  const createdBotIds = [];
  let tournamentId = null;

  try {
    const entries = [];
    for (let i = 0; i < 3; i += 1) {
      const user = await prisma.user.create({
        data: {
          username: `smoke_host_${stamp}_${i}`,
          email: `smoke_${stamp}_${i}@example.com`,
          password: "not-a-real-hash",
        },
      });
      createdUserIds.push(user.id);
      const bot = await prisma.bot.create({
        data: {
          name: `smoke-bot-${stamp}-${i}`,
          sourceCode: BOT_SOURCE,
          language: "javascript",
          protocolVersion: 2,
          isActive: true,
          userId: user.id,
        },
      });
      createdBotIds.push(bot.id);
      entries.push({ userId: user.id, botId: bot.id });
    }
    const hostId = createdUserIds[0];
    console.log("Created 3 users and 3 bots.");

    const created = await tournamentService.createTournament(hostId, {
      name: `Smoke Tournament ${stamp}`,
      description: "live smoke test",
    });
    tournamentId = created.id;
    assert(created.status === "draft", "tournament created in draft");
    assert(created.hostUserId === hostId, "host is the owner");

    try {
      await tournamentService.lockRoster(tournamentId, hostId);
      throw new Error("expected TOURNAMENT_MIN_PARTICIPANTS");
    } catch (error) {
      assert(
        error.message === "TOURNAMENT_MIN_PARTICIPANTS",
        "cannot lock with fewer than 3 participants"
      );
    }

    // 4. Each participant registers themselves with their own bot.
    for (const entry of entries) {
      await tournamentService.addParticipant(
        tournamentId,
        entry.userId,
        entry.botId
      );
    }
    const detail = await tournamentService.getTournament(tournamentId);
    assert(detail.entries.length === 3, "three participants registered");

    try {
      await tournamentService.lockRoster(tournamentId, createdUserIds[1]);
      throw new Error("expected TOURNAMENT_HOST_ONLY");
    } catch (error) {
      assert(
        error.message === "TOURNAMENT_HOST_ONLY",
        "non-host cannot lock the roster"
      );
    }

    const locked = await tournamentService.lockRoster(tournamentId, hostId);
    assert(locked.status === "ready", "roster locked -> ready");
    const matches = locked.rounds.flatMap((round) => round.matches);
    const legs = matches.flatMap((match) => match.games);
    assert(matches.length === 3, "three pairs created");
    assert(legs.length === 6, "six legs created");
    assert(
      matches.every((m) => m.games.length === 2),
      "every pair has two side-swapped legs"
    );

    await prisma.bot.update({
      where: { id: createdBotIds[0] },
      data: { sourceCode: "TAMPERED", language: "python" },
    });
    const raw = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { entries: true },
    });
    assert(
      raw.entries[0].snapshotSourceCode === BOT_SOURCE,
      "snapshot source unchanged after editing the bot"
    );
    assert(
      raw.entries[0].snapshotLanguage === "javascript",
      "snapshot language unchanged after editing the bot"
    );

    try {
      await tournamentService.addParticipant(
        tournamentId,
        createdUserIds[0],
        createdBotIds[0]
      );
      throw new Error("expected TOURNAMENT_NOT_EDITABLE");
    } catch (error) {
      assert(
        error.message === "TOURNAMENT_NOT_EDITABLE",
        "cannot add participants after locking"
      );
    }

    const started = await tournamentService.startTournament(tournamentId, hostId);
    assert(started.status === "running", "tournament started -> running");

    let final = null;
    for (let i = 0; i < 120; i += 1) {
      final = await tournamentService.getTournament(tournamentId);
      if (final.status === "completed" || final.status === "cancelled") break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(final.status === "completed", "tournament reached completed");
    assert(
      final.progress.completed === 6,
      `all six games completed (progress.completed=${final.progress.completed})`
    );

    const allGames = final.rounds
      .flatMap((r) => r.matches)
      .flatMap((m) => m.games);
    const draws = allGames.filter((g) => g.isDraw).length;
    const decisive = allGames.length - draws;
    const expectedPoints = decisive * 3 + draws * 2;
    const totalPoints = final.standings.reduce((sum, row) => sum + row.points, 0);
    assert(
      totalPoints === expectedPoints,
      `standings points (${totalPoints}) match game results (${expectedPoints})`
    );
    assert(final.standings[0].rank === 1, "standings are ranked");

    console.log("\nLive smoke test PASSED.");
  } finally {
    if (tournamentId) {
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    if (createdBotIds.length) {
      await prisma.bot.deleteMany({ where: { id: { in: createdBotIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
    console.log("Cleaned up temporary data.");
  }
}

main().catch(async (error) => {
  console.error("Live smoke test FAILED:", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
