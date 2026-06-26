import { describe, expect, it } from "vitest";

import { buildPayload } from "./payload.ts";
import type { Rendered, ScopeSelection, TabLite, WindowLite } from "@/lib/copy/types.ts";

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

describe("buildPayload (tab scope)", () => {
  it("produces a tab-discriminated payload carrying the flat entries", () => {
    const selection: ScopeSelection = {
      scope: "tab",
      tabs: [tab({ id: 1, url: "https://a.com/", title: "A" })],
    };

    expect(buildPayload(selection)).toEqual({
      scope: "tab",
      entries: [
        {
          title: "A",
          url: "https://a.com/",
          favIconUrl: undefined,
          domain: "a.com",
          pinned: false,
          index: 0,
          globalSeq: 1,
        },
      ],
    });
  });

  it("attaches the rendered channel when provided", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [tab({ id: 1 })] };
    const rendered: Rendered = { text: "https://example.com/1", html: "<a>...</a>" };

    const payload = buildPayload(selection, rendered);

    expect(payload.rendered).toEqual(rendered);
  });

  it("omits rendered when not provided", () => {
    const selection: ScopeSelection = { scope: "tab", tabs: [tab({ id: 1 })] };

    expect(buildPayload(selection).rendered).toBeUndefined();
  });
});

describe("buildPayload (window scope)", () => {
  it("groups entries by window and also flattens them", () => {
    const windows: WindowLite[] = [
      { id: 10, tabs: [tab({ id: 1, title: "W1T1" }), tab({ id: 2, title: "W1T2" })] },
      { id: 11, tabs: [tab({ id: 3, title: "W2T1" })] },
    ];
    const selection: ScopeSelection = { scope: "window", windows };

    const payload = buildPayload(selection);

    if (payload.scope !== "window") {
      throw new Error("expected window-scoped payload");
    }

    expect(payload.windows).toEqual([
      { windowSeq: 1, entries: [expect.objectContaining({ globalSeq: 1, windowSeq: 1, windowTabSeq: 1 }), expect.objectContaining({ globalSeq: 2, windowSeq: 1, windowTabSeq: 2 })] },
      { windowSeq: 2, entries: [expect.objectContaining({ globalSeq: 3, windowSeq: 2, windowTabSeq: 1 })] },
    ]);
    expect(payload.entries.map((e) => e.globalSeq)).toEqual([1, 2, 3]);
  });

  it("drops empty windows from windows[] and keeps flattened entries empty", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [] }],
    };

    const payload = buildPayload(selection);

    if (payload.scope !== "window") {
      throw new Error("expected window-scoped payload");
    }

    expect(payload.windows).toEqual([]);
    expect(payload.entries).toEqual([]);
  });

  it("attaches the rendered channel for window scope", () => {
    const selection: ScopeSelection = {
      scope: "window",
      windows: [{ id: 10, tabs: [tab({ id: 1 })] }],
    };
    const rendered: Rendered = { text: "Window 1\nhttps://example.com/1" };

    expect(buildPayload(selection, rendered).rendered).toEqual(rendered);
  });
});
