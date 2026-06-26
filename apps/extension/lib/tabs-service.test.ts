import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyOrder,
  getCurrentWindowTabs,
  getScopeSnapshot,
  moveTabsToNewWindow,
} from "./tabs-service.ts";

const query = vi.fn();
const move = vi.fn();
const create = vi.fn();
const getWindowsAll = vi.fn();
const getCurrentWindow = vi.fn();

describe("tabs service", () => {
  beforeEach(() => {
    query.mockReset();
    move.mockReset();
    create.mockReset();
    getWindowsAll.mockReset();
    getCurrentWindow.mockReset();
    vi.stubGlobal("browser", {
      tabs: { query, move },
      windows: { create, getAll: getWindowsAll, getCurrent: getCurrentWindow },
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
      { id: 1, url: "https://example.com", title: "Example", index: 0, pinned: true },
    ]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true });
  });

  it("re-queries before applying order and skips stale ids", async () => {
    query.mockResolvedValue([{ id: 3 }, { id: 1 }]);

    await applyOrder([3, 2, 1]);

    expect(move).toHaveBeenNthCalledWith(1, 3, { index: 0 });
    expect(move).toHaveBeenNthCalledWith(2, 1, { index: 1 });
    expect(move).toHaveBeenCalledTimes(2);
  });

  it("does not move empty or single-id order lists", async () => {
    await applyOrder([]);
    await applyOrder([1]);

    expect(query).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("creates a new focused window and moves remaining tabs", async () => {
    create.mockResolvedValue({ id: 42 });

    await moveTabsToNewWindow([1, 2, 3]);

    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).toHaveBeenCalledWith([2, 3], { windowId: 42, index: -1 });
  });

  it("creates a window for a single extracted tab and ignores empty input", async () => {
    create.mockResolvedValue({ id: 42 });

    await moveTabsToNewWindow([1]);
    await moveTabsToNewWindow([]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).not.toHaveBeenCalled();
  });

  describe("getScopeSnapshot", () => {
    it("maps windows.getAll into WindowLite[] with favIconUrl and highlighted", async () => {
      // windows.getAll({ populate: true }) mirrors donor getWindowsAndTabs
      getWindowsAll.mockResolvedValue([
        {
          id: 10,
          tabs: [
            {
              id: 1,
              url: "https://a.test",
              title: "A",
              index: 0,
              pinned: true,
              favIconUrl: "https://a.test/favicon.ico",
              highlighted: false,
            },
            {
              id: 2,
              url: "https://b.test",
              title: "B",
              index: 1,
              pinned: false,
              highlighted: true,
            },
          ],
        },
        {
          id: 20,
          tabs: [{ id: 3, url: "https://c.test", title: "C", index: 0, pinned: false }],
        },
      ]);
      // tabs.query({ highlighted: true, currentWindow: true }) -> donor highlighted branch
      query.mockResolvedValue([{ id: 2 }]);
      // windows.getCurrent() -> the focused window (source of currentWindowId)
      getCurrentWindow.mockResolvedValue({ id: 10 });

      const snapshot = await getScopeSnapshot();

      expect(getWindowsAll).toHaveBeenCalledWith({ populate: true });
      expect(query).toHaveBeenCalledWith({ highlighted: true, currentWindow: true });
      expect(getCurrentWindow).toHaveBeenCalled();
      expect(snapshot).toEqual({
        windows: [
          {
            id: 10,
            tabs: [
              {
                id: 1,
                url: "https://a.test",
                title: "A",
                index: 0,
                pinned: true,
                favIconUrl: "https://a.test/favicon.ico",
                highlighted: false,
              },
              {
                id: 2,
                url: "https://b.test",
                title: "B",
                index: 1,
                pinned: false,
                highlighted: true,
              },
            ],
          },
          {
            id: 20,
            tabs: [
              {
                id: 3,
                url: "https://c.test",
                title: "C",
                index: 0,
                pinned: false,
                highlighted: false,
              },
            ],
          },
        ],
        currentWindowId: 10,
        highlightedTabIds: [2],
      });
    });

    it("drops tabs without ids and windows without ids", async () => {
      getWindowsAll.mockResolvedValue([
        {
          id: 10,
          tabs: [
            { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false },
            { url: "https://no-id.test", title: "No id", index: 1, pinned: false },
          ],
        },
        { tabs: [{ id: 9, url: "https://x.test", title: "X", index: 0, pinned: false }] },
      ]);
      query.mockResolvedValue([]);
      getCurrentWindow.mockResolvedValue({ id: 10 });

      const snapshot = await getScopeSnapshot();

      expect(snapshot.windows).toEqual([
        {
          id: 10,
          tabs: [
            {
              id: 1,
              url: "https://a.test",
              title: "A",
              index: 0,
              pinned: false,
              highlighted: false,
            },
          ],
        },
      ]);
      expect(snapshot.highlightedTabIds).toEqual([]);
    });

    it("takes currentWindowId from windows.getCurrent, not the getAll order", async () => {
      // getAll returns window 10 first, but the focused window is 20 — currentWindowId
      // must follow windows.getCurrent(), not the array order.
      getWindowsAll.mockResolvedValue([
        { id: 10, tabs: [{ id: 1, url: "https://a.test", title: "A", index: 0, pinned: false }] },
        { id: 20, tabs: [{ id: 2, url: "https://b.test", title: "B", index: 0, pinned: false }] },
      ]);
      query.mockResolvedValue([{ id: 2 }]);
      getCurrentWindow.mockResolvedValue({ id: 20 });

      const snapshot = await getScopeSnapshot();

      expect(snapshot.currentWindowId).toBe(20);
      expect(snapshot.highlightedTabIds).toEqual([2]);
    });

    it("reports currentWindowId even when no tabs are highlighted", async () => {
      // Ctrl+click can deselect the active tab → highlighted query returns []. The
      // focused window id must still come through from windows.getCurrent().
      getWindowsAll.mockResolvedValue([
        { id: 10, tabs: [{ id: 1, url: "https://a.test", title: "A", index: 0, pinned: false }] },
        { id: 20, tabs: [{ id: 2, url: "https://b.test", title: "B", index: 0, pinned: false }] },
      ]);
      query.mockResolvedValue([]);
      getCurrentWindow.mockResolvedValue({ id: 20 });

      const snapshot = await getScopeSnapshot();

      expect(snapshot.currentWindowId).toBe(20);
      expect(snapshot.highlightedTabIds).toEqual([]);
    });

    it("covers a tab missing favIconUrl (field absent from copy TabLite)", async () => {
      getWindowsAll.mockResolvedValue([
        {
          id: 10,
          tabs: [
            {
              id: 1,
              url: "https://a.test",
              title: "A",
              index: 0,
              pinned: false,
              // no favIconUrl property; highlighted not set on this raw tab
            },
          ],
        },
      ]);
      query.mockResolvedValue([]);
      getCurrentWindow.mockResolvedValue({ id: 10 });

      const snapshot = await getScopeSnapshot();
      const tab = snapshot.windows[0]!.tabs[0]!;

      // favIconUrl absent on raw tab → undefined on copy TabLite (not empty string)
      expect(tab.favIconUrl).toBeUndefined();
      // highlighted defaults to false when not present on the raw tab
      expect(tab.highlighted).toBe(false);
    });
  });
});
