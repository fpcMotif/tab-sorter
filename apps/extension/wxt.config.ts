import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tab Sorter",
    description: "Sort the current window's tabs and extract matching tabs into a new window.",
    permissions: ["tabs", "storage", "contextMenus"],
    commands: {
      "sort-by-title": {
        suggested_key: {
          default: "Alt+Shift+T",
        },
        description: "Sort tabs A to Z by title",
      },
      "sort-by-domain": {
        suggested_key: {
          default: "Alt+Shift+D",
        },
        description: "Sort tabs by domain",
      },
      "sort-default": {
        description: "Sort tabs using the default sort mode from options",
      },
    },
  },
});
