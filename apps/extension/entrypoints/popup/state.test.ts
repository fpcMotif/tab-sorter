import { describe, expect, it } from "vitest";

import type { PopupData } from "@/lib/orchestration";
import { DEFAULT_PREFS } from "@/lib/types";

import { IDLE_STATUS, initialState, reducer, type State } from "./state";

const SAMPLE_DATA: PopupData = {
  domainGroups: [{ domain: "example.com", count: 3, tabIds: [1, 2, 3] }],
  prefs: DEFAULT_PREFS,
  tabs: [],
  totalTabs: 3,
  duplicateCount: 1,
  canUndo: false,
};

describe("popup reducer", () => {
  it("stores loaded data without touching the rest of the state", () => {
    const next = reducer(initialState, { type: "dataLoaded", data: SAMPLE_DATA });

    expect(next.data).toBe(SAMPLE_DATA);
    expect(next.dedupeArmed).toBe(false);
    expect(next.copyFormat).toBe("markdown");
    expect(next.status).toBe(IDLE_STATUS);
  });

  it("arms and disarms the dedupe confirm as a pure toggle", () => {
    const armed = reducer(initialState, { type: "dedupeArmed" });
    expect(armed.dedupeArmed).toBe(true);

    const disarmed = reducer(armed, { type: "dedupeDisarmed" });
    expect(disarmed.dedupeArmed).toBe(false);
  });

  it("selects a copy format", () => {
    const next = reducer(initialState, { type: "copyFormatChanged", format: "json" });
    expect(next.copyFormat).toBe("json");
  });

  it("transitions the status slot between success and error tones", () => {
    const success: State["status"] = { message: "Sorted 4 tabs.", tone: "success" };
    const afterSuccess = reducer(initialState, { type: "statusSet", status: success });
    expect(afterSuccess.status).toBe(success);

    const error: State["status"] = { message: "Couldn't complete that action.", tone: "error" };
    const afterError = reducer(afterSuccess, { type: "statusSet", status: error });
    expect(afterError.status).toBe(error);

    const cleared = reducer(afterError, { type: "statusSet", status: IDLE_STATUS });
    expect(cleared.status).toBe(IDLE_STATUS);
  });

  it("leaves the input state unchanged (returns a new object, same field values)", () => {
    const next = reducer(initialState, { type: "dataLoaded", data: SAMPLE_DATA });
    expect(next).not.toBe(initialState);
    expect(initialState.data).toBeNull();
  });
});
