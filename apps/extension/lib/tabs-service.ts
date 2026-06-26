import type { TabLite } from "./types";
import type {
  ScopeSnapshot,
  TabLite as CopyTabLite,
  WindowLite,
} from "@/lib/copy/types.ts";

interface RawTab {
  id?: number;
  url?: string;
  title?: string;
  index?: number;
  pinned?: boolean;
  favIconUrl?: string;
  highlighted?: boolean;
  windowId?: number;
}

interface RawWindow {
  id?: number;
  tabs?: RawTab[];
}

function toTabLite(tab: RawTab): TabLite | undefined {
  if (typeof tab.id !== "number") {
    return undefined;
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? tab.url ?? "",
    index: tab.index ?? 0,
    pinned: tab.pinned ?? false,
  };
}

// Maps a raw Chrome tab to the copy engine's TabLite (includes favIconUrl + highlighted).
// Tabs missing an id are dropped (returns undefined).
export function toCopyTabLite(tab: RawTab): CopyTabLite | undefined {
  if (typeof tab.id !== "number") {
    return undefined;
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? tab.url ?? "",
    index: tab.index ?? 0,
    pinned: tab.pinned ?? false,
    // Only carry favIconUrl when present (undefined means absent, not "")
    ...(tab.favIconUrl === undefined ? {} : { favIconUrl: tab.favIconUrl }),
    highlighted: tab.highlighted ?? false,
  };
}

export async function getCurrentWindowTabs(): Promise<TabLite[]> {
  const tabs = (await browser.tabs.query({ currentWindow: true })) as RawTab[];

  return tabs.flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });
}

// `orderedIds` is the desired absolute order of every tab in the window
// (pinned block first, then unpinned). Re-queries a fresh snapshot so ids that
// vanished mid-operation are dropped, then moves survivors to consecutive
// indices from 0. Positioning relative to 0 keeps pinned/unpinned in their
// Chrome-enforced regions and is immune to a stale pinned-count boundary.
export async function applyOrder(orderedIds: number[]): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const currentTabs = (await browser.tabs.query({ currentWindow: true })) as RawTab[];
  const currentIds = new Set(
    currentTabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : [])),
  );
  const movableIds = orderedIds.filter((id) => currentIds.has(id));

  for (const [index, tabId] of movableIds.entries()) {
    await browser.tabs.move(tabId, { index });
  }
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<void> {
  const [firstTabId, ...remainingTabIds] = tabIds;

  if (firstTabId === undefined) {
    return;
  }

  const newWindow = await browser.windows.create({ tabId: firstTabId, focused: true });

  if (newWindow === undefined || typeof newWindow.id !== "number" || remainingTabIds.length === 0) {
    return;
  }

  await browser.tabs.move(remainingTabIds, { windowId: newWindow.id, index: -1 });
}

// Single raw read for the copy engine: all windows + tabs (mirrors donor getWindowsAndTabs)
// plus the highlighted ids of the current window (mirrors donor getTabs highlighted branch).
// No pinned filtering here — selectScope (scope.ts) owns that.
export async function getScopeSnapshot(): Promise<ScopeSnapshot> {
  const rawWindows = (await browser.windows.getAll({ populate: true })) as RawWindow[];
  const highlightedTabs = (await browser.tabs.query({
    highlighted: true,
    currentWindow: true,
  })) as RawTab[];

  const windows: WindowLite[] = rawWindows.flatMap((win) => {
    if (typeof win.id !== "number") {
      return [];
    }

    const tabs = (win.tabs ?? []).flatMap((tab) => {
      const copyTab = toCopyTabLite(tab);
      return copyTab === undefined ? [] : [copyTab];
    });

    return [{ id: win.id, tabs }];
  });

  const highlightedTabIds = highlightedTabs.flatMap((tab) =>
    typeof tab.id === "number" ? [tab.id] : [],
  );

  // currentWindowId: derived from the windowId of any highlighted tab (they all share
  // the current window). Falls back to the first window id, then -1 if snapshot is empty.
  const currentWindowId =
    highlightedTabs.find((tab) => typeof tab.windowId === "number")?.windowId ??
    windows[0]?.id ??
    -1;

  return { windows, currentWindowId, highlightedTabIds };
}
