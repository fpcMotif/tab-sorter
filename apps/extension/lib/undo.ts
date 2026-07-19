import { TAB_GROUP_NONE } from "./types";
import type { GroupSpec, TabLite, TabPlan, WindowSnapshot } from "./types";

function byIndex(a: { index: number }, b: { index: number }): number {
  return a.index - b.index;
}

// Turns a captured WindowSnapshot back into a TabPlan for the realize layer,
// against whatever the window looks like NOW. Pinned state is deliberately
// NOT restored — the user's pin changes since the snapshot are respected — so
// survivors are partitioned by their CURRENT pinned flag (never the snapshot's
// one), each partition ordered by snapshot index, and concatenated
// pinned-first to preserve the pinned-front invariant (CONTEXT.md). A tab
// whose pin state flipped since the snapshot just migrates to the other
// partition, still landing at its old relative position within it.
export function planUndo(snapshot: WindowSnapshot, current: TabLite[]): TabPlan {
  const currentById = new Map(current.map((tab) => [tab.id, tab]));
  const survivors = snapshot.tabs.filter((tab) => currentById.has(tab.id));

  const pinnedOrder = survivors
    .filter((tab) => currentById.get(tab.id)!.pinned)
    .toSorted(byIndex)
    .map((tab) => tab.id);
  const unpinnedSurvivors = survivors
    .filter((tab) => !currentById.get(tab.id)!.pinned)
    .toSorted(byIndex);
  const order = [...pinnedOrder, ...unpinnedSurvivors.map((tab) => tab.id)];

  // A tab group's members are always a contiguous run of indices at snapshot
  // time — Chrome never lets an unrelated tab sit between two members of the
  // same group — and a grouped tab is never pinned. So restricting membership
  // to survivors that are STILL unpinned can only shrink a group's run from
  // its edges/middle; it can never splice a foreign id into it. Filtering
  // `unpinnedSurvivors` (already sorted by snapshot index) by groupId is
  // therefore already a contiguous slice of `order`'s unpinned tail.
  const groups: GroupSpec[] = [];
  for (const group of snapshot.groups) {
    const tabIds = unpinnedSurvivors
      .filter((tab) => tab.groupId === group.groupId)
      .map((tab) => tab.id);

    if (tabIds.length >= 1) {
      groups.push({
        key: `g${group.groupId}`,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        tabIds,
      });
    }
  }

  // Ids the plan must explicitly pull OUT of a group: ungrouped at snapshot
  // time, but currently sitting in a live group (so `groups` above says
  // nothing about them — a tab joins at most one group per TabPlan's contract).
  const ungroup = survivors
    .filter((tab) => tab.groupId === TAB_GROUP_NONE)
    .filter((tab) => (currentById.get(tab.id)!.groupId ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE)
    .map((tab) => tab.id);

  return { order, groups, ungroup, close: [] };
}
