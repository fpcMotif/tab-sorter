import { planDedupe } from "./dedupe";
import { getDomain } from "./domain";
import { matchByDomain } from "./domain-groups";
import { matchPattern } from "./match";
import {
  loadMutationHistory,
  saveMutationHistory,
  type MutationHistory,
  type PendingMutation,
  type RestorePoint,
} from "./mutation-history";
import { realizePlan } from "./mutation-realize";
import { planWindowOrder } from "./plan";
import { protocolError } from "./protocol-error";
import { getPrefs } from "./storage";
import { moveTabsToNewWindow } from "./tabs-service";
import { planTidy } from "./tidy";
import { TAB_GROUP_NONE } from "./types";
import type {
  GroupColor,
  SnapshotGroup,
  SnapshotTab,
  SortMode,
  TabLite,
  TabPlan,
  WindowSnapshot,
} from "./types";
import { planUndo } from "./undo";

export type ExtractMatcher =
  | { type: "domain"; domain: string }
  | { type: "regex"; source: string; flags?: string };

// Absent scope means "window" — the origin window carried by windowId. "all"
// sweeps every normal window and consolidates the matches into one new window.
export type ExtractScope = "window" | "all";

export type MutationIntent =
  | { type: "sort"; windowId: number; mode?: SortMode }
  | { type: "tidy"; windowId: number }
  | { type: "dedupe"; windowId: number }
  | { type: "undo"; windowId: number }
  | { type: "extract"; windowId: number; matcher: ExtractMatcher; scope?: ExtractScope };

export interface MutationResultByType {
  sort: { type: "sort"; changed: boolean; moved: number };
  tidy: {
    type: "tidy";
    changed: boolean;
    moved: number;
    grouped: number;
    groupsCreated: number;
    createdGroups: Array<{ title: string; color: GroupColor }>;
  };
  dedupe: { type: "dedupe"; changed: boolean; duplicates: number; closed: number };
  undo: {
    type: "undo";
    changed: boolean;
    undone: boolean;
    restored: number;
    reopened: number;
  };
  extract: {
    type: "extract";
    changed: boolean;
    moved: number;
    // Set only by the all-windows path: how many source windows lost tabs, and
    // the consolidated window so a caller can focus it.
    windowsAffected?: number;
    newWindowId?: number;
  };
}

export type MutationResult<Intent extends MutationIntent = MutationIntent> =
  MutationResultByType[Intent["type"]];

export interface MutationState {
  canUndo: boolean;
  recoveryRequired: boolean;
}

interface RawTab {
  id?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  index?: number;
  pinned?: boolean;
  groupId?: number;
  windowId?: number;
  active?: boolean;
}

interface CapturedWindow {
  snapshot: WindowSnapshot;
  tabs: TabLite[];
}

interface PlanReceipt {
  changed: boolean;
  moved: number;
  grouped: number;
  ungrouped: number;
  createdGroups: Array<{ title: string; color: GroupColor }>;
  groupsUpdated: number;
  closed: number;
  reopened: number;
  vanished: number;
}

type UndoPending = PendingMutation & { recoverTo: RestorePoint };

const windowTails = new Map<number, Promise<void>>();
// Serializes an all-windows extract (the "writer") against every per-window
// mutation (the "readers"). Resolved when no writer is pending or running.
let wideBarrier: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);

  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isWindowId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isExtractMatcher(value: unknown): value is ExtractMatcher {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "domain") {
    return (
      hasOnlyKeys(value, ["type", "domain"]) &&
      typeof value.domain === "string" &&
      value.domain.length > 0
    );
  }

  return (
    value.type === "regex" &&
    hasOnlyKeys(value, ["type", "source", "flags"]) &&
    typeof value.source === "string" &&
    (value.flags === undefined || typeof value.flags === "string")
  );
}

export function isMutationIntent(value: unknown): value is MutationIntent {
  if (!isRecord(value) || !isWindowId(value.windowId) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "sort") {
    return (
      hasOnlyKeys(value, ["type", "windowId", "mode"]) &&
      (value.mode === undefined || value.mode === "title" || value.mode === "domain")
    );
  }

  if (value.type === "tidy" || value.type === "dedupe" || value.type === "undo") {
    return hasOnlyKeys(value, ["type", "windowId"]);
  }

  return (
    value.type === "extract" &&
    hasOnlyKeys(value, ["type", "windowId", "matcher", "scope"]) &&
    isExtractMatcher(value.matcher) &&
    (value.scope === undefined || value.scope === "window" || value.scope === "all")
  );
}

