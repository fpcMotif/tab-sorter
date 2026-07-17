import { describe, expect, it } from "vitest";

import { planBlockMoves, planFlatMoves, type RealizeMove, type StripTab } from "./realize-order";
import { TAB_GROUP_NONE } from "./types";

// A minimal live-window model the emitted moves replay against — faithful to the
// two browser calls the executor makes. tabs.move lifts one tab and reinserts it
// at the absolute index; tabGroups.move lifts a group's whole (contiguous) span
// and reinserts it. If the pure planners' index math is off, replaying scrambles
// this model and the invariants below fail.
function replayFlat(start: number[], moves: Array<{ id: number; index: number }>): number[] {
  const strip = [...start];
  for (const { id, index } of moves) {
    strip.splice(strip.indexOf(id), 1);
    strip.splice(index, 0, id);
  }
  return strip;
}

function replayBlocks(start: StripTab[], moves: RealizeMove[]): StripTab[] {
  const strip = start.map((tab) => ({ ...tab }));
  for (const move of moves) {
    if (move.kind === "tab") {
      const from = strip.findIndex((tab) => tab.id === move.id);
      const [tab] = strip.splice(from, 1);
      strip.splice(move.index, 0, tab!);
      continue;
    }
    const members = strip.filter((tab) => tab.groupId === move.groupId);
    const rest = strip.filter((tab) => tab.groupId !== move.groupId);
    rest.splice(move.index, 0, ...members);
    strip.splice(0, strip.length, ...rest);
  }
  return strip;
}

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

// The top-level block sequence a strip presents: each ungrouped tab is its own
// block; each contiguous group run collapses to a single group marker. Ids in
// `skip` (the pinned front) are ignored. Distinguishing tab vs group markers by
// sign keeps the two id spaces from colliding.
function blockSeq(strip: StripTab[], skip: Set<number>): number[] {
  const seq: number[] = [];
  let lastGroup: number | undefined;
  for (const tab of strip) {
    if (skip.has(tab.id)) {
      continue;
    }
    if (tab.groupId === TAB_GROUP_NONE) {
      seq.push(tab.id);
      lastGroup = undefined;
      continue;
    }
    if (tab.groupId !== lastGroup) {
      seq.push(-tab.groupId);
      lastGroup = tab.groupId;
    }
  }
  return seq;
}

// The block sequence the desired `order` asks for: walk the mentioned unpinned
// ids, emitting each ungrouped id once and each live group once at its first
// sighting.
function desiredBlockSeq(order: number[], idToGroup: Map<number, number>, pinned: Set<number>) {
  const seq: number[] = [];
  const seen = new Set<number>();
  for (const id of order) {
    if (pinned.has(id)) {
      continue;
    }
    const groupId = idToGroup.get(id)!;
    if (groupId === TAB_GROUP_NONE) {
      seq.push(id);
      continue;
    }
    if (seen.has(groupId)) {
      continue;
    }
    seen.add(groupId);
    seq.push(-groupId);
  }
  return seq;
}

const isSurvivor = (id: number): boolean => id < 1000;

function stripTab(id: number, groupId = TAB_GROUP_NONE, pinned = false): StripTab {
  return { id, pinned, groupId };
}

function groupsAreContiguous(strip: StripTab[]): boolean {
  const seen = new Set<number>();
  let previous: number | undefined;
  for (const tab of strip) {
    if (tab.groupId === TAB_GROUP_NONE) {
      previous = undefined;
      continue;
    }
    if (tab.groupId !== previous && seen.has(tab.groupId)) {
      return false;
    }
    seen.add(tab.groupId);
    previous = tab.groupId;
  }
  return true;
}

