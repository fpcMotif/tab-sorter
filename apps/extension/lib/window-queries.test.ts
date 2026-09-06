import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAllWindowsExtract, getPopupData, getSelectedTabs } from "./window-queries";
import { DEFAULT_PREFS, type Prefs, type TabLite } from "@tab-sorter/core/types";

const mocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  getHighlightedTabs: vi.fn(),
  getAllWindowsTabs: vi.fn(),
  getWindowCount: vi.fn(),
  getMutationState: vi.fn(),
  getPrefs: vi.fn(),
}));

vi.mock("./tabs-service", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
  getHighlightedTabs: mocks.getHighlightedTabs,
  getAllWindowsTabs: mocks.getAllWindowsTabs,
  getWindowCount: mocks.getWindowCount,
}));

vi.mock("./mutation", () => ({
  getMutationState: mocks.getMutationState,
}));

vi.mock("./storage", () => ({
  getPrefs: mocks.getPrefs,
}));

const prefs: Prefs = {
  ...DEFAULT_PREFS,
  defaultSort: "title",
  ignorePinned: true,
  regexPresets: [],
};

const tabs: TabLite[] = [
  { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
  { id: 2, title: "Beta", url: "https://github.com/b", index: 1, pinned: false },
  { id: 1, title: "Alpha", url: "https://docs.example.com/a", index: 2, pinned: false },
];

describe("window queries", () => {
  beforeEach(() => {
    mocks.getCurrentWindow.mockReset();
    mocks.getHighlightedTabs.mockReset();
    mocks.getAllWindowsTabs.mockReset();
    mocks.getWindowCount.mockReset();
    mocks.getMutationState.mockReset();
    mocks.getPrefs.mockReset();

    mocks.getCurrentWindow.mockResolvedValue({ windowId: 7, tabs });
    mocks.getWindowCount.mockResolvedValue(1);
    mocks.getMutationState.mockResolvedValue({
      canUndo: false,
      recoveryRequired: false,
    });
    mocks.getPrefs.mockResolvedValue(prefs);
  });

  it("returns highlighted tabs verbatim", async () => {
    mocks.getHighlightedTabs.mockResolvedValue([tabs[0], tabs[2]]);

    await expect(getSelectedTabs()).resolves.toEqual([tabs[0], tabs[2]]);
    expect(mocks.getPrefs).not.toHaveBeenCalled();
  });

  it("reports the explicit window and filters pinned action tabs", async () => {
    await expect(getPopupData()).resolves.toMatchObject({
      windowId: 7,
      domainGroups: [
        { domain: "docs.example.com", count: 1, tabIds: [1] },
        { domain: "github.com", count: 1, tabIds: [2] },
      ],
      tabs: [tabs[1], tabs[2]],
      totalTabs: 3,
      duplicateCount: 0,
      canUndo: false,
      recoveryRequired: false,
    });
    expect(mocks.getMutationState).toHaveBeenCalledWith(7);
  });

  it("keeps pinned tabs when ignorePinned is off", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, ignorePinned: false });

    await expect(getPopupData()).resolves.toMatchObject({
      domainGroups: [
        { domain: "docs.example.com", count: 1, tabIds: [1] },
        { domain: "github.com", count: 1, tabIds: [2] },
        { domain: "pinned.example", count: 1, tabIds: [9] },
      ],
      tabs,
      totalTabs: 3,
    });
  });

  it("counts duplicates over all tabs and exposes recovery as undo", async () => {
    const withDuplicate: TabLite[] = [
      { id: 9, title: "Pinned", url: "https://dup.example/x", index: 0, pinned: true },
      { id: 2, title: "Keep", url: "https://dup.example/x", index: 1, pinned: false },
      { id: 3, title: "Other", url: "https://other.example", index: 2, pinned: false },
    ];
    mocks.getCurrentWindow.mockResolvedValue({ windowId: 11, tabs: withDuplicate });
    mocks.getMutationState.mockResolvedValue({
      canUndo: true,
      recoveryRequired: true,
    });

    await expect(getPopupData()).resolves.toMatchObject({
      windowId: 11,
      duplicateCount: 1,
      totalTabs: 3,
      canUndo: true,
      recoveryRequired: true,
    });
  });

  it("reports how many windows are open so the popup can offer the scope toggle", async () => {
    mocks.getWindowCount.mockResolvedValue(3);

    await expect(getPopupData()).resolves.toMatchObject({ windowCount: 3 });
    expect(mocks.getWindowCount).toHaveBeenCalledTimes(1);
  });
});

describe("getAllWindowsExtract", () => {
  beforeEach(() => {
    mocks.getAllWindowsTabs.mockReset();
    mocks.getWindowCount.mockReset();
    mocks.getPrefs.mockReset();
    mocks.getPrefs.mockResolvedValue(prefs);
    mocks.getWindowCount.mockResolvedValue(2);
  });

  it("aggregates domain groups across every window and drops pinned tabs", async () => {
    mocks.getAllWindowsTabs.mockResolvedValue([
      { id: 9, title: "Pinned", url: "https://github.com/pinned", index: 0, pinned: true },
      { id: 2, title: "PR", url: "https://github.com/pr", index: 1, pinned: false },
      { id: 5, title: "Issues", url: "https://github.com/issues", index: 0, pinned: false },
      { id: 1, title: "Docs", url: "https://docs.example.com/a", index: 1, pinned: false },
    ] satisfies TabLite[]);

    await expect(getAllWindowsExtract()).resolves.toEqual({
      domainGroups: [
        { domain: "github.com", count: 2, tabIds: [2, 5] },
        { domain: "docs.example.com", count: 1, tabIds: [1] },
      ],
      tabs: [
        { id: 2, title: "PR", url: "https://github.com/pr", index: 1, pinned: false },
        { id: 5, title: "Issues", url: "https://github.com/issues", index: 0, pinned: false },
        { id: 1, title: "Docs", url: "https://docs.example.com/a", index: 1, pinned: false },
      ],
      totalTabs: 4,
      windowCount: 2,
    });
  });

  it("keeps pinned tabs in the all-windows set when ignorePinned is off", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, ignorePinned: false });
    mocks.getAllWindowsTabs.mockResolvedValue([
      { id: 9, title: "Pinned", url: "https://github.com/pinned", index: 0, pinned: true },
      { id: 2, title: "PR", url: "https://github.com/pr", index: 1, pinned: false },
    ] satisfies TabLite[]);

    await expect(getAllWindowsExtract()).resolves.toMatchObject({
      domainGroups: [{ domain: "github.com", count: 2, tabIds: [9, 2] }],
      totalTabs: 2,
    });
  });
});
