import { GROUP_COLORS } from "./types";
import type { SnapshotGroup, SnapshotTab, WindowSnapshot } from "./types";

export interface RestorePoint {
  snapshot: WindowSnapshot;
  close: number[];
}

export interface PendingMutation {
  before: RestorePoint;
  recoverTo?: RestorePoint;
  reopened?: Record<string, number>;
  reopening?: number;
  startedAt: number;
}

export interface MutationHistory {
  undo?: RestorePoint;
  pending?: PendingMutation;
}

function historyKey(windowId: number): string {
  return `mutation:${windowId}`;
}

function legacyUndoKey(windowId: number): string {
  return `undo:${windowId}`;
}

function isTabId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSnapshotTab(value: unknown): value is SnapshotTab {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { id, url, index, pinned, groupId } = value as Record<string, unknown>;

  return (
    isTabId(id) &&
    typeof url === "string" &&
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    typeof pinned === "boolean" &&
    typeof groupId === "number" &&
    Number.isInteger(groupId) &&
    groupId >= -1
  );
}

function isSnapshotGroup(value: unknown): value is SnapshotGroup {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { groupId, title, color, collapsed } = value as Record<string, unknown>;

  return (
    typeof groupId === "number" &&
    Number.isInteger(groupId) &&
    groupId >= 0 &&
    typeof title === "string" &&
    GROUP_COLORS.includes(color as SnapshotGroup["color"]) &&
    typeof collapsed === "boolean"
  );
}

function isWindowSnapshot(value: unknown, expectedWindowId: number): value is WindowSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { windowId, tabs, groups, savedAt } = value as Record<string, unknown>;

  return (
    windowId === expectedWindowId &&
    Array.isArray(tabs) &&
    tabs.every(isSnapshotTab) &&
    Array.isArray(groups) &&
    groups.every(isSnapshotGroup) &&
    typeof savedAt === "number" &&
    Number.isFinite(savedAt) &&
    savedAt >= 0
  );
}

function parseRestorePoint(value: unknown, expectedWindowId: number): RestorePoint | undefined {
  if (isWindowSnapshot(value, expectedWindowId)) {
    return { snapshot: value, close: [] };
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { snapshot, close } = value as Record<string, unknown>;

  if (
    !isWindowSnapshot(snapshot, expectedWindowId) ||
    !Array.isArray(close) ||
    !close.every(isTabId) ||
    new Set(close).size !== close.length
  ) {
    return undefined;
  }

  const snapshotIds = new Set(snapshot.tabs.map((tab) => tab.id));
  if (close.some((id) => snapshotIds.has(id))) {
    return undefined;
  }

  return { snapshot, close };
}

function parseReopened(value: unknown): Record<string, number> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value);
  const values = entries.map(([, newId]) => newId);
  if (
    entries.some(
      ([oldId, newId]) =>
        !isTabId(Number(oldId)) || String(Number(oldId)) !== oldId || !isTabId(newId),
    ) ||
    new Set(values).size !== values.length
  ) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function parsePendingMutation(
  value: unknown,
  expectedWindowId: number,
): PendingMutation | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { before, recoverTo, reopened, reopening, startedAt } = value as Record<string, unknown>;
  const parsedBefore = parseRestorePoint(before, expectedWindowId);
  const parsedRecoverTo =
    recoverTo === undefined ? undefined : parseRestorePoint(recoverTo, expectedWindowId);
  const parsedReopened = parseReopened(reopened);

  if (
    parsedBefore === undefined ||
    (recoverTo !== undefined && parsedRecoverTo === undefined) ||
    (reopened !== undefined && parsedReopened === undefined) ||
    (reopening !== undefined && !isTabId(reopening)) ||
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt)
  ) {
    return undefined;
  }

  if ((parsedReopened !== undefined || reopening !== undefined) && parsedRecoverTo === undefined) {
    return undefined;
  }

  if (parsedRecoverTo !== undefined) {
    const targetIds = new Set(parsedRecoverTo.snapshot.tabs.map((tab) => tab.id));
    const inverseClose = new Set(parsedBefore.close);
    const targetClose = new Set(parsedRecoverTo.close);
    const entries = Object.entries(parsedReopened ?? {});

    if (
      entries.some(
        ([oldId, newId]) =>
          !targetIds.has(Number(oldId)) || !inverseClose.has(newId) || targetClose.has(newId),
      ) ||
      (typeof reopening === "number" &&
        (!targetIds.has(reopening) || parsedReopened?.[reopening] !== undefined))
    ) {
      return undefined;
    }
  }

  return {
    before: parsedBefore,
    ...(parsedRecoverTo === undefined ? {} : { recoverTo: parsedRecoverTo }),
    ...(parsedReopened === undefined ? {} : { reopened: parsedReopened }),
    ...(typeof reopening === "number" ? { reopening } : {}),
    startedAt,
  };
}

function parseHistory(value: unknown, expectedWindowId: number): MutationHistory {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const { undo, pending } = value as Record<string, unknown>;
  const parsedUndo = parseRestorePoint(undo, expectedWindowId);
  const parsedPending = parsePendingMutation(pending, expectedWindowId);

  return {
    ...(parsedUndo === undefined ? {} : { undo: parsedUndo }),
    ...(parsedPending === undefined ? {} : { pending: parsedPending }),
  };
}

export async function loadMutationHistory(windowId: number): Promise<MutationHistory> {
  const key = historyKey(windowId);
  const oldKey = legacyUndoKey(windowId);
  const stored = (await browser.storage.session.get([key, oldKey])) as Record<string, unknown>;
  const history = parseHistory(stored[key], windowId);

  if (history.undo !== undefined || history.pending !== undefined) {
    return history;
  }

  const legacyUndo = isWindowSnapshot(stored[oldKey], windowId) ? stored[oldKey] : undefined;
  if (legacyUndo === undefined) {
    return {};
  }

  const migrated = { undo: { snapshot: legacyUndo, close: [] } };
  await browser.storage.session.set({ [key]: migrated });
  await browser.storage.session.remove(oldKey);

  return migrated;
}

export async function saveMutationHistory(
  windowId: number,
  history: MutationHistory,
): Promise<void> {
  const key = historyKey(windowId);

  if (history.undo === undefined && history.pending === undefined) {
    await browser.storage.session.remove(key);
    return;
  }

  await browser.storage.session.set({ [key]: history });
}
