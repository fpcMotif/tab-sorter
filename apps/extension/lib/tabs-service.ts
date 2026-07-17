import { planGroupOps } from "./group-ops";
import type { LiveGroup } from "./group-ops";
import { planBlockMoves, planFlatMoves } from "./realize-order";
import type { StripTab } from "./realize-order";
import { TAB_GROUP_NONE } from "./types";
import type {
  GroupSpec,
  SnapshotGroup,
  SnapshotTab,
  TabLite,
  TabPlan,
  WindowSnapshot,
} from "./types";

interface RawTab {
  id?: number;
  url?: string;
  title?: string;
  index?: number;
  pinned?: boolean;
  groupId?: number;
}

function toTabLite(tab: RawTab): TabLite | undefined {
  if (typeof tab.id !== "number") {
    return undefined;
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? tab.url ?? "",
    index: tab.index ?? 0,
    pinned: tab.pinned ?? false,
    groupId: tab.groupId ?? TAB_GROUP_NONE,
  };
}

async function queryTabsAsLite(
  queryInfo: Parameters<typeof browser.tabs.query>[0],
): Promise<TabLite[]> {
  const tabs = (await browser.tabs.query(queryInfo)) as RawTab[];

  return tabs.flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });
}

export function getCurrentWindowTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ currentWindow: true });
}

// The tabs the user has highlighted in the current window's strip — Chrome's
// native multi-select. Always includes the active tab, so the result is never
// empty for a normal window.
export function getHighlightedTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ currentWindow: true, highlighted: true });
}

// `orderedIds` is the desired absolute order of every tab in the window (pinned
// block first, then unpinned). Re-queries a fresh snapshot so ids that vanished
// mid-operation are dropped, then issues only the moves needed to reach that
// order (see planFlatMoves) — tabs already in place are left untouched, which
// keeps flicker down. Positioning relative to the live strip keeps
// pinned/unpinned in their Chrome-enforced regions and is immune to a stale
// pinned-count boundary. Takes `windowId` explicitly rather than querying
// `{ currentWindow: true }` — the caller (orchestration's run*) already resolved
// it once; re-resolving here would let a focus change mid-action retarget this
// call. Sequential (not Promise.all): planFlatMoves's absolute indices assume
// each move lands before the next, so the moves must be replayed strictly in
// order.
export async function applyOrder(orderedIds: number[], windowId: number): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const currentTabs = (await browser.tabs.query({ windowId })) as RawTab[];
  const liveOrder = currentTabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : []));

  for (const { id, index } of planFlatMoves(liveOrder, orderedIds)) {
    await browser.tabs.move(id, { index });
  }
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<void> {
  const [firstTabId, ...remainingTabIds] = tabIds;

  if (firstTabId === undefined) {
    return;
  }

  const newWindow = await browser.windows.create({ tabId: firstTabId, focused: true });

  if (newWindow === undefined || typeof newWindow.id !== "number") {
    return;
  }

  // Single-id calls only — chrome.tabs.move's batch/array form has a
  // documented off-by-one that scrambles the destination order.
  for (const tabId of remainingTabIds) {
    await browser.tabs.move(tabId, { windowId: newWindow.id, index: -1 });
  }
}

export async function getCurrentWindowId(): Promise<number> {
  const currentWindow = await browser.windows.getCurrent();

  if (typeof currentWindow.id !== "number") {
    throw new Error("current window has no id");
  }

  return currentWindow.id;
}

// The one ambient current-window resolution a mutating user action gets: id
// and live tabs come back from a single browser.windows.getCurrent query, so
// there's no gap between "find the window" and "read its tabs" for a focus
// change to land in. orchestration.ts's run* functions call this once and
// thread the windowId into every subsequent tabs-service call instead of
// re-resolving "current".
export async function getCurrentWindow(): Promise<{ windowId: number; tabs: TabLite[] }> {
  const currentWindow = (await browser.windows.getCurrent({ populate: true })) as {
    id?: number;
    tabs?: RawTab[];
  };

  if (typeof currentWindow.id !== "number") {
    throw new Error("current window has no id");
  }

  const tabs = (currentWindow.tabs ?? []).flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });

  return { windowId: currentWindow.id, tabs };
}

export async function snapshotWindow(windowId: number): Promise<WindowSnapshot> {
  const [tabs, rawGroups] = await Promise.all([
    queryTabsAsLite({ windowId }),
    browser.tabGroups.query({ windowId }),
  ]);

  const snapshotTabs: SnapshotTab[] = tabs
    .toSorted((a, b) => a.index - b.index)
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      index: tab.index,
      pinned: tab.pinned,
      // toTabLite (queryTabsAsLite) already defaults groupId, so it's never
      // undefined here — a ?? fallback would be dead code no test can reach.
      groupId: tab.groupId!,
    }));

  const snapshotGroups: SnapshotGroup[] = rawGroups.map((group) => ({
    groupId: group.id,
    title: group.title ?? "",
    color: group.color,
    collapsed: group.collapsed,
  }));

  return { windowId, tabs: snapshotTabs, groups: snapshotGroups, savedAt: Date.now() };
}

