import { getDomain } from "./domain";
import { sortByTitle } from "./sort";
import { GROUP_COLORS, TAB_GROUP_NONE } from "./types";
import type { GroupColor, GroupOrder, GroupSpec, Prefs, TabLite, TabPlan } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function isGrouped(tab: TabLite): boolean {
  return (tab.groupId ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE;
}

// Deterministic domain -> palette color, so the same domain always gets the
// same swatch across tidy runs (a djb2 string hash needs no shared state or
// storage). Collisions across the 9-color palette are expected and accepted
// per the PRD ("Many domains > 9 colors" — title disambiguates).
export function assignColor(domain: string): GroupColor {
  let hash = 5381;

  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 33 + domain.charCodeAt(i)) | 0;
  }

  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]!;
}

function compareBuckets(
  groupOrder: GroupOrder,
  left: { domain: string; tabs: TabLite[] },
  right: { domain: string; tabs: TabLite[] },
): number {
  if (groupOrder === "sizeDesc" && left.tabs.length !== right.tabs.length) {
    return right.tabs.length - left.tabs.length;
  }

  return collator.compare(left.domain, right.domain);
}

// Sort + group in one verb. Pinned tabs are never reordered or grouped — they
// form the frozen prefix of `order`. With `regroupExisting` off (the default),
// tidy only claims UNGROUPED unpinned tabs; the human's own groups are atomic
// blocks that keep their current relative and internal order, placed first in
// the unpinned region. With it on, ALL unpinned tabs are claimed and rebucketed
// by domain, dissolving old groups; ids that end up ungrouped (leftover
// singletons) are reported in `ungroup` — a tab moving into a new group needs
// no entry, since `tabs.group()` implicitly removes it from its old group.
export function planTidy(
  tabs: TabLite[],
  prefs: Pick<Prefs, "minGroupSize" | "groupOrder" | "collapseAfterTidy" | "regroupExisting">,
): TabPlan {
  const pinnedOrder = tabs.filter((tab) => tab.pinned).map((tab) => tab.id);
  const unpinned = tabs.filter((tab) => !tab.pinned);

  const existingBlockOrder = prefs.regroupExisting
    ? []
    : unpinned.filter(isGrouped).map((tab) => tab.id);
  const claimed = prefs.regroupExisting ? unpinned : unpinned.filter((tab) => !isGrouped(tab));

  const buckets = new Map<string, TabLite[]>();
  for (const tab of claimed) {
    const domain = getDomain(tab.url);
    const bucket = buckets.get(domain);

    if (bucket === undefined) {
      buckets.set(domain, [tab]);
    } else {
      bucket.push(tab);
    }
  }

  const newBuckets: { domain: string; tabs: TabLite[] }[] = [];
  const leftover: TabLite[] = [];

  for (const [domain, bucketTabs] of buckets) {
    if (bucketTabs.length >= prefs.minGroupSize) {
      newBuckets.push({ domain, tabs: bucketTabs });
    } else {
      leftover.push(...bucketTabs);
    }
  }

  const groups: GroupSpec[] = newBuckets
    .toSorted((left, right) => compareBuckets(prefs.groupOrder, left, right))
    .map(({ domain, tabs: bucketTabs }) => ({
      key: domain,
      title: domain,
      color: assignColor(domain),
      collapsed: prefs.collapseAfterTidy,
      tabIds: sortByTitle(bucketTabs),
    }));

  const order = [
    ...pinnedOrder,
    ...existingBlockOrder,
    ...groups.flatMap((group) => group.tabIds),
    ...sortByTitle(leftover),
  ];

  // Previously-grouped tabs that landed as leftover singletons must be told to
  // ungroup; ones absorbed into a new group leave their old group implicitly.
  const ungroup = prefs.regroupExisting ? leftover.filter(isGrouped).map((tab) => tab.id) : [];

  return { order, groups, ungroup, close: [] };
}
