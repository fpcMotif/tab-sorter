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

function countChanged(desired: number[], current: number[]): number {
  return desired.filter((id, index) => current[index] !== id).length;
}

export async function runSort(mode: SortMode): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);

  if (tabs.length <= 1) {
    return { moved: 0 };
  }

  const sortFn = mode === "title" ? sortByTitle : sortByDomain;
  const pinned = tabs.filter((tab) => tab.pinned);
  const unpinned = tabs.filter((tab) => !tab.pinned);

  // Chrome keeps pinned tabs at the front of the window and clamps any move
  // that would cross that boundary, so pinned and unpinned are sorted within
  // their own regions and never interleaved. When ignorePinned is set the
  // pinned block is left exactly as-is.
  const pinnedOrder = prefs.ignorePinned ? pinned.map((tab) => tab.id) : sortFn(pinned);
  const desiredOrder = [...pinnedOrder, ...sortFn(unpinned)];
  const moved = countChanged(
    desiredOrder,
    tabs.map((tab) => tab.id),
  );

  if (moved === 0) {
    return { moved: 0 };
  }

  await applyOrder(desiredOrder);

  return { moved };
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
