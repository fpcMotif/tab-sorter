import { planGroupOps } from "./group-ops";
import type { LiveGroup } from "./group-ops";
import { planMoves } from "./tab-moves";
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
// order (see planMoves) — tabs already in place are left untouched, which keeps
// flicker down. Positioning relative to the live strip keeps pinned/unpinned in
// their Chrome-enforced regions and is immune to a stale pinned-count boundary.
// Takes `windowId` explicitly rather than querying `{ currentWindow: true }` —
// the caller (orchestration's run*) already resolved it once; re-resolving
// here would let a focus change mid-action retarget this call.
export async function applyOrder(orderedIds: number[], windowId: number): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const currentTabs = (await browser.tabs.query({ windowId })) as RawTab[];
  const liveOrder = currentTabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : []));
  const liveIds = new Set(liveOrder);
  const survivors = new Set(orderedIds.filter((id) => liveIds.has(id)));
  const currentOrder = liveOrder.filter((id) => survivors.has(id));
  const targetOrder = orderedIds.filter((id) => survivors.has(id));

  // planMoves works in survivor-strip coordinates, but browser.tabs.move takes an
  // ABSOLUTE window index. A tab opened between the sort snapshot and this
  // re-query is a non-survivor still sitting in the live window, so a raw replay
  // would shift survivors by however many such tabs precede each move. Translate
  // each survivor-strip index to its absolute slot — the position of the index-th
  // surviving tab (or the window end) — against a simulation of the full strip.
  // Sequential (not Promise.all): each move shifts live indices, so the moves
  // must be replayed strictly in order.
  const strip = [...liveOrder];

  for (const { id, index } of planMoves(currentOrder, targetOrder)) {
    strip.splice(strip.indexOf(id), 1);
    const survivorPositions = strip.flatMap((tabId, position) =>
      survivors.has(tabId) ? [position] : [],
    );
    const absoluteIndex =
      index < survivorPositions.length ? survivorPositions[index] : strip.length;
    strip.splice(absoluteIndex, 0, id);
    await browser.tabs.move(id, { index: absoluteIndex });
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

// The live strip's realize-layer view: just enough per-tab state (id, pinned,
// group membership) to drive the ORDER phase's block model. Distinct from
// TabLite — the pure layer's shape — because this is browser-boundary-only data.
interface StripTab {
  id: number;
  pinned: boolean;
  groupId: number;
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

// Removes `id` from wherever it sits in `sim` and reinserts it at the absolute
// `index`, mirroring the single browser.tabs.move call just issued so every
// later phase reasons about the live strip's CURRENT layout, not a stale one.
function simMove(sim: StripTab[], id: number, index: number): void {
  const from = sim.findIndex((tab) => tab.id === id);
  const tab = sim[from];

  sim.splice(from, 1);
  sim.splice(index, 0, tab);
}

// Surviving `ungroupIds` that are currently grouped, pulled out with one batch
// call. Vanished ids and already-ungrouped ids alike read as TAB_GROUP_NONE via
// the `??` fallback, so both are silently dropped rather than special-cased.
async function runUngroup(windowId: number, ungroupIds: number[]): Promise<void> {
  if (ungroupIds.length === 0) {
    return;
  }

  const live = await getLiveStrip(windowId);
  const liveGroupId = new Map(live.map((tab) => [tab.id, tab.groupId]));
  const grouped = ungroupIds.filter(
    (id) => (liveGroupId.get(id) ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE,
  );

  if (grouped.length > 0) {
    await browser.tabs.ungroup(asNonEmpty(grouped));
  }
}

// Reconciles the live groups against `desired` (see planGroupOps) and executes
// the resulting ops in order. A "create" op's returned groupId is captured by
// its plan-local key so the "update" op emitted right after it (group-ops.ts's
// contract) can resolve which live group to stamp metadata onto.
async function runGroups(
  windowId: number,
  groups: GroupSpec[],
): Promise<{ grouped: number; groupsCreated: number }> {
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

  return { grouped, groupsCreated };
}

type OrderBlock = { id: number } | { groupId: number };

// Realizes `plan.order` against the live strip. Skipped entirely by the caller
// when `plan.order` is empty (the dedupe case: leave positions alone).
async function runOrder(windowId: number, plan: TabPlan): Promise<void> {
  const sim = await getLiveStrip(windowId);
  const hasLiveGroups = sim.some((tab) => tab.groupId !== TAB_GROUP_NONE);

  // FAST PATH: nothing here or upstream touches groups, so the general block
  // model degenerates to a plain reorder — hand it to the proven minimal-moves
  // path instead of re-deriving the same result the slow way.
  if (plan.groups.length === 0 && plan.ungroup.length === 0 && !hasLiveGroups) {
    await applyOrder(plan.order, windowId);
    return;
  }

  const survivorIds = new Set(sim.map((tab) => tab.id));
  const desiredSurvivors = plan.order.filter((id) => survivorIds.has(id));
  const pinnedIds = new Set(sim.filter((tab) => tab.pinned).map((tab) => tab.id));
  const idToGroup = new Map(sim.map((tab) => [tab.id, tab.groupId]));

  // (a) Pinned region: pinned tabs are always the window's contiguous front
  // block, so the region-relative index planMoves returns IS the absolute one.
  const currentPinned = sim.filter((tab) => tab.pinned).map((tab) => tab.id);
  const desiredPinned = desiredSurvivors.filter((id) => pinnedIds.has(id));

  for (const move of planMoves(currentPinned, desiredPinned)) {
    await browser.tabs.move(move.id, { index: move.index });
    simMove(sim, move.id, move.index);
  }

  // (b) Within each live group, fix member order before relocating the group
  // as a whole in (c) — tabGroups.move carries members along in their current
  // relative order, so getting that order right first means the group only
  // ever needs the one relocating move.
  const reordered = new Set<number>();
  for (const id of desiredSurvivors) {
    const groupId = idToGroup.get(id)!;
    if (groupId === TAB_GROUP_NONE || reordered.has(groupId)) {
      continue;
    }
    reordered.add(groupId);

    const currentMembers = sim.filter((tab) => tab.groupId === groupId).map((tab) => tab.id);
    const desiredMembers = desiredSurvivors.filter(
      (memberId) => idToGroup.get(memberId) === groupId,
    );
    const spanStart = sim.findIndex((tab) => tab.groupId === groupId);

    for (const move of planMoves(currentMembers, desiredMembers)) {
      const absoluteIndex = spanStart + move.index;
      await browser.tabs.move(move.id, { index: absoluteIndex });
      simMove(sim, move.id, absoluteIndex);
    }
  }

  // (c) Top-level blocks: walk the desired unpinned sequence left to right,
  // relocating each group (as one contiguous span, via tabGroups.move) or
  // ungrouped singleton (via tabs.move) into place. A live tab absent from
  // `plan.order` is never a target, so it just keeps its slot and drifts
  // toward the end as blocks get inserted ahead of it.
  //
  // A live group's members can appear non-contiguously in `desiredSurvivors`
  // (e.g. a plain group-agnostic sort like planWindowOrder interleaves an
  // unrelated id between them) even though Chrome enforces contiguity for
  // every live group. Emit exactly one block per live groupId, at its first
  // member's position — a second sighting is skipped rather than opening a
  // rival block for the same real group, which would otherwise undercount
  // the span and let a later move land inside it.
  const blocks: OrderBlock[] = [];
  const seenGroups = new Set<number>();

  for (const id of desiredSurvivors) {
    if (pinnedIds.has(id)) {
      continue;
    }

    const groupId = idToGroup.get(id)!;
    if (groupId === TAB_GROUP_NONE) {
      blocks.push({ id });
      continue;
    }

    if (seenGroups.has(groupId)) {
      continue;
    }
    seenGroups.add(groupId);
    blocks.push({ groupId });
  }

  let cursor = pinnedIds.size;
  for (const block of blocks) {
    if ("id" in block) {
      if (sim[cursor].id !== block.id) {
        await browser.tabs.move(block.id, { index: cursor });
        simMove(sim, block.id, cursor);
      }
      cursor += 1;
      continue;
    }

    // tabGroups.move relocates the group's full live membership — which may
    // include ids `plan.order` never mentions — so the span width comes from
    // the live strip, not from however many of its members `desiredSurvivors`
    // happened to name.
    const spanStart = sim.findIndex((tab) => tab.groupId === block.groupId);
    const spanWidth = sim.filter((tab) => tab.groupId === block.groupId).length;
    if (spanStart !== cursor) {
      await browser.tabGroups.move(block.groupId, { index: cursor });
      const span = sim.splice(spanStart, spanWidth);
      sim.splice(cursor, 0, ...span);
    }
    cursor += spanWidth;
  }
}

// Surviving `plan.close` ids, removed with one batch call; already-vanished
// ids are silently dropped rather than special-cased.
async function runClose(windowId: number, closeIds: number[]): Promise<number> {
  if (closeIds.length === 0) {
    return 0;
  }

  const live = await getLiveStrip(windowId);
  const liveIds = new Set(live.map((tab) => tab.id));
  const surviving = closeIds.filter((id) => liveIds.has(id));

  if (surviving.length > 0) {
    await browser.tabs.remove(surviving);
  }

  return surviving.length;
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
export async function applyPlan(
  plan: TabPlan,
  windowId: number,
): Promise<{ grouped: number; groupsCreated: number; closed: number }> {
  await runUngroup(windowId, plan.ungroup);
  const { grouped, groupsCreated } = await runGroups(windowId, plan.groups);

  if (plan.order.length > 0) {
    await runOrder(windowId, plan);
  }

  const closed = await runClose(windowId, plan.close);

  return { grouped, groupsCreated, closed };
}