function toTabLite(tab: RawTab): TabLite | undefined {
  if (typeof tab.id !== "number") {
    return undefined;
  }

  return {
    id: tab.id,
    url: tab.pendingUrl ?? tab.url ?? "",
    title: tab.title ?? tab.pendingUrl ?? tab.url ?? "",
    index: tab.index ?? 0,
    pinned: tab.pinned ?? false,
    groupId: tab.groupId ?? TAB_GROUP_NONE,
  };
}

async function captureWindow(windowId: number): Promise<CapturedWindow> {
  const [rawTabs, rawGroups] = await Promise.all([
    browser.tabs.query({ windowId }) as Promise<RawTab[]>,
    browser.tabGroups.query({ windowId }),
  ]);
  const tabs = rawTabs.flatMap((tab) => {
    const parsed = toTabLite(tab);

    return parsed === undefined ? [] : [parsed];
  });
  const snapshotTabs: SnapshotTab[] = tabs
    .toSorted((left, right) => left.index - right.index)
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      index: tab.index,
      pinned: tab.pinned,
      groupId: tab.groupId!,
    }));
  const groups: SnapshotGroup[] = rawGroups.map((group) => ({
    groupId: group.id,
    title: group.title ?? "",
    color: group.color,
    collapsed: group.collapsed,
  }));

  return {
    tabs,
    snapshot: { windowId, tabs: snapshotTabs, groups, savedAt: Date.now() },
  };
}

function orderFor(snapshot: WindowSnapshot, ids: Set<number>): number[] {
  return snapshot.tabs
    .filter((tab) => ids.has(tab.id))
    .toSorted((left, right) => left.index - right.index)
    .map((tab) => tab.id);
}

function measurePlan(
  before: WindowSnapshot,
  after: WindowSnapshot,
  plan: TabPlan,
  reopenedIds: readonly number[] = [],
): PlanReceipt {
  const scopedIds = new Set(plan.order);
  const beforeOrder = orderFor(before, scopedIds);
  const afterOrder = orderFor(after, scopedIds);
  const moved =
    plan.order.length === 0
      ? 0
      : afterOrder.reduce((count, id, index) => count + (beforeOrder[index] === id ? 0 : 1), 0);
  const beforeTabs = new Map(before.tabs.map((tab) => [tab.id, tab]));
  const afterTabs = new Map(after.tabs.map((tab) => [tab.id, tab]));
  const desiredGroupIds = new Set(plan.groups.flatMap((group) => group.tabIds));
  const grouped = [...desiredGroupIds].filter((id) => {
    const beforeGroup = beforeTabs.get(id)?.groupId ?? TAB_GROUP_NONE;
    const afterGroup = afterTabs.get(id)?.groupId ?? TAB_GROUP_NONE;

    return beforeGroup !== afterGroup && afterGroup !== TAB_GROUP_NONE;
  }).length;
  const ungrouped = plan.ungroup.filter((id) => {
    const beforeGroup = beforeTabs.get(id)!.groupId;
    const afterGroup = afterTabs.get(id)?.groupId ?? TAB_GROUP_NONE;

    return beforeGroup !== TAB_GROUP_NONE && afterGroup === TAB_GROUP_NONE;
  }).length;
  const beforeGroups = new Map(before.groups.map((group) => [group.groupId, group]));
  const afterMembers = new Map<number, number[]>();
  for (const tab of after.tabs) {
    if (tab.groupId === TAB_GROUP_NONE) {
      continue;
    }
    const members = afterMembers.get(tab.groupId) ?? [];
    members.push(tab.id);
    afterMembers.set(tab.groupId, members);
  }
  const createdGroups = after.groups
    .filter((group) => !beforeGroups.has(group.groupId))
    .filter((group) =>
      (afterMembers.get(group.groupId) ?? []).some((id) => desiredGroupIds.has(id)),
    )
    .map(({ title, color }) => ({ title, color }));
  const groupsUpdated = after.groups.filter((group) => {
    const previous = beforeGroups.get(group.groupId);
    const touchesPlan = (afterMembers.get(group.groupId) ?? []).some((id) =>
      desiredGroupIds.has(id),
    );

    return (
      touchesPlan &&
      previous !== undefined &&
      (previous.title !== group.title ||
        previous.color !== group.color ||
        previous.collapsed !== group.collapsed)
    );
  }).length;
  const closed = plan.close.filter((id) => beforeTabs.has(id) && !afterTabs.has(id)).length;
  const reopened = [...new Set(reopenedIds)].filter((id) => afterTabs.has(id)).length;
  const vanished = [...scopedIds].filter(
    (id) => beforeTabs.has(id) && !afterTabs.has(id) && !plan.close.includes(id),
  ).length;
  const orderChanged =
    beforeOrder.length !== afterOrder.length ||
    beforeOrder.some((id, index) => afterOrder[index] !== id);
  const changed =
    orderChanged ||
    grouped > 0 ||
    ungrouped > 0 ||
    createdGroups.length > 0 ||
    groupsUpdated > 0 ||
    closed > 0 ||
    reopened > 0 ||
    vanished > 0;

  return {
    changed,
    moved,
    grouped,
    ungrouped,
    createdGroups,
    groupsUpdated,
    closed,
    reopened,
    vanished,
  };
}

