import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assignColor } from "@tab-sorter/core/domain";
import { saveMutationHistory } from "./mutation-history";
import { executeMutation, getMutationState, isMutationIntent } from "./mutation";
import { commitPrefsPatch } from "./storage";
import { TAB_GROUP_NONE } from "@tab-sorter/core/types";
import type { GroupColor, WindowSnapshot } from "@tab-sorter/core/types";

interface FakeTab {
  id: number;
  url: string;
  pendingUrl?: string;
  title: string;
  pinned: boolean;
  groupId: number;
}

interface FakeGroup {
  id: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

interface FakeQueryTab extends Omit<FakeTab, "id"> {
  id?: number;
  index: number;
  windowId: number;
}

function createBrowser(initialTabs: FakeTab[], initialGroups: FakeGroup[] = []) {
  const tabs = initialTabs.map((tab) => ({ ...tab }));
  const groups = new Map(
    initialGroups.map((group) => [
      group.id,
      { title: group.title, color: group.color, collapsed: group.collapsed },
    ]),
  );
  let nextGroupId = Math.max(0, ...initialGroups.map((group) => group.id)) + 1;
  let nextTabId = Math.max(99, ...initialTabs.map((tab) => tab.id)) + 1;

  const query = vi.fn(
    (_queryInfo?: { windowId?: number }): Promise<FakeQueryTab[]> =>
      Promise.resolve(tabs.map((tab, index) => Object.assign({}, tab, { index, windowId: 7 }))),
  );
  const move = vi.fn((id: number, options: { index: number; windowId?: number }) => {
    if (options.windowId !== undefined) {
      tabs.splice(
        tabs.findIndex((tab) => tab.id === id),
        1,
      );
      return Promise.resolve();
    }

    const from = tabs.findIndex((tab) => tab.id === id);
    const [tab] = tabs.splice(from, 1);
    tabs.splice(options.index, 0, tab!);
    return Promise.resolve();
  });
  const group = vi.fn(
    ({ tabIds, groupId }: { tabIds: number[]; groupId?: number }): Promise<number> => {
      const resolvedGroupId = groupId ?? nextGroupId++;
      if (groupId === undefined) {
        groups.set(resolvedGroupId, { title: "", color: "grey", collapsed: false });
      }

      const currentMembers = tabs.filter((tab) => tab.groupId === resolvedGroupId);
      const incoming = tabIds
        .filter((id) => !currentMembers.some((tab) => tab.id === id))
        .map((id) => tabs.find((tab) => tab.id === id)!);
      const members = [...currentMembers, ...incoming];
      const memberIds = new Set(members.map((tab) => tab.id));
      const firstIndex = Math.min(...members.map((tab) => tabs.indexOf(tab)));
      const rest = tabs.filter((tab) => !memberIds.has(tab.id));
      const insertAt = rest.filter((tab) => tabs.indexOf(tab) < firstIndex).length;

      members.forEach((tab) => {
        tab.groupId = resolvedGroupId;
      });
      rest.splice(insertAt, 0, ...members);
      tabs.splice(0, tabs.length, ...rest);

      return Promise.resolve(resolvedGroupId);
    },
  );
  const update = vi.fn(
    (
      groupId: number,
      patch: { title: string; color: GroupColor; collapsed: boolean },
    ): Promise<void> => {
      groups.set(groupId, patch);
      return Promise.resolve();
    },
  );
  const moveGroup = vi.fn((groupId: number, { index }: { index: number }): Promise<void> => {
    const members = tabs.filter((tab) => tab.groupId === groupId);
    const rest = tabs.filter((tab) => tab.groupId !== groupId);
    rest.splice(index, 0, ...members);
    tabs.splice(0, tabs.length, ...rest);
    return Promise.resolve();
  });
  const remove = vi.fn((ids: number | number[]): Promise<void> => {
    const removed = new Set(Array.isArray(ids) ? ids : [ids]);
    tabs.splice(0, tabs.length, ...tabs.filter((tab) => !removed.has(tab.id)));
    return Promise.resolve();
  });
  const ungroup = vi.fn((ids: number[]): Promise<void> => {
    const ungrouped = new Set(ids);
    for (const tab of tabs) {
      if (ungrouped.has(tab.id)) {
        tab.groupId = TAB_GROUP_NONE;
      }
    }

    return Promise.resolve();
  });
  const create = vi.fn(
    ({ active: _active, url, windowId }: { active: boolean; url: string; windowId: number }) => {
      const tab: FakeTab = {
        id: nextTabId++,
        url,
        title: url,
        pinned: false,
        groupId: TAB_GROUP_NONE,
      };
      tabs.push(tab);

      return Promise.resolve({ ...tab, index: tabs.length - 1, windowId });
    },
  );

  return {
    tabs,
    groups,
    browser: {
      storage: fakeBrowser.storage,
      windows: {
        create: vi.fn(({ tabId }: { tabId: number }) => {
          tabs.splice(
            tabs.findIndex((tab) => tab.id === tabId),
            1,
          );
          return Promise.resolve({ id: 8 });
        }),
      },
      tabs: {
        query,
        move,
        create,
        group,
        ungroup,
        remove,
      },
      tabGroups: {
        query: vi.fn(() =>
          Promise.resolve(
            [...new Set(tabs.map((tab) => tab.groupId))]
              .filter((groupId) => groupId !== TAB_GROUP_NONE)
              .map((groupId) => Object.assign({ id: groupId }, groups.get(groupId)!)),
          ),
        ),
        update,
        move: moveGroup,
      },
    },
  };
}

function snapshot(
  tabs: WindowSnapshot["tabs"],
  groups: WindowSnapshot["groups"] = [],
): WindowSnapshot {
  return { windowId: 7, tabs, groups, savedAt: 1 };
}

describe("executeMutation", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes raw capture fields and drops tabs without ids", async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { url: "https://missing-id.example" },
        { id: 1, url: "https://one.example" },
        { id: 2 },
      ]);
    vi.stubGlobal("browser", {
      storage: fakeBrowser.storage,
      tabs: { query },
      tabGroups: {
        query: vi.fn().mockResolvedValue([{ id: 4, color: "grey", collapsed: false }]),
      },
    });

    await expect(executeMutation({ type: "dedupe", windowId: 7 })).resolves.toEqual({
      type: "dedupe",
      changed: false,
      duplicates: 0,
      closed: 0,
    });
    expect(query).toHaveBeenCalledWith({ windowId: 7 });
  });

  it("records sort history from final state so undo restores the original order", async () => {
    const fake = createBrowser([
      {
        id: 2,
        url: "https://b.example",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 1,
        url: "https://a.example",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await expect(executeMutation({ type: "sort", windowId: 7 })).resolves.toEqual({
      type: "sort",
      changed: true,
      moved: 2,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 2]);

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toEqual({
      type: "undo",
      changed: true,
      undone: true,
      restored: 2,
      reopened: 0,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([2, 1]);
  });

  it("records a tab that vanishes during realization as an observed change", async () => {
    const fake = createBrowser([
      {
        id: 2,
        url: "https://b.example",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 1,
        url: "https://a.example",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    fake.browser.tabs.move.mockImplementationOnce((id: number) => {
      fake.tabs.splice(
        fake.tabs.findIndex((tab) => tab.id === id),
        1,
      );

      return Promise.resolve();
    });

    await expect(executeMutation({ type: "sort", windowId: 7, mode: "title" })).resolves.toEqual({
      type: "sort",
      changed: true,
      moved: 0,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([2]);
    await expect(getMutationState(7)).resolves.toMatchObject({ canUndo: true });
  });

  it.each([
    {
      label: "new",
      beforeGroups: [],
    },
    {
      label: "existing",
      beforeGroups: [{ id: 99, title: "Racing", color: "grey" as const, collapsed: false }],
    },
  ])("ignores a $label group row with no captured members", async ({ beforeGroups }) => {
    const fake = createBrowser([
      {
        id: 2,
        url: "https://b.example",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 1,
        url: "https://a.example",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    const racingGroup = { id: 99, title: "Racing", color: "grey" as const, collapsed: false };
    fake.browser.tabGroups.query
      .mockResolvedValueOnce(beforeGroups)
      .mockResolvedValueOnce([racingGroup]);

    await expect(executeMutation({ type: "sort", windowId: 7 })).resolves.toMatchObject({
      type: "sort",
      changed: true,
    });
  });

  it("preserves the prior undo snapshot after a no-op mutation", async () => {
    const fake = createBrowser([
      {
        id: 2,
        url: "https://b.example",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 1,
        url: "https://a.example",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await executeMutation({ type: "sort", windowId: 7, mode: "title" });
    await expect(executeMutation({ type: "sort", windowId: 7, mode: "title" })).resolves.toEqual({
      type: "sort",
      changed: false,
      moved: 0,
    });

    await executeMutation({ type: "undo", windowId: 7 });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([2, 1]);
  });

  it("creates a new tidy group when a same-title manual group has zero member overlap", async () => {
    const fake = createBrowser(
      [
        {
          id: 90,
          url: "https://manual.example/one",
          title: "Manual one",
          pinned: false,
          groupId: 9,
        },
        {
          id: 91,
          url: "https://manual.example/two",
          title: "Manual two",
          pinned: false,
          groupId: 9,
        },
        {
          id: 1,
          url: "https://work.example/a",
          title: "Alpha",
          pinned: false,
          groupId: TAB_GROUP_NONE,
        },
        {
          id: 2,
          url: "https://work.example/b",
          title: "Beta",
          pinned: false,
          groupId: TAB_GROUP_NONE,
        },
      ],
      [{ id: 9, title: "work.example", color: "red", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);

    await expect(executeMutation({ type: "tidy", windowId: 7 })).resolves.toEqual({
      type: "tidy",
      changed: true,
      moved: 0,
      grouped: 2,
      groupsCreated: 1,
      createdGroups: [{ title: "work.example", color: assignColor("work.example") }],
    });

    expect(fake.tabs.find((tab) => tab.id === 90)!.groupId).toBe(9);
    expect(fake.tabs.find((tab) => tab.id === 91)!.groupId).toBe(9);
    expect(fake.groups.get(9)).toEqual({
      title: "work.example",
      color: "red",
      collapsed: false,
    });

    const newGroupId = fake.tabs.find((tab) => tab.id === 1)!.groupId;
    expect(newGroupId).not.toBe(9);
    expect(fake.tabs.find((tab) => tab.id === 2)!.groupId).toBe(newGroupId);
  });

  it("measures a desired group member that vanishes during grouping", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://work.example/b",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    fake.browser.tabs.group.mockImplementationOnce(({ tabIds }: { tabIds: number[] }) => {
      const surviving = fake.tabs.find((tab) => tab.id === tabIds[0]);
      if (surviving !== undefined) {
        surviving.groupId = 10;
      }
      fake.tabs.splice(
        fake.tabs.findIndex((tab) => tab.id === tabIds[1]),
        1,
      );
      fake.groups.set(10, { title: "", color: "grey", collapsed: false });

      return Promise.resolve(10);
    });

    await expect(executeMutation({ type: "tidy", windowId: 7 })).resolves.toMatchObject({
      type: "tidy",
      changed: true,
      grouped: 1,
      groupsCreated: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1]);
  });

  it("records and undoes a metadata-only group change", async () => {
    const fake = createBrowser(
      [
        {
          id: 1,
          url: "https://work.example/a",
          title: "Alpha",
          pinned: false,
          groupId: 9,
        },
        {
          id: 2,
          url: "https://work.example/b",
          title: "Beta",
          pinned: false,
          groupId: 9,
        },
      ],
      [{ id: 9, title: "Manual", color: "red", collapsed: true }],
    );
    vi.stubGlobal("browser", fake.browser);
    await commitPrefsPatch({ regroupExisting: true });

    await expect(executeMutation({ type: "tidy", windowId: 7 })).resolves.toEqual({
      type: "tidy",
      changed: true,
      moved: 0,
      grouped: 0,
      groupsCreated: 0,
      createdGroups: [],
    });
    expect(fake.groups.get(9)).toEqual({
      title: "work.example",
      color: assignColor("work.example"),
      collapsed: false,
    });

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      undone: true,
    });
    expect(fake.groups.get(9)).toEqual({
      title: "Manual",
      color: "red",
      collapsed: true,
    });
  });

  it("records a tidy that only ungroups a leftover tab", async () => {
    const fake = createBrowser(
      [
        {
          id: 1,
          url: "https://solo.example",
          title: "Solo",
          pinned: false,
          groupId: 9,
        },
      ],
      [{ id: 9, title: "Manual", color: "red", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);
    await commitPrefsPatch({ regroupExisting: true });

    await expect(executeMutation({ type: "tidy", windowId: 7 })).resolves.toMatchObject({
      type: "tidy",
      changed: true,
      grouped: 0,
      groupsCreated: 0,
    });
    expect(fake.tabs[0]?.groupId).toBe(TAB_GROUP_NONE);

    await executeMutation({ type: "undo", windowId: 7 });
    const restoredGroupId = fake.tabs[0]?.groupId;
    expect(restoredGroupId).not.toBe(TAB_GROUP_NONE);
    expect(fake.groups.get(restoredGroupId!)).toEqual({
      title: "Manual",
      color: "red",
      collapsed: false,
    });
  });

  it("measures an ungroup target that vanishes during the operation", async () => {
    const fake = createBrowser(
      [
        {
          id: 1,
          url: "https://solo.example",
          title: "Solo",
          pinned: false,
          groupId: 9,
        },
      ],
      [{ id: 9, title: "Manual", color: "red", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);
    await commitPrefsPatch({ regroupExisting: true });
    fake.browser.tabs.ungroup.mockImplementationOnce((ids: number[]) => {
      fake.tabs.splice(
        fake.tabs.findIndex((tab) => tab.id === ids[0]),
        1,
      );

      return Promise.resolve();
    });

    await expect(executeMutation({ type: "tidy", windowId: 7 })).resolves.toMatchObject({
      type: "tidy",
      changed: true,
      grouped: 0,
      groupsCreated: 0,
    });
    expect(fake.tabs).toEqual([]);
  });

  it("undoes dedupe by reopening into the target window and remapping the stale id", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await expect(executeMutation({ type: "dedupe", windowId: 7 })).resolves.toEqual({
      type: "dedupe",
      changed: true,
      duplicates: 1,
      closed: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1]);

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toEqual({
      type: "undo",
      changed: true,
      undone: true,
      restored: 2,
      reopened: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);
    expect(fake.browser.tabs.create).toHaveBeenCalledWith({
      active: false,
      url: "https://dup.example/page",
      windowId: 7,
    });
  });

  it("keeps undo reversible across repeated close and reopen cycles", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await executeMutation({ type: "dedupe", windowId: 7 });
    await executeMutation({ type: "undo", windowId: 7 });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      undone: true,
      reopened: 0,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1]);

    await executeMutation({ type: "undo", windowId: 7 });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 101]);

    await executeMutation({ type: "undo", windowId: 7 });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1]);
  });

  it("adopts a reopened tab after failure instead of creating a duplicate on retry", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    await executeMutation({ type: "dedupe", windowId: 7 });
    fake.browser.tabs.create.mockImplementationOnce(
      ({ url, windowId: _windowId }: { active: boolean; url: string; windowId: number }) => {
        fake.tabs.push({
          id: 100,
          url: "",
          pendingUrl: url,
          title: url,
          pinned: false,
          groupId: TAB_GROUP_NONE,
        });

        return Promise.reject(new Error("worker stopped after create"));
      },
    );

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toThrow(
      "worker stopped after create",
    );
    await expect(getMutationState(7)).resolves.toEqual({
      canUndo: true,
      recoveryRequired: true,
    });

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      undone: true,
      reopened: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);
    expect(fake.browser.tabs.create).toHaveBeenCalledTimes(1);
  });

  it("retries creation when an interrupted attempt left no candidate", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    await executeMutation({ type: "dedupe", windowId: 7 });
    fake.browser.tabs.create.mockRejectedValueOnce(new Error("create stopped before commit"));

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toThrow(
      "create stopped before commit",
    );
    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      reopened: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);
    expect(fake.browser.tabs.create).toHaveBeenCalledTimes(2);
  });

  it("keeps recovery pending when Chrome omits the created tab id", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    await executeMutation({ type: "dedupe", windowId: 7 });
    fake.browser.tabs.create.mockResolvedValueOnce({} as never);

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toMatchObject({
      code: "MUTATION_FAILED",
    });
    await expect(getMutationState(7)).resolves.toMatchObject({ recoveryRequired: true });
  });

  it("clears a stale reopen marker for a target with no URL", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://keep.example",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    const before = snapshot([
      {
        id: 1,
        url: "https://keep.example",
        index: 0,
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    const recoverTo = snapshot([
      ...before.tabs,
      {
        id: 2,
        url: "",
        index: 1,
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    await saveMutationHistory(7, {
      pending: {
        before: { snapshot: before, close: [] },
        recoverTo: { snapshot: recoverTo, close: [] },
        reopening: 2,
        startedAt: 1,
      },
    });

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toEqual({
      type: "undo",
      changed: false,
      undone: false,
      restored: 1,
      reopened: 0,
    });
    await expect(getMutationState(7)).resolves.toEqual({
      canUndo: false,
      recoveryRequired: false,
    });
  });

  it("refuses ambiguous reopen adoption instead of claiming a user tab", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://dup.example/page",
        title: "Keep",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://dup.example/page",
        title: "Duplicate",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    await executeMutation({ type: "dedupe", windowId: 7 });
    fake.browser.tabs.create.mockImplementationOnce(
      ({ url }: { active: boolean; url: string; windowId: number }) => {
        fake.tabs.push({
          id: 100,
          url: "",
          pendingUrl: url,
          title: url,
          pinned: false,
          groupId: TAB_GROUP_NONE,
        });

        return Promise.reject(new Error("worker stopped after create"));
      },
    );

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toThrow(
      "worker stopped after create",
    );
    fake.tabs.push({
      id: 101,
      url: "https://dup.example/page",
      title: "User tab",
      pinned: false,
      groupId: TAB_GROUP_NONE,
    });

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toMatchObject({
      code: "RECOVERY_AMBIGUOUS",
    });
    expect(fake.browser.tabs.create).toHaveBeenCalledTimes(1);
    await expect(getMutationState(7)).resolves.toMatchObject({ recoveryRequired: true });
  });

  it("reuses a persisted id map when realization fails after reopening", async () => {
    const fake = createBrowser(
      [
        {
          id: 1,
          url: "https://dup.example/page",
          title: "Keep",
          pinned: false,
          groupId: 9,
        },
        {
          id: 2,
          url: "https://dup.example/page",
          title: "Duplicate",
          pinned: false,
          groupId: 9,
        },
      ],
      [{ id: 9, title: "Saved", color: "blue", collapsed: false }],
    );
    vi.stubGlobal("browser", fake.browser);
    await executeMutation({ type: "dedupe", windowId: 7 });
    fake.browser.tabs.group.mockImplementationOnce(
      ({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
        for (const tabId of tabIds) {
          const tab = fake.tabs.find((candidate) => candidate.id === tabId);
          if (tab !== undefined) {
            tab.groupId = groupId ?? 9;
          }
        }

        return Promise.reject(new Error("group failed after applying"));
      },
    );

    await expect(executeMutation({ type: "undo", windowId: 7 })).rejects.toThrow(
      "group failed after applying",
    );
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      undone: true,
      reopened: 1,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([1, 100]);
    expect(fake.browser.tabs.create).toHaveBeenCalledTimes(1);
  });

  it("extracts matching tabs through the background executor without creating undo history", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 2,
        url: "https://work.example/b",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 3,
        url: "https://other.example",
        title: "Other",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "work.example" },
      }),
    ).resolves.toEqual({
      type: "extract",
      changed: true,
      moved: 2,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([3]);

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      undone: false,
    });
  });

  it("observes extraction when moving every tab closes the source window", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    fake.browser.tabs.query.mockImplementation((queryInfo?: { windowId?: number }) => {
      if (queryInfo?.windowId === 7 && fake.tabs.length === 0) {
        return Promise.reject(new Error("No window with id: 7"));
      }

      if (queryInfo?.windowId === undefined) {
        return Promise.resolve([
          {
            id: 1,
            url: "https://work.example/a",
            title: "Alpha",
            pinned: false,
            groupId: TAB_GROUP_NONE,
            index: 0,
            windowId: 8,
          },
          {
            url: "",
            title: "",
            pinned: false,
            groupId: TAB_GROUP_NONE,
            index: 0,
            windowId: 7,
          },
        ]);
      }

      return Promise.resolve(
        fake.tabs.map((tab, index) =>
          Object.assign({}, tab, { index, windowId: queryInfo.windowId ?? 7 }),
        ),
      );
    });

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "work.example" },
      }),
    ).resolves.toEqual({
      type: "extract",
      changed: true,
      moved: 1,
    });
  });

  it("uses the shared regex surface and no-ops on an invalid pattern", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "regex", source: "[" },
      }),
    ).resolves.toEqual({
      type: "extract",
      changed: false,
      moved: 0,
    });
    expect(fake.browser.windows.create).not.toHaveBeenCalled();
  });

  it("can extract a pinned regex match when the preference allows it", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: true,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    await commitPrefsPatch({ ignorePinned: false });

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "regex", source: "alpha", flags: "i" },
      }),
    ).resolves.toEqual({
      type: "extract",
      changed: true,
      moved: 1,
    });
  });

  it("reports observed no-op when a matching extraction cannot create a window", async () => {
    const fake = createBrowser([
      {
        id: 1,
        url: "https://work.example/a",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    fake.browser.windows.create.mockResolvedValueOnce(undefined as never);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "work.example" },
      }),
    ).resolves.toEqual({
      type: "extract",
      changed: false,
      moved: 0,
    });
  });

  it("leaves a recoverable journal after failure and blocks later mutations until undo", async () => {
    const fake = createBrowser([
      {
        id: 2,
        url: "https://b.example",
        title: "Beta",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
      {
        id: 1,
        url: "https://a.example",
        title: "Alpha",
        pinned: false,
        groupId: TAB_GROUP_NONE,
      },
    ]);
    vi.stubGlobal("browser", fake.browser);
    fake.browser.tabs.move.mockImplementationOnce(
      (id: number, { index }: { index: number }): Promise<void> => {
        const from = fake.tabs.findIndex((tab) => tab.id === id);
        const [tab] = fake.tabs.splice(from, 1);

        if (tab !== undefined) {
          fake.tabs.splice(index, 0, tab);
        }

        return Promise.reject(new Error("move failed after applying"));
      },
    );

    await expect(executeMutation({ type: "sort", windowId: 7, mode: "title" })).rejects.toThrow(
      "move failed after applying",
    );
    await expect(getMutationState(7)).resolves.toEqual({
      canUndo: true,
      recoveryRequired: true,
    });
    await expect(executeMutation({ type: "tidy", windowId: 7 })).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });

    await expect(executeMutation({ type: "undo", windowId: 7 })).resolves.toMatchObject({
      type: "undo",
      changed: true,
      undone: true,
    });
    expect(fake.tabs.map((tab) => tab.id)).toEqual([2, 1]);
    await expect(getMutationState(7)).resolves.toEqual({
      canUndo: true,
      recoveryRequired: false,
    });
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { type: "sort" },
    { type: "sort", windowId: "7" },
    { type: "sort", windowId: -1 },
    { type: "sort", windowId: 7.5 },
    { type: "sort", windowId: 7, mode: null },
    { type: "sort", windowId: 7, mode: "random" },
    { type: "tidy", windowId: 7, extra: true },
    { type: "unknown", windowId: 7 },
    { type: "extract", windowId: 7, matcher: null },
    { type: "extract", windowId: 7, matcher: {} },
    { type: "extract", windowId: 7, matcher: { type: 1 } },
    { type: "extract", windowId: 7, matcher: { type: "domain", domain: 1 } },
    { type: "extract", windowId: 7, matcher: { type: "domain", domain: "" } },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example", extra: true },
    },
    { type: "extract", windowId: 7, matcher: { type: "regex" } },
    { type: "extract", windowId: 7, matcher: { type: "regex", source: 2 } },
    { type: "extract", windowId: 7, matcher: { type: "regex", source: "x", flags: 2 } },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "regex", source: "x", extra: true },
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example" },
      scope: "planet",
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example" },
      scope: null,
    },
  ])("rejects an invalid runtime intent: %j", async (intent) => {
    await expect(executeMutation(intent as unknown)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it.each([
    { type: "sort", windowId: 0 },
    { type: "sort", windowId: 7, mode: "title" },
    { type: "sort", windowId: 7, mode: "domain" },
    { type: "tidy", windowId: 7 },
    { type: "dedupe", windowId: 7 },
    { type: "undo", windowId: 7 },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example" },
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "regex", source: "work" },
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "regex", source: "work", flags: "i" },
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example" },
      scope: "all",
    },
    {
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "work.example" },
      scope: "window",
    },
  ])("accepts a valid runtime intent: %j", (intent) => {
    expect(isMutationIntent(intent)).toBe(true);
  });
});

