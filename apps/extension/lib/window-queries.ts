import { planDedupe } from "./dedupe";
import { groupByDomain } from "./domain-groups";
import { getMutationState } from "./mutation";
import { getPrefs } from "./storage";
import {
  getAllWindowsTabs,
  getCurrentWindow,
  getHighlightedTabs,
  getWindowCount,
} from "./tabs-service";
import type { DomainGroup, Prefs, TabLite } from "@tab-sorter/core/types";

export interface PopupData {
  windowId: number;
  domainGroups: DomainGroup[];
  prefs: Prefs;
  tabs: TabLite[];
  totalTabs: number;
  duplicateCount: number;
  windowCount: number;
  canUndo: boolean;
  recoveryRequired: boolean;
}

export interface AllWindowsExtract {
  domainGroups: DomainGroup[];
  tabs: TabLite[];
  totalTabs: number;
  windowCount: number;
}

function actionTabs(tabs: TabLite[], prefs: Prefs): TabLite[] {
  return prefs.ignorePinned ? tabs.filter((tab) => !tab.pinned) : tabs;
}

export function getSelectedTabs(): Promise<TabLite[]> {
  return getHighlightedTabs();
}

export async function getPopupData(): Promise<PopupData> {
  const [{ windowId, tabs }, prefs, windowCount] = await Promise.all([
    getCurrentWindow(),
    getPrefs(),
    getWindowCount(),
  ]);
  const filteredTabs = actionTabs(tabs, prefs);
  const { close } = planDedupe(tabs, {
    ignoreHash: prefs.dedupeIgnoreHash,
    ignoreQuery: prefs.dedupeIgnoreQuery,
  });
  const mutationState = await getMutationState(windowId);

  return {
    windowId,
    domainGroups: groupByDomain(filteredTabs),
    prefs,
    tabs: filteredTabs,
    totalTabs: tabs.length,
    duplicateCount: close.length,
    windowCount,
    ...mutationState,
  };
}

// Fetched lazily when the user flips the scope toggle, so popup-open cost stays
// a single-window query.
export async function getAllWindowsExtract(): Promise<AllWindowsExtract> {
  const [allTabs, prefs, windowCount] = await Promise.all([
    getAllWindowsTabs(),
    getPrefs(),
    getWindowCount(),
  ]);
  const filteredTabs = actionTabs(allTabs, prefs);

  return {
    domainGroups: groupByDomain(filteredTabs),
    tabs: filteredTabs,
    totalTabs: allTabs.length,
    windowCount,
  };
}
