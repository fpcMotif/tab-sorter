import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentWindow,
  getCurrentWindowId,
  getCurrentWindowTabs,
  getHighlightedTabs,
  moveTabsToNewWindow,
  openOptionsPage,
  reopenTabs,
  snapshotWindow,
} from "./tabs-service";

const query = vi.fn();
const move = vi.fn();
const create = vi.fn();

describe("tabs service", () => {
  beforeEach(() => {
    query.mockReset();
    move.mockReset();
    create.mockReset();
    vi.stubGlobal("browser", {
      tabs: { query, move },
      windows: { create },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries current-window tabs and drops tabs without ids", async () => {
    query.mockResolvedValue([
      { id: 1, url: "https://example.com", title: "Example", index: 0, pinned: true },
      { url: "https://missing-id.test", title: "Missing", index: 1, pinned: false },
    ]);

    await expect(getCurrentWindowTabs()).resolves.toEqual([
      { id: 1, url: "https://example.com", title: "Example", index: 0, pinned: true, groupId: -1 },
    ]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true });
  });

  it("queries only the highlighted tabs in the current window", async () => {
    query.mockResolvedValue([
      { id: 4, url: "https://a.test", title: "A", index: 2, pinned: false },
      { url: "https://no-id.test", title: "No id", index: 3, pinned: false },
    ]);

    await expect(getHighlightedTabs()).resolves.toEqual([
      { id: 4, url: "https://a.test", title: "A", index: 2, pinned: false, groupId: -1 },
    ]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true, highlighted: true });
  });

  it("fills defaults for tabs missing optional fields", async () => {
    query.mockResolvedValue([{ id: 5 }, { id: 6, url: "https://u.test" }]);

    await expect(getCurrentWindowTabs()).resolves.toEqual([
      { id: 5, url: "", title: "", index: 0, pinned: false, groupId: -1 },
      {
        id: 6,
        url: "https://u.test",
        title: "https://u.test",
        index: 0,
        pinned: false,
        groupId: -1,
      },
    ]);
  });

  it("creates a new focused window and moves remaining tabs one at a time", async () => {
    create.mockResolvedValue({ id: 42 });

    await moveTabsToNewWindow([1, 2, 3]);

    // Single-id calls, in order — never the batch/array form (its off-by-one
    // would scramble the destination order).
    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).toHaveBeenCalledTimes(2);
    expect(move).toHaveBeenNthCalledWith(1, 2, { windowId: 42, index: -1 });
    expect(move).toHaveBeenNthCalledWith(2, 3, { windowId: 42, index: -1 });
  });

  it("creates a window for a single extracted tab and ignores empty input", async () => {
    create.mockResolvedValue({ id: 42 });

    await moveTabsToNewWindow([1]);
    await moveTabsToNewWindow([]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).not.toHaveBeenCalled();
  });

  it("issues no moves when the created window has no usable id", async () => {
    create.mockResolvedValue({});

    await moveTabsToNewWindow([1, 2, 3]);

    expect(move).not.toHaveBeenCalled();
  });
});

describe("getCurrentWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves windowId and tabs from a single populated query", async () => {
    const getCurrent = vi.fn().mockResolvedValue({
      id: 4,
      tabs: [
        { id: 1, url: "https://a.test", title: "A", index: 0, pinned: true },
        { url: "https://no-id.test", title: "No id", index: 1, pinned: false },
      ],
    });
    vi.stubGlobal("browser", { windows: { getCurrent } });

    await expect(getCurrentWindow()).resolves.toEqual({
      windowId: 4,
      tabs: [{ id: 1, url: "https://a.test", title: "A", index: 0, pinned: true, groupId: -1 }],
    });
    expect(getCurrent).toHaveBeenCalledWith({ populate: true });
  });

  it("returns an empty tabs list when the window has none populated", async () => {
    vi.stubGlobal("browser", { windows: { getCurrent: vi.fn().mockResolvedValue({ id: 5 }) } });

    await expect(getCurrentWindow()).resolves.toEqual({ windowId: 5, tabs: [] });
  });

  it("throws when the current window has no id", async () => {
    vi.stubGlobal("browser", { windows: { getCurrent: vi.fn().mockResolvedValue({ tabs: [] }) } });

    await expect(getCurrentWindow()).rejects.toThrow("current window has no id");
  });
});

describe("getCurrentWindowId, snapshotWindow, reopenTabs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the current window's id", async () => {
    vi.stubGlobal("browser", { windows: { getCurrent: vi.fn().mockResolvedValue({ id: 9 }) } });

    await expect(getCurrentWindowId()).resolves.toBe(9);
  });

  it("throws when the current window has no id", async () => {
    vi.stubGlobal("browser", { windows: { getCurrent: vi.fn().mockResolvedValue({}) } });

    await expect(getCurrentWindowId()).rejects.toThrow("current window has no id");
  });

  it("round-trips a window snapshot: tabs sorted by index, defaulted groupId, title-fallback groups", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      { id: 2, url: "https://b.test", index: 1, pinned: false, groupId: 5 },
      { id: 1, url: "https://a.test", index: 0, pinned: true },
    ]);
    const tabGroupsQuery = vi.fn().mockResolvedValue([
      { id: 5, title: "Named", color: "blue", collapsed: false },
      { id: 6, color: "red", collapsed: true },
    ]);
    // No windows.getCurrent stub: snapshotWindow takes windowId explicitly and
    // must not resolve "current" itself.
    vi.stubGlobal("browser", {
      tabs: { query: snapshotQuery },
      tabGroups: { query: tabGroupsQuery },
    });

    const snapshot = await snapshotWindow(3);

    expect(snapshot.windowId).toBe(3);
    expect(snapshot.tabs).toEqual([
      { id: 1, url: "https://a.test", index: 0, pinned: true, groupId: -1 },
      { id: 2, url: "https://b.test", index: 1, pinned: false, groupId: 5 },
    ]);
    expect(snapshot.groups).toEqual([
      { groupId: 5, title: "Named", color: "blue", collapsed: false },
      { groupId: 6, title: "", color: "red", collapsed: true },
    ]);
    expect(snapshotQuery).toHaveBeenCalledWith({ windowId: 3 });
    expect(tabGroupsQuery).toHaveBeenCalledWith({ windowId: 3 });
    expect(typeof snapshot.savedAt).toBe("number");
  });

  it("reopens tabs sequentially and returns the count", async () => {
    const reopenCreate = vi.fn().mockResolvedValue({ id: 1 });
    vi.stubGlobal("browser", { tabs: { create: reopenCreate } });

    await expect(reopenTabs(["https://a.test", "https://b.test"])).resolves.toBe(2);

    expect(reopenCreate).toHaveBeenCalledTimes(2);
    expect(reopenCreate).toHaveBeenNthCalledWith(1, { url: "https://a.test", active: false });
    expect(reopenCreate).toHaveBeenNthCalledWith(2, { url: "https://b.test", active: false });
  });
});

describe("openOptionsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delegates to browser.runtime.openOptionsPage", async () => {
    const openOptions = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", { runtime: { openOptionsPage: openOptions } });

    await expect(openOptionsPage()).resolves.toBeUndefined();
    expect(openOptions).toHaveBeenCalledTimes(1);
  });
});
