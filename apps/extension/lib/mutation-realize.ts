import { planMoves } from "@tab-sorter/core/tab-moves";
import { TAB_GROUP_NONE } from "@tab-sorter/core/types";
import type { GroupSpec, TabPlan } from "@tab-sorter/core/types";

interface RawTab {
  id?: number;
  pinned?: boolean;
  groupId?: number;
}

interface StripTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

interface LiveGroup {
  groupId: number;
  title: string;
  color: GroupSpec["color"];
  collapsed: boolean;
  tabIds: number[];
}

async function getLiveStrip(windowId: number): Promise<StripTab[]> {
  const tabs = (await browser.tabs.query({ windowId })) as RawTab[];

  return tabs.flatMap((tab) =>
    typeof tab.id === "number"
      ? [{ id: tab.id, pinned: tab.pinned ?? false, groupId: tab.groupId ?? TAB_GROUP_NONE }]
      : [],
  );
}

function asNonEmpty(ids: number[]): [number, ...number[]] {
  return ids as [number, ...number[]];
}

function simMove(sim: StripTab[], id: number, index: number): void {
  const from = sim.findIndex((tab) => tab.id === id);
  const tab = sim[from]!;

  sim.splice(from, 1);
  sim.splice(index, 0, tab);
}

// Private fast path for a groupless order. Survivor-strip indices are
// translated to absolute window indices so foreign tabs cannot skew moves.
async function applyOrder(orderedIds: number[], windowId: number): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const currentTabs = (await browser.tabs.query({ windowId })) as RawTab[];
  const liveOrder = currentTabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : []));
  const survivors = new Set(orderedIds.filter((id) => liveOrder.includes(id)));
  const currentOrder = liveOrder.filter((id) => survivors.has(id));
  const targetOrder = orderedIds.filter((id) => survivors.has(id));
  const strip = [...liveOrder];

  for (const { id, index } of planMoves(currentOrder, targetOrder)) {
    strip.splice(strip.indexOf(id), 1);
    const survivorPositions = strip.flatMap((tabId, position) =>
      survivors.has(tabId) ? [position] : [],
    );
    const absoluteIndex = survivorPositions[index] ?? strip.length;
    strip.splice(absoluteIndex, 0, id);
    await browser.tabs.move(id, { index: absoluteIndex });
  }
}

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

function bestOverlap(
  desired: GroupSpec,
  live: LiveGroup[],
  claimed: Set<number>,
): LiveGroup | undefined {
  const desiredIds = new Set(desired.tabIds);
  let best: LiveGroup | undefined;
  let bestCount = 0;

  for (const candidate of live) {
    if (claimed.has(candidate.groupId)) {
      continue;
    }

    const overlap = candidate.tabIds.reduce((count, id) => count + (desiredIds.has(id) ? 1 : 0), 0);
    if (
      overlap > 0 &&
      (best === undefined ||
        overlap > bestCount ||
        (overlap === bestCount && candidate.groupId < best.groupId))
    ) {
      best = candidate;
      bestCount = overlap;
    }
  }

  return best;
}

// Group reconciliation is private realization protocol. Identity requires
// positive member overlap; equal titles never identify a live group.
async function runGroups(windowId: number, groups: GroupSpec[]): Promise<void> {
  if (groups.length === 0) {
    return;
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
  const pinnedIds = new Set(strip.filter((tab) => tab.pinned).map((tab) => tab.id));
  const desired = groups
    .map((group) => ({
      ...group,
      tabIds: group.tabIds.filter((id) => survivorIds.has(id) && !pinnedIds.has(id)),
    }))
    .filter((group) => group.tabIds.length > 0);
  const claimed = new Set<number>();

  for (const spec of desired) {
    const match = bestOverlap(spec, live, claimed);

    if (match === undefined) {
      const groupId = await browser.tabs.group({ tabIds: asNonEmpty(spec.tabIds) });
      await browser.tabGroups.update(groupId, {
        title: spec.title,
        color: spec.color,
        collapsed: spec.collapsed,
      });
      continue;
    }

    claimed.add(match.groupId);
    const liveMembers = new Set(match.tabIds);
    const missing = spec.tabIds.filter((id) => !liveMembers.has(id));

    if (missing.length > 0) {
      await browser.tabs.group({ tabIds: asNonEmpty(missing), groupId: match.groupId });
    }

    if (
      match.title !== spec.title ||
      match.color !== spec.color ||
      match.collapsed !== spec.collapsed
    ) {
      await browser.tabGroups.update(match.groupId, {
        title: spec.title,
        color: spec.color,
        collapsed: spec.collapsed,
      });
    }
  }
}

type OrderBlock = { id: number } | { groupId: number };

async function runOrder(windowId: number, plan: TabPlan): Promise<void> {
  const sim = await getLiveStrip(windowId);
  const hasLiveGroups = sim.some((tab) => tab.groupId !== TAB_GROUP_NONE);

  if (plan.groups.length === 0 && plan.ungroup.length === 0 && !hasLiveGroups) {
    await applyOrder(plan.order, windowId);
    return;
  }

  const survivorIds = new Set(sim.map((tab) => tab.id));
  const desiredSurvivors = plan.order.filter((id) => survivorIds.has(id));
  const pinnedIds = new Set(sim.filter((tab) => tab.pinned).map((tab) => tab.id));
  const idToGroup = new Map(sim.map((tab) => [tab.id, tab.groupId]));
  const currentPinned = sim.filter((tab) => tab.pinned).map((tab) => tab.id);
  const desiredPinned = desiredSurvivors.filter((id) => pinnedIds.has(id));

  for (const move of planMoves(currentPinned, desiredPinned)) {
    await browser.tabs.move(move.id, { index: move.index });
    simMove(sim, move.id, move.index);
  }

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

    if (!seenGroups.has(groupId)) {
      seenGroups.add(groupId);
      blocks.push({ groupId });
    }
  }

  let cursor = pinnedIds.size;
  for (const block of blocks) {
    if ("id" in block) {
      if (sim[cursor]?.id !== block.id) {
        await browser.tabs.move(block.id, { index: cursor });
        simMove(sim, block.id, cursor);
      }
      cursor += 1;
      continue;
    }

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

async function runClose(windowId: number, closeIds: number[]): Promise<void> {
  if (closeIds.length === 0) {
    return;
  }

  const live = await getLiveStrip(windowId);
  const liveIds = new Set(live.map((tab) => tab.id));
  const surviving = closeIds.filter((id) => liveIds.has(id));

  if (surviving.length > 0) {
    await browser.tabs.remove(surviving);
  }
}

// The sole realization interface. Group reconciliation and phase protocol stay
// private; callers receive mutation truth from the transaction's final diff.
export async function realizePlan(plan: TabPlan, windowId: number): Promise<void> {
  await runUngroup(windowId, plan.ungroup);
  await runGroups(windowId, plan.groups);

  if (plan.order.length > 0) {
    await runOrder(windowId, plan);
  }

  await runClose(windowId, plan.close);
}
