import { fakeBrowser } from "@webext-core/fake-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearUndo, loadUndo, saveUndo } from "./session-store";
import type { WindowSnapshot } from "./types";

function snapshot(windowId: number): WindowSnapshot {
  return {
    windowId,
    tabs: [{ id: 1, url: "https://a.example", index: 0, pinned: false, groupId: -1 }],
    groups: [{ groupId: 5, title: "News", color: "blue", collapsed: false }],
    savedAt: 1000,
  };
}

describe("session undo store", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal("browser", fakeBrowser);
  });

  it("round-trips a saved snapshot", async () => {
    await saveUndo(1, snapshot(1));

    await expect(loadUndo(1)).resolves.toEqual(snapshot(1));
  });

  it("returns undefined when nothing has been saved for the window", async () => {
    await expect(loadUndo(1)).resolves.toBeUndefined();
  });

  it("isolates snapshots per window", async () => {
    await saveUndo(1, snapshot(1));
    await saveUndo(2, snapshot(2));

    await expect(loadUndo(1)).resolves.toEqual(snapshot(1));
    await expect(loadUndo(2)).resolves.toEqual(snapshot(2));
  });

  it("overwrite replaces the previous snapshot for the same window", async () => {
    await saveUndo(1, snapshot(1));
    const replacement = { ...snapshot(1), savedAt: 2000 };
    await saveUndo(1, replacement);

    await expect(loadUndo(1)).resolves.toEqual(replacement);
  });

  it("clearUndo removes only its own window", async () => {
    await saveUndo(1, snapshot(1));
    await saveUndo(2, snapshot(2));

    await clearUndo(1);

    await expect(loadUndo(1)).resolves.toBeUndefined();
    await expect(loadUndo(2)).resolves.toEqual(snapshot(2));
  });

  it("rejects a stored value that isn't an object", async () => {
    await fakeBrowser.storage.session.set({ "undo:1": "not-an-object" });

    await expect(loadUndo(1)).resolves.toBeUndefined();
  });

  it("rejects a stored null value", async () => {
    await fakeBrowser.storage.session.set({ "undo:1": null });

    await expect(loadUndo(1)).resolves.toBeUndefined();
  });

  it("rejects a stored value with a non-numeric windowId", async () => {
    await fakeBrowser.storage.session.set({
      "undo:1": { ...snapshot(1), windowId: "1" },
    });

    await expect(loadUndo(1)).resolves.toBeUndefined();
  });

  it("rejects a stored value whose tabs field isn't an array", async () => {
    await fakeBrowser.storage.session.set({
      "undo:1": { ...snapshot(1), tabs: "nope" },
    });

    await expect(loadUndo(1)).resolves.toBeUndefined();
  });

  it("rejects a stored value whose groups field isn't an array", async () => {
    await fakeBrowser.storage.session.set({
      "undo:1": { ...snapshot(1), groups: "nope" },
    });

    await expect(loadUndo(1)).resolves.toBeUndefined();
  });
});
