import { getDomain } from "../lib/domain";
import { runExtract, runSort } from "../lib/orchestration";
import { getPrefs } from "../lib/storage";

const MENU_SORT_TITLE = "sort-title";
const MENU_SORT_DOMAIN = "sort-domain";
const MENU_SORT_DEFAULT = "sort-default";
const MENU_EXTRACT_SITE = "extract-site";

type ContextMenusWithOnShown = typeof browser.contextMenus & {
  onShown?: {
    addListener(callback: (info: { tab?: Browser.tabs.Tab }) => void): void;
  };
};

function extractMenuTitle(domain: string): string {
  return `Extract this site (${domain}) to new window`;
}

async function createContextMenus(): Promise<void> {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    id: MENU_SORT_TITLE,
    title: "Sort tabs A to Z",
    contexts: ["page"],
  });
  browser.contextMenus.create({
    id: MENU_SORT_DOMAIN,
    title: "Sort tabs by domain",
    contexts: ["page"],
  });
  browser.contextMenus.create({
    id: MENU_SORT_DEFAULT,
    title: "Sort tabs (default)",
    contexts: ["page"],
  });
  browser.contextMenus.create({
    id: MENU_EXTRACT_SITE,
    title: "Extract this site to new window",
    contexts: ["page"],
  });
}

async function handleCommand(command: string): Promise<void> {
  if (command === "sort-by-title") {
    await runSort("title");
    return;
  }

  if (command === "sort-by-domain") {
    await runSort("domain");
    return;
  }

  if (command === "sort-default") {
    const prefs = await getPrefs();
    await runSort(prefs.defaultSort);
  }
}

async function handleContextMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
): Promise<void> {
  if (info.menuItemId === MENU_SORT_TITLE) {
    await runSort("title");
    return;
  }

  if (info.menuItemId === MENU_SORT_DOMAIN) {
    await runSort("domain");
    return;
  }

  if (info.menuItemId === MENU_SORT_DEFAULT) {
    const prefs = await getPrefs();
    await runSort(prefs.defaultSort);
    return;
  }

  if (info.menuItemId === MENU_EXTRACT_SITE && tab?.url) {
    await runExtract({ type: "domain", domain: getDomain(tab.url) });
  }
}

async function updateExtractMenuTitle(info: { tab?: Browser.tabs.Tab }): Promise<void> {
  if (info.tab?.url) {
    await browser.contextMenus.update(MENU_EXTRACT_SITE, {
      title: extractMenuTitle(getDomain(info.tab.url)),
    });
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void createContextMenus();
  });

  browser.runtime.onStartup.addListener(() => {
    void createContextMenus();
  });

  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });

  const contextMenus = browser.contextMenus as ContextMenusWithOnShown;
  if (contextMenus.onShown) {
    contextMenus.onShown.addListener((info) => {
      void updateExtractMenuTitle(info);
    });
  }

  void createContextMenus();
});
