import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyOrder } from "./tabs-service";

// The realize layer is where the subtle bugs live: planMoves speaks in
// survivor-strip coordinates, but `browser.tabs.move` takes an ABSOLUTE window
// index, and the live window may hold foreign tabs (opened after the snapshot)
// and be missing vanished ones. This file fuzzes that translation against a
// faithful in-memory window so any off-by-one scrambles survivors and fails.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }

  return copy;
}

function lisLength(values: number[]): number {
  const length = values.map(() => 1);
  let best = 0;

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

const query = vi.fn();
const move = vi.fn();

// Disjoint id ranges so the three populations never collide.
const isSurvivor = (id: number): boolean => id < 1000;
const isForeign = (id: number): boolean => id >= 1000 && id < 5000;

describe("applyOrder — realize-layer fuzz", () => {
  beforeEach(() => {
    query.mockReset();
    move.mockReset();
    vi.stubGlobal("browser", { tabs: { query, move } });
  });

  it("drives survivors to their target order despite foreign and vanished tabs, with minimal moves", async () => {
    const rng = mulberry32(101);

    for (let trial = 0; trial < 400; trial += 1) {
      const survivorCount = 1 + Math.floor(rng() * 7);
      const survivors = Array.from({ length: survivorCount }, (_value, i) => i + 1);
      const foreign = Array.from({ length: Math.floor(rng() * 4) }, (_value, i) => 1000 + i);
      const vanished = Array.from({ length: Math.floor(rng() * 3) }, (_value, i) => 5000 + i);

      const liveOrder = shuffled([...survivors, ...foreign], rng);
      const targetSurvivors = shuffled(survivors, rng);

      // Desired order: the target survivor order with already-closed tabs sprinkled
      // in — applyOrder must drop them without disturbing the survivors.
      const orderedIds = [...targetSurvivors];
      for (const id of vanished) {
        orderedIds.splice(Math.floor(rng() * (orderedIds.length + 1)), 0, id);
      }

      const liveWindow = [...liveOrder];
      // Re-arm per trial: the call counters must reflect this trial alone, not
      // the running total across the loop.
      query.mockReset();
      move.mockReset();
      query.mockResolvedValue(liveOrder.map((id) => ({ id })));
      move.mockImplementation((id: number, { index }: { index: number }) => {
        liveWindow.splice(liveWindow.indexOf(id), 1);
        liveWindow.splice(index, 0, id);
        return Promise.resolve();
      });

      await applyOrder(orderedIds, 1);

      // Survivors land in exactly the requested relative order...
      expect(liveWindow.filter(isSurvivor)).toEqual(targetSurvivors);
      // ...and no foreign tab is lost or duplicated.
      expect(liveWindow.filter(isForeign).toSorted((a, b) => a - b)).toEqual(
        foreign.toSorted((a, b) => a - b),
      );

      // No redundant work: the move count equals the proven minimum n - LIS over
      // the survivor strip, not one move per tab.
      const rankOf = new Map(targetSurvivors.map((id, i) => [id, i]));
      const currentSurvivors = liveOrder.filter(isSurvivor);
      const expectedMoves =
        currentSurvivors.length - lisLength(currentSurvivors.map((id) => rankOf.get(id)!));
      expect(move).toHaveBeenCalledTimes(expectedMoves);
    }
  });
});
