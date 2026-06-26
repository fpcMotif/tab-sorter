import { describe, expect, it } from "vitest";

import { buildEntries } from "./entries.ts";
import type { ScopeSelection, TabLite, WindowLite } from "@/lib/copy/types.ts";

function tab(over: Partial<TabLite> & { id: number }): TabLite {
  return {
    id: over.id,
    url: over.url ?? `https://example.com/${over.id}`,
    title: over.title ?? `Tab ${over.id}`,
    index: over.index ?? 0,
    pinned: over.pinned ?? false,
    favIconUrl: over.favIconUrl,
    highlighted: over.highlighted,
  };
}

describe("buildEntries (tab scope)", () => {
  it("maps each tab to a record with a continuous 1-based globalSeq and no window seqs", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [
        tab({ id: 1, url: "https://docs.example.com/a", title: "Alpha", index: 0, pinned: true }),
        tab({ id: 2, url: "https://github.com/x", title: "Beta", index: 1 }),
      ],
    };

    expect(buildEntries(selection)).toEqual([
      {
        title: "Alpha",
        url: "https://docs.example.com/a",
        favIconUrl: undefined,
        domain: "docs.example.com",
        pinned: true,
        index: 0,
        globalSeq: 1,
      },
      {
        title: "Beta",
        url: "https://github.com/x",
        favIconUrl: undefined,
        domain: "github.com",
        pinned: false,
        index: 1,
        globalSeq: 2,
      },
    ]);
  });

  it("preserves favIconUrl and derives domain via getDomain for special schemes", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [
        tab({ id: 1, url: "chrome://settings", title: "Settings", favIconUrl: "https://i/c.png" }),
      ],
    };

    const [entry] = buildEntries(selection);

    expect(entry?.favIconUrl).toBe("https://i/c.png");
    expect(entry?.domain).toBe("(chrome)");
  });

  it("returns an empty array for an empty tab selection", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [] };

    expect(buildEntries(selection)).toEqual([]);
  });
});

describe("buildEntries (window scope)", () => {
  it("continues globalSeq across windows and resets windowTabSeq per window", () => {
    const windows: WindowLite[] = [
      {
        id: 10,
        tabs: [tab({ id: 1, title: "W1T1", index: 0 }), tab({ id: 2, title: "W1T2", index: 1 })],
      },
      { id: 11, tabs: [tab({ id: 3, title: "W2T1", index: 0 })] },
    ];
    const selection: ScopeSelection = { scope: "window", windows };

    expect(buildEntries(selection)).toEqual([
      {
        title: "W1T1",
        url: "https://example.com/1",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 0,
        windowSeq: 1,
        windowTabSeq: 1,
        globalSeq: 1,
      },
      {
        title: "W1T2",
        url: "https://example.com/2",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 1,
        windowSeq: 1,
        windowTabSeq: 2,
        globalSeq: 2,
      },
      {
        title: "W2T1",
        url: "https://example.com/3",
        favIconUrl: undefined,
        domain: "example.com",
        pinned: false,
        index: 0,
        windowSeq: 2,
        windowTabSeq: 1,
        globalSeq: 3,
      },
    ]);
  });

  it("returns an empty array when all windows are empty", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [] }],
    };

    expect(buildEntries(selection)).toEqual([]);
  });
});
