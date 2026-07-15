import { TAB_GROUP_NONE } from "./types";
import type { SnapshotGroup, SnapshotTab, TabLite, WindowSnapshot } from "./types";

export interface RawTab {
  id?: number;
  url?: string;
  title?: string;
  index?: number;
  pinned?: boolean;
  groupId?: number;
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
    groupId: tab.groupId ?? TAB_GROUP_NONE,
  };
}

async function queryTabsAsLite(
  queryInfo: Parameters<typeof browser.tabs.query>[0],
): Promise<TabLite[]> {
  const tabs = (await browser.tabs.query(queryInfo)) as RawTab[];

  return tabs.flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });
}

export function getCurrentWindowTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ currentWindow: true });
}

// The tabs the user has highlighted in the current window's strip — Chrome's
// native multi-select. Always includes the active tab, so the result is never
// empty for a normal window.
export function getHighlightedTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ currentWindow: true, highlighted: true });
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<void> {
  const [firstTabId, ...remainingTabIds] = tabIds;

  if (firstTabId === undefined) {
    return;
  }

  const newWindow = await browser.windows.create({ tabId: firstTabId, focused: true });

  if (newWindow === undefined || typeof newWindow.id !== "number") {
    return;
  }

  // Single-id calls only — chrome.tabs.move's batch/array form has a
  // documented off-by-one that scrambles the destination order.
  for (const tabId of remainingTabIds) {
    await browser.tabs.move(tabId, { windowId: newWindow.id, index: -1 });
  }
}

export async function getCurrentWindowId(): Promise<number> {
  const currentWindow = await browser.windows.getCurrent();

  if (typeof currentWindow.id !== "number") {
    throw new Error("current window has no id");
  }

  return currentWindow.id;
}

// The one ambient current-window resolution a mutating user action gets: id
// and live tabs come back from a single browser.windows.getCurrent query, so
// there's no gap between "find the window" and "read its tabs" for a focus
// change to land in. orchestration.ts's run* functions call this once and
// thread the windowId into every subsequent tabs-service call instead of
// re-resolving "current".
export async function getCurrentWindow(): Promise<{ windowId: number; tabs: TabLite[] }> {
  const currentWindow = (await browser.windows.getCurrent({ populate: true })) as {
    id?: number;
    tabs?: RawTab[];
  };

  if (typeof currentWindow.id !== "number") {
    throw new Error("current window has no id");
  }

  const tabs = (currentWindow.tabs ?? []).flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });

  return { windowId: currentWindow.id, tabs };
}

export async function snapshotWindow(windowId: number): Promise<WindowSnapshot> {
  const [tabs, rawGroups] = await Promise.all([
    queryTabsAsLite({ windowId }),
    browser.tabGroups.query({ windowId }),
  ]);

  const snapshotTabs: SnapshotTab[] = tabs
    .toSorted((a, b) => a.index - b.index)
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      index: tab.index,
      pinned: tab.pinned,
      // toTabLite (queryTabsAsLite) already defaults groupId, so it's never
      // undefined here — a ?? fallback would be dead code no test can reach.
      groupId: tab.groupId!,
    }));

  const snapshotGroups: SnapshotGroup[] = rawGroups.map((group) => ({
    groupId: group.id,
    title: group.title ?? "",
    color: group.color,
    collapsed: group.collapsed,
  }));

  return { windowId, tabs: snapshotTabs, groups: snapshotGroups, savedAt: Date.now() };
}

// Sequential — chrome.tabs.create resolves per-tab, and undo's reopen list has
// no ordering requirement beyond "one call per url", so there's nothing to gain
// from Promise.all beyond risking an unbounded burst of tab creation.
export async function reopenTabs(urls: string[]): Promise<number> {
  for (const url of urls) {
    await browser.tabs.create({ url, active: false });
  }

  return urls.length;
}

// Routed through the tabs-service adapter (like the query/verb calls above) so
// the popup never reaches browser.runtime directly — the browser boundary
// stays in one module.
export function openOptionsPage(): Promise<void> {
  return browser.runtime.openOptionsPage();
}
