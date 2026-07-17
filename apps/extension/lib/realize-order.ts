import { planMoves } from "./tab-moves";
import type { TabMove } from "./tab-moves";
import { TAB_GROUP_NONE } from "./types";

// The live strip's realize-layer view: just enough per-tab state (id, pinned,
// group membership) to drive the ORDER phase's block model. Distinct from
// TabLite — the pure layer's shape — because this is browser-boundary-only data.
export interface StripTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

// One realized move against the live window: either a single tab relocated to an
// absolute index (browser.tabs.move) or a whole live group span relocated as a
// unit (browser.tabGroups.move). The executor issues these strictly in order,
// one browser call each.
export type RealizeMove =
  | { kind: "tab"; id: number; index: number }
  | { kind: "group"; groupId: number; index: number };

// Removes `id` from wherever it sits in `sim` and reinserts it at the absolute
// `index`, mirroring the single browser.tabs.move call the executor will issue
// so every later phase reasons about the live strip's CURRENT layout, not a
// stale one.
function simMove(sim: StripTab[], id: number, index: number): void {
  const from = sim.findIndex((tab) => tab.id === id);
  // Callers only sim-move an id that just moved in the live strip, so it is present.
  const tab = sim[from]!;

  sim.splice(from, 1);
  sim.splice(index, 0, tab);
}

// The absolute-index moves that reorder `liveOrder`'s surviving tabs into
// `orderedIds`'s order, ready to be replayed with single-id browser.tabs.move
// calls.
//
// planMoves works in survivor-strip coordinates, but browser.tabs.move takes an
// ABSOLUTE window index. A tab opened between the sort snapshot and the live
// re-query is a non-survivor still sitting in the window, so a raw replay would
// shift survivors by however many such tabs precede each move. Translate each
// survivor-strip index to its absolute slot — the position of the index-th
// surviving tab (or the window end) — against a simulation of the full strip.
// The absolute indices assume the moves land strictly in order, each shifting
// the live strip, so the executor must replay them sequentially.
export function planFlatMoves(liveOrder: number[], orderedIds: number[]): TabMove[] {
  const survivors = new Set(orderedIds.filter((id) => liveOrder.includes(id)));
  const currentOrder = liveOrder.filter((id) => survivors.has(id));
  const targetOrder = orderedIds.filter((id) => survivors.has(id));

  const strip = [...liveOrder];
  const moves: TabMove[] = [];

  for (const { id, index } of planMoves(currentOrder, targetOrder)) {
    strip.splice(strip.indexOf(id), 1);
    const survivorPositions = strip.flatMap((tabId, position) =>
      survivors.has(tabId) ? [position] : [],
    );
    const absoluteIndex =
      index < survivorPositions.length ? survivorPositions[index]! : strip.length;
    strip.splice(absoluteIndex, 0, id);
    moves.push({ id, index: absoluteIndex });
  }

  return moves;
}

type OrderBlock = { id: number } | { groupId: number };

// The block moves that realize `order` against the live `strip`, in three
// phases — (a) pinned region, (b) within-group member order, (c) top-level
// blocks. Simulates each move against an internal copy of the strip so a later
// phase reasons about the layout the executor will have produced, not a stale
// one, and emits one RealizeMove per browser call the executor should issue, in
// order. Callers hand this only the general (grouped) case; a plain reorder is
// routed to planFlatMoves instead.
export function planBlockMoves(strip: StripTab[], order: number[]): RealizeMove[] {
  const sim = [...strip];
  const moves: RealizeMove[] = [];

  const survivorIds = new Set(sim.map((tab) => tab.id));
  const desiredSurvivors = order.filter((id) => survivorIds.has(id));
  const pinnedIds = new Set(sim.filter((tab) => tab.pinned).map((tab) => tab.id));
  const idToGroup = new Map(sim.map((tab) => [tab.id, tab.groupId]));

  // (a) Pinned region: pinned tabs are always the window's contiguous front
  // block, so the region-relative index planMoves returns IS the absolute one.
  const currentPinned = sim.filter((tab) => tab.pinned).map((tab) => tab.id);
  const desiredPinned = desiredSurvivors.filter((id) => pinnedIds.has(id));

  for (const move of planMoves(currentPinned, desiredPinned)) {
    moves.push({ kind: "tab", id: move.id, index: move.index });
    simMove(sim, move.id, move.index);
  }

  // (b) Within each live group, fix member order before relocating the group
  // as a whole in (c) — tabGroups.move carries members along in their current
  // relative order, so getting that order right first means the group only
  // ever needs the one relocating move.
  const reordered = new Set<number>();
  for (const id of desiredSurvivors) {
    const groupId = idToGroup.get(id)!;
    if (groupId === TAB_GROUP_NONE || reordered.has(groupId)) {
      continue;
    }
    reordered.add(groupId);

    const currentMembers = sim.filter((tab) => tab.groupId === groupId).map((tab) => tab.id);
    const desiredMembers = desiredSurvivors.filter(
      (memberId) => idToGroup.get(memberId) === groupId,
    );
    const spanStart = sim.findIndex((tab) => tab.groupId === groupId);

    for (const move of planMoves(currentMembers, desiredMembers)) {
      const absoluteIndex = spanStart + move.index;
      moves.push({ kind: "tab", id: move.id, index: absoluteIndex });
      simMove(sim, move.id, absoluteIndex);
    }
  }

  // (c) Top-level blocks: walk the desired unpinned sequence left to right,
  // relocating each group (as one contiguous span, via tabGroups.move) or
  // ungrouped singleton (via tabs.move) into place. A live tab absent from
  // `order` is never a target, so it just keeps its slot and drifts toward the
  // end as blocks get inserted ahead of it.
  //
  // A live group's members can appear non-contiguously in `desiredSurvivors`
  // (e.g. a plain group-agnostic sort like planWindowOrder interleaves an
  // unrelated id between them) even though Chrome enforces contiguity for
  // every live group. Emit exactly one block per live groupId, at its first
  // member's position — a second sighting is skipped rather than opening a
  // rival block for the same real group, which would otherwise undercount
  // the span and let a later move land inside it.
  const blocks: OrderBlock[] = [];
  const seenGroups = new Set<number>();

  for (const id of desiredSurvivors) {
    if (pinnedIds.has(id)) {
      continue;
    }

    const groupId = idToGroup.get(id)!;
    if (groupId === TAB_GROUP_NONE) {
      blocks.push({ id });
      continue;
    }

    if (seenGroups.has(groupId)) {
      continue;
    }
    seenGroups.add(groupId);
    blocks.push({ groupId });
  }

  let cursor = pinnedIds.size;
  for (const block of blocks) {
    if ("id" in block) {
      // cursor walks sim slot-by-slot as blocks are placed; an id block always
      // addresses an existing slot, so sim[cursor] is defined.
      if (sim[cursor]!.id !== block.id) {
        moves.push({ kind: "tab", id: block.id, index: cursor });
        simMove(sim, block.id, cursor);
      }
      cursor += 1;
      continue;
    }

    // tabGroups.move relocates the group's full live membership — which may
    // include ids `order` never mentions — so the span width comes from the
    // live strip, not from however many of its members `desiredSurvivors`
    // happened to name.
    const spanStart = sim.findIndex((tab) => tab.groupId === block.groupId);
    const spanWidth = sim.filter((tab) => tab.groupId === block.groupId).length;
    if (spanStart !== cursor) {
      moves.push({ kind: "group", groupId: block.groupId, index: cursor });
      const span = sim.splice(spanStart, spanWidth);
      sim.splice(cursor, 0, ...span);
    }
    cursor += spanWidth;
  }

  return moves;
}
