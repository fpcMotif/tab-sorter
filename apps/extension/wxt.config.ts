import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    action: {
      default_title: "Tab Sorter",
    },
    commands: {
      "sort-default": {
        description: "Sort tabs using your default sort",
        suggested_key: {
          default: "Alt+Shift+S",
        },
      },
      // Chrome allows at most 4 commands with a suggested_key across the whole
      // manifest; tidy/undo/sort-default/sort-by-title claim that budget, so
      // sort-by-domain stays a command (bindable via chrome://extensions/shortcuts)
      // but loses its default binding.
      "sort-by-domain": {
        description: "Sort tabs by domain",
      },
      "sort-by-title": {
        description: "Sort tabs A to Z",
        suggested_key: {
          default: "Alt+Shift+T",
        },
      },
      tidy: {
        description: "Tidy this window: sort and group tabs",
        suggested_key: {
          default: "Alt+Shift+Space",
        },
      },
      undo: {
        description: "Undo the last tidy or dedupe",
        suggested_key: {
          default: "Alt+Shift+Z",
        },
      },
    },
    description:
      "Sort and group the current window's tabs, or move matching tabs into a new window.",
    name: "Tab Sorter",
    permissions: ["tabs", "tabGroups", "storage", "contextMenus", "clipboardWrite"],
  },
});
