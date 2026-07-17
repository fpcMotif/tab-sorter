import { sortByDomain, sortByTitle } from "./sort";
import type { GroupSpec, SortMode, TabLite, TabPlan } from "./types";

// The single home of the never-interleave construction (CONTEXT.md
// "never-interleave construction"): `[...pinnedOrder, ...unpinnedTail]`.
// Chrome keeps pinned tabs as a contiguous block at the front of the window
// and silently clamps any move that would cross that boundary — no throw, no
// unpin, just a wrong permutation — so every producer (planWindowOrder,
// planTidy, planUndo) designates its own pinned region and unpinned tail, and
// this constructor owns the one splice that concatenates them pinned-first.
// Keeping the splice in one place, rather than re-typed at each producer,
// makes the clamp bug structurally unrepresentable everywhere a TabPlan is
// built. `groups`/`ungroup`/`close` default to empty — most producers only
// ever populate a subset of them.
export function assemblePlan(parts: {
  pinnedOrder: number[];
  unpinnedTail: number[];
  groups?: GroupSpec[];
  ungroup?: number[];
  close?: number[];
}): TabPlan {
  return {
    order: [...parts.pinnedOrder, ...parts.unpinnedTail],
    groups: parts.groups ?? [],
    ungroup: parts.ungroup ?? [],
    close: parts.close ?? [],
  };
}

// `planWindowOrder` is the one pinned-AWARE ordering rule. Chrome keeps pinned
// tabs as a contiguous block at the front of the window and silently clamps any
// move that would cross that boundary, so pinned and unpinned tabs are ordered
// within their own regions and concatenated pinned-first — never interleaved.
// When `ignorePinned` is set the pinned block keeps its current order; otherwise
// pinned tabs are sorted among themselves. Returns the absolute desired order of
// every tab id in the window.
export function planWindowOrder(tabs: TabLite[], mode: SortMode, ignorePinned: boolean): number[] {
  const sortFn = mode === "title" ? sortByTitle : sortByDomain;
  const pinned = tabs.filter((tab) => tab.pinned);
  const unpinned = tabs.filter((tab) => !tab.pinned);
  const pinnedOrder = ignorePinned ? pinned.map((tab) => tab.id) : sortFn(pinned);

  return assemblePlan({ pinnedOrder, unpinnedTail: sortFn(unpinned) }).order;
}
