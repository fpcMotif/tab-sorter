import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCopyPopupData, runCopy } from "@/lib/orchestration.ts";
import type { CopyPayload, ScopeSnapshot } from "@/lib/copy/types.ts";
import type { Sink } from "@/lib/sinks/sink.ts";

const mocks = vi.hoisted(() => ({
  getScopeSnapshot: vi.fn(),
  selectScope: vi.fn(),
  resolveConfiguredFormat: vi.fn(),
  render: vi.fn(),
  buildPayload: vi.fn(),
}));

vi.mock("@/lib/tabs-service.ts", () => ({
  getScopeSnapshot: mocks.getScopeSnapshot,
  // keep the sort-feature exports so the existing orchestration tests still pass
  getCurrentWindowTabs: vi.fn(),
  applyOrder: vi.fn(),
  moveTabsToNewWindow: vi.fn(),
}));

vi.mock("@/lib/copy/scope.ts", () => ({
  selectScope: mocks.selectScope,
  SCOPES: [
    { id: "highlighted-tabs", label: "Highlighted" },
    { id: "window-tabs", label: "This window" },
    { id: "all-tabs", label: "All tabs" },
    { id: "all-windows-and-tabs", label: "All windows" },
  ],
  SCOPE_LABELS: {
    "highlighted-tabs": "Highlighted",
    "window-tabs": "This window",
    "all-tabs": "All tabs",
    "all-windows-and-tabs": "All windows",
  },
}));

vi.mock("@/lib/copy/configured-format.ts", () => ({
  resolveConfiguredFormat: mocks.resolveConfiguredFormat,
}));

vi.mock("@/lib/copy/render.ts", () => ({
  render: mocks.render,
}));

vi.mock("@/lib/copy/payload.ts", () => ({
  buildPayload: mocks.buildPayload,
}));

vi.mock("@/lib/copy/format.ts", () => ({
  getFormat: (id: string) => ({ id, label: () => id.charAt(0).toUpperCase() + id.slice(1) }),
  BUILTIN_FORMATS: [
    { id: "link", label: () => "Link", description: () => "HTML anchor tag" },
    { id: "url", label: () => "URL" },
    { id: "title", label: () => "Title" },
  ],
}));

const snapshot: ScopeSnapshot = {
  windows: [
    {
      id: 1,
      tabs: [
        { id: 10, url: "https://a.example/", title: "A", index: 0, pinned: true },
        { id: 11, url: "https://b.example/", title: "B", index: 1, pinned: false },
      ],
    },
  ],
  currentWindowId: 1,
  highlightedTabIds: [11],
};

