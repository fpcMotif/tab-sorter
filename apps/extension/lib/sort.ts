import { getDomain } from "./domain";
import type { TabLite } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareText(left: string, right: string): number {
  return collator.compare(left, right);
}

function compareByTitle(left: TabLite, right: TabLite): number {
  return (
    compareText(left.title, right.title) ||
    compareText(left.url, right.url) ||
    left.index - right.index ||
    left.id - right.id
  );
}

export function sortByTitle(tabs: TabLite[]): number[] {
  return tabs.toSorted(compareByTitle).map((tab) => tab.id);
}

export function sortByDomain(tabs: TabLite[]): number[] {
  // Decorate-sort-undecorate: resolve each domain exactly once up front. A bare
  // comparator would call the (URL-parsing) `getDomain` O(n log n) times; this
  // pins it at O(n) while producing the identical order.
  return tabs
    .map((tab) => ({ tab, domain: getDomain(tab.url) }))
    .toSorted(
      (left, right) =>
        compareText(left.domain, right.domain) || compareByTitle(left.tab, right.tab),
    )
    .map((entry) => entry.tab.id);
}