describe("mutation queue", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs one FIFO per window while allowing different windows to start", async () => {
    const waiting: Array<{
      windowId: number;
      resolve: (tabs: []) => void;
    }> = [];
    const query = vi.fn(
      ({ windowId }: { windowId: number }) =>
        new Promise<[]>((resolve) => {
          waiting.push({ windowId, resolve });
        }),
    );
    vi.stubGlobal("browser", {
      storage: fakeBrowser.storage,
      tabs: { query },
      tabGroups: { query: vi.fn(() => Promise.resolve([])) },
    });

    const first = executeMutation({ type: "dedupe", windowId: 11 });
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    const second = executeMutation({ type: "dedupe", windowId: 11 });
    await Promise.resolve();
    expect(waiting).toHaveLength(1);

    waiting[0]!.resolve([]);
    await first;
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    waiting[1]!.resolve([]);
    await second;

    const left = executeMutation({ type: "dedupe", windowId: 12 });
    const right = executeMutation({ type: "dedupe", windowId: 13 });
    await vi.waitFor(() => expect(waiting).toHaveLength(4));
    expect(
      waiting
        .slice(2)
        .map(({ windowId }) => windowId)
        .toSorted(),
    ).toEqual([12, 13]);
    waiting[2]!.resolve([]);
    waiting[3]!.resolve([]);
    await Promise.all([left, right]);
  });
});

