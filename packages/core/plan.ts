import { sortByDomain, sortByTitle } from "./sort";
import type { SortMode, TabLite } from "./types";

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

  return [...pinnedOrder, ...sortFn(unpinned)];
}
