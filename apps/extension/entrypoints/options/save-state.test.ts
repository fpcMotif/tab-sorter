import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS } from "@/lib/types";
import type { Prefs } from "@/lib/types";

import { INITIAL_SAVE_STATE, saveReducer, type SaveState } from "./save-state";

const LOADED_PREFS: Prefs = { ...DEFAULT_PREFS, minGroupSize: 3 };

describe("options saveReducer", () => {
  it("stores loaded prefs without touching status or error", () => {
    const next = saveReducer(INITIAL_SAVE_STATE, { type: "prefsLoaded", prefs: LOADED_PREFS });

    expect(next.prefs).toBe(LOADED_PREFS);
    expect(next.status).toBe("");
    expect(next.error).toBe("");
  });

  it("reports a load failure without touching the currently held prefs", () => {
    const loaded = saveReducer(INITIAL_SAVE_STATE, { type: "prefsLoaded", prefs: LOADED_PREFS });
    const next = saveReducer(loaded, { type: "loadFailed" });

    expect(next.error).toBe("Could not load preferences.");
    expect(next.prefs).toBe(LOADED_PREFS);
  });

  it("clears status and error when a save starts", () => {
    const dirty: SaveState = { prefs: LOADED_PREFS, status: "Saved.", error: "bad pattern" };
    const next = saveReducer(dirty, { type: "saveStarted" });

    expect(next.status).toBe("");
    expect(next.error).toBe("");
    expect(next.prefs).toBe(LOADED_PREFS);
  });

  it("commits the saved prefs and sets the confirmation status", () => {
    const next = saveReducer(INITIAL_SAVE_STATE, {
      type: "saveSucceeded",
      prefs: LOADED_PREFS,
    });

    expect(next.prefs).toBe(LOADED_PREFS);
    expect(next.status).toBe("Saved.");
  });

  it("reports a save failure without discarding the in-memory prefs", () => {
    const next = saveReducer(INITIAL_SAVE_STATE, { type: "saveFailed" });

    expect(next.error).toBe("Could not save preferences.");
    expect(next.prefs).toBe(INITIAL_SAVE_STATE.prefs);
  });

  it("surfaces a validation error verbatim", () => {
    const next = saveReducer(INITIAL_SAVE_STATE, {
      type: "validationFailed",
      error: "Label is required.",
    });

    expect(next.error).toBe("Label is required.");
  });

  it("leaves the input state unchanged (returns a new object, same field values)", () => {
    const next = saveReducer(INITIAL_SAVE_STATE, { type: "prefsLoaded", prefs: LOADED_PREFS });

    expect(next).not.toBe(INITIAL_SAVE_STATE);
    expect(INITIAL_SAVE_STATE.prefs).toBe(DEFAULT_PREFS);
  });
});
