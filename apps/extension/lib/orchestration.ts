import { groupByDomain, matchByDomain, matchByRegex } from "./match";
import { sortByDomain, sortByTitle } from "./sort";
import { getPrefs } from "./storage";
import { applyOrder, getCurrentWindowTabs, getScopeSnapshot, moveTabsToNewWindow } from "./tabs-service";
import type { DomainGroup, Prefs, SortMode, TabLite } from "./types";
import { resolveConfiguredFormat } from "./copy/configured-format.ts";
import { BUILTIN_FORMATS, getFormat, type FormatId } from "./copy/format.ts";
import { buildPayload } from "./copy/payload.ts";
import { render } from "./copy/render.ts";
import { SCOPES, selectScope } from "./copy/scope.ts";
import type { CopyPayload, ScopeId } from "./copy/types.ts";
import type { Sink } from "./sinks/sink.ts";

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

// ---------------------------------------------------------------------------
// Copy pipeline — Module L
// ---------------------------------------------------------------------------

// Copy's own includePinned default is `true` (donor parity, DEVIATION #2).
// The sort feature's ignorePinned pref does NOT gate the copy pipeline.
const COPY_INCLUDE_PINNED = true;

function countEntries(payload: CopyPayload): number {
  // Both CopyPayload arms carry a flat `entries[]`; the window arm populates it
  // from buildEntries so it contains every tab across all windows.
  return payload.entries.length;
}

/**
 * Drive the M1 copy pipeline end-to-end.
 *
 * Signature is the 3-param M1 form (reconciliation #2 — no `trigger` yet).
 */
export async function runCopy(
  scopeId: ScopeId,
  formatId: FormatId,
  sink: Sink,
): Promise<{ count: number }> {
  const snapshot = await getScopeSnapshot();
  const selection = selectScope(snapshot, scopeId, COPY_INCLUDE_PINNED);
  const format = getFormat(formatId);
  const configured = resolveConfiguredFormat(format, undefined, getFormat);
  const rendered = render(selection, configured);
  const payload = buildPayload(selection, rendered);

  await sink.consume(payload);

  return { count: countEntries(payload) };
}

// --- getCopyPopupData types (reconciliation #1: L is sole owner) ---

export interface CopyScopeView {
  id: ScopeId;
  label: string;
  count: number;
}

export interface CopyFormatView {
  id: FormatId;
  label: string;
  description?: string;
  isDefault: boolean;
}

export interface CopyPopupData {
  scopes: CopyScopeView[];
  formats: CopyFormatView[];
  defaultFormatId: FormatId;
}

function countSelection(selection: ReturnType<typeof selectScope>): number {
  return selection.scope === "tab"
    ? selection.tabs.length
    : selection.windows.reduce((total, win) => total + win.tabs.length, 0);
}

/**
 * Produce the data the Copy popup needs.
 *
 * Fans one ScopeSnapshot through selectScope×4 (reconciliation, coverage note #4).
 * Formats list is the builtin registry in declaration order (M3 will add prefs-driven
 * visibility and custom formats).
 */
export async function getCopyPopupData(): Promise<CopyPopupData> {
  const snapshot = await getScopeSnapshot();

  const scopes: CopyScopeView[] = SCOPES.map((scope) => ({
    id: scope.id,
    label: scope.label,
    count: countSelection(selectScope(snapshot, scope.id, COPY_INCLUDE_PINNED)),
  }));

  // M1 default = first visible format (donor parity: getDefaultFormatId = first visible).
  const defaultFormatId: FormatId = BUILTIN_FORMATS[0]!.id;

  const formats: CopyFormatView[] = BUILTIN_FORMATS.map((fmt) => ({
    id: fmt.id,
    label: fmt.label(),
    description: fmt.description?.(),
    isDefault: fmt.id === defaultFormatId,
  }));

  return { scopes, formats, defaultFormatId };
}
