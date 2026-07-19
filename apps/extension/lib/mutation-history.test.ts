import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMutationHistory, saveMutationHistory } from "./mutation-history";
import type { WindowSnapshot } from "./types";

function snapshot(windowId = 7): WindowSnapshot {
  return {
    windowId,
    tabs: [
      {
        id: 1,
        url: "https://example.test",
        index: 0,
        pinned: false,
        groupId: -1,
      },
    ],
    groups: [{ groupId: 3, title: "Work", color: "blue", collapsed: false }],
    savedAt: 10,
  };
}

describe("mutation history", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("browser", fakeBrowser);
  });

  it("round-trips undo and pending state, then removes empty history", async () => {
    const before = snapshot();
    const recoverTo = { ...snapshot(), savedAt: 11 };
    const beforePoint = { snapshot: before, close: [] };
    const pendingBefore = { snapshot: before, close: [20] };
    const recoverPoint = { snapshot: recoverTo, close: [] };

    await saveMutationHistory(7, {
      undo: beforePoint,
      pending: {
        before: pendingBefore,
        recoverTo: recoverPoint,
        reopened: { 1: 20 },
        startedAt: 12,
      },
    });
    await expect(loadMutationHistory(7)).resolves.toEqual({
      undo: beforePoint,
      pending: {
        before: pendingBefore,
        recoverTo: recoverPoint,
        reopened: { 1: 20 },
        startedAt: 12,
      },
    });

    await saveMutationHistory(7, {});
    await expect(loadMutationHistory(7)).resolves.toEqual({});
  });

  it("migrates the prior undo key once", async () => {
    const undo = snapshot();
    await fakeBrowser.storage.session.set({ "undo:7": undo });

    const restorePoint = { snapshot: undo, close: [] };
    await expect(loadMutationHistory(7)).resolves.toEqual({ undo: restorePoint });
    await expect(fakeBrowser.storage.session.get(["undo:7", "mutation:7"])).resolves.toEqual({
      "mutation:7": { undo: restorePoint },
    });
  });

  it("accepts each valid pending-recovery phase", async () => {
    const before = { snapshot: snapshot(), close: [20, 21] };
    const target = snapshot();
    target.tabs.push({
      id: 2,
      url: "https://second.test",
      index: 1,
      pinned: false,
      groupId: -1,
    });
    const recoverTo = { snapshot: target, close: [] };

    for (const pending of [
      { before, startedAt: 1 },
      { before, recoverTo, startedAt: 2 },
      { before, recoverTo, reopening: 1, startedAt: 3 },
      { before, recoverTo, reopened: { 1: 20 }, startedAt: 4 },
      {
        before,
        recoverTo,
        reopened: { 1: 20 },
        reopening: 2,
        startedAt: 5,
      },
    ]) {
      await fakeBrowser.storage.session.set({ "mutation:7": { pending } });

      await expect(loadMutationHistory(7)).resolves.toEqual({ pending });
    }
  });

  it.each([
    null,
    { undo: { snapshot: { ...snapshot(), tabs: [null] }, close: [] } },
    { undo: { snapshot: { ...snapshot(), groups: [null] }, close: [] } },
    { undo: { ...snapshot(), windowId: 8 } },
    { undo: { ...snapshot(), tabs: [{ ...snapshot().tabs[0], id: "1" }] } },
    { undo: { ...snapshot(), tabs: [{ ...snapshot().tabs[0], url: 1 }] } },
    { undo: { ...snapshot(), tabs: [{ ...snapshot().tabs[0], index: 0.5 }] } },
    { undo: { ...snapshot(), tabs: [{ ...snapshot().tabs[0], pinned: "no" }] } },
    { undo: { ...snapshot(), tabs: [{ ...snapshot().tabs[0], groupId: 1.5 }] } },
    { undo: { ...snapshot(), groups: [{ ...snapshot().groups[0], groupId: 1.5 }] } },
    { undo: { ...snapshot(), groups: [{ ...snapshot().groups[0], title: 2 }] } },
    { undo: { ...snapshot(), groups: [{ ...snapshot().groups[0], color: "beige" }] } },
    { undo: { ...snapshot(), groups: [{ ...snapshot().groups[0], collapsed: 0 }] } },
    { undo: { ...snapshot(), savedAt: Number.POSITIVE_INFINITY } },
    { undo: { snapshot: snapshot(), close: [-1] } },
    { undo: { snapshot: snapshot(), close: [20, 20] } },
    { undo: { snapshot: snapshot(), close: [1] } },
    { pending: { before: snapshot(), recoverTo: snapshot(8), startedAt: 1 } },
    { pending: { before: snapshot(), startedAt: Number.NaN } },
    {
      pending: {
        before: { snapshot: snapshot(), close: [] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: null,
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [] },
        reopened: {},
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [20] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: { "01": 20 },
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [20] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: { 2: 20 },
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [20] },
        recoverTo: { snapshot: snapshot(), close: [20] },
        reopened: { 1: 20 },
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopening: 2,
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [20] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: { 1: 20 },
        reopening: 1,
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [20, 21] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: { 1: 20, 2: 20 },
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopened: { 1: 20 },
        startedAt: 1,
      },
    },
    {
      pending: {
        before: { snapshot: snapshot(), close: [] },
        recoverTo: { snapshot: snapshot(), close: [] },
        reopening: -1,
        startedAt: 1,
      },
    },
  ])("drops malformed history: %j", async (value) => {
    await fakeBrowser.storage.session.set({ "mutation:7": value });

    await expect(loadMutationHistory(7)).resolves.toEqual({});
  });
});
