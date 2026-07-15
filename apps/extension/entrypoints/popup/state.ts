import type { PopupData } from "@/lib/orchestration";
import type { ClipboardFormat, GroupColor } from "@/lib/types";

export type StatusTone = "idle" | "success" | "error";

export interface Status {
  message: string;
  tone: StatusTone;
  // The group-color dots echoed in a tidy success toast (DESIGN-SPEC §4.7's
  // Utility Dense graft) — absent for every other action's toast.
  dots?: GroupColor[];
}

export interface State {
  data: PopupData | null;
  dedupeArmed: boolean;
  copyFormat: ClipboardFormat;
  status: Status;
}

export type Action =
  | { type: "dataLoaded"; data: PopupData }
  | { type: "dedupeArmed" }
  | { type: "dedupeDisarmed" }
  | { type: "copyFormatChanged"; format: ClipboardFormat }
  | { type: "statusSet"; status: Status };

export const IDLE_STATUS: Status = { message: "", tone: "idle" };

export const initialState: State = {
  data: null,
  dedupeArmed: false,
  copyFormat: "markdown",
  status: IDLE_STATUS,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "dataLoaded":
      return { ...state, data: action.data };
    case "dedupeArmed":
      return { ...state, dedupeArmed: true };
    case "dedupeDisarmed":
      return { ...state, dedupeArmed: false };
    case "copyFormatChanged":
      return { ...state, copyFormat: action.format };
    case "statusSet":
      return { ...state, status: action.status };
  }
}
