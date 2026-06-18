import type { TabLite } from "./types";

export interface ApplyOrderOptions {
  afterPinned: number;
}

interface RawTab {
  id?: number;
  url?: string;
  title?: string;
  index?: number;
  pinned?: boolean;
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

export async function getCurrentWindowTabs(): Promise<TabLite[]> {
  const tabs = (await browser.tabs.query({ currentWindow: true })) as RawTab[];

  return tabs.flatMap((tab) => {
    const tabLite = toTabLite(tab);

    return tabLite === undefined ? [] : [tabLite];
  });
}

export async function applyOrder(orderedIds: number[], { afterPinned }: ApplyOrderOptions): Promise<void> {
  if (orderedIds.length <= 1) {
    return;
  }

  const currentTabs = (await browser.tabs.query({ currentWindow: true })) as RawTab[];
  const currentIds = new Set(
    currentTabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : [])),
  );
  const movableIds = orderedIds.filter((id) => currentIds.has(id));

  for (const [offset, tabId] of movableIds.entries()) {
    await browser.tabs.move(tabId, { index: afterPinned + offset });
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
