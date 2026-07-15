import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPopupData,
  getSelectedTabs,
  getUndoAvailable,
  openOptionsPage,
  runDedupe,
  runDefaultSort,
  runExtract,
  runSort,
  runTidy,
  runUndo,
} from "./orchestration";
import {
  DEFAULT_PREFS,
  TAB_GROUP_NONE,
  type Prefs,
  type TabLite,
  type WindowSnapshot,
} from "./types";

const mocks = vi.hoisted(() => ({
  applyPlan: vi.fn(),
  getCurrentWindow: vi.fn(),
  getCurrentWindowId: vi.fn(),
  getCurrentWindowTabs: vi.fn(),
  getHighlightedTabs: vi.fn(),
  getPrefs: vi.fn(),
  loadUndo: vi.fn(),
  moveTabsToNewWindow: vi.fn(),
  openOptionsPage: vi.fn(),
  reopenTabs: vi.fn(),
  saveUndo: vi.fn(),
  snapshotWindow: vi.fn(),
}));

vi.mock("./realize", () => ({
  applyPlan: mocks.applyPlan,
}));

vi.mock("./tabs-service", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
  getCurrentWindowId: mocks.getCurrentWindowId,
  getCurrentWindowTabs: mocks.getCurrentWindowTabs,
  getHighlightedTabs: mocks.getHighlightedTabs,
  moveTabsToNewWindow: mocks.moveTabsToNewWindow,
  openOptionsPage: mocks.openOptionsPage,
  reopenTabs: mocks.reopenTabs,
  snapshotWindow: mocks.snapshotWindow,
}));

vi.mock("./storage", () => ({
  getPrefs: mocks.getPrefs,
}));

