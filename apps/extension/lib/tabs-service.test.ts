import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "./tabs-service";

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
      { id: 1, url: "https://example.com", title: "Example", index: 0, pinned: true },
    ]);
    expect(query).toHaveBeenCalledWith({ currentWindow: true });
  });

  it("re-queries before applying order and skips stale ids", async () => {
    query.mockResolvedValue([{ id: 3 }, { id: 1 }]);

    await applyOrder([3, 2, 1]);

    expect(move).toHaveBeenCalledWith([3, 1], { index: 0 });
    expect(move).toHaveBeenCalledTimes(1);
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
});
