import type { Prefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

export interface SaveState {
  prefs: Prefs;
  status: string;
  error: string;
}

export type SaveAction =
  | { type: "prefsLoaded"; prefs: Prefs }
  | { type: "loadFailed" }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; prefs: Prefs }
  | { type: "saveFailed" }
  | { type: "validationFailed"; error: string };

export const INITIAL_SAVE_STATE: SaveState = {
  prefs: DEFAULT_PREFS,
  status: "",
  error: "",
};

export function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case "prefsLoaded":
      return { ...state, prefs: action.prefs };
    case "loadFailed":
      return { ...state, error: "Could not load preferences." };
    case "saveStarted":
      return { ...state, error: "", status: "" };
    case "saveSucceeded":
      return { ...state, prefs: action.prefs, status: "Saved." };
    case "saveFailed":
      return { ...state, error: "Could not save preferences." };
    case "validationFailed":
      return { ...state, error: action.error };
  }
}
