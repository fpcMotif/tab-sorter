import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidPatternError } from "./match";
import { getPopupData, runDefaultSort, runExtract, runSort } from "./orchestration";
import type { Prefs, TabLite } from "./types";

const mocks = vi.hoisted(() => ({
  applyOrder: vi.fn(),
  getCurrentWindowTabs: vi.fn(),
  getPrefs: vi.fn(),
  moveTabsToNewWindow: vi.fn(),
}));

vi.mock("./tabs-service", () => ({
  applyOrder: mocks.applyOrder,
  getCurrentWindowTabs: mocks.getCurrentWindowTabs,
  moveTabsToNewWindow: mocks.moveTabsToNewWindow,
}));

vi.mock("./storage", () => ({
  getPrefs: mocks.getPrefs,
}));

const prefs: Prefs = {
  defaultSort: "title",
  ignorePinned: true,
  regexPresets: [],
};

const tabs: TabLite[] = [
  { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
  { id: 2, title: "Beta", url: "https://github.com/b", index: 1, pinned: false },
  { id: 1, title: "Alpha", url: "https://docs.example.com/a", index: 2, pinned: false },
];

describe("orchestration", () => {
  beforeEach(() => {
    mocks.applyOrder.mockReset();
    mocks.getCurrentWindowTabs.mockReset();
    mocks.getPrefs.mockReset();
    mocks.moveTabsToNewWindow.mockReset();
    mocks.getCurrentWindowTabs.mockResolvedValue(tabs);
    mocks.getPrefs.mockResolvedValue(prefs);
  });

  it("sorts unpinned tabs after the pinned block", async () => {
    await expect(runSort("title")).resolves.toEqual({ moved: 2 });

    expect(mocks.applyOrder).toHaveBeenCalledWith([1, 2], { afterPinned: 1 });
  });

  it("does not apply an already sorted order", async () => {
    mocks.getCurrentWindowTabs.mockResolvedValue([tabs[0], tabs[2], tabs[1]]);

    await expect(runSort("title")).resolves.toEqual({ moved: 0 });

    expect(mocks.applyOrder).not.toHaveBeenCalled();
  });

  it("can sort all tabs when pinned tabs are not ignored", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, ignorePinned: false });

    await expect(runSort("domain")).resolves.toEqual({ moved: 3 });

    expect(mocks.applyOrder).toHaveBeenCalledWith([1, 2, 9], { afterPinned: 0 });
  });

  it("runs the default sort preference", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, defaultSort: "domain" });

    await expect(runDefaultSort()).resolves.toEqual({ moved: 2 });

    expect(mocks.applyOrder).toHaveBeenCalledWith([1, 2], { afterPinned: 1 });
  });

  it("extracts matching unpinned tabs by domain", async () => {
    await expect(runExtract({ type: "domain", domain: "github.com" })).resolves.toEqual({ moved: 1 });

    expect(mocks.moveTabsToNewWindow).toHaveBeenCalledWith([2]);
  });

  it("extracts matching unpinned tabs by regex", async () => {
    await expect(runExtract({ type: "regex", source: "alpha", flags: "i" })).resolves.toEqual({ moved: 1 });

    expect(mocks.moveTabsToNewWindow).toHaveBeenCalledWith([1]);
  });

  it("does not create a window for zero matches", async () => {
    await expect(runExtract({ type: "domain", domain: "missing.example" })).resolves.toEqual({ moved: 0 });

    expect(mocks.moveTabsToNewWindow).not.toHaveBeenCalled();
  });

  it("propagates invalid regex errors", async () => {
    await expect(runExtract({ type: "regex", source: "[" })).rejects.toThrow(InvalidPatternError);
  });

  it("provides popup data without pinned tabs when ignored", async () => {
    await expect(getPopupData()).resolves.toMatchObject({
      domainGroups: [
        { domain: "docs.example.com", count: 1, tabIds: [1] },
        { domain: "github.com", count: 1, tabIds: [2] },
      ],
      tabs: [tabs[1], tabs[2]],
    });
  });
});
