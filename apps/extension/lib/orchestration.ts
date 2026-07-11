import { planDedupe } from "./dedupe";
import { groupByDomain, matchByDomain, matchPattern } from "./match";
import { planWindowOrder } from "./plan";
import { getPrefs } from "./storage";
import { loadUndo, saveUndo } from "./session-store";
import {
  applyPlan,
  getCurrentWindow,
  getCurrentWindowId,
  getCurrentWindowTabs,
  getHighlightedTabs,
  moveTabsToNewWindow,
  reopenTabs,
  snapshotWindow,
} from "./tabs-service";
import { planTidy } from "./tidy";
import { planUndo } from "./undo";
import type { DomainGroup, Prefs, SortMode, TabLite } from "./types";

export type ExtractMatcher =
  | { type: "domain"; domain: string }
  | { type: "regex"; source: string; flags?: string };

export interface ActionResult {
  moved: number;
}

export interface TidyResult {
  moved: number;
  grouped: number;
  groupsCreated: number;
}

export interface DedupeResult {
  duplicates: number;
  closed: number;
}

export interface UndoResult {
  undone: boolean;
  restored: number;
  reopened: number;
}

export interface PopupData {
  domainGroups: DomainGroup[];
  prefs: Prefs;
  tabs: TabLite[];
  // The window's true tab count, unfiltered by ignorePinned — `tabs` above is
  // the extract-action set (pinned tabs dropped when ignorePinned is on), so
  // it undercounts a pinned-heavy window. Facts-line and the empty-state gate
  // must read this instead.
  totalTabs: number;
  duplicateCount: number;
  canUndo: boolean;
}

function getActionTabs(tabs: TabLite[], prefs: Prefs): TabLite[] {
  return prefs.ignorePinned ? tabs.filter((tab) => !tab.pinned) : tabs;
}

function countChanged(desired: number[], current: number[]): number {
  return desired.filter((id, index) => current[index] !== id).length;
}

// Dispatches on the user's chosen matcher. A regex that fails validation yields
// no ids (the popup gates extraction behind a valid preview), so an unusable
// pattern is a no-op move rather than a thrown error.
function resolveMatchedIds(tabs: TabLite[], matcher: ExtractMatcher): number[] {
  if (matcher.type === "domain") {
    return matchByDomain(tabs, matcher.domain);
  }

  const result = matchPattern(tabs, matcher.source, matcher.flags);

  return result.ok ? result.ids : [];
}

export async function runSort(mode: SortMode): Promise<ActionResult> {
  const [{ windowId, tabs }, prefs] = await Promise.all([getCurrentWindow(), getPrefs()]);

  if (tabs.length <= 1) {
    return { moved: 0 };
  }

  const desiredOrder = planWindowOrder(tabs, mode, prefs.ignorePinned);
  const moved = countChanged(
    desiredOrder,
    tabs.map((tab) => tab.id),
  );

  if (moved === 0) {
    return { moved: 0 };
  }

  // Sort predates snapshots and stays cheap: unlike tidy/dedupe it never
  // groups or closes anything, so it deliberately skips saveUndo.
  await applyPlan({ order: desiredOrder, groups: [], ungroup: [], close: [] }, windowId);

  return { moved };
}

export async function runDefaultSort(): Promise<ActionResult> {
  const prefs = await getPrefs();

  return runSort(prefs.defaultSort);
}

export async function runExtract(matcher: ExtractMatcher): Promise<ActionResult> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const extractableTabs = getActionTabs(tabs, prefs);
  const matchedIds = resolveMatchedIds(extractableTabs, matcher);

  if (matchedIds.length === 0) {
    return { moved: 0 };
  }

  await moveTabsToNewWindow(matchedIds);

  return { moved: matchedIds.length };
}

// The selection the popup copies. Routed through orchestration so the popup
// never reaches into tabs-service directly — the browser boundary stays in one
// place. No prefs filtering: copy acts on exactly what the user highlighted,
// pinned or not.
export function getSelectedTabs(): Promise<TabLite[]> {
  return getHighlightedTabs();
}