// Reader: one FIFO per window, concurrent across windows, and — new — held
// behind any pending all-windows writer. allSettled keeps the run-regardless
// semantics of the old `previous.then(task, task)` while adding the barrier.
function enqueue<Result>(windowId: number, task: () => Promise<Result>): Promise<Result> {
  const previous = windowTails.get(windowId) ?? Promise.resolve();
  const result = Promise.allSettled([previous, wideBarrier]).then(task);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  windowTails.set(windowId, tail);

  void tail.finally(() => {
    if (windowTails.get(windowId) === tail) {
      windowTails.delete(windowId);
    }
  });

  return result;
}

// Writer: waits for every in-flight reader, then runs exclusively while new
// readers queue behind the barrier it installs synchronously. The identity
// guard mirrors the windowTails cleanup so a finished writer never resets a
// barrier a later writer is still holding.
function enqueueExclusive<Result>(task: () => Promise<Result>): Promise<Result> {
  const readers = [...windowTails.values()];
  const previous = wideBarrier;
  const result = Promise.allSettled([previous, ...readers]).then(task);
  const barrier = result.then(
    () => undefined,
    () => undefined,
  );
  wideBarrier = barrier;

  void barrier.finally(() => {
    if (wideBarrier === barrier) {
      wideBarrier = Promise.resolve();
    }
  });

  return result;
}

function recoveryRequired(message = "undo pending recovery before another mutation") {
  return protocolError("RECOVERY_REQUIRED", message);
}

// Chrome window ids are opaque and their on-screen order is unreliable, so name
// a blocking window by what the user can actually see in it: its active tab.
function pendingWindowMessage(raw: RawTab[], pending: number[]): string {
  const active = raw.find((tab) => tab.windowId === pending[0] && tab.active === true);
  const title = active?.title?.trim();
  const url = active?.pendingUrl ?? active?.url;
  const name =
    title !== undefined && title.length > 0
      ? title
      : url !== undefined && url.length > 0
        ? getDomain(url)
        : "another window";
  const others = pending.length - 1;
  const suffix = others > 0 ? ` and ${others} other window${others > 1 ? "s" : ""}` : "";

  return `The window showing “${name}”${suffix} has an unfinished change. Switch to it, tap Recover, then retry.`;
}

async function beginPlan(history: MutationHistory, before: WindowSnapshot): Promise<void> {
  await saveMutationHistory(before.windowId, {
    ...history,
    pending: {
      before: { snapshot: before, close: [] },
      startedAt: Date.now(),
    },
  });
}

async function finishPlan(
  history: MutationHistory,
  before: RestorePoint,
  changed: boolean,
): Promise<void> {
  await saveMutationHistory(
    before.snapshot.windowId,
    changed ? { undo: before } : { undo: history.undo },
  );
}

async function runPlan(
  windowId: number,
  history: MutationHistory,
  before: CapturedWindow,
  plan: TabPlan,
): Promise<{ after: CapturedWindow; receipt: PlanReceipt }> {
  await beginPlan(history, before.snapshot);
  await realizePlan(plan, windowId);
  const after = await captureWindow(windowId);
  const receipt = measurePlan(before.snapshot, after.snapshot, plan);
  await finishPlan(history, { snapshot: before.snapshot, close: [] }, receipt.changed);

  return { after, receipt };
}

