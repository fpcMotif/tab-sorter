import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import "./App.css";

import { useAsyncAction } from "@/hooks/use-async-action";
import { assignColor } from "@tab-sorter/core/domain";
import {
  buildClipboardContent,
  buildUrlExport,
  COPY_FORMATS,
  DOWNLOAD_FORMATS,
} from "@tab-sorter/core/export";
import { MATCH_SAFETY_CAP, matchPattern, reasonToString } from "@tab-sorter/core/match";
import type { ExtractMatcher, ExtractScope } from "@/lib/mutation";
import { requestMutation } from "@/lib/runtime";
import type {
  ClipboardFormat,
  DomainGroup,
  ExportFormat,
  GroupColor,
  SortMode,
} from "@tab-sorter/core/types";
import {
  getAllWindowsExtract,
  getPopupData,
  getSelectedTabs,
  type AllWindowsExtract,
  type PopupData,
} from "@/lib/window-queries";

// Esc, any other action, or this timeout disarms the two-step dedupe confirm
// (DESIGN-SPEC §4.3's armed state: a 4-second timer).
const DEDUPE_ARM_MS = 4000;

const FORMAT_SHORT_LABELS: Record<ClipboardFormat, string> = {
  markdown: "MD",
  json: "JSON",
  url: "URL",
  html: "HTML",
};