interface WinTab {
  id?: number;
  url: string;
  title?: string;
  pinned?: boolean;
  windowId?: number;
  active?: boolean;
  windowType?: "normal" | "popup";
}

function pendingHistory(windowId: number) {
  return {
    pending: {
      before: {
        snapshot: { windowId, tabs: [], groups: [], savedAt: 1 },
        close: [],
      },
      startedAt: 1,
    },
  };
}

function stubMultiWindow(initial: WinTab[]) {
  const tabs = initial.map((tab) => ({ ...tab }));
  let nextWindowId = 200;

  const query = vi.fn((info?: { windowId?: number; windowType?: string }) => {
    let result = tabs;
    if (info?.windowType === "normal") {
      result = result.filter((tab) => (tab.windowType ?? "normal") === "normal");
    }
    if (info?.windowId !== undefined) {
      result = result.filter((tab) => tab.windowId === info.windowId);
    }

    return Promise.resolve(
      result.map((tab, index) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title ?? tab.url,
        pinned: tab.pinned ?? false,
        groupId: TAB_GROUP_NONE,
        index,
        windowId: tab.windowId,
        active: tab.active ?? false,
      })),
    );
  });
  const create = vi.fn(({ tabId }: { tabId: number }) => {
    const id = nextWindowId++;
    const seed = tabs.find((tab) => tab.id === tabId);
    if (seed !== undefined) {
      seed.windowId = id;
    }

    return Promise.resolve({ id });
  });
  const move = vi.fn((id: number, { windowId }: { windowId?: number }) => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab !== undefined && windowId !== undefined) {
      tab.windowId = windowId;
    }

    return Promise.resolve();
  });
  const update = vi.fn(() => Promise.resolve());

  vi.stubGlobal("browser", {
    storage: fakeBrowser.storage,
    windows: { create, update },
    tabs: { query, move },
    tabGroups: { query: vi.fn(() => Promise.resolve([])) },
  });

  return { tabs, query, create, move, update };
}

