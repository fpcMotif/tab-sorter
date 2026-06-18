import { groupByDomain, matchByDomain, matchByRegex } from "./match";
import { sortByDomain, sortByTitle } from "./sort";
import { getPrefs } from "./storage";
import { applyOrder, getCurrentWindowTabs, moveTabsToNewWindow } from "./tabs-service";
import type { DomainGroup, Prefs, SortMode, TabLite } from "./types";

export type ExtractMatcher =
  | { type: "domain"; domain: string }
  | { type: "regex"; source: string; flags?: string };

export interface ActionResult {
  moved: number;
}

export interface PopupData {
  domainGroups: DomainGroup[];
  prefs: Prefs;
  tabs: TabLite[];
}

function getActionTabs(tabs: TabLite[], prefs: Prefs): TabLite[] {
  return prefs.ignorePinned ? tabs.filter((tab) => !tab.pinned) : tabs;
}

function sameOrder(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function runSort(mode: SortMode): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const sortableTabs = getActionTabs(tabs, prefs);

  if (sortableTabs.length <= 1) {
    return { moved: 0 };
  }

  const orderedIds = mode === "title" ? sortByTitle(sortableTabs) : sortByDomain(sortableTabs);
  const currentIds = sortableTabs.map((tab) => tab.id);

  if (sameOrder(orderedIds, currentIds)) {
    return { moved: 0 };
  }

  await applyOrder(orderedIds, { afterPinned: prefs.ignorePinned ? tabs.length - sortableTabs.length : 0 });

  return { moved: orderedIds.length };
}

export async function runDefaultSort(): Promise<ActionResult> {
  const prefs = await getPrefs();

  return runSort(prefs.defaultSort);
}

export async function runExtract(matcher: ExtractMatcher): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const extractableTabs = getActionTabs(tabs, prefs);
  const matchedIds =
    matcher.type === "domain"
      ? matchByDomain(extractableTabs, matcher.domain)
      : matchByRegex(extractableTabs, matcher.source, matcher.flags);

  if (matchedIds.length === 0) {
    return { moved: 0 };
  }

  await moveTabsToNewWindow(matchedIds);

  return { moved: matchedIds.length };
}

export async function getPopupData(): Promise<PopupData> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const extractableTabs = getActionTabs(tabs, prefs);

  return {
    domainGroups: groupByDomain(extractableTabs),
    prefs,
    tabs: extractableTabs,
  };
}
