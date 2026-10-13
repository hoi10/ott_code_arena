// Tournament scoring and ranking.
//
// Points per game (only counted once, from persisted completed games):
//   - win  → 3 points
//   - draw → 1 point to each side
//   - loss → 0 points
//
// Ranking order (stable, decided before the tournament starts):
//   1. total points (descending)
//   2. head-to-head points among the tied group (descending), only when the
//      tie can be resolved from direct games between the tied participants
//   3. win-minus-loss differential (descending)
//   4. seed (ascending) as the final deterministic tiebreaker
//
// Ties that survive every criterion share the same displayed rank.

const POINTS_WIN = 3;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

function createTally(entry) {
  return {
    entryId: entry.id,
    seed: entry.seed,
    userId: entry.userId,
    username: entry.user?.username ?? null,
    botId: entry.botId,
    botName: entry.bot?.name ?? null,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
  };
}

function applyGame(tallies, game) {
  const first = tallies.get(game.firstEntryId);
  const second = tallies.get(game.secondEntryId);
  if (!first || !second) return;

  first.gamesPlayed += 1;
  second.gamesPlayed += 1;

  if (game.isDraw || !game.winnerEntryId) {
    first.draws += 1;
    second.draws += 1;
    first.points += POINTS_DRAW;
    second.points += POINTS_DRAW;
    return;
  }

  const winner = game.winnerEntryId === first.entryId ? first : second;
  const loser = winner === first ? second : first;
  winner.wins += 1;
  winner.points += POINTS_WIN;
  loser.losses += 1;
  loser.points += POINTS_LOSS;
}

function headToHeadPoints(tallies, games) {
  const tiedIds = new Set(tallies.keys());
  const h2h = new Map();
  for (const id of tiedIds) h2h.set(id, 0);

  for (const game of games) {
    const firstInGroup = tiedIds.has(game.firstEntryId);
    const secondInGroup = tiedIds.has(game.secondEntryId);
    if (!firstInGroup || !secondInGroup) continue;

    if (game.isDraw || !game.winnerEntryId) {
      h2h.set(game.firstEntryId, h2h.get(game.firstEntryId) + POINTS_DRAW);
      h2h.set(game.secondEntryId, h2h.get(game.secondEntryId) + POINTS_DRAW);
    } else {
      h2h.set(game.winnerEntryId, h2h.get(game.winnerEntryId) + POINTS_WIN);
    }
  }

  return h2h;
}

// Groups entries that are indistinguishable on the published criteria so they
// can share a rank number.
function assignRanks(rows) {
  let lastKey = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    const key = `${row.points}|${row.headToHead}|${row.differential}|${row.seed}`;
    if (key !== lastKey) {
      lastRank = index + 1;
      lastKey = key;
    }
    row.rank = lastRank;
  });
  return rows;
}

function computeStandings({ entries, games }) {
  const completedGames = games.filter(
    (game) => game.status === "completed"
  );

  const tallies = new Map();
  for (const entry of entries) {
    tallies.set(entry.id, createTally(entry));
  }

  for (const game of completedGames) {
    applyGame(tallies, game);
  }

  const rows = [...tallies.values()].map((row) => ({
    ...row,
    differential: row.wins - row.losses,
    headToHead: 0,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.seed - b.seed;
  });

  // Resolve head-to-head within each points group, then final differential and
  // seed ordering. Recomputing until stable keeps the comparison deterministic.
  let start = 0;
  while (start < rows.length) {
    let end = start;
    while (end < rows.length && rows[end].points === rows[start].points) {
      end += 1;
    }
    if (end - start > 1) {
      const group = rows.slice(start, end);
      const h2h = headToHeadPoints(
        new Map(group.map((row) => [row.entryId, { id: row.entryId }])),
        completedGames
      );
      for (const row of group) {
        row.headToHead = h2h.get(row.entryId) ?? 0;
      }
      group.sort((a, b) => {
        if (b.headToHead !== a.headToHead) return b.headToHead - a.headToHead;
        if (b.differential !== a.differential) return b.differential - a.differential;
        return a.seed - b.seed;
      });
      rows.splice(start, end - start, ...group);
    }
    start = end;
  }

  return assignRanks(rows);
}

module.exports = {
  POINTS_WIN,
  POINTS_DRAW,
  POINTS_LOSS,
  computeStandings,
};