// Sequential — chrome.tabs.create resolves per-tab, and undo's reopen list has
// no ordering requirement beyond "one call per url", so there's nothing to gain
// from Promise.all beyond risking an unbounded burst of tab creation.
export async function reopenTabs(urls: string[]): Promise<number> {
  for (const url of urls) {
    await browser.tabs.create({ url, active: false });
  }

  return urls.length;
}

async function getLiveStrip(windowId: number): Promise<StripTab[]> {
  const tabs = (await browser.tabs.query({ windowId })) as RawTab[];

  return tabs.flatMap((tab) =>
    typeof tab.id === "number"
      ? [{ id: tab.id, pinned: tab.pinned ?? false, groupId: tab.groupId ?? TAB_GROUP_NONE }]
      : [],
  );
}

// browser.tabs.group/ungroup type their tab-id list as a non-empty tuple; every
// call site below only reaches this after confirming the list is non-empty.
function asNonEmpty(ids: number[]): [number, ...number[]] {
  return ids as [number, ...number[]];
}

// Surviving `ungroupIds` that are currently grouped, pulled out with one batch
// call. Vanished ids and already-ungrouped ids alike read as TAB_GROUP_NONE via
// the `??` fallback, so both are silently dropped from the ungroup call rather
// than special-cased — but they are NOT the same signal: an already-ungrouped id
// is present in the live strip (just group-less), a vanished one is absent from
// it entirely. Returns the vanished subset (the `liveIds` set is what tells the
// two apart) so applyPlan can count planned ids that disappeared; the ids passed
// to browser.tabs.ungroup are unchanged.
async function runUngroup(windowId: number, ungroupIds: number[]): Promise<number[]> {
  if (ungroupIds.length === 0) {
    return [];
  }

  const live = await getLiveStrip(windowId);
  const liveIds = new Set(live.map((tab) => tab.id));
  const liveGroupId = new Map(live.map((tab) => [tab.id, tab.groupId]));
  const grouped = ungroupIds.filter(
    (id) => (liveGroupId.get(id) ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE,
  );

  if (grouped.length > 0) {
    await browser.tabs.ungroup(asNonEmpty(grouped));
  }

  return ungroupIds.filter((id) => !liveIds.has(id));
}

// Reconciles the live groups against `desired` (see planGroupOps) and executes
// the resulting ops in order. A "create" op's returned groupId is captured by
// its plan-local key so the "update" op emitted right after it (group-ops.ts's
// contract) can resolve which live group to stamp metadata onto.
async function runGroups(
  windowId: number,
  groups: GroupSpec[],
): Promise<{ grouped: number; groupsCreated: number; vanished: number[] }> {
  // A groupless plan — plain sort, dedupe, ungroup-only undo — should not pay
  // for two queries (the live strip and tabGroups.query) it has no use for;
  // bail before either fires, matching sibling phases runUngroup/runClose.
  if (groups.length === 0) {
    return { grouped: 0, groupsCreated: 0, vanished: [] };
  }

  const [strip, rawGroups] = await Promise.all([
    getLiveStrip(windowId),
    browser.tabGroups.query({ windowId }),
  ]);

  const live: LiveGroup[] = rawGroups.map((group) => ({
    groupId: group.id,
    title: group.title ?? "",
    color: group.color,
    collapsed: group.collapsed,
    tabIds: strip.filter((tab) => tab.groupId === group.id).map((tab) => tab.id),
  }));

  const survivorIds = new Set(strip.map((tab) => tab.id));
  // A tab pinned after the plan was built must not reach tabs.group() — Chrome
  // silently unpins any tab it groups (CONTEXT.md's grouping-unpins gotcha),
  // which would revert the user's just-issued pin. Re-check against this fresh
  // strip query, the same source survivorIds comes from.
  const pinnedIds = new Set(strip.filter((tab) => tab.pinned).map((tab) => tab.id));
  // A plan-referenced id absent from this fresh strip vanished before GROUPS
  // ran. An id dropped only by the pinnedIds check below did NOT vanish —
  // pinned exclusion is deliberate policy, so only non-survivors are counted.
  const vanished = groups.flatMap((group) => group.tabIds.filter((id) => !survivorIds.has(id)));
  const desired = groups
    .map((group) => ({
      ...group,
      tabIds: group.tabIds.filter((id) => survivorIds.has(id) && !pinnedIds.has(id)),
    }))
    .filter((group) => group.tabIds.length > 0);

  const createdGroupIds = new Map<string, number>();
  let grouped = 0;
  let groupsCreated = 0;

  for (const op of planGroupOps(live, desired)) {
    if (op.type === "group") {
      await browser.tabs.group({ tabIds: asNonEmpty(op.tabIds), groupId: op.groupId });
      grouped += op.tabIds.length;
      continue;
    }

    if (op.type === "create") {
      const groupId = await browser.tabs.group({ tabIds: asNonEmpty(op.tabIds) });
      createdGroupIds.set(op.key, groupId);
      grouped += op.tabIds.length;
      groupsCreated += 1;
      continue;
    }

    const resolvedId =
      "groupId" in op.target ? op.target.groupId : createdGroupIds.get(op.target.key)!;
    await browser.tabGroups.update(resolvedId, {
      title: op.title,
      color: op.color,
      collapsed: op.collapsed,
    });
  }

  return { grouped, groupsCreated, vanished };
}

// Realizes `plan.order` against the live strip. Skipped entirely by the caller
// when `plan.order` is empty (the dedupe case: leave positions alone). Returns
// the plan.order ids absent from this phase's own strip (vanished), computed up
// front so the fast path can report them without threading a count through
// applyOrder (whose void signature and self-re-query semantics stay unchanged).
async function runOrder(windowId: number, plan: TabPlan): Promise<number[]> {
  const strip = await getLiveStrip(windowId);
  const hasLiveGroups = strip.some((tab) => tab.groupId !== TAB_GROUP_NONE);
  const liveIds = new Set(strip.map((tab) => tab.id));
  const vanished = plan.order.filter((id) => !liveIds.has(id));

  // FAST PATH: nothing here or upstream touches groups, so the general block
  // model degenerates to a plain reorder — hand it to the proven minimal-moves
  // path instead of re-deriving the same result the slow way.
  if (plan.groups.length === 0 && plan.ungroup.length === 0 && !hasLiveGroups) {
    await applyOrder(plan.order, windowId);
    return vanished;
  }

  // planBlockMoves already simulated the whole sequence against the strip; issue
  // each emitted move against the live window. Sequential (not Promise.all):
  // every move shifts live indices, so the planner's absolute indices only hold
  // if they land strictly in order.
  for (const move of planBlockMoves(strip, plan.order)) {
    if (move.kind === "tab") {
      await browser.tabs.move(move.id, { index: move.index });
    } else {
      await browser.tabGroups.move(move.groupId, { index: move.index });
    }
  }

  return vanished;
}

// Surviving `plan.close` ids, removed with one batch call; already-vanished
// ids are silently dropped rather than special-cased. Returns both the closed
// count and the vanished subset (plan.close ids absent from the live query) so
// applyPlan can fold the latter into its cross-phase vanished total.
async function runClose(
  windowId: number,
  closeIds: number[],
): Promise<{ closed: number; vanished: number[] }> {
  if (closeIds.length === 0) {
    return { closed: 0, vanished: [] };
  }

  const live = await getLiveStrip(windowId);
  const liveIds = new Set(live.map((tab) => tab.id));
  const surviving = closeIds.filter((id) => liveIds.has(id));

  if (surviving.length > 0) {
    await browser.tabs.remove(surviving);
  }

  return { closed: surviving.length, vanished: closeIds.filter((id) => !liveIds.has(id)) };
}

// Realizes a TabPlan against `windowId` in four phases — UNGROUP, GROUPS,
// ORDER, CLOSE — each re-deriving survivors from a fresh `{ windowId }` query,
// so a tab that vanishes mid-operation is silently dropped rather than
// corrupting a later phase's index math. GROUPS runs before ORDER: tabs.group()
// auto-moves its members to be contiguous, which is what makes ORDER's block
// model valid — by the time it queries, every group is already one relocatable
// span. `windowId` is the caller's job to resolve (once, ambiently) — every
// query here is scoped to it explicitly, never to `{ currentWindow: true }`,
// so a focus change after the caller resolved it can't retarget these calls.
//
// `vanished` reports how many DISTINCT plan-referenced ids the phases found
// missing from their own fresh queries — the same silent drops described above,
// now counted. Each phase returns the ids it saw vanish and applyPlan unions
// them, so an id gone for two phases counts once. Detection only: no phase's
// browser-call sequence changes, and a vanished id is still dropped, never chased.
export async function applyPlan(
  plan: TabPlan,
  windowId: number,
): Promise<{ grouped: number; groupsCreated: number; closed: number; vanished: number }> {
  const vanished = new Set<number>();

  for (const id of await runUngroup(windowId, plan.ungroup)) {
    vanished.add(id);
  }

  const {
    grouped,
    groupsCreated,
    vanished: groupVanished,
  } = await runGroups(windowId, plan.groups);
  for (const id of groupVanished) {
    vanished.add(id);
  }

  if (plan.order.length > 0) {
    for (const id of await runOrder(windowId, plan)) {
      vanished.add(id);
    }
  }

  const { closed, vanished: closeVanished } = await runClose(windowId, plan.close);
  for (const id of closeVanished) {
    vanished.add(id);
  }

  return { grouped, groupsCreated, closed, vanished: vanished.size };
}
