import type { TabLite } from "@tab-sorter/core/types";

export interface DedupeOptions {
  ignoreHash: boolean;
  ignoreQuery: boolean;
}

function byIndex(a: TabLite, b: TabLite): number {
  return a.index - b.index;
}

// A normalized string identity for a tab's URL, or undefined if `url` can't
// yield one (empty/whitespace-only or unparseable) — an undefined-keyed tab is
// NEVER treated as a duplicate of anything, including another undefined one.
// Deliberately does NOT strip a leading 'www.' the way getDomain does: dedupe
// judges URL identity (the same page, reachable the same way), not domain
// grouping, so https://www.x.com and https://x.com stay distinct pages here.
export function normalizeUrl(url: string, opts: DedupeOptions): string | undefined {
  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    // `host` (not `hostname`) so a non-default port still distinguishes two
    // URLs, while WHATWG URL parsing has already dropped a DEFAULT port
    // (e.g. http://x.com:80 parses to the same host as http://x.com).
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname;
    const search = opts.ignoreQuery ? "" : parsed.search;
    const hash = opts.ignoreHash ? "" : parsed.hash;

    return `${parsed.protocol}//${host}${path}${search}${hash}`;
  } catch {
    return undefined;
  }
}

// Buckets every tab by its normalized URL; a bucket of size 1 is never a
// duplicate. Within a bucket that IS a duplicate set, the keeper is the
// lowest-index pinned tab if any tab in the bucket is pinned, else the
// lowest-index tab overall — and every unpinned non-keeper is marked to
// close. A pinned tab is never closed, even if another pinned tab in the
// same bucket is the keeper (tabs.remove would destroy it same as any tab;
// the product rule is simply that dedupe never touches pinned tabs).
export function planDedupe(
  tabs: TabLite[],
  opts: DedupeOptions,
): { keep: number[]; close: number[] } {
  const buckets = new Map<string, TabLite[]>();
  const keep: TabLite[] = [];
  const close: TabLite[] = [];

  for (const tab of tabs) {
    const key = normalizeUrl(tab.url, opts);

    if (key === undefined) {
      keep.push(tab);
      continue;
    }

    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [tab]);
    } else {
      bucket.push(tab);
    }
  }

  for (const bucket of buckets.values()) {
    const pinnedInBucket = bucket.filter((tab) => tab.pinned);
    const candidates = pinnedInBucket.length > 0 ? pinnedInBucket : bucket;
    const keeper = candidates.reduce((lowest, tab) => (tab.index < lowest.index ? tab : lowest));

    for (const tab of bucket) {
      if (tab.id === keeper.id || tab.pinned) {
        keep.push(tab);
      } else {
        close.push(tab);
      }
    }
  }

  return {
    keep: keep.toSorted(byIndex).map((tab) => tab.id),
    close: close.toSorted(byIndex).map((tab) => tab.id),
  };
}
