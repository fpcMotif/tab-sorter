import { getDomain } from "./domain";
import type { DomainGroup, TabLite } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export type PatternErrorReason = "pattern" | "flags" | "tooLong";

export type PatternVerdict =
  | { ok: true; regex: RegExp }
  | { ok: false; reason: PatternErrorReason };

export type MatchResult = { ok: true; ids: number[] } | { ok: false; reason: PatternErrorReason };

// The single safety cap every matching path inherits: a source longer than this
// is refused before compilation, bounding regex backtracking (ReDoS) cost when a
// pattern is run across every tab. Distinct from the options page's stricter
// storage cap on persisted presets — see docs/adr/0001-two-pattern-caps.md.
export const MATCH_SAFETY_CAP = 1000;

// Does `source` compile as a RegExp on its own (ignoring flags)? Used to decide
// whether a compile failure is the pattern's fault or the flags'.
function patternCompiles(source: string): boolean {
  try {
    return Boolean(new RegExp(source));
  } catch {
    return false;
  }
}

// Internal primitive: turns a user-supplied pattern into a RegExp. Strips the
// stateful `g`/`y` flags (a reused matcher advances `lastIndex` between test()
// calls and would silently skip tabs), and on failure reports whether the pattern
// or the flags are at fault. Returns the structural reason rather than throwing.
function compilePattern(
  source: string,
  flags: string,
): { regex: RegExp } | { reason: "pattern" | "flags" } {
  const safeFlags = flags.replace(/[gy]/g, "");

  try {
    return { regex: new RegExp(source, safeFlags) };
  } catch {
    return { reason: patternCompiles(source) ? "flags" : "pattern" };
  }
}

// The single home for judging a user-supplied pattern: enforces the match safety
// cap, then compiles. Never throws — the popup preview, options preset form, and
// extraction all read the same verdict, so validity is one rule everywhere.
export function validatePattern(source: string, flags = "i"): PatternVerdict {
  if (source.length > MATCH_SAFETY_CAP) {
    return { ok: false, reason: "tooLong" };
  }

  const compiled = compilePattern(source, flags);

  return "regex" in compiled
    ? { ok: true, regex: compiled.regex }
    : { ok: false, reason: compiled.reason };
}

// Matches a pattern against every tab's `title\nurl`, returning the ids that hit.
// Validates first, so an invalid or over-long pattern yields a verdict instead of
// a throw or a silently wrong result.
export function matchPattern(tabs: TabLite[], source: string, flags = "i"): MatchResult {
  const verdict = validatePattern(source, flags);

  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason };
  }

  const ids: number[] = [];

  for (const tab of tabs) {
    if (verdict.regex.test(`${tab.title}\n${tab.url}`)) {
      ids.push(tab.id);
    }
  }

  return { ok: true, ids };
}

const REASON_MESSAGES: Record<PatternErrorReason, string> = {
  pattern: "Invalid regular expression.",
  flags: "Invalid regex flags.",
  tooLong: "Pattern is too long.",
};

// The one home for the user-facing copy, so the popup and options can't drift.
export function reasonToString(reason: PatternErrorReason): string {
  return REASON_MESSAGES[reason];
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

  return Array.from(groups.values()).toSorted(
    (left, right) => right.count - left.count || collator.compare(left.domain, right.domain),
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
