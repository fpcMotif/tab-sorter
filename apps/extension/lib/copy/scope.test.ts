import { describe, expect, it } from "vitest";

import { selectScope } from "./scope.ts";
import type { ScopeSnapshot, TabLite, WindowLite } from "./types.ts";

function tab(partial: Partial<TabLite> & { id: number }): TabLite {
  return {
    url: `https://example.com/${partial.id}`,
    title: `Tab ${partial.id}`,
    index: 0,
    pinned: false,
    ...partial,
  };
}

// Window 1 (current): t1 highlighted+pinned, t2 highlighted, t3 plain, t4 pinned, t5 no-url.
// Window 2: t6 plain, t7 pinned, t8 no-url.
const t1 = tab({ id: 1, index: 0, pinned: true, highlighted: true });
const t2 = tab({ id: 2, index: 1, highlighted: true });
const t3 = tab({ id: 3, index: 2 });
const t4 = tab({ id: 4, index: 3, pinned: true });
const t5 = tab({ id: 5, index: 4, url: "" });
const t6 = tab({ id: 6, index: 0 });
const t7 = tab({ id: 7, index: 1, pinned: true });
const t8 = tab({ id: 8, index: 2, url: "" });

const window1: WindowLite = { id: 10, tabs: [t1, t2, t3, t4, t5] };
const window2: WindowLite = { id: 20, tabs: [t6, t7, t8] };

const snapshot: ScopeSnapshot = {
  windows: [window1, window2],
  currentWindowId: 10,
  highlightedTabIds: [1, 2],
};

describe("selectScope highlighted-tabs", () => {
  it("returns highlighted url-truthy tabs and is pinned-immune (ignores includePinned)", () => {
    // Donor: highlighted filter applied to unfiltered (url-only) current-window tabs.
    const excluded = selectScope(snapshot, "highlighted-tabs", false);
    const included = selectScope(snapshot, "highlighted-tabs", true);
    expect(excluded).toEqual({ scope: "tab", tabs: [t1, t2] });
    expect(included).toEqual({ scope: "tab", tabs: [t1, t2] });
  });

  it("drops highlighted tabs that have no url", () => {
    const snap: ScopeSnapshot = {
      windows: [{ id: 10, tabs: [t2, t5] }],
      currentWindowId: 10,
      highlightedTabIds: [2, 5],
    };
    expect(selectScope(snap, "highlighted-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t2],
    });
  });
});

describe("selectScope window-tabs", () => {
  it("includes pinned when includePinned is true (url-truthy current window)", () => {
    expect(selectScope(snapshot, "window-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t1, t2, t3, t4],
    });
  });

  it("drops pinned when includePinned is false", () => {
    expect(selectScope(snapshot, "window-tabs", false)).toEqual({
      scope: "tab",
      tabs: [t2, t3],
    });
  });
});

describe("selectScope all-tabs", () => {
  it("flattens url-truthy tabs across all windows with pinned filter", () => {
    expect(selectScope(snapshot, "all-tabs", false)).toEqual({
      scope: "tab",
      tabs: [t2, t3, t6],
    });
    expect(selectScope(snapshot, "all-tabs", true)).toEqual({
      scope: "tab",
      tabs: [t1, t2, t3, t4, t6, t7],
    });
  });
});

describe("selectScope all-windows-and-tabs", () => {
  it("keeps grouping, applies per-tab filter, and drops empty windows", () => {
    expect(selectScope(snapshot, "all-windows-and-tabs", true)).toEqual({
      scope: "window",
      windows: [
        { id: 10, tabs: [t1, t2, t3, t4] },
        { id: 20, tabs: [t6, t7] },
      ],
    });
  });

  it("drops a window whose tabs are all filtered out", () => {
    const snap: ScopeSnapshot = {
      windows: [
        { id: 10, tabs: [t3] },
        { id: 20, tabs: [t7] }, // only a pinned tab
      ],
      currentWindowId: 10,
      highlightedTabIds: [],
    };
    // includePinned false → window 20 becomes empty → dropped.
    expect(selectScope(snap, "all-windows-and-tabs", false)).toEqual({
      scope: "window",
      windows: [{ id: 10, tabs: [t3] }],
    });
  });
});
