import { getDomain } from "./domain.ts";
import { InvalidPatternError, type DomainGroup, type TabLite } from "./types.ts";

export function groupByDomain(tabs: TabLite[]): DomainGroup[] {
  const map = new Map<string, number[]>();

  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    const ids = map.get(domain) ?? [];
    ids.push(tab.id);
    map.set(domain, ids);
  }

  const groups: DomainGroup[] = [...map.entries()].map(([domain, tabIds]) => ({
    domain,
    count: tabIds.length,
    tabIds,
  }));

  return groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.domain.localeCompare(b.domain);
  });
}

export function matchByDomain(tabs: TabLite[], domain: string): number[] {
  const needle = domain.toLowerCase();
  return tabs
    .filter((tab) => getDomain(tab.url) === needle)
    .map((tab) => tab.id);
}

export function matchByRegex(
  tabs: TabLite[],
  source: string,
  flags = "i",
): number[] {
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidPatternError(message);
  }

  return tabs
    .filter((tab) => pattern.test(`${tab.title}\n${tab.url}`))
    .map((tab) => tab.id);
}
