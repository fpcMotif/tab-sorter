import { getDomain } from "./domain";
import type { DomainGroup, TabLite } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export class InvalidPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPatternError";
  }
}

export function groupByDomain(tabs: TabLite[]): DomainGroup[] {
  const groups = new Map<string, number[]>();

  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    const tabIds = groups.get(domain) ?? [];
    tabIds.push(tab.id);
    groups.set(domain, tabIds);
  }

  return [...groups.entries()]
    .map(([domain, tabIds]) => ({ domain, count: tabIds.length, tabIds }))
    .sort((left, right) => right.count - left.count || collator.compare(left.domain, right.domain));
}

export function matchByDomain(tabs: TabLite[], domain: string): number[] {
  return tabs.filter((tab) => getDomain(tab.url) === domain).map((tab) => tab.id);
}

export function matchByRegex(tabs: TabLite[], source: string, flags = ""): number[] {
  if (!source.trim()) {
    return [];
  }

  let pattern: RegExp;

  try {
    // Global and sticky flags are meaningless for per-tab boolean tests and
    // would advance lastIndex across calls, silently skipping tabs. Strip them.
    const safeFlags = flags.replace(/[gy]/gu, "");
    pattern = new RegExp(source, safeFlags);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid regular expression";
    throw new InvalidPatternError(message);
  }

  return tabs
    .filter((tab) => pattern.test(`${tab.title}\n${tab.url}`))
    .map((tab) => tab.id);
}
