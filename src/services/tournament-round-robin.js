// Deterministic Round Robin schedule generator (circle method).
//
// Each participant meets every other participant exactly once. Pairs are
// grouped into rounds so that, within a round, no participant appears twice.
// For n participants:
//   - even n → (n - 1) rounds, each with n/2 pairs
//   - odd  n → n rounds, each with (n - 1)/2 pairs (one bye per round)
// Total pairs = n * (n - 1) / 2, independent of parity.
//
// The returned pairs are ordered lists of participant identifiers. Callers
// store them in a canonical order (see tournament.service) and expand each
// pair into two side-swapped legs.

function generateRounds(participants) {
  const ids = [...participants];

  if (ids.length < 2) {
    return [];
  }

  const hasBye = ids.length % 2 === 1;
  const rotation = hasBye ? [...ids, null] : [...ids];
  const size = rotation.length;
  const half = size / 2;
  const rounds = [];

  // Fix the first slot and rotate the remainder (standard circle method).
  const slots = [...rotation];
  for (let round = 0; round < size - 1; round += 1) {
    const pairs = [];
    for (let index = 0; index < half; index += 1) {
      const home = slots[index];
      const away = slots[size - 1 - index];
      if (home !== null && away !== null) {
        pairs.push([home, away]);
      }
    }
    rounds.push(pairs);

    const fixed = slots[0];
    const rest = slots.slice(1);
    rest.unshift(rest.pop());
    slots.splice(0, slots.length, fixed, ...rest);
  }

  return rounds;
}

module.exports = {
  generateRounds,
};
