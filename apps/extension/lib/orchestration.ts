import { groupByDomain, matchByDomain, matchByRegex } from "./match";
import { sortByDomain, sortByTitle } from "./sort";
import { getPrefs } from "./storage";
import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "./tabs-service";
import type { ActionResult, DomainGroup, ExtractMatcher, SortMode, TabLite } from "./types";

function eligibleTabs(tabs: TabLite[], ignorePinned: boolean): TabLite[] {
  return ignorePinned ? tabs.filter((tab) => !tab.pinned) : tabs;
}

function pinnedCount(tabs: TabLite[], ignorePinned: boolean): number {
  return ignorePinned ? tabs.filter((tab) => tab.pinned).length : 0;
}

function hasOrderChanged(tabs: TabLite[], orderedIds: number[]): boolean {
  return orderedIds.some((id, index) => tabs[index]?.id !== id);
}

export async function runSort(mode: SortMode): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const sortableTabs = eligibleTabs(tabs, prefs.ignorePinned);

  if (sortableTabs.length <= 1) {
    return { moved: 0 };
  }

  const orderedIds = mode === "domain" ? sortByDomain(sortableTabs) : sortByTitle(sortableTabs);

  if (!hasOrderChanged(sortableTabs, orderedIds)) {
    return { moved: 0 };
  }

  await applyOrder(orderedIds, { afterPinned: pinnedCount(tabs, prefs.ignorePinned) });
  return { moved: orderedIds.length };
}

export async function runExtract(matcher: ExtractMatcher): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const extractableTabs = eligibleTabs(tabs, prefs.ignorePinned);
  const matchedIds = matcher.type === "domain"
    ? matchByDomain(extractableTabs, matcher.domain)
    : matchByRegex(extractableTabs, matcher.source, matcher.flags);

  if (matchedIds.length === 0) {
    return { moved: 0 };
  }

  await moveTabsToNewWindow(matchedIds);
  return { moved: matchedIds.length };
}

export async function getDomainGroups(): Promise<DomainGroup[]> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  return groupByDomain(eligibleTabs(tabs, prefs.ignorePinned));
}

export async function previewRegexMatches(source: string, flags = ""): Promise<number> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  return matchByRegex(eligibleTabs(tabs, prefs.ignorePinned), source, flags).length;
}