describe("runCopy", () => {
  beforeEach(() => {
    mocks.getScopeSnapshot.mockReset();
    mocks.selectScope.mockReset();
    mocks.resolveConfiguredFormat.mockReset();
    mocks.render.mockReset();
    mocks.buildPayload.mockReset();

    mocks.getScopeSnapshot.mockResolvedValue(snapshot);
    mocks.selectScope.mockReturnValue({
      scope: "tab",
      tabs: snapshot.windows[0]!.tabs,
    });
    mocks.resolveConfiguredFormat.mockReturnValue({
      id: "link",
      label: "Link",
      transforms: { text: { tab: () => "" } },
    });
    mocks.render.mockReturnValue({ text: "rendered-text" });
    mocks.buildPayload.mockImplementation(
      (_selection: unknown, rendered: unknown): CopyPayload => ({
        scope: "tab",
        entries: [
          { title: "A", url: "https://a.example/", globalSeq: 1 },
          { title: "B", url: "https://b.example/", globalSeq: 2 },
        ],
        rendered: rendered as { text: string },
      }),
    );
  });

  it("drives snapshot → selectScope(includePinned=true) → render → buildPayload → sink and returns the entry count", async () => {
    const consumed: CopyPayload[] = [];
    const sink: Sink = {
      consume: vi.fn(async (payload: CopyPayload) => {
        consumed.push(payload);
      }),
    };

    const result = await runCopy("all-tabs", "link", sink);

    // includePinned defaults to true (DEVIATION #2): pinned tabs must NOT be filtered out
    expect(mocks.selectScope).toHaveBeenCalledWith(snapshot, "all-tabs", true);
    // resolveConfiguredFormat receives the Format object + undefined storedOpts + getFormat
    expect(mocks.resolveConfiguredFormat).toHaveBeenCalledTimes(1);
    expect(mocks.render).toHaveBeenCalledWith(
      { scope: "tab", tabs: snapshot.windows[0]!.tabs },
      { id: "link", label: "Link", transforms: { text: { tab: expect.any(Function) } } },
    );
    expect(mocks.buildPayload).toHaveBeenCalledWith(
      { scope: "tab", tabs: snapshot.windows[0]!.tabs },
      { text: "rendered-text" },
    );
    expect(sink.consume).toHaveBeenCalledTimes(1);
    expect(consumed[0]).toMatchObject({ scope: "tab" });
    // count = flattened entries from the returned payload
    expect(result).toEqual({ count: 2 });
  });

  it("counts flattened entries for a window-scoped payload", async () => {
    mocks.selectScope.mockReturnValue({ scope: "window", windows: snapshot.windows });
    mocks.buildPayload.mockReturnValue({
      scope: "window",
      windows: [
        {
          windowSeq: 1,
          entries: [{ title: "A", url: "https://a.example/", globalSeq: 1 }],
        },
      ],
      entries: [{ title: "A", url: "https://a.example/", globalSeq: 1 }],
      rendered: { text: "rendered-text" },
    });

    const sink: Sink = { consume: vi.fn(async () => {}) };

    const result = await runCopy("all-windows-and-tabs", "link", sink);

    // count uses the flat `entries` array regardless of scope
    expect(result).toEqual({ count: 1 });
  });
});

describe("getCopyPopupData", () => {
  beforeEach(() => {
    mocks.getScopeSnapshot.mockReset();
    mocks.selectScope.mockReset();
    mocks.getScopeSnapshot.mockResolvedValue(snapshot);

    // selectScope is called once per scope (×4) to compute live counts.
    // includePinned is always true (DEVIATION #2).
    mocks.selectScope.mockImplementation((_snapshot: unknown, scopeId: string) => {
      if (scopeId === "highlighted-tabs") {
        // only 1 highlighted tab (t11)
        return { scope: "tab", tabs: [snapshot.windows[0]!.tabs[1]!] };
      }
      if (scopeId === "window-tabs") {
        // both tabs in the current window (pinned included)
        return { scope: "tab", tabs: snapshot.windows[0]!.tabs };
      }
      if (scopeId === "all-tabs") {
        // both tabs across all windows
        return { scope: "tab", tabs: snapshot.windows[0]!.tabs };
      }
      // all-windows-and-tabs → window scope
      return { scope: "window", windows: snapshot.windows };
    });
  });

  it("returns 4 scopes with live tab counts (pinned counted, DEVIATION #2)", async () => {
    const data = await getCopyPopupData();

    expect(data.scopes).toEqual([
      { id: "highlighted-tabs", label: "Highlighted", count: 1 },
      { id: "window-tabs", label: "This window", count: 2 },
      { id: "all-tabs", label: "All tabs", count: 2 },
      // all-windows-and-tabs: window scope → sum of tabs.length across windows = 2
      { id: "all-windows-and-tabs", label: "All windows", count: 2 },
    ]);

    // selectScope called exactly once per scope
    expect(mocks.selectScope).toHaveBeenCalledTimes(4);
    // each call uses includePinned=true
    for (const call of mocks.selectScope.mock.calls) {
      expect(call[2]).toBe(true);
    }
  });

  it("returns builtin formats with label, optional description, and isDefault flag", async () => {
    const data = await getCopyPopupData();

    expect(data.formats).toEqual([
      { id: "link", label: "Link", description: "HTML anchor tag", isDefault: true },
      { id: "url", label: "URL", description: undefined, isDefault: false },
      { id: "title", label: "Title", description: undefined, isDefault: false },
    ]);
  });

  it("sets defaultFormatId to the first builtin (link)", async () => {
    const data = await getCopyPopupData();
    expect(data.defaultFormatId).toBe("link");
  });
});
