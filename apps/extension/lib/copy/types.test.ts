import { describe, expect, it } from "vitest";

import {
  SCOPE_IDS,
  isTabScopeId,
  type CopyPayload,
  type Rendered,
  type ScopeId,
  type ScopeSelection,
  type ScopeSnapshot,
  type TabLite,
  type TabRecord,
  type WindowLite,
} from "./types.ts";

describe("copy scope ids", () => {
  it("lists the four canonical scope ids in order", () => {
    expect(SCOPE_IDS).toEqual([
      "highlighted-tabs",
      "window-tabs",
      "all-tabs",
      "all-windows-and-tabs",
    ]);
  });

  it("treats every scope except all-windows-and-tabs as a tab scope", () => {
    // isTabScopeId === (id !== 'all-windows-and-tabs')
    expect(isTabScopeId("highlighted-tabs")).toBe(true);
    expect(isTabScopeId("window-tabs")).toBe(true);
    expect(isTabScopeId("all-tabs")).toBe(true);
    expect(isTabScopeId("all-windows-and-tabs")).toBe(false);
  });

  it("narrows a ScopeId via the guard", () => {
    const id: ScopeId = "window-tabs";
    if (isTabScopeId(id)) {
      // exclusion of the window scope is the whole point of the guard
      const narrowed: Exclude<ScopeId, "all-windows-and-tabs"> = id;
      expect(narrowed).toBe("window-tabs");
    } else {
      throw new Error("window-tabs must be a tab scope");
    }
  });
});

describe("copy data contracts", () => {
  it("accepts a minimal TabLite and its optional fields", () => {
    const minimal: TabLite = {
      id: 1,
      url: "https://example.com",
      title: "Example",
      index: 0,
      pinned: false,
    };
    const full: TabLite = {
      ...minimal,
      favIconUrl: "https://example.com/favicon.ico",
      highlighted: true,
    };

    expect(minimal.favIconUrl).toBeUndefined();
    expect(full.highlighted).toBe(true);
  });

  it("builds a ScopeSnapshot of windows with tabs", () => {
    const tab: TabLite = { id: 7, url: "https://a.test", title: "A", index: 0, pinned: false };
    const window: WindowLite = { id: 10, tabs: [tab] };
    const snapshot: ScopeSnapshot = {
      windows: [window],
      currentWindowId: 10,
      highlightedTabIds: [7],
    };

    expect(snapshot.windows[0]!.tabs[0]!.id).toBe(7);
    expect(snapshot.currentWindowId).toBe(10);
    expect(snapshot.highlightedTabIds).toEqual([7]);
  });

  it("discriminates ScopeSelection by scope", () => {
    const tab: TabLite = { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false };
    const tabSel: ScopeSelection = { scope: "tab", tabs: [tab] };
    const windowSel: ScopeSelection = { scope: "window", windows: [{ id: 2, tabs: [tab] }] };

    expect(tabSel.scope === "tab" && tabSel.tabs.length).toBe(1);
    expect(windowSel.scope === "window" && windowSel.windows.length).toBe(1);
  });

  it("models a TabRecord with engine-computed sequence fields", () => {
    const record: TabRecord = {
      title: "A",
      url: "https://a.test",
      favIconUrl: "https://a.test/favicon.ico",
      domain: "a.test",
      pinned: false,
      index: 0,
      windowSeq: 1,
      windowTabSeq: 1,
      globalSeq: 1,
    };

    expect(record.globalSeq).toBe(1);
  });

  it("carries text always and html optionally in Rendered", () => {
    const textOnly: Rendered = { text: "https://a.test" };
    const withHtml: Rendered = { text: "https://a.test", html: "<a href=\"https://a.test\">A</a>" };

    expect(textOnly.html).toBeUndefined();
    expect(withHtml.html).toContain("<a");
  });

  it("discriminates CopyPayload by scope and exposes flattened entries for window payloads", () => {
    const record: TabRecord = { title: "A", url: "https://a.test", globalSeq: 1 };
    const tabPayload: CopyPayload = {
      scope: "tab",
      entries: [record],
      rendered: { text: "https://a.test" },
    };
    const windowPayload: CopyPayload = {
      scope: "window",
      windows: [{ windowSeq: 1, entries: [record] }],
      entries: [record],
    };

    expect(tabPayload.scope === "tab" && tabPayload.entries.length).toBe(1);
    expect(windowPayload.scope === "window" && windowPayload.windows[0]!.windowSeq).toBe(1);
    expect(windowPayload.scope === "window" && windowPayload.entries.length).toBe(1);
  });
});
