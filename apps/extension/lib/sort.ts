import { getDomain } from "./domain.ts";
import type { TabLite } from "./types.ts";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function titleComparator(a: TabLite, b: TabLite): number {
  const byTitle = collator.compare(a.title, b.title);
  if (byTitle !== 0) return byTitle;
  return collator.compare(a.url, b.url);
}

export function sortByTitle(tabs: TabLite[]): number[] {
  return [...tabs].sort(titleComparator).map((tab) => tab.id);
}

export function sortByDomain(tabs: TabLite[]): number[] {
  const grouped = new Map<string, TabLite[]>();

  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    const group = grouped.get(domain) ?? [];
    group.push(tab);
    grouped.set(domain, group);
  }

  const domains = [...grouped.keys()].sort((a, b) => collator.compare(a, b));
  const orderedIds: number[] = [];

  for (const domain of domains) {
    const group = grouped.get(domain);
    if (!group) continue;
    orderedIds.push(...[...group].sort(titleComparator).map((tab) => tab.id));
  }

  return orderedIds;
}