vi.mock("./session-store", () => ({
  loadUndo: mocks.loadUndo,
  saveUndo: mocks.saveUndo,
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

function snapshot(windowId: number, tag: string): WindowSnapshot {
  return {
    windowId,
    tabs: [
      { id: 100, url: `https://${tag}.example`, index: 0, pinned: false, groupId: TAB_GROUP_NONE },
    ],
    groups: [],
    savedAt: 1,
  };
}

describe("orchestration", () => {
  let callOrder: string[];

  beforeEach(() => {
    callOrder = [];

    mocks.applyPlan.mockReset();
    mocks.getCurrentWindow.mockReset();
    mocks.getCurrentWindowId.mockReset();
    mocks.getCurrentWindowTabs.mockReset();
    mocks.getHighlightedTabs.mockReset();
    mocks.loadUndo.mockReset();
    mocks.moveTabsToNewWindow.mockReset();
    mocks.openOptionsPage.mockReset();
    mocks.reopenTabs.mockReset();
    mocks.saveUndo.mockReset();
    mocks.snapshotWindow.mockReset();
    mocks.getPrefs.mockReset();

    mocks.getCurrentWindowTabs.mockResolvedValue(tabs);
    mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs });
    mocks.getPrefs.mockResolvedValue(prefs);
    mocks.getCurrentWindowId.mockResolvedValue(1);
    mocks.loadUndo.mockResolvedValue(undefined);
    mocks.snapshotWindow.mockResolvedValue(snapshot(1, "default"));
    mocks.applyPlan.mockImplementation(async () => {
      callOrder.push("apply");
      return { grouped: 0, createdGroups: [], closed: 0 };
    });
    mocks.reopenTabs.mockImplementation(async (urls: string[]) => {
      callOrder.push("reopen");
      return urls.length;
    });
    mocks.saveUndo.mockImplementation(async () => {
      callOrder.push("save");
    });
  });

  it("returns the highlighted tabs verbatim for copy, without prefs filtering", async () => {
    // Selection includes a pinned tab; copy must not drop it the way extract does.
    mocks.getHighlightedTabs.mockResolvedValue([tabs[0], tabs[2]]);

    await expect(getSelectedTabs()).resolves.toEqual([tabs[0], tabs[2]]);
    expect(mocks.getPrefs).not.toHaveBeenCalled();
  });

  it("delegates openOptionsPage to tabs-service", async () => {
    mocks.openOptionsPage.mockResolvedValue(undefined);

    await expect(openOptionsPage()).resolves.toBeUndefined();
    expect(mocks.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("sorts unpinned tabs after the pinned block", async () => {
    await expect(runSort("title")).resolves.toEqual({ moved: 2 });

    expect(mocks.applyPlan).toHaveBeenCalledWith(
      {
        order: [9, 1, 2],
        groups: [],
        ungroup: [],
        close: [],
      },
      1,
    );
  });

  it("does nothing for a window with a single tab", async () => {
    mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: [tabs[0]] });

    await expect(runSort("title")).resolves.toEqual({ moved: 0 });

    expect(mocks.applyPlan).not.toHaveBeenCalled();
  });

  it("does not apply an already sorted order", async () => {
    mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: [tabs[0], tabs[2], tabs[1]] });

    await expect(runSort("title")).resolves.toEqual({ moved: 0 });

    expect(mocks.applyPlan).not.toHaveBeenCalled();
  });

  it("runs the default sort preference", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, defaultSort: "domain" });

    await expect(runDefaultSort()).resolves.toEqual({ moved: 2 });

    expect(mocks.applyPlan).toHaveBeenCalledWith(
      {
        order: [9, 1, 2],
        groups: [],
        ungroup: [],
        close: [],
      },
      1,
    );
  });

  it("extracts matching unpinned tabs by domain", async () => {
    await expect(runExtract({ type: "domain", domain: "github.com" })).resolves.toEqual({
      moved: 1,
    });

    expect(mocks.moveTabsToNewWindow).toHaveBeenCalledWith([2]);
  });

  it("extracts matching unpinned tabs by regex", async () => {
    await expect(runExtract({ type: "regex", source: "alpha", flags: "i" })).resolves.toEqual({
      moved: 1,
    });

    expect(mocks.moveTabsToNewWindow).toHaveBeenCalledWith([1]);
  });

  it("does not create a window for zero matches", async () => {
    await expect(runExtract({ type: "domain", domain: "missing.example" })).resolves.toEqual({
      moved: 0,
    });

    expect(mocks.moveTabsToNewWindow).not.toHaveBeenCalled();
  });

  it("treats an invalid regex as zero matches", async () => {
    await expect(runExtract({ type: "regex", source: "[" })).resolves.toEqual({ moved: 0 });

    expect(mocks.moveTabsToNewWindow).not.toHaveBeenCalled();
  });

  it("keeps pinned tabs in popup data when ignorePinned is off", async () => {
    mocks.getPrefs.mockResolvedValue({ ...prefs, ignorePinned: false });

    await expect(getPopupData()).resolves.toMatchObject({
      domainGroups: [
        { domain: "docs.example.com", count: 1, tabIds: [1] },
        { domain: "github.com", count: 1, tabIds: [2] },
        { domain: "pinned.example", count: 1, tabIds: [9] },
      ],
      tabs,
    });
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

  it("reports duplicateCount over ALL tabs (not the ignorePinned-filtered set)", async () => {
    const withDup: TabLite[] = [
      { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
      { id: 2, title: "Beta", url: "https://dup.example/x", index: 1, pinned: false },
      { id: 3, title: "Beta2", url: "https://dup.example/x", index: 2, pinned: false },
    ];
    mocks.getCurrentWindowTabs.mockResolvedValue(withDup);

    await expect(getPopupData()).resolves.toMatchObject({ duplicateCount: 1, canUndo: false });
  });

  it("reports totalTabs as the unfiltered window count, not the ignorePinned-filtered tabs list", async () => {
    const pinnedHeavy: TabLite[] = [
      { id: 1, title: "P1", url: "https://p1.example", index: 0, pinned: true },
      { id: 2, title: "P2", url: "https://p2.example", index: 1, pinned: true },
      { id: 3, title: "Solo", url: "https://solo.example", index: 2, pinned: false },
    ];
    mocks.getCurrentWindowTabs.mockResolvedValue(pinnedHeavy);

    await expect(getPopupData()).resolves.toMatchObject({
      totalTabs: 3,
      tabs: [pinnedHeavy[2]],
    });
  });

  it("reports canUndo true when a snapshot exists for the current window", async () => {
    mocks.loadUndo.mockResolvedValue(snapshot(1, "saved"));

    await expect(getPopupData()).resolves.toMatchObject({ canUndo: true });
  });

  describe("runTidy", () => {
    it("returns zeros without snapshotting or mutating an empty window", async () => {
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: [] });

      await expect(runTidy()).resolves.toEqual({ moved: 0, grouped: 0, createdGroups: [] });

      expect(mocks.snapshotWindow).not.toHaveBeenCalled();
      expect(mocks.applyPlan).not.toHaveBeenCalled();
      expect(mocks.saveUndo).not.toHaveBeenCalled();
    });

    it("skips saveUndo when tidying an already-tidy window (no move, no group, no ungroup)", async () => {
      const tidyTabs: TabLite[] = [
        { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
        { id: 1, title: "Alpha", url: "https://alpha.example/a", index: 1, pinned: false },
        { id: 2, title: "Beta", url: "https://beta.example/b", index: 2, pinned: false },
      ];
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: tidyTabs });
      const snap = snapshot(1, "tidy-noop");
      mocks.snapshotWindow.mockResolvedValue(snap);

      await expect(runTidy()).resolves.toEqual({ moved: 0, grouped: 0, createdGroups: [] });

      expect(mocks.snapshotWindow).toHaveBeenCalledWith(1);
      expect(mocks.applyPlan).toHaveBeenCalledWith(
        {
          order: [9, 1, 2],
          groups: [],
          ungroup: [],
          close: [],
        },
        1,
      );
      expect(mocks.saveUndo).not.toHaveBeenCalled();
    });

    it("saves the pre-mutation snapshot when tidy moves tabs", async () => {
      const tidyTabs: TabLite[] = [
        { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
        { id: 2, title: "Beta", url: "https://beta.example/b", index: 1, pinned: false },
        { id: 1, title: "Alpha", url: "https://alpha.example/a", index: 2, pinned: false },
      ];
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: tidyTabs });
      const snap = snapshot(1, "tidy-moved");
      mocks.snapshotWindow.mockResolvedValue(snap);

      await expect(runTidy()).resolves.toEqual({ moved: 2, grouped: 0, createdGroups: [] });

      expect(mocks.saveUndo).toHaveBeenCalledWith(1, snap);
    });

    it("saves undo when a group forms even though the order itself is unchanged", async () => {
      const tidyTabs: TabLite[] = [
        { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
        { id: 1, title: "Alpha1", url: "https://shared.example/a", index: 1, pinned: false },
        { id: 2, title: "Alpha2", url: "https://shared.example/b", index: 2, pinned: false },
      ];
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: tidyTabs });
      const snap = snapshot(1, "tidy-grouped");
      mocks.snapshotWindow.mockResolvedValue(snap);
      const createdGroups = [{ title: "shared.example", color: "blue" as const }];
      mocks.applyPlan.mockResolvedValue({ grouped: 2, createdGroups, closed: 0 });

      await expect(runTidy()).resolves.toEqual({ moved: 0, grouped: 2, createdGroups });

      expect(mocks.saveUndo).toHaveBeenCalledWith(1, snap);
    });

    it("saves undo when a leftover single needs ungrouping even with no move or new group", async () => {
      const tidyTabs: TabLite[] = [
        { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
        {
          id: 2,
          title: "Solo",
          url: "https://solo.example/x",
          index: 1,
          pinned: false,
          groupId: 5,
        },
      ];
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: tidyTabs });
      mocks.getPrefs.mockResolvedValue({ ...prefs, regroupExisting: true });
      const snap = snapshot(1, "tidy-ungroup");
      mocks.snapshotWindow.mockResolvedValue(snap);

      await expect(runTidy()).resolves.toEqual({ moved: 0, grouped: 0, createdGroups: [] });

      expect(mocks.saveUndo).toHaveBeenCalledWith(1, snap);
    });
  });

  describe("runDedupe", () => {
    const dupeTabs: TabLite[] = [
      { id: 1, title: "Keep", url: "https://d.example/page", index: 0, pinned: false },
      { id: 2, title: "Dup", url: "https://d.example/page", index: 1, pinned: false },
    ];

    it("previews without mutating when confirm is false", async () => {
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: dupeTabs });

      await expect(runDedupe({ confirm: false })).resolves.toEqual({ duplicates: 1, closed: 0 });

      expect(mocks.snapshotWindow).not.toHaveBeenCalled();
      expect(mocks.applyPlan).not.toHaveBeenCalled();
      expect(mocks.saveUndo).not.toHaveBeenCalled();
    });

    it("does nothing when confirmed but there are no duplicates", async () => {
      await expect(runDedupe({ confirm: true })).resolves.toEqual({ duplicates: 0, closed: 0 });

      expect(mocks.snapshotWindow).not.toHaveBeenCalled();
      expect(mocks.applyPlan).not.toHaveBeenCalled();
      expect(mocks.saveUndo).not.toHaveBeenCalled();
    });

    it("snapshots, closes, and saves undo when confirmed with duplicates present", async () => {
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: dupeTabs });
      const snap = snapshot(1, "dedupe");
      mocks.snapshotWindow.mockResolvedValue(snap);
      mocks.applyPlan.mockResolvedValue({ grouped: 0, createdGroups: [], closed: 1 });

      await expect(runDedupe({ confirm: true })).resolves.toEqual({ duplicates: 1, closed: 1 });

      expect(mocks.applyPlan).toHaveBeenCalledWith(
        {
          order: [],
          groups: [],
          ungroup: [],
          close: [2],
        },
        1,
      );
      expect(mocks.saveUndo).toHaveBeenCalledWith(1, snap);
    });

    it("routes the dedupeIgnoreQuery/dedupeIgnoreHash prefs into planDedupe", async () => {
      const queryTabs: TabLite[] = [
        { id: 1, title: "A", url: "https://x.example/p?q=1", index: 0, pinned: false },
        { id: 2, title: "B", url: "https://x.example/p?q=2", index: 1, pinned: false },
      ];
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: queryTabs });
      mocks.getPrefs.mockResolvedValue({ ...prefs, dedupeIgnoreQuery: true });

      await expect(runDedupe({ confirm: false })).resolves.toEqual({ duplicates: 1, closed: 0 });
    });
  });

  describe("runUndo", () => {
    it("reports undone: false with no side effects when there is no saved snapshot", async () => {
      mocks.loadUndo.mockResolvedValue(undefined);

      await expect(runUndo()).resolves.toEqual({ undone: false, restored: 0, reopened: 0 });

      expect(mocks.snapshotWindow).not.toHaveBeenCalled();
      expect(mocks.reopenTabs).not.toHaveBeenCalled();
      expect(mocks.applyPlan).not.toHaveBeenCalled();
      expect(mocks.saveUndo).not.toHaveBeenCalled();
    });

    it("reopens vanished tabs before realizing the plan, then saves the pre-undo snapshot", async () => {
      const saved: WindowSnapshot = {
        windowId: 1,
        tabs: [
          { id: 9, url: "https://pinned.example", index: 0, pinned: true, groupId: TAB_GROUP_NONE },
          {
            id: 1,
            url: "https://alpha.example/a",
            index: 1,
            pinned: false,
            groupId: TAB_GROUP_NONE,
          },
          { id: 3, url: "https://gone.example", index: 2, pinned: false, groupId: TAB_GROUP_NONE },
        ],
        groups: [],
        savedAt: 1000,
      };
      const currentTabs: TabLite[] = [
        { id: 9, title: "Pinned", url: "https://pinned.example", index: 0, pinned: true },
        { id: 1, title: "Alpha", url: "https://alpha.example/a", index: 1, pinned: false },
      ];
      const snapshotNow = snapshot(1, "pre-undo");
      mocks.loadUndo.mockResolvedValue(saved);
      mocks.getCurrentWindow.mockResolvedValue({ windowId: 1, tabs: currentTabs });
      mocks.snapshotWindow.mockResolvedValue(snapshotNow);

      await expect(runUndo()).resolves.toEqual({ undone: true, restored: 2, reopened: 1 });

      expect(mocks.reopenTabs).toHaveBeenCalledWith(["https://gone.example"]);
      expect(mocks.applyPlan).toHaveBeenCalledWith(
        {
          order: [9, 1],
          groups: [],
          ungroup: [],
          close: [],
        },
        1,
      );
      expect(mocks.saveUndo).toHaveBeenCalledWith(1, snapshotNow);
      expect(callOrder).toEqual(["reopen", "apply", "save"]);
    });
  });

  describe("getUndoAvailable", () => {
    it("is true when a snapshot is saved for the current window", async () => {
      mocks.getCurrentWindowId.mockResolvedValue(7);
      mocks.loadUndo.mockResolvedValue(snapshot(7, "avail"));

      await expect(getUndoAvailable()).resolves.toBe(true);

      expect(mocks.loadUndo).toHaveBeenCalledWith(7);
    });

    it("is false when nothing is saved for the current window", async () => {
      mocks.getCurrentWindowId.mockResolvedValue(7);
      mocks.loadUndo.mockResolvedValue(undefined);

      await expect(getUndoAvailable()).resolves.toBe(false);
    });
  });
});
