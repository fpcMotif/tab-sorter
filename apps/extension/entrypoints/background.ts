import { getDomain } from "@tab-sorter/core/domain";
import { executeMutation } from "@/lib/mutation";
import { createBackgroundDispatcher, createBackgroundListener } from "@/lib/runtime";
import { commitPrefsPatch } from "@/lib/storage";
import { getCurrentWindowId } from "@/lib/tabs-service";

const MENU_IDS = {
  tidy: "tidy",
  extractSite: "extract-site",
  extractSiteAll: "extract-site-all",
  sortByDomain: "sort-by-domain",
  sortByTitle: "sort-by-title",
  sortDefault: "sort-default",
  undo: "undo",
} as const;

interface MenuClickInfo {
  menuItemId: string | number;
  pageUrl?: string;
}

interface ClickedTab {
  url?: string;
  windowId?: number;
}

async function setupContextMenus(): Promise<void> {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.tidy,
    title: "Tidy this window",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.sortDefault,
    title: "Sort tabs (your default)",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.sortByTitle,
    title: "Sort tabs A to Z",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.sortByDomain,
    title: "Sort tabs by domain",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.extractSite,
    title: "Extract this site to new window",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.extractSiteAll,
    title: "Extract this site from all windows",
  });
  browser.contextMenus.create({
    contexts: ["page"],
    id: MENU_IDS.undo,
    title: "Undo last tidy",
  });
}

async function executeMenuMutation(
  menuItemId: string | number,
  windowId: number,
): Promise<boolean> {
  if (menuItemId === MENU_IDS.tidy) {
    await executeMutation({ type: "tidy", windowId });

    return true;
  }

  if (menuItemId === MENU_IDS.sortDefault) {
    await executeMutation({ type: "sort", windowId });

    return true;
  }

  if (menuItemId === MENU_IDS.sortByTitle) {
    await executeMutation({ type: "sort", windowId, mode: "title" });

    return true;
  }

  if (menuItemId === MENU_IDS.sortByDomain) {
    await executeMutation({ type: "sort", windowId, mode: "domain" });

    return true;
  }

  if (menuItemId === MENU_IDS.undo) {
    await executeMutation({ type: "undo", windowId });

    return true;
  }

  return false;
}

async function handleCommand(command: string): Promise<void> {
  const windowId = await getCurrentWindowId();

  await executeMenuMutation(command, windowId);
}

async function dispatchSiteExtract(
  url: string | undefined,
  windowId: number,
  scope: "all" | undefined,
): Promise<void> {
  if (url === undefined) {
    return;
  }

  const result = await executeMutation({
    type: "extract",
    windowId,
    matcher: { type: "domain", domain: getDomain(url) },
    scope,
  });

  // No popup to survive an all-windows sweep, so bring the new window forward.
  if (scope === "all" && typeof result.newWindowId === "number") {
    await browser.windows.update(result.newWindowId, { focused: true });
  }
}

async function handleContextMenu(info: MenuClickInfo, tab: ClickedTab | undefined): Promise<void> {
  const windowId = typeof tab?.windowId === "number" ? tab.windowId : await getCurrentWindowId();

  if (info.menuItemId === MENU_IDS.extractSite) {
    await dispatchSiteExtract(tab?.url ?? info.pageUrl, windowId, undefined);

    return;
  }

  if (info.menuItemId === MENU_IDS.extractSiteAll) {
    await dispatchSiteExtract(tab?.url ?? info.pageUrl, windowId, "all");

    return;
  }

  await executeMenuMutation(info.menuItemId, windowId);
}

export default defineBackground(() => {
  const dispatch = createBackgroundDispatcher({ executeMutation, commitPrefsPatch });

  browser.runtime.onMessage.addListener(createBackgroundListener(dispatch));

  // Run once on every service-worker startup so the menus also reappear after a
  // mid-session disable/re-enable (which fires neither onInstalled nor onStartup).
  // removeAll() inside makes this idempotent.
  //
  // These actions have no UI to surface failures, so we let any rejection
  // propagate as an unhandled rejection: the runtime records it against the
  // service worker (chrome://extensions and the worker DevTools console)
  // without us owning a logging side effect here.
  void setupContextMenus();

  browser.runtime.onInstalled.addListener(() => {
    void setupContextMenus();
  });
  browser.runtime.onStartup.addListener(() => {
    void setupContextMenus();
  });
  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab);
  });
});
