import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeBrowser } from "@webext-core/fake-browser";

import { runExtract, runSort } from "../orchestration.ts";
import type { TabLite } from "../types.ts";

function makeTabs(
  items: Array<Partial<TabLite> & { id: number; title: string; url: string }>,
): TabLite[] {
  return items.map((item, index) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    index: item.index ?? index,
    pinned: item.pinned ?? false,
  }));
}

describe("runSort", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("no-ops when fewer than two unpinned tabs", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "A", url: "https://a.com", pinned: false, index: 0 },
      ] as chrome.tabs.Tab[],
    );

    const result = await runSort("title");
    expect(result.count).toBe(0);
    expect(fakeBrowser.tabs.move).not.toHaveBeenCalled();
  });

  it("sorts unpinned tabs by title", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "Z", url: "https://z.com", pinned: false, index: 0 },
        { id: 2, title: "A", url: "https://a.com", pinned: false, index: 1 },
      ] as chrome.tabs.Tab[],
    );

    const result = await runSort("title");
    expect(result.count).toBe(2);
    expect(fakeBrowser.tabs.move).toHaveBeenCalledWith(2, { index: 0 });
  });

  it("keeps pinned tabs fixed at the front", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "Pinned", url: "https://p.com", pinned: true, index: 0 },
        { id: 2, title: "Z", url: "https://z.com", pinned: false, index: 1 },
        { id: 3, title: "A", url: "https://a.com", pinned: false, index: 2 },
      ] as chrome.tabs.Tab[],
    );

    await runSort("title");
    expect(fakeBrowser.tabs.move).toHaveBeenCalledWith(3, { index: 1 });
  });
});

describe("runExtract", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("returns zero count when no tabs match", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "A", url: "https://a.com", pinned: false, index: 0 },
      ] as chrome.tabs.Tab[],
    );

    const result = await runExtract({ type: "domain", domain: "b.com" });
    expect(result.count).toBe(0);
    expect(fakeBrowser.windows.create).not.toHaveBeenCalled();
  });

  it("moves matching tabs to a new window", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "GitHub", url: "https://github.com/a", pinned: false, index: 0 },
        { id: 2, title: "Example", url: "https://example.com", pinned: false, index: 1 },
      ] as chrome.tabs.Tab[],
    );
    fakeBrowser.windows.create.mockImplementation(async ({ tabId }) => ({
      id: 99,
      tabs: [{ id: tabId }],
    }));

    const result = await runExtract({ type: "domain", domain: "github.com" });
    expect(result.count).toBe(1);
    expect(fakeBrowser.windows.create).toHaveBeenCalledWith({ tabId: 1 });
  });

  it("skips pinned tabs when ignorePinned is true", async () => {
    fakeBrowser.storage.sync.set({
      prefs: { defaultSort: "title", ignorePinned: true, regexPresets: [] },
    });
    fakeBrowser.tabs.query.mockImplementation(async () =>
      [
        { id: 1, title: "GitHub", url: "https://github.com/a", pinned: true, index: 0 },
      ] as chrome.tabs.Tab[],
    );

    const result = await runExtract({ type: "domain", domain: "github.com" });
    expect(result.count).toBe(0);
  });
});
