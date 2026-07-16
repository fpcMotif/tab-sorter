import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyOrder,
  applyPlan,
  getCurrentWindow,
  getCurrentWindowId,
  getCurrentWindowTabs,
  getHighlightedTabs,
  moveTabsToNewWindow,
  reopenTabs,
  snapshotWindow,
} from "./tabs-service";
import { TAB_GROUP_NONE } from "./types";
import type { GroupColor, TabPlan } from "./types";

const query = vi.fn();
const move = vi.fn();
const create = vi.fn();

// Group-aware in-memory browser fake for applyPlan's realize phases.
// @webext-core/fake-browser (checked: lib/index.mjs has no tabGroups/group/
// ungroup symbols) doesn't model tabs.group/tabs.ungroup/tabGroups.*, so this
// mimics the verified contract facts from tabs-service.ts's header: group()
// assigns a fresh id (or reuses the one passed in) and packs members
// contiguous starting at the lowest-index member; tabGroups.move relocates
// the whole span; tabGroups.update only records metadata; ungroup clears
// groupId. Single-window model — every query ignores its windowId filter.
interface FakeStripTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

interface FakeGroupSeed {
  id: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

function createFakeBrowser(initialStrip: FakeStripTab[], initialGroups: FakeGroupSeed[] = []) {
  const strip: FakeStripTab[] = initialStrip.map((tab) => ({ ...tab }));
  const groupMeta = new Map<number, { title: string; color: GroupColor; collapsed: boolean }>(
    initialGroups.map((g) => [g.id, { title: g.title, color: g.color, collapsed: g.collapsed }]),
  );
  let nextGroupId = Math.max(0, ...initialGroups.map((g) => g.id)) + 1;

  const fakeQuery = vi.fn(() =>
    Promise.resolve(strip.map((tab, index) => ({ ...tab, index, url: `https://${tab.id}.test` }))),
  );

  const fakeMove = vi.fn((id: number, { index }: { index: number }) => {
    const from = strip.findIndex((tab) => tab.id === id);
    // move is only issued for ids present in the strip, so the splice yields one tab.
    const [tab] = strip.splice(from, 1);
    strip.splice(index, 0, tab!);
    return Promise.resolve();
  });

  const fakeGroup = vi.fn(({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
    const gid = groupId ?? nextGroupId++;
    if (groupId === undefined) {
      groupMeta.set(gid, { title: "", color: "grey", collapsed: false });
    }

    const existing = strip.filter((tab) => tab.groupId === gid);
    const incoming = tabIds
      .filter((id) => !existing.some((tab) => tab.id === id))
      .map((id) => strip.find((tab) => tab.id === id)!);
    const members = [...existing, ...incoming];
    const memberIds = new Set(members.map((tab) => tab.id));
    const lowestIndex = Math.min(...members.map((tab) => strip.indexOf(tab)));
    const rest = strip.filter((tab) => !memberIds.has(tab.id));
    const insertAt = rest.filter((tab) => strip.indexOf(tab) < lowestIndex).length;

    members.forEach((tab) => {
      tab.groupId = gid;
    });
    rest.splice(insertAt, 0, ...members);
    strip.splice(0, strip.length, ...rest);

    return Promise.resolve(gid);
  });

  const fakeUngroup = vi.fn((ids: number[]) => {
    for (const id of ids) {
      const tab = strip.find((candidate) => candidate.id === id);
      if (tab !== undefined) {
        tab.groupId = TAB_GROUP_NONE;
      }
    }
    return Promise.resolve();
  });

  const fakeRemove = vi.fn((ids: number[]) => {
    const idSet = new Set(ids);
    strip.splice(0, strip.length, ...strip.filter((tab) => !idSet.has(tab.id)));
    return Promise.resolve();
  });

  const fakeTabGroupsQuery = vi.fn(() => {
    const liveIds = new Set(
      strip.filter((tab) => tab.groupId !== TAB_GROUP_NONE).map((tab) => tab.groupId),
    );

    return Promise.resolve(
      [...liveIds].map((id) => {
        const meta = groupMeta.get(id)!;
        return { id, title: meta.title, color: meta.color, collapsed: meta.collapsed };
      }),
    );
  });

  const fakeTabGroupsUpdate = vi.fn(
    (groupId: number, patch: { title: string; color: GroupColor; collapsed: boolean }) => {
      groupMeta.set(groupId, patch);
      return Promise.resolve();
    },
  );

  const fakeTabGroupsMove = vi.fn((groupId: number, { index }: { index: number }) => {
    const members = strip.filter((tab) => tab.groupId === groupId);
    const rest = strip.filter((tab) => tab.groupId !== groupId);
    rest.splice(index, 0, ...members);
    strip.splice(0, strip.length, ...rest);
    return Promise.resolve();
  });

  return {
    strip,
    groupMeta,
    move: fakeMove,
    group: fakeGroup,
    ungroup: fakeUngroup,
    remove: fakeRemove,
    tabGroupsMove: fakeTabGroupsMove,
    tabGroupsUpdate: fakeTabGroupsUpdate,
    browser: {
      windows: { getCurrent: vi.fn(() => Promise.resolve({ id: 1 })) },
      tabs: {
        query: fakeQuery,
        move: fakeMove,
        group: fakeGroup,
        ungroup: fakeUngroup,
        remove: fakeRemove,
      },
      tabGroups: {
        query: fakeTabGroupsQuery,
        update: fakeTabGroupsUpdate,
        move: fakeTabGroupsMove,
      },
    },
  };
}

function stripIds(strip: FakeStripTab[]): number[] {
  return strip.map((tab) => tab.id);
}

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

  it("drops re-queried tabs without ids when building the live order", async () => {
    query.mockResolvedValue([{ id: 2 }, { url: "https://no-id.test" }, { id: 1 }]);

    await applyOrder([1, 2], 1);

    // The id-less tab is dropped, so the live order is [2, 1]; one move reaches [1, 2].
    expect(move).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenNthCalledWith(1, 1, { index: 0 });
  });

  it("re-queries a fresh snapshot scoped to the given windowId and skips stale ids", async () => {
    query.mockResolvedValue([{ id: 3 }, { id: 1 }]);

    await applyOrder([3, 2, 1], 7);

    // id 2 vanished mid-operation; the survivors [3, 1] are already in their
    // target order, so minimal-moves issues nothing. The query is scoped to the
    // caller's explicit windowId, never `{ currentWindow: true }`.
    expect(query).toHaveBeenCalledWith({ windowId: 7 });
    expect(move).not.toHaveBeenCalled();
  });

  it("issues only the moves needed to reach the target order", async () => {
    query.mockResolvedValue([{ id: 2 }, { id: 1 }, { id: 3 }]);

    await applyOrder([1, 2, 3], 1);

    // One tab is out of place; one move suffices instead of three.
    expect(move).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenNthCalledWith(1, 1, { index: 0 });
  });

  it("keeps survivors in order when a non-survivor tab shares the live window", async () => {
    // A tab (99) opened after the sort snapshot still sits in the live window but
    // is absent from the desired order. planMoves emits survivor-strip indices, so
    // applyOrder must translate them to absolute window slots; replaying them raw
    // lets the foreign tab shift every move and scramble the survivors.
    const window = [1, 99, 2, 3, 4];
    query.mockResolvedValue(window.map((id) => ({ id })));
    move.mockImplementation((id: number, { index }: { index: number }) => {
      window.splice(window.indexOf(id), 1);
      window.splice(index, 0, id);
      return Promise.resolve();
    });

    await applyOrder([2, 3, 4, 1], 1);

    // The foreign tab may land anywhere, but the survivors must reach their order.
    expect(window.filter((id) => id !== 99)).toEqual([2, 3, 4, 1]);
  });

  it("does not move empty or single-id order lists", async () => {
    await applyOrder([], 1);
    await applyOrder([1], 1);

    expect(query).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
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

describe("applyPlan — group-aware realize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("realizes a tidy-shaped plan end to end: pinned reorder, two new groups, final block order", async () => {
    const fake = createFakeBrowser([
      { id: 101, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 100, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 26, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 23, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 22, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 25, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 24, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [100, 101, 22, 24, 23, 25, 26],
      groups: [
        { key: "a", title: "Reading", color: "blue", collapsed: false, tabIds: [22, 24] },
        { key: "b", title: "Docs", color: "green", collapsed: true, tabIds: [23, 25] },
      ],
      ungroup: [],
      close: [],
    };

    const result = await applyPlan(plan, 1);

    expect(stripIds(fake.strip)).toEqual([100, 101, 22, 24, 23, 25, 26]);
    expect(result).toEqual({ grouped: 4, groupsCreated: 2, closed: 0 });

    const groupA = fake.strip.find((tab) => tab.id === 22)!.groupId;
    const groupB = fake.strip.find((tab) => tab.id === 23)!.groupId;
    expect(fake.strip.find((tab) => tab.id === 24)!.groupId).toBe(groupA);
    expect(fake.strip.find((tab) => tab.id === 25)!.groupId).toBe(groupB);
    expect(fake.groupMeta.get(groupA)).toEqual({
      title: "Reading",
      color: "blue",
      collapsed: false,
    });
    expect(fake.groupMeta.get(groupB)).toEqual({ title: "Docs", color: "green", collapsed: true });

    // One pinned-region move (101,100 -> 100,101), two group relocations, no
    // move needed for the already-in-place trailing singleton (26).
    expect(fake.move).toHaveBeenCalledTimes(1);
    expect(fake.move).toHaveBeenCalledWith(100, { index: 0 });
    expect(fake.tabGroupsMove).toHaveBeenCalledTimes(2);
    expect(fake.group).toHaveBeenCalledTimes(2);
    expect(fake.tabGroupsUpdate).toHaveBeenCalledTimes(2);
  });

  it("takes the groupless fast path (proven minimal moves) when nothing touches groups", async () => {
    const fake = createFakeBrowser([
      { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 3, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = { order: [1, 2, 3], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    expect(stripIds(fake.strip)).toEqual([1, 2, 3]);
    // n=3, LIS of [2,1,3] by target rank is 2 ([2,3] or [1,3]) -> 1 move.
    expect(fake.move).toHaveBeenCalledTimes(1);
    expect(fake.group).not.toHaveBeenCalled();
    expect(fake.tabGroupsUpdate).not.toHaveBeenCalled();
    expect(fake.tabGroupsMove).not.toHaveBeenCalled();
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("forces the block model when a live group exists even though the plan touches none, drifting the excluded survivor to the end", async () => {
    const fake = createFakeBrowser(
      [
        { id: 1, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 3, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 4, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 5, pinned: false, groupId: 42 },
        { id: 6, pinned: false, groupId: 42 },
      ],
      [{ id: 42, title: "Old", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    // id 4 is deliberately absent from plan.order — it must keep drifting
    // toward the end rather than being targeted by any move.
    const plan: TabPlan = { order: [3, 1, 2, 5, 6], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    expect(stripIds(fake.strip)).toEqual([3, 1, 2, 5, 6, 4]);
    expect(fake.move).toHaveBeenCalledTimes(1);
    expect(fake.move).toHaveBeenCalledWith(3, { index: 0 });
    expect(fake.move).not.toHaveBeenCalledWith(4, expect.anything());
    expect(fake.tabGroupsMove).toHaveBeenCalledTimes(1);
    expect(fake.tabGroupsMove).toHaveBeenCalledWith(42, { index: 3 });
    expect(fake.group).not.toHaveBeenCalled();
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("keeps a live group's members as one contiguous block when plan.order interleaves an unrelated id between them", async () => {
    // A group-agnostic plan (e.g. planWindowOrder's plain sort) can ask for
    // [1, 2, 3] even though tabs 1 and 3 share a live group Chrome always
    // keeps contiguous. The realize layer must not split that group into two
    // rival blocks chasing an interleave Chrome would never allow.
    const fake = createFakeBrowser(
      [
        { id: 1, pinned: false, groupId: 42 },
        { id: 3, pinned: false, groupId: 42 },
        { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 42, title: "G", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = { order: [1, 2, 3], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    // Already at the front, so no relocation is needed — but critically, only
    // ONE decision was made for groupId 42, not two.
    expect(fake.tabGroupsMove).not.toHaveBeenCalled();
    const groupPositions = fake.strip.flatMap((tab, index) => (tab.groupId === 42 ? [index] : []));
    expect(groupPositions).toEqual([0, 1]);
    expect(stripIds(fake.strip)).toEqual([1, 3, 2]);
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("relocates an interleaved live group as its full-width span, not just the order-mentioned member count", async () => {
    const fake = createFakeBrowser(
      [
        { id: 2, pinned: false, groupId: TAB_GROUP_NONE },
        { id: 1, pinned: false, groupId: 42 },
        { id: 3, pinned: false, groupId: 42 },
      ],
      [{ id: 42, title: "G", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = { order: [1, 2, 3], groups: [], ungroup: [], close: [] };
    const result = await applyPlan(plan, 1);

    // The group (both members) relocates to the front in one move; sizing the
    // span at 1 (the old bug) would have left tab 3 behind mid-strip.
    expect(fake.tabGroupsMove).toHaveBeenCalledTimes(1);
    expect(fake.tabGroupsMove).toHaveBeenCalledWith(42, { index: 0 });
    const groupPositions = fake.strip.flatMap((tab, index) => (tab.groupId === 42 ? [index] : []));
    expect(groupPositions).toEqual([0, 1]);
    expect(stripIds(fake.strip)).toEqual([1, 3, 2]);
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("is a full no-op when live groups and order already match the plan exactly", async () => {
    const fake = createFakeBrowser(
      [
        { id: 20, pinned: false, groupId: 555 },
        { id: 21, pinned: false, groupId: 555 },
        { id: 30, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 555, title: "Work", color: "blue", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [20, 21, 30],
      groups: [{ key: "w", title: "Work", color: "blue", collapsed: false, tabIds: [20, 21] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(stripIds(fake.strip)).toEqual([20, 21, 30]);
    expect(fake.move).not.toHaveBeenCalled();
    expect(fake.group).not.toHaveBeenCalled();
    expect(fake.tabGroupsUpdate).not.toHaveBeenCalled();
    expect(fake.tabGroupsMove).not.toHaveBeenCalled();
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("adds a missing member to a matched live group and updates it by its live groupId", async () => {
    const fake = createFakeBrowser(
      [
        { id: 50, pinned: false, groupId: 888 },
        { id: 51, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 888, title: "Old", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [],
      groups: [{ key: "g", title: "NewTitle", color: "red", collapsed: true, tabIds: [50, 51] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(fake.group).toHaveBeenCalledTimes(1);
    expect(fake.group).toHaveBeenCalledWith({ tabIds: [51], groupId: 888 });
    expect(fake.tabGroupsUpdate).toHaveBeenCalledTimes(1);
    expect(fake.tabGroupsUpdate).toHaveBeenCalledWith(888, {
      title: "NewTitle",
      color: "red",
      collapsed: true,
    });
    expect(fake.strip.find((tab) => tab.id === 51)!.groupId).toBe(888);
    expect(result).toEqual({ grouped: 1, groupsCreated: 0, closed: 0 });
  });

  it("excludes a currently-pinned id from tabs.group even though the plan still lists it", async () => {
    // The plan was built before tab 7 was pinned; runGroups' own fresh strip
    // query reads it as pinned, so it must never reach tabs.group() (which
    // would silently unpin it — CONTEXT.md's grouping-unpins gotcha).
    const fake = createFakeBrowser([
      { id: 7, pinned: true, groupId: TAB_GROUP_NONE },
      { id: 8, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [],
      groups: [{ key: "a", title: "T", color: "blue", collapsed: false, tabIds: [7, 8] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(fake.group).toHaveBeenCalledTimes(1);
    expect(fake.group).toHaveBeenCalledWith({ tabIds: [8] });
    expect(fake.strip.find((tab) => tab.id === 7)!.groupId).toBe(TAB_GROUP_NONE);
    expect(fake.strip.find((tab) => tab.id === 7)!.pinned).toBe(true);
    expect(result).toEqual({ grouped: 1, groupsCreated: 1, closed: 0 });
  });

  it("drops a GroupSpec entirely when every listed id is currently pinned", async () => {
    const fake = createFakeBrowser([{ id: 7, pinned: true, groupId: TAB_GROUP_NONE }]);
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [],
      groups: [{ key: "a", title: "T", color: "blue", collapsed: false, tabIds: [7] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(fake.group).not.toHaveBeenCalled();
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("drops a fully-vanished GroupSpec and filters a partially-vanished one to its survivors", async () => {
    const fake = createFakeBrowser([{ id: 60, pinned: false, groupId: TAB_GROUP_NONE }]);
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [],
      groups: [
        { key: "gone", title: "Gone", color: "grey", collapsed: false, tabIds: [9001] },
        { key: "partial", title: "Partial", color: "yellow", collapsed: false, tabIds: [9002, 60] },
      ],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(fake.group).toHaveBeenCalledTimes(1);
    expect(fake.group).toHaveBeenCalledWith({ tabIds: [60] });
    expect(result).toEqual({ grouped: 1, groupsCreated: 1, closed: 0 });

    const gid = fake.strip.find((tab) => tab.id === 60)!.groupId;
    expect(fake.tabGroupsUpdate).toHaveBeenCalledWith(gid, {
      title: "Partial",
      color: "yellow",
      collapsed: false,
    });
  });

  it("reorders members within an already-matched live group before any block relocation", async () => {
    const fake = createFakeBrowser(
      [
        { id: 42, pinned: false, groupId: 777 },
        { id: 41, pinned: false, groupId: 777 },
        { id: 9, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 777, title: "T", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = {
      order: [41, 42, 9],
      groups: [{ key: "g", title: "T", color: "grey", collapsed: false, tabIds: [41, 42] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    // Membership and metadata already matched, so the reorder is pure order-phase
    // work: one move inside the group's span, no group/tabGroups.move calls.
    expect(fake.group).not.toHaveBeenCalled();
    expect(fake.tabGroupsUpdate).not.toHaveBeenCalled();
    expect(fake.tabGroupsMove).not.toHaveBeenCalled();
    expect(fake.move).toHaveBeenCalledTimes(1);
    expect(fake.move).toHaveBeenCalledWith(41, { index: 0 });
    expect(stripIds(fake.strip)).toEqual([41, 42, 9]);
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
  });

  it("ungroups only the surviving currently-grouped ids in one batch call", async () => {
    const fake = createFakeBrowser(
      [
        { id: 70, pinned: false, groupId: 999 },
        { id: 71, pinned: false, groupId: TAB_GROUP_NONE },
      ],
      [{ id: 999, title: "G", color: "grey", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    const plan: TabPlan = { order: [], groups: [], ungroup: [70, 71, 9999], close: [] };
    await applyPlan(plan, 1);

    expect(fake.ungroup).toHaveBeenCalledTimes(1);
    expect(fake.ungroup).toHaveBeenCalledWith([70]);
    expect(fake.strip.find((tab) => tab.id === 70)!.groupId).toBe(TAB_GROUP_NONE);
  });

  it("issues no ungroup call when every requested id is already ungrouped or vanished", async () => {
    const fake = createFakeBrowser([{ id: 71, pinned: false, groupId: TAB_GROUP_NONE }]);
    vi.stubGlobal("browser", fake.browser);

    await applyPlan({ order: [], groups: [], ungroup: [9999, 71], close: [] }, 1);

    expect(fake.ungroup).not.toHaveBeenCalled();
  });

  it("closes only the surviving requested ids", async () => {
    const fake = createFakeBrowser([
      { id: 80, pinned: false, groupId: TAB_GROUP_NONE },
      { id: 81, pinned: false, groupId: TAB_GROUP_NONE },
    ]);
    vi.stubGlobal("browser", fake.browser);

    const result = await applyPlan({ order: [], groups: [], ungroup: [], close: [80, 9999] }, 1);

    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledWith([80]);
    expect(result.closed).toBe(1);
    expect(stripIds(fake.strip)).toEqual([81]);
  });

  it("issues no remove call and reports zero closed when every close id already vanished", async () => {
    const fake = createFakeBrowser([{ id: 90, pinned: false, groupId: TAB_GROUP_NONE }]);
    vi.stubGlobal("browser", fake.browser);

    const result = await applyPlan({ order: [], groups: [], ungroup: [], close: [9999] }, 1);

    expect(fake.remove).not.toHaveBeenCalled();
    expect(result.closed).toBe(0);
    expect(stripIds(fake.strip)).toEqual([90]);
  });

  it("drops id-less tabs from the live strip every phase re-derives (getLiveStrip)", async () => {
    const rawQuery = vi
      .fn()
      .mockResolvedValue([{ id: 1 }, { url: "https://no-id.test" }, { id: 2, pinned: false }]);
    const rawMove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
      tabs: { query: rawQuery, move: rawMove },
      tabGroups: { query: vi.fn().mockResolvedValue([]) },
    });

    const result = await applyPlan({ order: [2, 1], groups: [], ungroup: [], close: [] }, 1);

    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
    expect(rawMove).toHaveBeenCalledTimes(1);
    expect(rawMove).toHaveBeenCalledWith(2, { index: 0 });
  });

  it("falls back to an empty title when a live group's title is undefined", async () => {
    const groupsQuery = vi.fn().mockResolvedValue([{ id: 5, color: "grey", collapsed: false }]);
    const tabsQuery = vi.fn().mockResolvedValue([{ id: 10, pinned: false, groupId: 5 }]);
    const tabGroupsUpdate = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
      tabs: { query: tabsQuery },
      tabGroups: { query: groupsQuery, update: tabGroupsUpdate },
    });

    // Full membership match (live [10] vs desired [10]) but the live group's
    // title reads as "" (fallback), which differs from "New" -> update only.
    const plan: TabPlan = {
      order: [],
      groups: [{ key: "g", title: "New", color: "blue", collapsed: false, tabIds: [10] }],
      ungroup: [],
      close: [],
    };
    const result = await applyPlan(plan, 1);

    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
    expect(tabGroupsUpdate).toHaveBeenCalledWith(5, {
      title: "New",
      color: "blue",
      collapsed: false,
    });
  });

  it("leaves every tab's position alone when plan.order is empty (the dedupe case)", async () => {
    const fake = createFakeBrowser(
      [5, 3, 1, 2, 4].map((id) => ({ id, pinned: false, groupId: TAB_GROUP_NONE })),
    );
    vi.stubGlobal("browser", fake.browser);

    const result = await applyPlan({ order: [], groups: [], ungroup: [], close: [] }, 1);

    expect(fake.move).not.toHaveBeenCalled();
    expect(fake.tabGroupsMove).not.toHaveBeenCalled();
    expect(fake.group).not.toHaveBeenCalled();
    expect(stripIds(fake.strip)).toEqual([5, 3, 1, 2, 4]);
    expect(result).toEqual({ grouped: 0, groupsCreated: 0, closed: 0 });
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

describe("applyPlan — windowId threading (focus-change regression)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every mutation scoped to the windowId resolved before the action started, even if the focused window changes before applyPlan's queries run", async () => {
    // Two independent windows with disjoint tab-id ranges, so a scoping bug
    // (a query or move leaking onto the wrong window) is immediately visible
    // in the final strips rather than silently no-op'ing.
    const windowA = 1;
    const windowB = 2;
    const strips = new Map<number, FakeStripTab[]>([
      [
        windowA,
        [
          { id: 11, pinned: false, groupId: TAB_GROUP_NONE },
          { id: 12, pinned: false, groupId: TAB_GROUP_NONE },
          { id: 13, pinned: false, groupId: TAB_GROUP_NONE },
        ],
      ],
      [windowB, [{ id: 21, pinned: false, groupId: TAB_GROUP_NONE }]],
    ]);
    let focusedWindowId = windowA;

    const tabsQuery = vi.fn((queryInfo: { windowId?: number }) => {
      const strip = strips.get(queryInfo.windowId!) ?? [];
      return Promise.resolve(
        strip.map((tab) => ({ id: tab.id, pinned: tab.pinned, groupId: tab.groupId })),
      );
    });
    const tabsMove = vi.fn((id: number, { index }: { index: number }) => {
      for (const strip of strips.values()) {
        const from = strip.findIndex((tab) => tab.id === id);
        if (from !== -1) {
          // from !== -1 guarantees the splice yields exactly one tab.
          const [tab] = strip.splice(from, 1);
          strip.splice(index, 0, tab!);
          break;
        }
      }
      return Promise.resolve();
    });
    const tabGroupsQuery = vi.fn().mockResolvedValue([]);
    const windowsGetCurrent = vi.fn(() => Promise.resolve({ id: focusedWindowId }));

    vi.stubGlobal("browser", {
      windows: { getCurrent: windowsGetCurrent },
      tabs: { query: tabsQuery, move: tabsMove },
      tabGroups: { query: tabGroupsQuery },
    });

    const plan: TabPlan = { order: [13, 11, 12], groups: [], ungroup: [], close: [] };

    // orchestration.ts already resolved windowA before calling applyPlan; a
    // hotkey (background.ts) or any other focus change flips the OS-level
    // focused window to B before applyPlan's own queries run.
    focusedWindowId = windowB;
    await applyPlan(plan, windowA);

    // applyPlan never falls back to an ambient "current window" resolution.
    expect(windowsGetCurrent).not.toHaveBeenCalled();
    for (const call of tabsQuery.mock.calls) {
      expect(call[0]).toEqual({ windowId: windowA });
    }

    expect(strips.get(windowA)!.map((tab) => tab.id)).toEqual(plan.order);
    expect(strips.get(windowB)!.map((tab) => tab.id)).toEqual([21]);
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
