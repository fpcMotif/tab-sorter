import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "./tabs-service";

const query = vi.fn();
const move = vi.fn();
const create = vi.fn();
const update = vi.fn();
const globalWithBrowser = globalThis as typeof globalThis & { browser?: unknown };

describe("tabs-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalWithBrowser.browser = {
      tabs: { query, move },
      windows: { create, update },
    };
    query.mockResolvedValue([
      { id: 1, url: "https://b.example", title: "B", index: 0, pinned: false },
      { id: 2, url: "https://a.example", title: "A", index: 1, pinned: false },
      { url: "https://missing-id.example", title: "Missing", index: 2, pinned: false },
    ]);
    move.mockResolvedValue(undefined);
    create.mockResolvedValue({ id: 99 });
    update.mockResolvedValue(undefined);
  });

  it("maps current-window tabs to TabLite and skips tabs without ids", async () => {
    await expect(getCurrentWindowTabs()).resolves.toEqual([
      { id: 1, url: "https://b.example", title: "B", index: 0, pinned: false },
      { id: 2, url: "https://a.example", title: "A", index: 1, pinned: false },
    ]);
  });

  it("applies an order after the pinned block and ignores stale ids", async () => {
    await applyOrder([3, 2, 1], { afterPinned: 1 });

    expect(move).toHaveBeenNthCalledWith(1, 2, { index: 1 });
    expect(move).toHaveBeenNthCalledWith(2, 1, { index: 2 });
  });

  it("does not move empty or single-tab orders", async () => {
    await applyOrder([]);
    await applyOrder([1]);

    expect(move).not.toHaveBeenCalled();
  });

  it("moves matching tabs into a focused new window", async () => {
    await moveTabsToNewWindow([1, 2]);

    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).toHaveBeenCalledWith([2], { windowId: 99, index: -1 });
    expect(update).toHaveBeenCalledWith(99, { focused: true });
  });

  it("ignores stale ids when moving to a new window", async () => {
    await moveTabsToNewWindow([1, 3, 2]);

    expect(create).toHaveBeenCalledWith({ tabId: 1, focused: true });
    expect(move).toHaveBeenCalledWith([2], { windowId: 99, index: -1 });
  });
});