async function executeSort(
  intent: Extract<MutationIntent, { type: "sort" }>,
  history: MutationHistory,
): Promise<MutationResultByType["sort"]> {
  const [before, prefs] = await Promise.all([captureWindow(intent.windowId), getPrefs()]);
  const mode = intent.mode ?? prefs.defaultSort;
  const plan: TabPlan = {
    order: planWindowOrder(before.tabs, mode, prefs.ignorePinned),
    groups: [],
    ungroup: [],
    close: [],
  };
  const { receipt } = await runPlan(intent.windowId, history, before, plan);

  return { type: "sort", changed: receipt.changed, moved: receipt.moved };
}

async function savePending(history: MutationHistory, pending: PendingMutation): Promise<void> {
  await saveMutationHistory(pending.before.snapshot.windowId, { ...history, pending });
}

function withoutReopening(pending: UndoPending): UndoPending {
  const { reopening: _reopening, ...rest } = pending;

  return rest;
}

function addClose(point: RestorePoint, tabId: number): RestorePoint {
  return { ...point, close: [...point.close, tabId] };
}

async function prepareUndo(
  history: MutationHistory,
  windowId: number,
): Promise<{ current: CapturedWindow; pending: UndoPending } | undefined> {
  if (history.pending?.recoverTo !== undefined) {
    return {
      current: await captureWindow(windowId),
      pending: history.pending as UndoPending,
    };
  }

  const recoverTo = history.pending?.before ?? history.undo;
  if (recoverTo === undefined) {
    return undefined;
  }

  const current = await captureWindow(windowId);
  const pending: UndoPending = {
    before: { snapshot: current.snapshot, close: [] },
    recoverTo,
    startedAt: Date.now(),
  };
  await savePending(history, pending);

  return { current, pending };
}

async function adoptInterruptedReopen(
  history: MutationHistory,
  current: CapturedWindow,
  pending: UndoPending,
): Promise<UndoPending> {
  if (pending.reopening === undefined) {
    return pending;
  }

  // The history parser and marker writer both guarantee this id belongs to
  // recoverTo.snapshot.
  const target = pending.recoverTo.snapshot.tabs.find((tab) => tab.id === pending.reopening)!;
  if (target.url === "") {
    const cleared = withoutReopening(pending);
    await savePending(history, cleared);

    return cleared;
  }

  const baselineIds = new Set(pending.before.snapshot.tabs.map((tab) => tab.id));
  const usedIds = new Set(Object.values(pending.reopened ?? {}));
  const closeIds = new Set(pending.recoverTo.close);
  // Chrome has no atomic create-and-journal call. Recovery can identify only
  // the sole post-baseline tab with the target URL. Multiple matches fail.
  const candidates = current.tabs
    .filter((tab) => !baselineIds.has(tab.id))
    .filter((tab) => !usedIds.has(tab.id))
    .filter((tab) => !closeIds.has(tab.id))
    .filter((tab) => tab.url === target.url);

  if (candidates.length === 0) {
    return pending;
  }
  if (candidates.length > 1) {
    throw protocolError("RECOVERY_AMBIGUOUS", "reopened tab recovery is ambiguous");
  }
  const candidate = candidates[0]!;

  const cleared = withoutReopening(pending);
  const adopted: UndoPending = {
    ...cleared,
    before: addClose(cleared.before, candidate.id),
    reopened: { ...cleared.reopened, [target.id]: candidate.id },
  };
  await savePending(history, adopted);

  return adopted;
}

