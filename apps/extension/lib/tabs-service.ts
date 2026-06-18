import type { TabLite } from "./types";

type BrowserTab = {
  id?: number;
  url?: string;
  title?: string;
  index: number;
  pinned?: boolean;
};

type BrowserWindow = {
  id?: number;
};

type BrowserLike = {
  tabs?: {
    query(queryInfo: { currentWindow: boolean }): Promise<BrowserTab[]>;
    move(tabIds: number | number[], moveProperties: { index: number; windowId?: number }): Promise<unknown>;
  };
  windows?: {
    create(createData: { tabId: number; focused?: boolean }): Promise<BrowserWindow>;
    update?(windowId: number, updateInfo: { focused: boolean }): Promise<unknown>;
  };
};

function getBrowser(): Required<Pick<BrowserLike, "tabs" | "windows">> {
  const browserLike = (globalThis as typeof globalThis & { browser?: BrowserLike }).browser;

  if (!browserLike?.tabs || !browserLike.windows) {
    throw new Error("Extension tabs API is unavailable");
  }

  return {
    tabs: browserLike.tabs,
    windows: browserLike.windows,
  };
}

function toTabLite(tab: BrowserTab): TabLite | null {
  if (typeof tab.id !== "number") {
    return null;
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? tab.url ?? "",
    index: tab.index,
    pinned: tab.pinned ?? false,
  };
}

export async function getCurrentWindowTabs(): Promise<TabLite[]> {
  const { tabs } = getBrowser();
  const currentTabs = await tabs.query({ currentWindow: true });
  return currentTabs.map(toTabLite).filter((tab): tab is TabLite => tab !== null);
}

export async function applyOrder(
  orderedIds: number[],
  options: { afterPinned?: number } = {},
): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const { tabs } = getBrowser();
  const currentTabs = await getCurrentWindowTabs();
  const currentIds = new Set(currentTabs.map((tab) => tab.id));
  const afterPinned = options.afterPinned ?? 0;
  const existingOrderedIds = orderedIds.filter((id) => currentIds.has(id));

  for (const [offset, id] of existingOrderedIds.entries()) {
    await tabs.move(id, { index: afterPinned + offset });
  }
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) {
    return;
  }

  const { tabs, windows } = getBrowser();

  // Re-read current tabs so stale ids from tabs closed between matching and
  // moving are ignored, matching the behavior of applyOrder.
  const currentTabs = await getCurrentWindowTabs();
  const currentIds = new Set(currentTabs.map((tab) => tab.id));
  const existingTabIds = tabIds.filter((id) => currentIds.has(id));

  const [firstTabId, ...restTabIds] = existingTabIds;

  if (firstTabId === undefined) {
    return;
  }

  const newWindow = await windows.create({ tabId: firstTabId, focused: true });

  if (restTabIds.length > 0 && typeof newWindow.id === "number") {
    await tabs.move(restTabIds, { windowId: newWindow.id, index: -1 });
  }

  if (typeof newWindow.id === "number" && windows.update) {
    await windows.update(newWindow.id, { focused: true });
  }
}
