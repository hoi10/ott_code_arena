const test = require("node:test");
const assert = require("node:assert/strict");
const roundRobin = require("../src/services/tournament-round-robin");

// Expands generated rounds into the full list of pair legs the service would
// persist: each unordered pair becomes two side-swapped games.
function expandPairs(rounds) {
  const legs = [];
  for (const round of rounds) {
    for (const [a, b] of round) {
      legs.push({ first: a, second: b });
      legs.push({ first: b, second: a });
    }
  }
  return legs;
}

function pairKey(a, b) {
  return [a, b].sort((x, y) => x - y).join("-");
}

test("three participants produce three pairs and six legs", () => {
  const rounds = roundRobin.generateRounds([1, 2, 3]);
  const pairs = rounds.flat();
  const legs = expandPairs(rounds);

  assert.equal(pairs.length, 3);
  assert.equal(legs.length, 6);

  const pairKeys = new Set(pairs.map(([a, b]) => pairKey(a, b)));
  assert.equal(pairKeys.size, 3, "no duplicate pairs");

  // No self matches.
  assert.ok(pairs.every(([a, b]) => a !== b), "no self matches");

  // Each unordered pair appears exactly twice across legs (both sides).
  const legKeys = legs.map((leg) => pairKey(leg.first, leg.second));
  for (const key of pairKeys) {
    assert.equal(legKeys.filter((k) => k === key).length, 2);
  }
});

test("four participants produce six pairs and twelve legs", () => {
  const rounds = roundRobin.generateRounds([1, 2, 3, 4]);
  const pairs = rounds.flat();
  const legs = expandPairs(rounds);

  assert.equal(pairs.length, 6);
  assert.equal(legs.length, 12);

  const pairKeys = new Set(pairs.map(([a, b]) => pairKey(a, b)));
  assert.equal(pairKeys.size, 6, "no duplicate pairs");
  assert.ok(pairs.every(([a, b]) => a !== b), "no self matches");

  // No duplicated directed leg (each ordered matchup is unique).
  const directed = new Set(legs.map((leg) => `${leg.first}->${leg.second}`));
  assert.equal(directed.size, 12, "no duplicate directed legs");
});

test("even participant count uses n-1 rounds without byes", () => {
  const rounds = roundRobin.generateRounds([1, 2, 3, 4]);
  assert.equal(rounds.length, 3);
  for (const round of rounds) {
    assert.equal(round.length, 2, "two pairs per round");
    const ids = round.flat();
    assert.equal(new Set(ids).size, ids.length, "no participant twice in a round");
  }
});

test("odd participant count uses n rounds with one bye each", () => {
  const rounds = roundRobin.generateRounds([1, 2, 3, 5, 7]);
  assert.equal(rounds.length, 5);
  for (const round of rounds) {
    // Five players -> one bye per round -> two active pairs.
    assert.equal(round.length, 2, "two pairs per round for five players");
    const ids = round.flat();
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("every participant plays every other participant exactly once", () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const ids = Array.from({ length: n }, (_, index) => index + 1);
    const rounds = roundRobin.generateRounds(ids);
    const pairKeys = rounds
      .flat()
      .map(([a, b]) => pairKey(a, b));

    assert.equal(pairKeys.length, (n * (n - 1)) / 2, `n=${n} pair count`);
    assert.equal(new Set(pairKeys).size, pairKeys.length, `n=${n} unique pairs`);

    // Each participant appears exactly (n - 1) times across all pairs.
    const appearances = {};
    for (const [a, b] of rounds.flat()) {
      appearances[a] = (appearances[a] ?? 0) + 1;
      appearances[b] = (appearances[b] ?? 0) + 1;
    }
    for (const id of ids) {
      assert.equal(appearances[id], n - 1, `n=${n} id=${id} appearances`);
    }
  }
});

test("within a round each participant plays at most once (both parities)", () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const ids = Array.from({ length: n }, (_, index) => index + 1);
    for (const round of roundRobin.generateRounds(ids)) {
      const seen = new Set();
      for (const [a, b] of round) {
        assert.ok(!seen.has(a) && !seen.has(b), `n=${n} round conflict`);
        seen.add(a);
        seen.add(b);
      }
    }
  }
});

test("schedule is deterministic for the same input order", () => {
  const first = roundRobin.generateRounds([10, 20, 30, 40, 50]);
  const second = roundRobin.generateRounds([10, 20, 30, 40, 50]);
  assert.deepEqual(first, second);
});

test("fewer than two participants produce no rounds", () => {
  assert.deepEqual(roundRobin.generateRounds([1]), []);
  assert.deepEqual(roundRobin.generateRounds([]), []);
});