async function executeUndo(
  intent: Extract<MutationIntent, { type: "undo" }>,
  history: MutationHistory,
): Promise<MutationResultByType["undo"]> {
  const prepared = await prepareUndo(history, intent.windowId);
  if (prepared === undefined) {
    return {
      type: "undo",
      changed: false,
      undone: false,
      restored: 0,
      reopened: 0,
    };
  }

  const { current } = prepared;
  const pending = await adoptInterruptedReopen(history, current, prepared.pending);
  const restore = pending.recoverTo;
  const currentIds = new Set(current.tabs.map((tab) => tab.id));
  const remappedTabs: SnapshotTab[] = [];

  for (const tab of restore.snapshot.tabs) {
    if (currentIds.has(tab.id)) {
      remappedTabs.push(tab);
      continue;
    }

    const mappedId = pending.reopened?.[tab.id];
    if (mappedId !== undefined && currentIds.has(mappedId)) {
      remappedTabs.push({ ...tab, id: mappedId });
      continue;
    }

    if (tab.url === "") {
      continue;
    }

    if (pending.reopening !== tab.id) {
      pending.reopening = tab.id;
      await savePending(history, pending);
    }

    const created = (await browser.tabs.create({
      active: false,
      url: tab.url,
      windowId: intent.windowId,
    })) as RawTab;
    if (typeof created.id !== "number") {
      throw protocolError("MUTATION_FAILED", "browser did not return a reopened tab id");
    }

    delete pending.reopening;
    pending.before = addClose(pending.before, created.id);
    pending.reopened ??= {};
    pending.reopened[tab.id] = created.id;
    await savePending(history, pending);
    currentIds.add(created.id);
    remappedTabs.push({ ...tab, id: created.id });
  }

  const remappedRestore: WindowSnapshot = {
    ...restore.snapshot,
    windowId: intent.windowId,
    tabs: remappedTabs,
  };
  const afterReopen = await captureWindow(intent.windowId);
  const undoPlan = planUndo(remappedRestore, afterReopen.tabs);
  const liveIds = new Set(afterReopen.tabs.map((tab) => tab.id));
  const restoredIds = new Set(remappedTabs.map((tab) => tab.id));
  const plan: TabPlan = {
    ...undoPlan,
    close: [
      ...new Set([
        ...undoPlan.close,
        ...restore.close.filter((id) => liveIds.has(id) && !restoredIds.has(id)),
      ]),
    ],
  };
  await realizePlan(plan, intent.windowId);
  const after = await captureWindow(intent.windowId);
  const receipt = measurePlan(
    pending.before.snapshot,
    after.snapshot,
    plan,
    Object.values(pending.reopened ?? {}),
  );
  const finalIds = new Set(after.tabs.map((tab) => tab.id));
  await finishPlan(history, pending.before, receipt.changed);

  return {
    type: "undo",
    changed: receipt.changed,
    undone: receipt.changed,
    restored: plan.order.filter((id) => finalIds.has(id)).length,
    reopened: receipt.reopened,
  };
}

async function executeTidy(
  intent: Extract<MutationIntent, { type: "tidy" }>,
  history: MutationHistory,
): Promise<MutationResultByType["tidy"]> {
  const [before, prefs] = await Promise.all([captureWindow(intent.windowId), getPrefs()]);
  const plan = planTidy(before.tabs, prefs);
  const { receipt } = await runPlan(intent.windowId, history, before, plan);

  return {
    type: "tidy",
    changed: receipt.changed,
    moved: receipt.moved,
    grouped: receipt.grouped,
    groupsCreated: receipt.createdGroups.length,
    createdGroups: receipt.createdGroups,
  };
}

async function executeDedupe(
  intent: Extract<MutationIntent, { type: "dedupe" }>,
  history: MutationHistory,
): Promise<MutationResultByType["dedupe"]> {
  const [before, prefs] = await Promise.all([captureWindow(intent.windowId), getPrefs()]);
  const { close } = planDedupe(before.tabs, {
    ignoreHash: prefs.dedupeIgnoreHash,
    ignoreQuery: prefs.dedupeIgnoreQuery,
  });

  if (close.length === 0) {
    return { type: "dedupe", changed: false, duplicates: 0, closed: 0 };
  }

  const plan: TabPlan = { order: [], groups: [], ungroup: [], close };
  const { receipt } = await runPlan(intent.windowId, history, before, plan);

  return {
    type: "dedupe",
    changed: receipt.changed,
    duplicates: close.length,
    closed: receipt.closed,
  };
}

function matchedIds(tabs: TabLite[], matcher: ExtractMatcher): number[] {
  if (matcher.type === "domain") {
    return matchByDomain(tabs, matcher.domain);
  }

  const result = matchPattern(tabs, matcher.source, matcher.flags);

  return result.ok ? result.ids : [];
}