function pluralize(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function factsLine(data: PopupData): string {
  const parts = [pluralize(data.totalTabs, "tab"), pluralize(data.domainGroups.length, "site")];

  if (data.duplicateCount > 0) {
    parts.push(pluralize(data.duplicateCount, "duplicate"));
  }

  return parts.join(" · ");
}

interface IconProps {
  className?: string;
}

function IconSparkle({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 3.2l1.9 5.3 5.3 1.9-5.3 1.9L11 17.6l-1.9-5.3L3.8 10.4l5.3-1.9L11 3.2z" />
      <path d="M18.3 2.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

function IconSort({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="15" y1="12" y2="12" />
      <line x1="4" x2="10" y1="18" y2="18" />
    </svg>
  );
}

function IconDomain({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect height="7.5" rx="2" width="7.5" x="3" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="3" y="13.5" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="13.5" />
    </svg>
  );
}

function IconGear({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm7.4-3.5c0-.4 0-.8-.1-1.2l1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 00-2-1.2L14.6 3H9.4l-.4 2.7a7.6 7.6 0 00-2 1.2l-2.3-.9L2.8 9.3l1.9 1.5c-.1.4-.1.8-.1 1.2s0 .8.1 1.2L2.8 14.7l1.9 3.3 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.7h5.2l.4-2.7c.7-.3 1.4-.7 2-1.2l2.3.9 1.9-3.3-1.9-1.5c.1-.4.1-.8.1-1.2z" />
    </svg>
  );
}

function IconChevron({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconUndo({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4.5 10.8a7.7 7.7 0 1 1 2 6.4" />
      <polyline points="4 4.5 4.5 10.8 10.7 10" />
    </svg>
  );
}

function IconClose({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <line x1="6" x2="18" y1="6" y2="18" />
      <line x1="18" x2="6" y1="6" y2="18" />
    </svg>
  );
}

function IconWarning({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 3.3 22 20H2z" />
      <line x1="12" x2="12" y1="9.5" y2="14.5" />
      <circle cx="12" cy="17.3" fill="currentColor" r=".9" stroke="none" />
    </svg>
  );
}

function IconCheckCircle({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="7.5 12.5 10.5 15.5 16.5 9" />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function IconOpenNew({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M9 5h10v10" />
      <line x1="19" x2="9.5" y1="5" y2="14.5" />
      <path d="M15 19H5V9" />
    </svg>
  );
}

function IconFilter({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3.5 4h17l-6.3 7.6v6l-4.4 2.2v-8.2z" />
    </svg>
  );
}

function IconCopy({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="2" width="11" x="3.5" y="8.5" />
      <path d="M7.5 8.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" />
    </svg>
  );
}

function IconDuplicate({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="1.5" width="11" x="5" y="8" />
      <path d="M9 8V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

function IconWindow({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <line x1="3" x2="21" y1="9.4" y2="9.4" />
      <rect fill="currentColor" height="2" rx="1" stroke="none" width="6" x="5.2" y="6.4" />
    </svg>
  );
}

function IconSpinner({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9.5" strokeDasharray="38 60" />
    </svg>
  );
}

type StatusTone = "idle" | "success" | "error";

interface Status {
  message: string;
  tone: StatusTone;
  // The group-color dots echoed in a tidy success toast (DESIGN-SPEC §4.7's
  // Utility Dense graft) — absent for every other action's toast.
  dots?: GroupColor[];
}

interface State {
  data: PopupData | null;
  extractScope: ExtractScope;
  // Cross-window tabs + domain groups, fetched lazily the first time the user
  // flips to "All windows" so popup-open stays a single-window read.
  allWindows: AllWindowsExtract | null;
  regexSource: string;
  regexFlags: string;
  patternOpen: boolean;
  dedupeArmed: boolean;
  copyFormat: ClipboardFormat;
  status: Status;
}

type Action =
  | { type: "dataLoaded"; data: PopupData }
  | { type: "scopeChanged"; scope: ExtractScope }
  | { type: "allWindowsLoaded"; data: AllWindowsExtract }
  | { type: "allWindowsInvalidated" }
  | { type: "regexSourceChanged"; source: string }
  | { type: "caseFlagToggled" }
  | { type: "presetApplied"; source: string; flags: string }
  | { type: "patternToggled" }
  | { type: "dedupeArmed" }
  | { type: "dedupeDisarmed" }
  | { type: "copyFormatChanged"; format: ClipboardFormat }
  | { type: "statusSet"; status: Status };

const IDLE_STATUS: Status = { message: "", tone: "idle" };

function extractErrorStatus(error: unknown): Status {
  // A cross-window extract blocked by a mid-recovery window arrives as a
  // RECOVERY_REQUIRED protocol error whose message already names the window.
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "RECOVERY_REQUIRED"
  ) {
    const message = (error as { message?: unknown }).message;

    return {
      message: typeof message === "string" ? message : "A window needs recovery first.",
      tone: "error",
    };
  }

  return { message: "Couldn't complete that action.", tone: "error" };
}

const initialState: State = {
  data: null,
  extractScope: "window",
  allWindows: null,
  regexSource: "",
  regexFlags: "i",
  patternOpen: false,
  dedupeArmed: false,
  copyFormat: "markdown",
  status: IDLE_STATUS,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "dataLoaded": {
      // On the very first load, default to the wide scope when the current
      // window is trivial but other windows are open — the consolidation case.
      const autoAll =
        state.data === null && action.data.totalTabs <= 1 && action.data.windowCount > 1;

      return { ...state, data: action.data, extractScope: autoAll ? "all" : state.extractScope };
    }
    case "scopeChanged":
      return { ...state, extractScope: action.scope };
    case "allWindowsLoaded":
      return { ...state, allWindows: action.data };
    case "allWindowsInvalidated":
      return { ...state, allWindows: null };
    case "regexSourceChanged":
      return { ...state, regexSource: action.source };
    case "caseFlagToggled":
      // Add/remove only the `i` character so a preset's other flags (e.g. the
      // `m` in "im") survive the toggle instead of being clobbered.
      return {
        ...state,
        regexFlags: state.regexFlags.includes("i")
          ? state.regexFlags.replace("i", "")
          : `${state.regexFlags}i`,
      };
    case "presetApplied":
      return { ...state, regexSource: action.source, regexFlags: action.flags };
    case "patternToggled":
      return { ...state, patternOpen: !state.patternOpen };
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

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    data,
    extractScope,
    allWindows,
    regexSource,
    regexFlags,
    patternOpen,
    dedupeArmed,
    copyFormat,
    status,
  } = state;
  const { pending, run } = useAsyncAction();
  const [tidyPending, setTidyPending] = useState(false);
  // The consolidated window from the last successful all-windows extract, so
  // the popup can offer a "Show new window" jump instead of auto-closing.
  const [newWindowId, setNewWindowId] = useState<number | undefined>(undefined);
  const [copyDone, setCopyDone] = useState(false);
  // Copy's own sr-only announcement (DESIGN-SPEC §4.6's #copyAnnounce) — kept
  // out of `status`/the shared toast slot so Copy never clobbers whatever
  // action's confirmation (or error) is currently showing there.
  const [copyAnnounce, setCopyAnnounce] = useState("");
  const dedupeTimerRef = useRef<number | undefined>(undefined);

  // Returns the freshly-fetched data (not just dispatching it) so a caller that
  // needs the post-mutation state — e.g. the tidy toast's group-dots — never
  // reads a stale closure over the pre-mutation render.
  const loadData = useCallback(async () => {
    const next = await getPopupData();
    dispatch({ type: "dataLoaded", data: next });
    return next;
  }, []);

  useEffect(() => {
    void loadData().catch(() => {
      dispatch({
        type: "statusSet",
        status: { message: "Couldn't load this window's tabs.", tone: "error" },
      });
    });
  }, [loadData]);

  const disarmDedupe = useCallback(() => {
    window.clearTimeout(dedupeTimerRef.current);
    dispatch({ type: "dedupeDisarmed" });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        disarmDedupe();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disarmDedupe]);

  useEffect(() => () => window.clearTimeout(dedupeTimerRef.current), []);

  // Fetch the cross-window set the first time it's needed (and after an extract
  // invalidates it), never on popup open.
  useEffect(() => {
    if (extractScope !== "all" || allWindows !== null) {
      return;
    }

    let cancelled = false;
    void getAllWindowsExtract()
      .then((next) => {
        if (!cancelled) {
          dispatch({ type: "allWindowsLoaded", data: next });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({
            type: "statusSet",
            status: { message: "Couldn't read your other windows.", tone: "error" },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [extractScope, allWindows]);

  // Defer the heavy match computation off the keystroke so a slow pattern never
  // blocks typing; matchPattern owns the safety cap that bounds backtracking cost.
  const deferredSource = useDeferredValue(regexSource);

  const scopeTabs = useMemo(
    () => (extractScope === "all" ? (allWindows?.tabs ?? []) : (data?.tabs ?? [])),
    [extractScope, allWindows, data],
  );

  const regexPreview = useMemo(() => {
    if (data === null || deferredSource.trim().length === 0) {
      return { count: 0, error: "" };
    }

    const result = matchPattern(scopeTabs, deferredSource, regexFlags);

    return result.ok
      ? { count: result.ids.length, error: "" }
      : { count: 0, error: reasonToString(result.reason) };
  }, [data, scopeTabs, regexFlags, deferredSource]);

  function runWithStatus(action: () => Promise<void>): Promise<void> {
    disarmDedupe();
    dispatch({ type: "statusSet", status: IDLE_STATUS });

    return run(action, () => {
      dispatch({
        type: "statusSet",
        status: { message: "Couldn't complete that action.", tone: "error" },
      });
    });
  }

  function handleTidy() {
    if (data === null) {
      return;
    }

    setTidyPending(true);
    void runWithStatus(async () => {
      const result = await requestMutation({ type: "tidy", windowId: data.windowId });
      await loadData();

      if (!result.changed) {
        dispatch({ type: "statusSet", status: { message: "Already tidy.", tone: "success" } });
        return;
      }

      dispatch({
        type: "statusSet",
        status: {
          message: `Grouped ${result.grouped} tabs into ${result.groupsCreated} groups · ${result.moved} moved`,
          tone: "success",
          dots: result.createdGroups.map((group) => group.color),
        },
      });
    }).finally(() => setTidyPending(false));
  }

  function handleSort(mode: SortMode) {
    if (data === null) {
      return;
    }

    void runWithStatus(async () => {
      const result = await requestMutation({ type: "sort", windowId: data.windowId, mode });
      await loadData();

      dispatch({
        type: "statusSet",
        status: {
          message: result.moved === 0 ? "Already sorted." : `Sorted ${result.moved} tabs.`,
          tone: "success",
        },
      });
    });
  }

  function handleDedupeClick() {
    if (data === null) {
      return;
    }

    if (!dedupeArmed) {
      dispatch({ type: "dedupeArmed" });
      window.clearTimeout(dedupeTimerRef.current);
      dedupeTimerRef.current = window.setTimeout(disarmDedupe, DEDUPE_ARM_MS);
      return;
    }

    disarmDedupe();
    void runWithStatus(async () => {
      const result = await requestMutation({ type: "dedupe", windowId: data.windowId });
      await loadData();

      dispatch({
        type: "statusSet",
        status: {
          message:
            result.closed === 0
              ? "No duplicates closed."
              : `Closed ${pluralize(result.closed, "duplicate")}.`,
          tone: "success",
        },
      });
    });
  }

  function handleUndo() {
    if (data === null) {
      return;
    }

    void runWithStatus(async () => {
      const result = await requestMutation({ type: "undo", windowId: data.windowId });
      await loadData();

      if (!result.undone) {
        dispatch({ type: "statusSet", status: { message: "Nothing to undo.", tone: "error" } });
        return;
      }

      dispatch({
        type: "statusSet",
        status: {
          message:
            result.reopened > 0
              ? `Restored ${result.restored} tabs, reopened ${result.reopened}.`
              : `Restored ${result.restored} tabs.`,
          tone: "success",
        },
      });
    });
  }

  function runExtract(matcher: ExtractMatcher, emptyMessage: string) {
    if (data === null) {
      return;
    }

    const scope = extractScope;
    void runWithStatus(async () => {
      setNewWindowId(undefined);

      const result = await requestMutation({
        type: "extract",
        windowId: data.windowId,
        matcher,
        scope: scope === "all" ? "all" : undefined,
      }).catch((error: unknown) => {
        dispatch({ type: "statusSet", status: extractErrorStatus(error) });

        return null;
      });
      if (result === null) {
        return;
      }

      // Tabs moved, so any cached cross-window set is now stale.
      dispatch({ type: "allWindowsInvalidated" });
      await loadData();

      if (scope === "all") {
        if (result.moved === 0) {
          dispatch({
            type: "statusSet",
            status: { message: "No tabs match across your windows.", tone: "success" },
          });
          return;
        }

        // Keep the popup open with a jump to the (unfocused) new window.
        setNewWindowId(result.newWindowId);
        dispatch({
          type: "statusSet",
          status: {
            message: `Moved ${pluralize(result.moved, "tab")} from ${pluralize(
              result.windowsAffected ?? 0,
              "window",
            )} into a new window.`,
            tone: "success",
          },
        });
        return;
      }

      dispatch({
        type: "statusSet",
        status: {
          message:
            result.moved === 0 ? emptyMessage : `Moved ${result.moved} tabs to a new window.`,
          tone: "success",
        },
      });

      if (result.moved > 0) {
        window.setTimeout(() => window.close(), 300);
      }
    });
  }

  function handleDomainExtract(group: DomainGroup) {
    runExtract({ type: "domain", domain: group.domain }, "No tabs match that domain.");
  }

  function handleRegexExtract() {
    if (regexSource.trim().length === 0) {
      dispatch({
        type: "statusSet",
        status: { message: "Enter a pattern first.", tone: "error" },
      });
      return;
    }

    runExtract(
      { type: "regex", source: regexSource, flags: regexFlags },
      "No tabs match that pattern.",
    );
  }

  function handleCopy() {
    disarmDedupe();

    void run(
      async () => {
        const tabs = await getSelectedTabs();
        await navigator.clipboard.writeText(buildClipboardContent(tabs, copyFormat));

        const label =
          COPY_FORMATS.find((option) => option.format === copyFormat)?.label ?? copyFormat;

        setCopyDone(true);
        window.setTimeout(() => setCopyDone(false), 1200);
        // Announced through the isolated sr-only channel, not `status` — the
        // shared toast slot is Tidy/Sort/Dedupe/Extract's, and a redundant
        // copy confirmation must never clobber whatever it's currently showing.
        setCopyAnnounce(`Copied ${pluralize(tabs.length, "tab")} as ${label}.`);
        window.setTimeout(() => setCopyAnnounce(""), 1200);
      },
      () => {
        dispatch({
          type: "statusSet",
          status: { message: "Couldn't copy to clipboard.", tone: "error" },
        });
      },
    );
  }

  function handleDownload(format: ExportFormat) {
    disarmDedupe();

    void run(
      async () => {
        const tabs = await getSelectedTabs();
        const { content, extension, mimeType } = buildUrlExport(tabs, format);

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `tab-sorter-export.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      () => {
        dispatch({
          type: "statusSet",
          status: { message: "Couldn't download tabs.", tone: "error" },
        });
      },
    );
  }

  // A trivial current window still gets the full UI when other windows are open,
  // so the All-windows toggle (and auto-switch) can offer consolidation.
  const isEmpty = data !== null && data.totalTabs <= 1 && !data.canUndo && data.windowCount <= 1;
  const mutationDisabled = pending || data?.recoveryRequired === true;
  const isErrorTone = status.tone === "error";
  const showScopeToggle = data !== null && data.windowCount > 1;
  const scopeGroups =
    extractScope === "all" ? (allWindows?.domainGroups ?? []) : (data?.domainGroups ?? []);
  const scopeScanning = extractScope === "all" && allWindows === null;
  const moveLabel =
    regexPreview.error.length === 0 && regexPreview.count > 0
      ? extractScope === "all"
        ? `Move ${pluralize(regexPreview.count, "tab")} from all windows`
        : `Move ${pluralize(regexPreview.count, "tab")} to new window`
      : "Move to new window";

  return (
    <main className="popup-shell">
      <div className="header">
        <span className="app-icon">
          <IconSparkle />
        </span>
        <div className="brand">
          <h1 className="app-name">Tab Sorter</h1>
        </div>
        <button
          aria-label="Open settings"
          className="icon-btn"
          onClick={() => void browser.runtime.openOptionsPage()}
          type="button"
        >
          <IconGear />
        </button>
      </div>

      <p className="facts-line num">
        {data === null
          ? isErrorTone
            ? "Couldn't read this window."
            : "Reading this window…"
          : factsLine(data)}
      </p>

      {data === null ? (
        <div className="popup-scroll">
          {isErrorTone ? (
            <div aria-live="assertive" className="toast is-error" role="alert">
              <IconWarning />
              <span className="toast-body">{status.message}</span>
            </div>
          ) : (
            <>
              <div className="loading-block">
                <IconSpinner className="spinner spin" />
                <span className="loading-text">Counting tabs and sites…</span>
              </div>
              <div className="skeleton" />
              <div className="skeleton" style={{ opacity: 0.7 }} />
              <div className="skeleton" style={{ opacity: 0.45 }} />
            </>
          )}
        </div>
      ) : isEmpty ? (
        <div className="popup-scroll">
          <div className="empty-block">
            <IconWindow className="empty-icon" />
            <span className="empty-title">Nothing to tidy</span>
            <span className="empty-sub">
              This window has {pluralize(data.totalTabs, "tab")}. Open a few more and Tab Sorter
              will find a shape worth grouping.
            </span>
          </div>
        </div>
      ) : (
        <div className="popup-scroll">
          <div
            aria-live={isErrorTone ? "assertive" : "polite"}
            className="toast-slot"
            role={isErrorTone ? "alert" : "status"}
          >
            {status.message.length > 0 ? (
              <div className={`toast${isErrorTone ? " is-error" : ""}`}>
                {isErrorTone ? <IconWarning /> : <IconCheckCircle />}
                <span className="toast-body">
                  {status.message}
                  {status.dots !== undefined && status.dots.length > 0 ? (
                    <span aria-hidden="true" className="group-dots">
                      {status.dots.map((color, index) => (
                        <span className={`dot dot-${color}`} key={`${color}-${index}`} />
                      ))}
                    </span>
                  ) : null}
                </span>
                <button
                  aria-label="Dismiss"
                  className="toast-close"
                  onClick={() => dispatch({ type: "statusSet", status: IDLE_STATUS })}
                  type="button"
                >
                  <IconClose />
                </button>
              </div>
            ) : data.recoveryRequired ? (
              <div className="toast is-error">
                <IconWarning />
                <span className="toast-body">An interrupted change needs recovery.</span>
              </div>
            ) : null}
            {data.canUndo ? (
              <button className="undo-pill" disabled={pending} onClick={handleUndo} type="button">
                <IconUndo />
                {data.recoveryRequired ? "Recover" : "Undo"}
                <kbd>⌥⇧Z</kbd>
              </button>
            ) : null}
            {newWindowId !== undefined ? (
              <button
                className="undo-pill"
                onClick={() => void browser.windows.update(newWindowId, { focused: true })}
                type="button"
              >
                <IconWindow />
                Show new window
              </button>
            ) : null}
          </div>

          <button
            className="hero-tidy"
            disabled={mutationDisabled}
            onClick={handleTidy}
            type="button"
          >
            <span className="hero-icon">
              {tidyPending ? <IconSpinner className="spin" /> : <IconSparkle />}
            </span>
            <span className="hero-text">
              <span className="hero-title">
                {tidyPending ? "Tidying window…" : "Tidy this window"}
              </span>
              <span className="hero-sub">
                {tidyPending ? "Sorting and grouping by site" : "Sort and group by site"}
              </span>
            </span>
            <span className="hero-keys">
              <kbd>⌥</kbd>
              <kbd>⇧</kbd>
              <kbd>Space</kbd>
            </span>
          </button>

          <fieldset aria-label="Sort tabs" className="sort-row">
            <button
              className="chip-btn"
              disabled={mutationDisabled}
              onClick={() => handleSort("title")}
              type="button"
            >
              <IconSort />
              A to Z<kbd>⌥⇧T</kbd>
            </button>
            <button
              className="chip-btn"
              disabled={mutationDisabled}
              onClick={() => handleSort("domain")}
              type="button"
            >
              <IconDomain />
              By domain
            </button>
          </fieldset>

          {data.duplicateCount > 0 ? (
            <div>
              <div className="dedupe-row">
                <span className="dedupe-icon">
                  <IconDuplicate />
                </span>
                <span className="dedupe-text num">{data.duplicateCount} duplicates found</span>
                <button
                  className={dedupeArmed ? "btn-danger-armed" : "btn-outline"}
                  disabled={mutationDisabled}
                  onClick={handleDedupeClick}
                  type="button"
                >
                  Close {data.duplicateCount} duplicates{dedupeArmed ? "?" : ""}
                </button>
              </div>
              {dedupeArmed ? (
                <p className="armed-hint">Press again to confirm — closes the newer copy of each</p>
              ) : null}
            </div>
          ) : null}

          <hr className="rule" />

          {showScopeToggle ? (
            <fieldset aria-label="Extract scope" className="scope-toggle">
              <button
                aria-pressed={extractScope === "window"}
                className={`scope-chip${extractScope === "window" ? " is-selected" : ""}`}
                disabled={pending}
                onClick={() => dispatch({ type: "scopeChanged", scope: "window" })}
                type="button"
              >
                This window
              </button>
              <button
                aria-pressed={extractScope === "all"}
                className={`scope-chip${extractScope === "all" ? " is-selected" : ""}`}
                disabled={pending}
                onClick={() => dispatch({ type: "scopeChanged", scope: "all" })}
                type="button"
              >
                All windows
              </button>
            </fieldset>
          ) : null}

          <div>
            <h2 className="section-label">Extract a domain</h2>
            {scopeScanning ? (
              <p className="empty-sub">Scanning all windows…</p>
            ) : scopeGroups.length === 0 ? (
              <p className="empty-sub">No movable tabs found.</p>
            ) : (
              <ul className="domain-list">
                {scopeGroups.map((group) => (
                  <li key={group.domain}>
                    <button
                      className="domain-row"
                      disabled={mutationDisabled}
                      onClick={() => handleDomainExtract(group)}
                      type="button"
                    >
                      <span className={`dot dot-${assignColor(group.domain)}`} />
                      <span
                        className={`domain-name${group.domain.startsWith("(") ? " muted" : ""}`}
                      >
                        {group.domain}
                      </span>
                      <IconOpenNew className="row-go" />
                      <span className="count-badge num">{group.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr className="rule" />

          <button
            aria-controls="pattern-panel"
            aria-expanded={patternOpen}
            className="disclosure-row"
            onClick={() => dispatch({ type: "patternToggled" })}
            type="button"
          >
            <span className="disclosure-icon">
              <IconFilter />
            </span>
            <span className="disclosure-label">Extract by pattern</span>
            <span className="chevron">
              <IconChevron />
            </span>
          </button>

          {patternOpen ? (
            <div className="pattern-panel" id="pattern-panel">
              <div className="field">
                <label htmlFor="regex-input">Pattern</label>
                <input
                  aria-describedby="match-count"
                  autoComplete="off"
                  className={`regex-input${regexPreview.error.length > 0 ? " is-invalid" : ""}`}
                  disabled={pending}
                  id="regex-input"
                  maxLength={MATCH_SAFETY_CAP}
                  onChange={(event) =>
                    dispatch({ type: "regexSourceChanged", source: event.target.value })
                  }
                  placeholder="github|docs"
                  spellCheck={false}
                  value={regexSource}
                />
              </div>
              <div className="flags-row">
                <button
                  aria-pressed={regexFlags.includes("i")}
                  className={`flag-chip${regexFlags.includes("i") ? " on" : ""}`}
                  disabled={pending}
                  onClick={() => dispatch({ type: "caseFlagToggled" })}
                  type="button"
                >
                  Case-insensitive
                </button>
              </div>
              <p
                className={`match-count num${regexPreview.error.length > 0 ? " is-invalid" : ""}`}
                id="match-count"
              >
                {regexPreview.error.length > 0
                  ? regexPreview.error
                  : regexSource.trim().length === 0
                    ? "Enter a pattern to preview matches."
                    : `Matches ${regexPreview.count} of ${scopeTabs.length} tabs${
                        extractScope === "all"
                          ? ` across ${pluralize(data.windowCount, "window")}`
                          : ""
                      }`}
              </p>
              <div className="preset-chips">
                {data.prefs.regexPresets.map((preset) => (
                  <button
                    className="preset-chip"
                    disabled={pending}
                    key={`${preset.label}:${preset.source}:${preset.flags}`}
                    onClick={() =>
                      dispatch({
                        type: "presetApplied",
                        source: preset.source,
                        flags: preset.flags,
                      })
                    }
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                className="move-btn"
                disabled={
                  mutationDisabled || regexPreview.error.length > 0 || regexPreview.count === 0
                }
                onClick={handleRegexExtract}
                type="button"
              >
                {moveLabel}
              </button>
            </div>
          ) : null}

          <div className="copy-row">
            <span className="copy-label">Copy tabs</span>
            <fieldset aria-label="Copy format" className="format-group">
              {COPY_FORMATS.map((option) => (
                <button
                  className={`format-chip${copyFormat === option.format ? " is-selected" : ""}`}
                  disabled={pending}
                  key={option.format}
                  onClick={() => dispatch({ type: "copyFormatChanged", format: option.format })}
                  type="button"
                >
                  {FORMAT_SHORT_LABELS[option.format]}
                </button>
              ))}
            </fieldset>
            <button
              aria-label="Copy tabs"
              className={`icon-btn copy-btn${copyDone ? " is-copied" : ""}`}
              disabled={pending}
              onClick={handleCopy}
              type="button"
            >
              {copyDone ? <IconCheck /> : <IconCopy />}
            </button>
            <span aria-live="polite" className="sr-only">
              {copyAnnounce}
            </span>
          </div>

          <div className="copy-row">
            <span className="copy-label">Download tabs</span>
            <fieldset aria-label="Download format" className="format-group">
              {DOWNLOAD_FORMATS.map((option) => (
                <button
                  className="format-chip"
                  disabled={pending}
                  key={option.format}
                  onClick={() => handleDownload(option.format)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
