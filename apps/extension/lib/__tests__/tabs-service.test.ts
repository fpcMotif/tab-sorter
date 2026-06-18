import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeBrowser } from "@webext-core/fake-browser";

import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "../tabs-service.ts";
import type { TabLite } from "../types.ts";

function makeChromeTabs(
  items: Array<Partial<chrome.tabs.Tab> & { id: number; url: string; title: string }>,
): chrome.tabs.Tab[] {
  return items.map((item, index) => ({
    id: item.id,
    index: item.index ?? index,
    pinned: item.pinned ?? false,
    url: item.url,
    title: item.title,
    active: item.active ?? false,
    highlighted: item.highlighted ?? false,
    incognito: item.incognito ?? false,
    selected: item.selected ?? false,
    discarded: item.discarded ?? false,
    autoDiscardable: item.autoDiscardable ?? true,
    groupId: item.groupId ?? -1,
    windowId: item.windowId ?? 1,
  })) as chrome.tabs.Tab[];
}

describe("getCurrentWindowTabs", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("maps chrome tabs to TabLite", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(
      makeChromeTabs([
        { id: 10, title: "A", url: "https://a.com", index: 0, pinned: true },
        { id: 20, title: "B", url: "https://b.com", index: 1 },
      ]),
    );

    const tabs = await getCurrentWindowTabs();
    expect(tabs).toEqual<TabLite[]>([
      { id: 10, title: "A", url: "https://a.com", index: 0, pinned: true },
      { id: 20, title: "B", url: "https://b.com", index: 1, pinned: false },
    ]);
  });

  it("skips tabs without id or URL", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([
      { id: 10, title: "A", url: "https://a.com" },
      { title: "No id", url: "https://b.com" },
      { id: 20, title: "No url" },
    ] as chrome.tabs.Tab[]);

    const tabs = await getCurrentWindowTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe(10);
  });
});

describe("applyOrder", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
    vi.spyOn(fakeBrowser.tabs, "move").mockResolvedValue({} as chrome.tabs.Tab);
  });

  it("is a no-op for fewer than two tabs", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(makeChromeTabs([]));
    await applyOrder([1]);
    expect(fakeBrowser.tabs.move).not.toHaveBeenCalled();
  });

  it("moves unpinned tabs after pinned block by default", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(
      makeChromeTabs([
        { id: 1, title: "Pinned", url: "https://p.com", pinned: true, index: 0 },
        { id: 2, title: "A", url: "https://a.com", index: 1 },
        { id: 3, title: "B", url: "https://b.com", index: 2 },
      ]),
    );

    await applyOrder([3, 2]);
    expect(fakeBrowser.tabs.move).toHaveBeenCalledWith(3, { index: 1 });
    expect(fakeBrowser.tabs.move).toHaveBeenCalledWith(2, { index: 2 });
  });

  it("ignores stale ids", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(
      makeChromeTabs([{ id: 2, title: "A", url: "https://a.com", index: 0 }]),
    );

    await applyOrder([2, 99]);
    expect(fakeBrowser.tabs.move).toHaveBeenCalledTimes(1);
  });

  it("continues after move errors", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(
      makeChromeTabs([
        { id: 1, title: "A", url: "https://a.com", index: 0 },
        { id: 2, title: "B", url: "https://b.com", index: 1 },
      ]),
    );
    vi.spyOn(fakeBrowser.tabs, "move").mockRejectedValueOnce(new Error("Tab closed"));

    await applyOrder([1, 2]);
    expect(fakeBrowser.tabs.move).toHaveBeenCalledTimes(2);
  });
});

describe("moveTabsToNewWindow", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
    vi.spyOn(fakeBrowser.tabs, "move").mockResolvedValue({} as never);
    vi.spyOn(fakeBrowser.windows, "create").mockResolvedValue({ id: 1 } as never);
    vi.spyOn(fakeBrowser.windows, "update").mockResolvedValue({} as never);
  });

  it("is a no-op for empty ids", async () => {
    await moveTabsToNewWindow([]);
    expect(fakeBrowser.windows.create).not.toHaveBeenCalled();
  });

  it("creates a window with the first tab and moves the rest", async () => {
    vi.spyOn(fakeBrowser.windows, "create").mockResolvedValue({
      id: 100,
      tabs: [{ id: 10 }],
    } as never);

    await moveTabsToNewWindow([10, 20, 30]);
    expect(fakeBrowser.windows.create).toHaveBeenCalledWith({ tabId: 10 });
    expect(fakeBrowser.tabs.move).toHaveBeenCalledWith([20, 30], {
      windowId: 100,
      index: -1,
    });
    expect(fakeBrowser.windows.update).toHaveBeenCalledWith(100, { focused: true });
  });

  it("throws when window creation fails", async () => {
    vi.spyOn(fakeBrowser.windows, "create").mockResolvedValue({
      id: undefined,
    } as never);
    await expect(moveTabsToNewWindow([10])).rejects.toThrow("Failed to create new window");
  });
});