async function executeExtract(
  intent: Extract<MutationIntent, { type: "extract" }>,
): Promise<MutationResultByType["extract"]> {
  const [before, prefs] = await Promise.all([captureWindow(intent.windowId), getPrefs()]);
  const extractable = prefs.ignorePinned ? before.tabs.filter((tab) => !tab.pinned) : before.tabs;
  const ids = matchedIds(extractable, intent.matcher);

  if (ids.length === 0) {
    return { type: "extract", changed: false, moved: 0 };
  }

  await moveTabsToNewWindow(ids);
  // Moving the last tab can close the source window. An all-tabs observation
  // still works after that window id stops being queryable.
  const liveTabs = (await browser.tabs.query({})) as RawTab[];
  const remaining = new Set(
    liveTabs.flatMap((tab) =>
      tab.windowId === intent.windowId && typeof tab.id === "number" ? [tab.id] : [],
    ),
  );
  const moved = ids.filter((id) => !remaining.has(id)).length;

  return { type: "extract", changed: moved > 0, moved };
}

async function executeExtractAll(
  intent: Extract<MutationIntent, { type: "extract" }>,
): Promise<MutationResultByType["extract"]> {
  const [raw, prefs] = await Promise.all([
    browser.tabs.query({ windowType: "normal" }) as Promise<RawTab[]>,
    getPrefs(),
  ]);

  // TabLite drops windowId, so keep provenance alongside the parsed tabs.
  const originOf = new Map<number, number>();
  const indexOf = new Map<number, number>();
  const tabs = raw.flatMap((tab) => {
    const parsed = toTabLite(tab);
    if (parsed === undefined || typeof tab.windowId !== "number") {
      return [];
    }
    originOf.set(parsed.id, tab.windowId);
    indexOf.set(parsed.id, parsed.index);

    return [parsed];
  });

  const extractable = prefs.ignorePinned ? tabs.filter((tab) => !tab.pinned) : tabs;
  const ids = matchedIds(extractable, intent.matcher);

  if (ids.length === 0) {
    return { type: "extract", changed: false, moved: 0 };
  }

  // Gate on the windows we would actually touch. Running under the exclusive
  // barrier, no live mutation is in flight, so any pending is a crashed journal.
  const sourceWindows = [...new Set(ids.map((id) => originOf.get(id)!))];
  const pending: number[] = [];
  for (const windowId of sourceWindows) {
    const history = await loadMutationHistory(windowId);
    if (history.pending !== undefined) {
      pending.push(windowId);
    }
  }
  if (pending.length > 0) {
    throw recoveryRequired(pendingWindowMessage(raw, pending));
  }

  const ordered = ids.toSorted(
    (left, right) =>
      originOf.get(left)! - originOf.get(right)! || indexOf.get(left)! - indexOf.get(right)!,
  );
  const newWindowId = await moveTabsToNewWindow(ordered, { focus: false });

  const liveTabs = (await browser.tabs.query({})) as RawTab[];
  const stillHome = new Set(
    liveTabs.flatMap((tab) =>
      typeof tab.id === "number" && originOf.get(tab.id) === tab.windowId ? [tab.id] : [],
    ),
  );
  const movedIds = ids.filter((id) => !stillHome.has(id));
  const windowsAffected = new Set(movedIds.map((id) => originOf.get(id)!)).size;

  return {
    type: "extract",
    changed: movedIds.length > 0,
    moved: movedIds.length,
    windowsAffected,
    newWindowId,
  };
}

async function executeNow(intent: MutationIntent): Promise<MutationResult> {
  const history = await loadMutationHistory(intent.windowId);

  if (history.pending !== undefined && intent.type !== "undo") {
    throw recoveryRequired();
  }

  switch (intent.type) {
    case "sort":
      return executeSort(intent, history);
    case "undo":
      return executeUndo(intent, history);
    case "tidy":
      return executeTidy(intent, history);
    case "dedupe":
      return executeDedupe(intent, history);
    case "extract":
      return executeExtract(intent);
  }
}

export async function getMutationState(windowId: number): Promise<MutationState> {
  const history = await loadMutationHistory(windowId);

  return {
    canUndo: history.pending !== undefined || history.undo !== undefined,
    recoveryRequired: history.pending !== undefined,
  };
}

export function executeMutation<Intent extends MutationIntent>(
  intent: Intent,
): Promise<MutationResult<Intent>>;
export function executeMutation(intent: unknown): Promise<MutationResult>;
export function executeMutation(intent: unknown): Promise<MutationResult> {
  if (!isMutationIntent(intent)) {
    return Promise.reject(protocolError("INVALID_REQUEST", "invalid mutation intent"));
  }

  if (intent.type === "extract" && intent.scope === "all") {
    return enqueueExclusive(() => executeExtractAll(intent));
  }

  return enqueue(intent.windowId, () => executeNow(intent));
}
