import { getDomain } from "./domain";
import type { DomainGroup, TabLite } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export class InvalidPatternError extends Error {
  constructor(source: string, options?: ErrorOptions) {
    super(`Invalid regular expression: ${source}`, options);
    this.name = "InvalidPatternError";
  }
}

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

  return [...groups.values()].sort(
    (left, right) => right.count - left.count || collator.compare(left.domain, right.domain),
  );
}

export function matchByDomain(tabs: TabLite[], domain: string): number[] {
  return tabs.filter((tab) => getDomain(tab.url) === domain).map((tab) => tab.id);
}

export function matchByRegex(tabs: TabLite[], source: string, flags = "i"): number[] {
  let matcher: RegExp;

  // Strip stateful flags: a reused `g`/`y` regex advances `lastIndex` between
  // `test()` calls and would silently skip matching tabs across the filter loop.
  const safeFlags = flags.replace(/[gy]/g, "");

  try {
    matcher = new RegExp(source, safeFlags);
  } catch (error) {
    throw new InvalidPatternError(source, { cause: error });
  }

  return tabs.filter((tab) => matcher.test(`${tab.title}\n${tab.url}`)).map((tab) => tab.id);
}
