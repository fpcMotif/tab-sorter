import { describe, expect, it } from "vitest";

import { planMoves, type TabMove } from "../tab-moves";

// Replays moves the way a single-id `browser.tabs.move(id, { index })` does:
// remove the tab, then reinsert it at the destination index.
function replay(start: number[], moves: TabMove[]): number[] {
  const strip = [...start];
  for (const { id, index } of moves) {
    strip.splice(strip.indexOf(id), 1);
    strip.splice(index, 0, id);
  }
  return strip;
}

function longestIncreasingLength(values: number[]): number {
  const length = values.map(() => 1);
  let best = 0;
  // `length` is values-sized and i, j index within [0, values.length).
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j]! < values[i]!) {
        length[i] = Math.max(length[i]!, length[j]! + 1);
      }
    }
    best = Math.max(best, length[i]!);
  }
  return best;
}

function* permutations(values: number[]): Generator<number[]> {
  if (values.length <= 1) {
    yield [...values];
    return;
  }
  for (let i = 0; i < values.length; i += 1) {
    const rest = [...values.slice(0, i), ...values.slice(i + 1)];
    for (const tail of permutations(rest)) {
      yield [values[i]!, ...tail];
    }
  }
}

describe("planMoves", () => {
  it("returns no moves when the strip already matches the target", () => {
    expect(planMoves([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it("ranks ids absent from the target below every target id", () => {
    // 5 has no target rank, so rankOf falls back to -1; both ids stay put.
    expect(planMoves([5, 1], [1])).toEqual([]);
  });

  it("moves a single out-of-place tab once", () => {
    const moves = planMoves([2, 1, 3], [1, 2, 3]);

    expect(moves).toHaveLength(1);
    expect(replay([2, 1, 3], moves)).toEqual([1, 2, 3]);
  });

  it("rotates the head to the tail in one move, not N", () => {
    const moves = planMoves([1, 2, 3, 4, 5], [2, 3, 4, 5, 1]);

    expect(moves).toHaveLength(1);
    expect(replay([1, 2, 3, 4, 5], moves)).toEqual([2, 3, 4, 5, 1]);
  });

  it("keeps the longest in-order run fixed and relocates the rest", () => {
    // [B,D,A,C] keeping {A,C} or {B,D} — either way exactly 2 moves.
    const moves = planMoves([10, 20, 30, 40], [20, 40, 10, 30]);

    expect(moves).toHaveLength(2);
    expect(replay([10, 20, 30, 40], moves)).toEqual([20, 40, 10, 30]);
  });

  // The load-bearing proof: for every reachable (current -> target) pair up to
  // relabeling (target = identity covers all of them), replaying the planned
  // single-id moves must reproduce the target, and the move count must equal the
  // proven minimum n - LIS(current).
  it("converges and is minimal for every permutation up to n=7", () => {
    for (let n = 1; n <= 7; n += 1) {
      const target = Array.from({ length: n }, (_, i) => i);
      const minimum = (current: number[]) => n - longestIncreasingLength(current);

      for (const current of permutations(target)) {
        const moves = planMoves(current, target);

        expect(replay(current, moves)).toEqual(target);
        expect(moves).toHaveLength(minimum(current));
      }
    }
  });
});
