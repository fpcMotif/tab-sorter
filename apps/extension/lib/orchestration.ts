import { matchByDomain, matchByRegex } from "./match.ts";
import { getPrefs } from "./storage.ts";
import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "./tabs-service.ts";
import { sortByDomain, sortByTitle } from "./sort.ts";
import type { SortMode, TabLite } from "./types.ts";

function splitPinned(tabs: TabLite[], ignorePinned: boolean) {
  if (!ignorePinned) {
    return { pinned: [] as TabLite[], unpinned: tabs };
  }

  const pinned: TabLite[] = [];
  const unpinned: TabLite[] = [];

  for (const tab of tabs) {
    if (tab.pinned) {
      pinned.push(tab);
    } else {
      unpinned.push(tab);
    }
  }

  return { pinned, unpinned };
}

export interface SortResult {
  count: number;
}

export async function runSort(mode: SortMode): Promise<SortResult> {
  const prefs = await getPrefs();
  const tabs = await getCurrentWindowTabs();
  const { pinned, unpinned } = splitPinned(tabs, prefs.ignorePinned);

  if (unpinned.length < 2) {
    return { count: 0 };
  }

  const orderedIds = mode === "domain" ? sortByDomain(unpinned) : sortByTitle(unpinned);

  await applyOrder(orderedIds, { afterPinned: pinned.length });

  return { count: orderedIds.length };
}

export type ExtractMatcher =
  | { type: "domain"; domain: string }
  | { type: "regex"; source: string; flags?: string };

export interface ExtractResult {
  count: number;
  windowId?: number;
}

export async function runExtract(matcher: ExtractMatcher): Promise<ExtractResult> {
  const prefs = await getPrefs();
  const tabs = await getCurrentWindowTabs();
  const { unpinned } = splitPinned(tabs, prefs.ignorePinned);

  const matchedIds =
    matcher.type === "domain"
      ? matchByDomain(unpinned, matcher.domain)
      : matchByRegex(unpinned, matcher.source, matcher.flags ?? "i");

  if (matchedIds.length === 0) {
    return { count: 0 };
  }

  await moveTabsToNewWindow(matchedIds);

  return { count: matchedIds.length };
}