describe("planFlatMoves", () => {
  it("emits no moves when the survivors already match the target order", () => {
    expect(planFlatMoves([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it("drops ids that vanished from the live window before planning", () => {
    // id 2 is in the desired order but no longer live; survivors [3, 1] are
    // already ordered, so nothing moves.
    expect(planFlatMoves([3, 1], [3, 2, 1])).toEqual([]);
  });

  it("translates a survivor-strip index past a foreign tab to an absolute slot", () => {
    // 1000 was opened after the snapshot and is not in the desired order. Moving
    // survivor 2 ahead of survivor 1 must skip over it.
    const moves = planFlatMoves([1, 2, 1000], [2, 1]);
    const after = replayFlat([1, 2, 1000], moves);

    expect(after.filter((id) => id < 1000)).toEqual([2, 1]);
    expect(after).toContain(1000);
  });

  it("appends a survivor at the window end when its slot is past every remaining survivor", () => {
    // Rotating 1 to the tail lands it at strip.length (the else branch of the
    // absolute-index translation), after the trailing foreign tab.
    const moves = planFlatMoves([1, 2, 3, 1000], [2, 3, 1]);
    const after = replayFlat([1, 2, 3, 1000], moves);

    expect(after.filter((id) => id < 1000)).toEqual([2, 3, 1]);
    expect(after.indexOf(1)).toBe(after.length - 1);
  });

  it("drives survivors to the target order with the minimal move count despite foreign and vanished tabs", () => {
    const rng = mulberry32(202);

    for (let trial = 0; trial < 400; trial += 1) {
      const survivorCount = 1 + Math.floor(rng() * 7);
      const survivors = Array.from({ length: survivorCount }, (_v, i) => i + 1);
      const foreign = Array.from({ length: Math.floor(rng() * 4) }, (_v, i) => 1000 + i);
      const vanished = Array.from({ length: Math.floor(rng() * 3) }, (_v, i) => 5000 + i);

      const liveOrder = shuffled([...survivors, ...foreign], rng);
      const targetSurvivors = shuffled(survivors, rng);
      const orderedIds = [...targetSurvivors];
      for (const id of vanished) {
        orderedIds.splice(Math.floor(rng() * (orderedIds.length + 1)), 0, id);
      }

      const moves = planFlatMoves(liveOrder, orderedIds);
      const after = replayFlat(liveOrder, moves);

      expect(after.filter(isSurvivor)).toEqual(targetSurvivors);
      expect(after.filter((id) => !isSurvivor(id)).toSorted((a, b) => a - b)).toEqual(
        foreign.toSorted((a, b) => a - b),
      );

      const rankOf = new Map(targetSurvivors.map((id, i) => [id, i]));
      const currentSurvivors = liveOrder.filter(isSurvivor);
      const expectedMoves =
        currentSurvivors.length - lisLength(currentSurvivors.map((id) => rankOf.get(id)!));
      expect(moves).toHaveLength(expectedMoves);
    }
  });
});

describe("planBlockMoves", () => {
  it("emits no moves when the grouped strip already matches the desired order", () => {
    const strip = [
      stripTab(1, TAB_GROUP_NONE, true),
      stripTab(10, 5),
      stripTab(11, 5),
      stripTab(99),
    ];

    expect(planBlockMoves(strip, [1, 10, 11, 99])).toEqual([]);
  });

  it("reorders pinned tabs within the front region", () => {
    const strip = [stripTab(1, TAB_GROUP_NONE, true), stripTab(2, TAB_GROUP_NONE, true)];
    const moves = planBlockMoves(strip, [2, 1]);
    const after = replayBlocks(strip, moves);

    expect(after.map((t) => t.id)).toEqual([2, 1]);
  });

  it("fixes within-group member order before relocating the group", () => {
    const strip = [stripTab(10, 5), stripTab(11, 5), stripTab(12, 5)];
    const moves = planBlockMoves(strip, [12, 10, 11]);
    const after = replayBlocks(strip, moves);

    expect(after.map((t) => t.id)).toEqual([12, 10, 11]);
    expect(after.every((t) => t.groupId === 5)).toBe(true);
  });

  it("moves a whole group span whose live membership exceeds the mentioned members", () => {
    // 51 is a live group member the order never names. tabGroups.move carries it
    // along, so the span width tracks live membership (3), not the 2 named ids.
    const strip = [stripTab(50, 7), stripTab(51, 7), stripTab(52, 7)];
    const moves = planBlockMoves(strip, [52, 50]);
    const after = replayBlocks(strip, moves);

    expect(after.filter((t) => t.groupId === 7)).toHaveLength(3);
    expect(after.map((t) => t.id)).toContain(51);
    const named = after.filter((t) => t.id === 52 || t.id === 50).map((t) => t.id);
    expect(named).toEqual([52, 50]);
  });

  it("keeps a group contiguous when the order interleaves an outsider between its members", () => {
    // A group-agnostic order sequences 10, 99, 11 even though 10 and 11 share a
    // live group; the group must stay one span rather than splitting around 99.
    const strip = [stripTab(10, 5), stripTab(11, 5), stripTab(99)];
    const moves = planBlockMoves(strip, [10, 99, 11]);
    const after = replayBlocks(strip, moves);

    expect(groupsAreContiguous(after)).toBe(true);
    expect(after.filter((t) => t.groupId === 5).map((t) => t.id)).toEqual([10, 11]);
  });

  it("relocates a group span and a trailing singleton into their desired order", () => {
    const strip = [stripTab(99), stripTab(10, 5), stripTab(11, 5)];
    const moves = planBlockMoves(strip, [10, 11, 99]);
    const after = replayBlocks(strip, moves);

    expect(after.map((t) => t.id)).toEqual([10, 11, 99]);
    expect(moves.some((m) => m.kind === "group")).toBe(true);
  });

  it("never lets a pinned tab leave the front region", () => {
    const strip = [
      stripTab(1, TAB_GROUP_NONE, true),
      stripTab(2, TAB_GROUP_NONE, true),
      stripTab(10, 5),
      stripTab(99),
    ];
    // Desired order deliberately buries the pinned ids among unpinned ones.
    const moves = planBlockMoves(strip, [99, 10, 2, 1]);
    const after = replayBlocks(strip, moves);

    expect(
      after
        .slice(0, 2)
        .map((t) => t.id)
        .toSorted((a, b) => a - b),
    ).toEqual([1, 2]);
  });

  it("holds every realize invariant across randomized grouped strips", () => {
    const rng = mulberry32(303);

    for (let trial = 0; trial < 500; trial += 1) {
      let nextId = 1;
      let nextGroup = 100;
      const strip: StripTab[] = [];

      const pinnedCount = Math.floor(rng() * 3);
      const pinnedIds: number[] = [];
      for (let i = 0; i < pinnedCount; i += 1) {
        const id = nextId++;
        pinnedIds.push(id);
        strip.push(stripTab(id, TAB_GROUP_NONE, true));
      }

      const blockCount = 1 + Math.floor(rng() * 4);
      for (let b = 0; b < blockCount; b += 1) {
        if (rng() < 0.55) {
          strip.push(stripTab(nextId++));
          continue;
        }
        const groupId = nextGroup++;
        const memberCount = 2 + Math.floor(rng() * 2);
        const members = Array.from({ length: memberCount }, () => nextId++);
        // Members sit contiguously but in a shuffled internal order, so phase (b)
        // has real work to do.
        for (const id of shuffled(members, rng)) {
          strip.push(stripTab(id, groupId));
        }
      }

      const pinnedSet = new Set(pinnedIds);
      const idToGroup = new Map(strip.map((t) => [t.id, t.groupId]));
      const unpinned = strip.filter((t) => !t.pinned).map((t) => t.id);
      // Always name the pinned ids; drop some unpinned ones so foreign-drift is
      // exercised.
      const mentioned = [...pinnedIds, ...unpinned.filter(() => rng() < 0.8)];
      const order = shuffled(mentioned, rng);

      const moves = planBlockMoves(strip, order);
      const after = replayBlocks(strip, moves);

      // Nothing is lost or duplicated.
      expect(after.map((t) => t.id).toSorted((a, b) => a - b)).toEqual(
        strip.map((t) => t.id).toSorted((a, b) => a - b),
      );
      // Chrome's contiguity invariant survives.
      expect(groupsAreContiguous(after)).toBe(true);
      // Pinned tabs stay the exact front block.
      expect(after.slice(0, pinnedCount).every((t) => t.pinned)).toBe(true);
      expect(after.slice(pinnedCount).some((t) => t.pinned)).toBe(false);

      // The mentioned blocks lead, in the desired order; foreign blocks trail.
      const desired = desiredBlockSeq(order, idToGroup, pinnedSet);
      const finalSeq = blockSeq(after, pinnedSet);
      expect(finalSeq.slice(0, desired.length)).toEqual(desired);

      // The realized layout is a fixed point: re-planning it asks for nothing.
      expect(planBlockMoves(after, order)).toEqual([]);
    }
  });
});
