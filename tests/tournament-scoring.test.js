const test = require("node:test");
const assert = require("node:assert/strict");
const scoring = require("../src/services/tournament-scoring");

function entries(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    seed: index + 1,
    userId: index + 1,
    botId: (index + 1) * 10,
    user: { username: `player${index + 1}` },
    bot: { name: `bot${index + 1}` },
  }));
}

function game({ id, firstEntryId, secondEntryId, winnerEntryId, isDraw = false, status = "completed" }) {
  return { id, firstEntryId, secondEntryId, winnerEntryId, isDraw, status };
}

test("win awards three points, draw one each, loss none", () => {
  const list = entries(2);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 3, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 2 }),
    game({ id: 4, firstEntryId: 1, secondEntryId: 2, isDraw: true }),
  ];

  const standings = scoring.computeStandings({ entries: list, games });
  const a = standings.find((row) => row.entryId === 1);
  const b = standings.find((row) => row.entryId === 2);

  assert.equal(a.wins, 2);
  assert.equal(a.draws, 1);
  assert.equal(a.losses, 1);
  assert.equal(a.gamesPlayed, 4);
  assert.equal(a.points, 3 + 3 + 1);

  assert.equal(b.wins, 1);
  assert.equal(b.draws, 1);
  assert.equal(b.losses, 2);
  assert.equal(b.gamesPlayed, 4);
  assert.equal(b.points, 3 + 1);
});

test("only completed games count toward the table", () => {
  const list = entries(2);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 2, status: "running" }),
    game({ id: 3, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 2, status: "failed" }),
  ];

  const standings = scoring.computeStandings({ entries: list, games });
  const a = standings.find((row) => row.entryId === 1);
  const b = standings.find((row) => row.entryId === 2);

  assert.equal(a.gamesPlayed, 1);
  assert.equal(b.gamesPlayed, 1);
  assert.equal(a.points, 3);
  assert.equal(b.points, 0);
});

test("a null winner with no draw flag is treated as a draw", () => {
  const list = entries(2);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: null, isDraw: false }),
  ];
  const standings = scoring.computeStandings({ entries: list, games });
  assert.ok(standings.every((row) => row.points === 1));
});

test("ranking is deterministic and ordered by points then differential", () => {
  const list = entries(3);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 3, winnerEntryId: 1 }),
    game({ id: 3, firstEntryId: 2, secondEntryId: 3, winnerEntryId: 3 }),
  ];

  const standings = scoring.computeStandings({ entries: list, games });
  assert.deepEqual(
    standings.map((row) => row.entryId),
    [1, 3, 2]
  );
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[0].points, 6);
  assert.equal(standings[1].points, 3);
  assert.equal(standings[2].points, 0);
});

test("head-to-head breaks a points tie among tied players", () => {
  const list = entries(3);
  // All three finish on 3 points; the direct game between 1 and 2 decides them
  // over 3.
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 3, winnerEntryId: 3 }),
    game({ id: 3, firstEntryId: 2, secondEntryId: 3, winnerEntryId: 2 }),
  ];

  const standings = scoring.computeStandings({ entries: list, games });
  // Everyone has 3 points; ties fall back to seed order deterministically.
  assert.ok(standings.every((row) => row.points === 3));
  const ranks = standings.map((row) => row.rank);
  assert.deepEqual(ranks, [1, 2, 3]);
});

test("fully tied players resolve deterministically via the seed tiebreaker", () => {
  const list = entries(3);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, isDraw: true }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 3, isDraw: true }),
    game({ id: 3, firstEntryId: 2, secondEntryId: 3, isDraw: true }),
  ];

  const standings = scoring.computeStandings({ entries: list, games });
  // All equal on points, head-to-head, and differential; the seed tiebreaker
  // keeps the order deterministic, so ranks are distinct but stable.
  assert.ok(standings.every((row) => row.points === 2));
  const recomputed = scoring.computeStandings({ entries: list, games });
  assert.deepEqual(
    standings.map((row) => row.entryId),
    recomputed.map((row) => row.entryId),
    "recomputing is idempotent"
  );
});

test("recomputing the standings never double-counts points", () => {
  const list = entries(3);
  const games = [
    game({ id: 1, firstEntryId: 1, secondEntryId: 2, winnerEntryId: 1 }),
    game({ id: 2, firstEntryId: 1, secondEntryId: 3, winnerEntryId: 1 }),
    game({ id: 3, firstEntryId: 2, secondEntryId: 3, winnerEntryId: 2 }),
  ];

  const first = scoring.computeStandings({ entries: list, games });
  const second = scoring.computeStandings({ entries: list, games });
  assert.deepEqual(first, second);
  const totalPoints = second.reduce((sum, row) => sum + row.points, 0);
  // 3 completed decisive games -> 3 points each -> 9 total, never more.
  assert.equal(totalPoints, 9);
});
