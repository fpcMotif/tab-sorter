import { TAB_GROUP_NONE } from "./types";
import type { TabLite } from "./types";

interface RawTab {
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

export function getHighlightedTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ currentWindow: true, highlighted: true });
}

export function getAllWindowsTabs(): Promise<TabLite[]> {
  return queryTabsAsLite({ windowType: "normal" });
}

export async function getWindowCount(): Promise<number> {
  const windows = await browser.windows.getAll({ windowTypes: ["normal"] });

  return windows.length;
}

export async function moveTabsToNewWindow(
  tabIds: number[],
  options: { focus?: boolean } = {},
): Promise<number | undefined> {
  const focused = options.focus ?? true;
  let newWindowId: number | undefined;
  let remaining: number[] = [];

  // Seed the window from the first tab Chrome accepts: a vanished tab makes
  // windows.create reject, so advance; a resolved window with no id is a
  // refusal that retrying won't fix, so give up.
  for (let seed = 0; seed < tabIds.length; seed += 1) {
    let created: { id?: number } | undefined;
    try {
      created = await browser.windows.create({ tabId: tabIds[seed]!, focused });
    } catch {
      continue;
    }

    if (created === undefined || typeof created.id !== "number") {
      return undefined;
    }

    newWindowId = created.id;
    remaining = tabIds.slice(seed + 1);
    break;
  }

  if (newWindowId === undefined) {
    return undefined;
  }

  for (const tabId of remaining) {
    try {
      await browser.tabs.move(tabId, { windowId: newWindowId, index: -1 });
    } catch {
      // A tab closed or moved mid-operation is skipped, not fatal.
    }
  }

  return newWindowId;
}

export async function getCurrentWindowId(): Promise<number> {
  const currentWindow = await browser.windows.getCurrent();

  if (typeof currentWindow.id !== "number") {
    throw new Error("current window has no id");
  }

  return currentWindow.id;
}

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
