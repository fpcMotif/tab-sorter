import type { WindowSnapshot } from "./types";

// One WindowSnapshot per window, keyed by windowId. browser.storage.session is
// in-memory for the life of the browser session (cleared on browser exit, never
// written to disk), so there's no chrome.storage.sync quota to worry about here
// — and it's readable from the popup, which is what lets undo survive the popup
// closing and reopening between "tidy" and "undo".
function undoKey(windowId: number): string {
  return `undo:${windowId}`;
}

export async function saveUndo(windowId: number, snapshot: WindowSnapshot): Promise<void> {
  await browser.storage.session.set({ [undoKey(windowId)]: snapshot });
}

// Unlike storage.ts's normalizePrefs, this is a shape check, not a per-field
// normalize-and-fallback: a WindowSnapshot is only ever written by this same
// extension in this same browser session (never cross-version, cross-device,
// or hand-edited like chrome.storage.sync), so a malformed value means the
// write was interrupted or the shape changed underneath us mid-session, not
// that individual fields need salvaging. Discard the whole thing.
function isWindowSnapshot(value: unknown): value is WindowSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { windowId, tabs, groups } = value as Record<string, unknown>;

  return typeof windowId === "number" && Array.isArray(tabs) && Array.isArray(groups);
}

export async function loadUndo(windowId: number): Promise<WindowSnapshot | undefined> {
  const key = undoKey(windowId);
  const stored = (await browser.storage.session.get(key)) as Record<string, unknown>;
  const value = stored[key];

  return isWindowSnapshot(value) ? value : undefined;
}
