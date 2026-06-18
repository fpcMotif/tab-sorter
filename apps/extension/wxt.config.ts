import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    action: {
      default_title: "Tab Sorter",
    },
    commands: {
      "sort-by-domain": {
        description: "Sort tabs by domain",
        suggested_key: {
          default: "Alt+Shift+D",
        },
      },
      "sort-by-title": {
        description: "Sort tabs A to Z",
        suggested_key: {
          default: "Alt+Shift+T",
        },
      },
    },
    description: "Sort the current window's tabs or move matching tabs into a new window.",
    name: "Tab Sorter",
    permissions: ["tabs", "storage", "contextMenus"],
  },
});
