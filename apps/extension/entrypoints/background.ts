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

// Shared by the keyboard-command and context-menu handlers below: both surfaces
// route the same MENU_IDS to the same orchestration calls, so the mapping lives
// once here. extract-site is deliberately absent — it needs the clicked tab's
// URL, which only the context-menu handler has, so it stays as an explicit case
// there instead of being contorted into this table.
const dispatch: Record<string, () => Promise<unknown>> = {
  [MENU_IDS.tidy]: runTidy,
  [MENU_IDS.sortDefault]: runDefaultSort,
  [MENU_IDS.sortByTitle]: () => runSort("title"),
  [MENU_IDS.sortByDomain]: () => runSort("domain"),
  [MENU_IDS.undo]: runUndo,
};

async function handleCommand(command: string): Promise<void> {
  const action = dispatch[command];

  if (action !== undefined) {
    await action();
  }
}

async function handleContextMenu(info: MenuClickInfo, tab: ClickedTab | undefined): Promise<void> {
  if (info.menuItemId === MENU_IDS.extractSite) {
    const url = tab?.url ?? info.pageUrl;

    if (url !== undefined) {
      await runExtract({ type: "domain", domain: getDomain(url) });
    }

    return;
  }

  const action = typeof info.menuItemId === "string" ? dispatch[info.menuItemId] : undefined;

  if (action !== undefined) {
    await action();
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
