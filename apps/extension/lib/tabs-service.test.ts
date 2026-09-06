import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAllWindowsTabs,
  getCurrentWindow,
  getCurrentWindowId,
  getHighlightedTabs,
  getWindowCount,
  moveTabsToNewWindow,
} from "./tabs-service";

const query = vi.fn();
const move = vi.fn();
const create = vi.fn();
const getAll = vi.fn();

describe("tabs service", () => {
  beforeEach(() => {
    query.mockReset();
    move.mockReset();
    create.mockReset();
    getAll.mockReset();
    vi.stubGlobal("browser", {
      tabs: { query, move },
      windows: { create, getAll },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries only highlighted tabs", async () => {
    query.mockResolvedValue([
      { id: 4, url: "https://a.test", title: "A", index: 2, pinned: false },
      { id: 5, url: "https://url-only.test" },
      { id: 6 },
      { url: "https://no-id.test", title: "No id", index: 3, pinned: false },
    ]);

    await expect(getHighlightedTabs()).resolves.toEqual([
      { id: 4, url: "https://a.test", title: "A", index: 2, pinned: false, groupId: -1 },
      {
        id: 5,
        url: "https://url-only.test",
        title: "https://url-only.test",
        index: 0,
        pinned: false,
        groupId: -1,
      },
      { id: 6, url: "", title: "", index: 0, pinned: false, groupId: -1 },
    ]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true, highlighted: true });
  });

  it("creates a focused window, moves remaining tabs, and returns the new window id", async () => {
    create.mockResolvedValue({ id: 42 });
    move.mockResolvedValue(undefined);

    await expect(moveTabsToNewWindow([1, 2, 3])).resolves.toBe(42);

    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).toHaveBeenNthCalledWith(1, 2, { windowId: 42, index: -1 });
    expect(move).toHaveBeenNthCalledWith(2, 3, { windowId: 42, index: -1 });
  });

  it("passes an unfocused window through when the caller opts out of focus", async () => {
    create.mockResolvedValue({ id: 8 });
    move.mockResolvedValue(undefined);

    await moveTabsToNewWindow([1], { focus: false });

    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: false });
  });

  it("handles empty, single-tab, and unusable-window extraction", async () => {
    create.mockResolvedValue({});

    await expect(moveTabsToNewWindow([])).resolves.toBeUndefined();
    await expect(moveTabsToNewWindow([1])).resolves.toBeUndefined();
    await expect(moveTabsToNewWindow([1, 2])).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(2);
    expect(move).not.toHaveBeenCalled();
  });

  it("advances to the next seed when creating from the first tab rejects", async () => {
    create.mockRejectedValueOnce(new Error("No tab with id")).mockResolvedValueOnce({ id: 42 });
    move.mockResolvedValue(undefined);

    await expect(moveTabsToNewWindow([1, 2, 3])).resolves.toBe(42);

    expect(create).toHaveBeenNthCalledWith(1, { tabId: 1, focused: true });
    expect(create).toHaveBeenNthCalledWith(2, { tabId: 2, focused: true });
    expect(move).toHaveBeenCalledExactlyOnceWith(3, { windowId: 42, index: -1 });
  });

  it("skips a tab that can no longer be moved instead of failing the whole move", async () => {
    create.mockResolvedValue({ id: 42 });
    move.mockRejectedValueOnce(new Error("No tab with id")).mockResolvedValue(undefined);

    await expect(moveTabsToNewWindow([1, 2, 3])).resolves.toBe(42);

    expect(move).toHaveBeenCalledTimes(2);
  });

  it("queries every normal window for the all-windows tab set", async () => {
    query.mockResolvedValue([
      { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false },
    ]);

    await expect(getAllWindowsTabs()).resolves.toEqual([
      { id: 1, url: "https://a.test", title: "A", index: 0, pinned: false, groupId: -1 },
    ]);
    expect(query).toHaveBeenCalledWith({ windowType: "normal" });
  });

  it("counts only the normal windows", async () => {
    getAll.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await expect(getWindowCount()).resolves.toBe(3);
    expect(getAll).toHaveBeenCalledWith({ windowTypes: ["normal"] });
  });
});

describe("getCurrentWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves window id and tabs from one populated query", async () => {
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

  it("defaults absent tabs and rejects a missing window id", async () => {
    const getCurrent = vi.fn().mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce({ tabs: [] });
    vi.stubGlobal("browser", { windows: { getCurrent } });

    await expect(getCurrentWindow()).resolves.toEqual({ windowId: 5, tabs: [] });
    await expect(getCurrentWindow()).rejects.toThrow("current window has no id");
  });
});

describe("getCurrentWindowId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves and validates the current window id", async () => {
    const getCurrent = vi.fn().mockResolvedValueOnce({ id: 9 }).mockResolvedValueOnce({});
    vi.stubGlobal("browser", { windows: { getCurrent } });

    await expect(getCurrentWindowId()).resolves.toBe(9);
    await expect(getCurrentWindowId()).rejects.toThrow("current window has no id");
  });
});
