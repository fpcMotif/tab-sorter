import type { TabLite } from "./types.ts";

export async function getCurrentWindowTabs(): Promise<TabLite[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter(
      (tab): tab is chrome.tabs.Tab & { id: number; url: string; title: string } =>
        typeof tab.id === "number" &&
        tab.id !== chrome.tabs.TAB_ID_NONE &&
        typeof tab.url === "string" &&
        typeof tab.title === "string",
    )
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      index: tab.index ?? 0,
      pinned: tab.pinned ?? false,
    }));
}

export interface ApplyOrderOptions {
  afterPinned?: number;
}

export async function applyOrder(
  orderedIds: number[],
  options: ApplyOrderOptions = {},
): Promise<void> {
  if (orderedIds.length < 2) return;

  const { afterPinned = 0 } = options;
  const freshTabs = await chrome.tabs.query({ currentWindow: true });
  const pinnedCount = freshTabs.filter((t) => t.pinned).length;
  const startIndex = Math.max(afterPinned, pinnedCount);

  const freshIds = new Set(
    freshTabs
      .filter(
        (tab): tab is chrome.tabs.Tab & { id: number } =>
          typeof tab.id === "number" && tab.id !== chrome.tabs.TAB_ID_NONE,
      )
      .map((tab) => tab.id),
  );

  const validIds = orderedIds.filter((id) => freshIds.has(id));

  // Sequential moves avoid races with Chrome's tab ordering.
  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < validIds.length; i++) {
    try {
      await chrome.tabs.move(validIds[i], { index: startIndex + i });
    } catch {
      // Tab may have closed; ignore and continue.
    }
  }
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;

  const [first, ...rest] = tabIds;
  const newWindow = await chrome.windows.create({ tabId: first });
  const windowId = newWindow?.id;

  if (!windowId) {
    throw new Error("Failed to create new window");
  }

  if (rest.length > 0) {
    await chrome.tabs.move(rest, { windowId, index: -1 });
  }

  await chrome.windows.update(windowId, { focused: true });
}
