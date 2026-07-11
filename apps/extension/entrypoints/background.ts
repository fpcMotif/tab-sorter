import { getDomain } from "@/lib/domain";
import { runDefaultSort, runExtract, runSort, runTidy, runUndo } from "@/lib/orchestration";

const MENU_IDS = {
  tidy: "tidy",
  extractSite: "extract-site",
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
    id: MENU_IDS.undo,
    title: "Undo last tidy",
  });
}

async function handleCommand(command: string): Promise<void> {
  if (command === MENU_IDS.tidy) {
    await runTidy();
    return;
  }

  if (command === MENU_IDS.sortDefault) {
    await runDefaultSort();
    return;
  }

  if (command === MENU_IDS.sortByTitle) {
    await runSort("title");
    return;
  }

  if (command === MENU_IDS.sortByDomain) {
    await runSort("domain");
    return;
  }

  if (command === MENU_IDS.undo) {
    await runUndo();
  }
}

async function handleContextMenu(info: MenuClickInfo, tab: ClickedTab | undefined): Promise<void> {
  if (info.menuItemId === MENU_IDS.tidy) {
    await runTidy();
    return;
  }

  if (info.menuItemId === MENU_IDS.sortDefault) {
    await runDefaultSort();
    return;
  }

  if (info.menuItemId === MENU_IDS.sortByTitle) {
    await runSort("title");
    return;
  }

  if (info.menuItemId === MENU_IDS.sortByDomain) {
    await runSort("domain");
    return;
  }

  if (info.menuItemId === MENU_IDS.extractSite) {
    const url = tab?.url ?? info.pageUrl;

    if (url !== undefined) {
      await runExtract({ type: "domain", domain: getDomain(url) });
    }

    return;
  }

  if (info.menuItemId === MENU_IDS.undo) {
    await runUndo();
  }
}

export default defineBackground(() => {
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
