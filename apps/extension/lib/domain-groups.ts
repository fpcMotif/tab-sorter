import { getDomain } from "./domain";
import { compareText } from "@tab-sorter/core/text";
import type { DomainGroup, TabLite } from "@tab-sorter/core/types";

export function groupByDomain(tabs: TabLite[]): DomainGroup[] {
  const groups = new Map<string, DomainGroup>();

  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    const group = groups.get(domain);

    if (group === undefined) {
      groups.set(domain, { domain, count: 1, tabIds: [tab.id] });
    } else {
      group.count += 1;
      group.tabIds.push(tab.id);
    }
  }

  return Array.from(groups.values()).toSorted(
    (left, right) => right.count - left.count || compareText(left.domain, right.domain),
  );
}

export function matchByDomain(tabs: TabLite[], domain: string): number[] {
  const ids: number[] = [];

  for (const tab of tabs) {
    if (getDomain(tab.url) === domain) {
      ids.push(tab.id);
    }
  }

  return ids;
}
