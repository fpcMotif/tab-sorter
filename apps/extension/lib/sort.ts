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
    compareText(left.title || left.url, right.title || right.url) ||
    compareText(left.url, right.url) ||
    left.index - right.index
  );
}

export function sortByTitle(tabs: TabLite[]): number[] {
  return [...tabs].sort(compareByTitle).map((tab) => tab.id);
}

export function sortByDomain(tabs: TabLite[]): number[] {
  return [...tabs]
    .sort((left, right) => {
      const domainOrder = compareText(getDomain(left.url), getDomain(right.url));
      return domainOrder || compareByTitle(left, right);
    })
    .map((tab) => tab.id);
}
