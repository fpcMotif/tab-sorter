import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prefs, TabLite } from "./types";

const mocks = vi.hoisted(() => ({
  getPrefs: vi.fn(),
  getCurrentWindowTabs: vi.fn(),
  applyOrder: vi.fn(),
  moveTabsToNewWindow: vi.fn(),
}));

vi.mock("./storage", () => ({
  getPrefs: mocks.getPrefs,
}));

vi.mock("./tabs-service", () => ({
  getCurrentWindowTabs: mocks.getCurrentWindowTabs,
  applyOrder: mocks.applyOrder,
  moveTabsToNewWindow: mocks.moveTabsToNewWindow,
}));

import { getDomainGroups, previewRegexMatches, runExtract, runSort } from "./orchestration";

const tabs: TabLite[] = [
  { id: 1, title: "Pinned", url: "https://z.example", index: 0, pinned: true },
  { id: 2, title: "B", url: "https://github.com/b", index: 1, pinned: false },
  { id: 3, title: "A", url: "https://github.com/a", index: 2, pinned: false },
];

const prefs: Prefs = { defaultSort: "title", ignorePinned: true, regexPresets: [] };

describe("orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPrefs.mockResolvedValue(prefs);
    mocks.getCurrentWindowTabs.mockResolvedValue(tabs);
    mocks.applyOrder.mockResolvedValue(undefined);
    mocks.moveTabsToNewWindow.mockResolvedValue(undefined);
  });

  it("sorts eligible tabs after pinned tabs", async () => {
    await expect(runSort("title")).resolves.toEqual({ moved: 2 });
    expect(mocks.applyOrder).toHaveBeenCalledWith([3, 2], { afterPinned: 1 });
  });

  it("returns a no-op when the eligible order is already sorted", async () => {
    mocks.getCurrentWindowTabs.mockResolvedValue([{ ...tabs[0] }, { ...tabs[2], index: 1 }, { ...tabs[1], index: 2 }]);

    await expect(runSort("title")).resolves.toEqual({ moved: 0 });
    expect(mocks.applyOrder).not.toHaveBeenCalled();
  });

  it("extracts by domain while excluding pinned tabs", async () => {
    await expect(runExtract({ type: "domain", domain: "github.com" })).resolves.toEqual({ moved: 2 });
    expect(mocks.moveTabsToNewWindow).toHaveBeenCalledWith([2, 3]);
  });

  it("extracts by regex and reports zero matches", async () => {
    await expect(runExtract({ type: "regex", source: "missing" })).resolves.toEqual({ moved: 0 });
    expect(mocks.moveTabsToNewWindow).not.toHaveBeenCalled();
  });

  it("builds domain groups and previews regex matches", async () => {
    await expect(getDomainGroups()).resolves.toEqual([{ domain: "github.com", count: 2, tabIds: [2, 3] }]);
    await expect(previewRegexMatches("github")).resolves.toBe(2);
  });
});
