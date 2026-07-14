import type { GroupColor, GroupSpec } from "./types";

// A tab-group already open in the window, read back from the browser. The
// pure sibling of `TabMove`/`planMoves` (see lib/tab-moves.ts) for the GROUP
// axis: this file never touches `browser.tabGroups`, only plain data.
export interface LiveGroup {
  groupId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
  tabIds: number[];
}

export type GroupOp =
  | { type: "group"; tabIds: number[]; groupId: number }
  | { type: "create"; key: string; tabIds: number[] }
  | {
      type: "update";
      target: { groupId: number } | { key: string };
      title: string;
      color: GroupColor;
      collapsed: boolean;
    };

// The unclaimed live group that best matches `desired`, or undefined if none
// qualifies. Two-tier rule, overlap always wins over title:
//   1. Most desired members in common (ties -> lowest groupId). Zero overlap
//      never counts here — an empty live group would otherwise "win" every
//      desired group it's compared against first.
//   2. Only when no live group shares a single member: the first unclaimed
//      live group whose title exactly equals desired.title (ties -> lowest
//      groupId). Covers re-tidy after a group's members were closed and
//      same-domain tabs reopened — without this, tidy spins up a duplicate
//      group with the same title instead of reusing the old one.
function bestMatch(
  desired: GroupSpec,
  live: LiveGroup[],
  claimed: Set<number>,
): LiveGroup | undefined {
  const desiredIds = new Set(desired.tabIds);
  let best: LiveGroup | undefined;
  let bestOverlap = 0;

  for (const candidate of live) {
    if (claimed.has(candidate.groupId)) {
      continue;
    }

    const overlap = candidate.tabIds.reduce((count, id) => count + (desiredIds.has(id) ? 1 : 0), 0);
    if (overlap === 0) {
      continue;
    }

    const better =
      best === undefined ||
      overlap > bestOverlap ||
      (overlap === bestOverlap && candidate.groupId < best.groupId);
    if (better) {
      best = candidate;
      bestOverlap = overlap;
    }
  }

  if (best !== undefined) {
    return best;
  }

  let titleMatch: LiveGroup | undefined;
  for (const candidate of live) {
    if (claimed.has(candidate.groupId) || candidate.title !== desired.title) {
      continue;
    }
    if (titleMatch === undefined || candidate.groupId < titleMatch.groupId) {
      titleMatch = candidate;
    }
  }

  return titleMatch;
}

// Minimal-diff GROUP reconciler: turns the live groups Chrome already has into
// the ops needed to reach `desired`, touching as little as possible. Mirrors
// planMoves' philosophy — never re-create what is already right. Each desired
// group is matched to at most one live group (see bestMatch); a matched group
// only gets the members it's missing plus a metadata update if something
// actually differs, so a perfect match emits zero ops. An unmatched desired
// group is created fresh, which always needs its own metadata update right
// after (a brand-new group has none of the desired title/color/collapsed yet).
//
// This never emits an "ungroup" op: TabPlan.ungroup (lib/types.ts) is the only
// owner of tabs that must end ungrouped. A tab leaving its matched live group
// is implicitly pulled out by whichever OTHER desired group's "group" op
// claims it — the adapter's `tabs.group()` call moves membership, it doesn't
// need an explicit removal first.
export function planGroupOps(live: LiveGroup[], desired: GroupSpec[]): GroupOp[] {
  const claimed = new Set<number>();
  const ops: GroupOp[] = [];

  for (const spec of desired) {
    const match = bestMatch(spec, live, claimed);

    if (match === undefined) {
      ops.push({ type: "create", key: spec.key, tabIds: spec.tabIds });
      ops.push({
        type: "update",
        target: { key: spec.key },
        title: spec.title,
        color: spec.color,
        collapsed: spec.collapsed,
      });
      continue;
    }

    claimed.add(match.groupId);

    const liveMembers = new Set(match.tabIds);
    const addIds = spec.tabIds.filter((id) => !liveMembers.has(id));
    if (addIds.length > 0) {
      ops.push({ type: "group", tabIds: addIds, groupId: match.groupId });
    }

    if (
      match.title !== spec.title ||
      match.color !== spec.color ||
      match.collapsed !== spec.collapsed
    ) {
      ops.push({
        type: "update",
        target: { groupId: match.groupId },
        title: spec.title,
        color: spec.color,
        collapsed: spec.collapsed,
      });
    }
  }

  return ops;
}