describe("all-windows extract", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consolidates matches from every normal window into one new window", async () => {
    const fake = stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { id: 2, url: "https://mail.google.com", windowId: 7 },
      { id: 3, url: "https://github.com/issues", windowId: 8 },
      { id: 4, url: "https://github.com/actions", windowId: 9 },
    ]);

    const result = await executeMutation({
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "github.com" },
      scope: "all",
    });

    expect(result).toMatchObject({ type: "extract", changed: true, moved: 3, windowsAffected: 3 });
    const moved = fake.tabs.filter((tab) => [1, 3, 4].includes(tab.id!));
    const landing = new Set(moved.map((tab) => tab.windowId));
    expect(landing.size).toBe(1);
    expect([7, 8, 9]).not.toContain([...landing][0]);
    expect(fake.tabs.find((tab) => tab.id === 2)!.windowId).toBe(7);
  });

  it("ignores tabs Chrome cannot parse into a window", async () => {
    const fake = stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { url: "https://github.com/no-id", windowId: 7 },
      { id: 5, url: "https://github.com/no-window" },
    ]);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toMatchObject({ moved: 1, windowsAffected: 1 });
    expect(fake.tabs.find((tab) => tab.id === 5)!.windowId).toBeUndefined();
  });

  it("never matches or moves tabs in non-normal windows", async () => {
    const fake = stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { id: 2, url: "https://github.com/app", windowId: 8, windowType: "popup" },
    ]);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toMatchObject({ moved: 1, windowsAffected: 1 });
    expect(fake.tabs.find((tab) => tab.id === 2)!.windowId).toBe(8);
  });

  it("respects ignore-pinned across every window", async () => {
    stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { id: 2, url: "https://github.com/pinned", windowId: 8, pinned: true },
    ]);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toMatchObject({ moved: 1 });
  });

  it("blocks the whole sweep and names a mid-recovery source window by its active tab", async () => {
    const fake = stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { id: 2, url: "https://github.com/ci", title: "CI · Actions", windowId: 8, active: true },
    ]);
    await saveMutationHistory(8, pendingHistory(8));

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
      message: expect.stringContaining("CI · Actions"),
    });
    expect(fake.tabs.map((tab) => tab.windowId).toSorted()).toEqual([7, 8]);
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("does not block on a mid-recovery window that holds no matches", async () => {
    stubMultiWindow([
      { id: 1, url: "https://github.com/pr", windowId: 7 },
      { id: 2, url: "https://mail.google.com", windowId: 8 },
    ]);
    await saveMutationHistory(8, pendingHistory(8));

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toMatchObject({ moved: 1 });
  });

  it("names the first blocker by domain when its active tab has no title, and counts the rest", async () => {
    stubMultiWindow([
      { id: 1, url: "https://github.com/a", title: "", windowId: 8, active: true },
      { id: 2, url: "https://github.com/b", windowId: 9 },
    ]);
    await saveMutationHistory(8, pendingHistory(8));
    await saveMutationHistory(9, pendingHistory(9));

    await expect(
      executeMutation({
        type: "extract",
        windowId: 8,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
      message: expect.stringMatching(/github\.com.*and 1 other window/),
    });
  });

  it("falls back to a generic name and pluralizes when several windows block", async () => {
    stubMultiWindow([
      { id: 1, url: "https://github.com/a", windowId: 8 },
      { id: 2, url: "", title: "", windowId: 8, active: true },
      { id: 3, url: "https://github.com/b", windowId: 9 },
      { id: 4, url: "https://github.com/c", windowId: 10 },
    ]);
    await saveMutationHistory(8, pendingHistory(8));
    await saveMutationHistory(9, pendingHistory(9));
    await saveMutationHistory(10, pendingHistory(10));

    await expect(
      executeMutation({
        type: "extract",
        windowId: 8,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
      message: expect.stringMatching(/another window.*and 2 other windows/),
    });
  });

  it("reports nothing moved when no window holds a match", async () => {
    stubMultiWindow([{ id: 1, url: "https://mail.google.com", windowId: 7 }]);

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toEqual({ type: "extract", changed: false, moved: 0 });
  });

  it("keeps pinned tabs and orders within a window when ignore-pinned is off", async () => {
    const fake = stubMultiWindow([
      { id: 1, url: "https://github.com/b", windowId: 7 },
      { id: 2, url: "https://github.com/a", windowId: 7, pinned: true },
    ]);
    await commitPrefsPatch({ ignorePinned: false });

    await expect(
      executeMutation({
        type: "extract",
        windowId: 7,
        matcher: { type: "domain", domain: "github.com" },
        scope: "all",
      }),
    ).resolves.toMatchObject({ moved: 2, windowsAffected: 1 });
    expect(new Set(fake.tabs.map((tab) => tab.windowId)).size).toBe(1);
  });

  it("serializes two overlapping all-windows extracts without releasing the barrier early", async () => {
    stubMultiWindow([
      { id: 1, url: "https://github.com/a", windowId: 7 },
      { id: 2, url: "https://docs.example/a", windowId: 7 },
    ]);

    const first = executeMutation({
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "github.com" },
      scope: "all",
    });
    const second = executeMutation({
      type: "extract",
      windowId: 7,
      matcher: { type: "domain", domain: "docs.example" },
      scope: "all",
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ moved: 1 });
    expect(secondResult).toMatchObject({ moved: 1 });
  });

  it("serializes exclusively: it waits for an in-flight window mutation, and later ones wait for it", async () => {
    const waiting: Array<{
      info: { windowId?: number; windowType?: string };
      resolve: (v: []) => void;
    }> = [];
    const query = vi.fn(
      (info: { windowId?: number; windowType?: string }) =>
        new Promise<[]>((resolve) => {
          waiting.push({ info, resolve });
        }),
    );
    vi.stubGlobal("browser", {
      storage: fakeBrowser.storage,
      windows: { create: vi.fn(() => Promise.resolve({ id: 500 })), update: vi.fn() },
      tabs: { query, move: vi.fn(() => Promise.resolve()) },
      tabGroups: { query: vi.fn(() => Promise.resolve([])) },
    });

    const inFlight = executeMutation({ type: "dedupe", windowId: 11 });
    await vi.waitFor(() => expect(waiting).toHaveLength(1));

    const wide = executeMutation({
      type: "extract",
      windowId: 11,
      matcher: { type: "domain", domain: "none.example" },
      scope: "all",
    });
    const later = executeMutation({ type: "dedupe", windowId: 12 });
    await Promise.resolve();
    await Promise.resolve();
    // Neither the writer nor the window-12 reader may start while window 11 runs.
    expect(waiting).toHaveLength(1);

    waiting[0]!.resolve([]);
    await inFlight;
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    expect(waiting[1]!.info).toEqual({ windowType: "normal" });

    // The writer drains (no matches → no move); only then does window 12 start.
    waiting[1]!.resolve([]);
    await wide;
    await vi.waitFor(() => expect(waiting).toHaveLength(3));
    expect(waiting[2]!.info).toMatchObject({ windowId: 12 });

    waiting[2]!.resolve([]);
    await later;
  });
});