// Sort + group in one verb (CONTEXT.md). Only writes an undo snapshot when
// something actually changed — moved > 0, a group formed, or an id needs
// ungrouping — so re-tidying an already-tidy window doesn't clobber a
// snapshot from an earlier, undoable mutation.
export async function runTidy(): Promise<TidyResult> {
  const [{ windowId, tabs }, prefs] = await Promise.all([getCurrentWindow(), getPrefs()]);

  if (tabs.length === 0) {
    return { moved: 0, grouped: 0, groupsCreated: 0 };
  }

  const snapshot = await snapshotWindow(windowId);
  const plan = planTidy(tabs, prefs);
  const moved = countChanged(
    plan.order,
    tabs.map((tab) => tab.id),
  );
  const result = await applyPlan(plan, windowId);

  if (moved > 0 || result.grouped > 0 || plan.ungroup.length > 0) {
    await saveUndo(windowId, snapshot);
  }

  return { moved, grouped: result.grouped, groupsCreated: result.groupsCreated };
}

// Preview vs confirm: an unconfirmed call is pure preview (no snapshot, no
// mutation) so the popup can show a duplicate count before the user commits
// to the one near-irreversible verb in this module (CONTEXT.md "Dedupe is
// confirmed"). Runs over ALL tabs, not the ignorePinned-filtered set — dedupe
// has its own pinned rule (a pinned tab is never closed) independent of the
// sort/extract ignorePinned pref.
export async function runDedupe(options: { confirm: boolean }): Promise<DedupeResult> {
  const [{ windowId, tabs }, prefs] = await Promise.all([getCurrentWindow(), getPrefs()]);
  const { close } = planDedupe(tabs, {
    ignoreHash: prefs.dedupeIgnoreHash,
    ignoreQuery: prefs.dedupeIgnoreQuery,
  });

  if (!options.confirm || close.length === 0) {
    return { duplicates: close.length, closed: 0 };
  }

  const snapshot = await snapshotWindow(windowId);
  const { closed } = await applyPlan({ order: [], groups: [], ungroup: [], close }, windowId);
  await saveUndo(windowId, snapshot);

  return { duplicates: close.length, closed };
}

// Reopens closed tabs BEFORE realizing the restored plan — they land as
// unknowns at the end of the strip, so applyPlan's ORDER phase (which only
// ever moves survivors it already knows about) never has to reason about
// where a not-yet-created tab belongs.
//
// Saves the PRE-undo snapshot afterward instead of clearing it, a deliberate
// deviation from the PRD's capture-consume-clear undo model
// (docs/prd/2026-06-21-layer1-tidy-groups-undo.md's undo state machine).
// That makes undo its own inverse: hitting undo again re-applies the
// tidy/dedupe that was just undone (a de-facto redo) rather than becoming a
// no-op once the snapshot is gone. Tracked as a docs/adr entry.
export async function runUndo(): Promise<UndoResult> {
  const { windowId, tabs } = await getCurrentWindow();
  const saved = await loadUndo(windowId);

  if (saved === undefined) {
    return { undone: false, restored: 0, reopened: 0 };
  }

  const snapshotNow = await snapshotWindow(windowId);
  const { plan, reopen } = planUndo(saved, tabs);

  const reopened = await reopenTabs(reopen);
  await applyPlan(plan, windowId);
  await saveUndo(windowId, snapshotNow);

  return { undone: true, restored: plan.order.length, reopened };
}

export async function getUndoAvailable(): Promise<boolean> {
  const windowId = await getCurrentWindowId();

  return (await loadUndo(windowId)) !== undefined;
}

export async function getPopupData(): Promise<PopupData> {
  const [tabs, prefs] = await Promise.all([getCurrentWindowTabs(), getPrefs()]);
  const extractableTabs = getActionTabs(tabs, prefs);
  const { close } = planDedupe(tabs, {
    ignoreHash: prefs.dedupeIgnoreHash,
    ignoreQuery: prefs.dedupeIgnoreQuery,
  });
  const canUndo = await getUndoAvailable();

  return {
    domainGroups: groupByDomain(extractableTabs),
    prefs,
    tabs: extractableTabs,
    totalTabs: tabs.length,
    duplicateCount: close.length,
    canUndo,
  };
}
