export interface TabMove {
  id: number;
  index: number;
}

// Indices of `values` that form a longest increasing subsequence. These mark the
// tabs already in correct relative order, so they can stay put while everything
// else is relocated around them. O(n^2) is ample for a window of tabs.
function longestIncreasingIndices(values: number[]): Set<number> {
  const length = values.map(() => 1);
  const previous = values.map(() => -1);
  let best = -1;

  // `length` and `previous` are values-sized, and i, j, best, and previous[i] all
  // index within [0, values.length), so the `!` reads below are never undefined.
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j]! < values[i]! && length[j]! + 1 > length[i]!) {
        length[i] = length[j]! + 1;
        previous[i] = j;
      }
    }
    if (best === -1 || length[i]! > length[best]!) {
      best = i;
    }
  }

  const keep = new Set<number>();
  for (let i = best; i !== -1; i = previous[i]!) {
    keep.add(i);
  }

  return keep;
}

// Fewest single-tab moves that turn `currentIds` into `targetIds` (both
// permutations of the same id set). The tabs already in correct relative order —
// the longest increasing subsequence by target rank — are never moved; every
// other tab is relocated to its slot. Each mover is inserted immediately after
// the last already-placed tab with a smaller target rank, so the kept tabs and
// the movers stay sorted by rank as the strip is rebuilt. Indices are produced by
// simulating each move against the live strip, so replaying them with single-id
// `browser.tabs.move` calls reproduces `targetIds` exactly.
export function planMoves(currentIds: number[], targetIds: number[]): TabMove[] {
  const rank = new Map<number, number>();
  targetIds.forEach((id, index) => rank.set(id, index));
  const rankOf = (id: number): number => rank.get(id) ?? -1;

  const keptPositions = longestIncreasingIndices(currentIds.map(rankOf));
  const keepers = new Set<number>();
  // keptPositions are indices into currentIds, so each read is in-bounds.
  keptPositions.forEach((position) => keepers.add(currentIds[position]!));

  const placed = new Set<number>(keepers);
  const strip = [...currentIds];
  const moves: TabMove[] = [];

  for (const id of targetIds) {
    if (keepers.has(id)) {
      continue;
    }

    // currentIds are distinct tab ids, so indexOf is unambiguous; and the
    // placement scan below is already O(n), so a position Map buys nothing.
    strip.splice(strip.indexOf(id), 1);

    let index = 0;
    // i indexes within [0, strip.length), so strip[i] is never undefined.
    for (let i = 0; i < strip.length; i += 1) {
      if (placed.has(strip[i]!) && rankOf(strip[i]!) < rankOf(id)) {
        index = i + 1;
      }
    }

    strip.splice(index, 0, id);
    moves.push({ id, index });
    placed.add(id);
  }

  return moves;
}
