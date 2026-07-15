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

import {
  IconCheck,
  IconCheckCircle,
  IconChevron,
  IconClose,
  IconCopy,
  IconDomain,
  IconDuplicate,
  IconFilter,
  IconGear,
  IconOpenNew,
  IconSort,
  IconSparkle,
  IconSpinner,
  IconUndo,
  IconWarning,
  IconWindow,
} from "@/components/icons";
import { useAsyncAction } from "@/hooks/use-async-action";
import { downloadFile, writeClipboard } from "@/lib/deliver";
import {
  buildClipboardContent,
  buildUrlExport,
  COPY_FORMATS,
  DOWNLOAD_FORMATS,
} from "@/lib/export";
import { MATCH_SAFETY_CAP, matchPattern, reasonToString } from "@/lib/match";
import {
  getPopupData,
  getSelectedTabs,
  openOptionsPage,
  runDedupe,
  runExtract,
  runSort,
  runTidy,
  runUndo,
  type PopupData,
} from "@/lib/orchestration";
import { assignColor } from "@/lib/domain";
import type { ClipboardFormat, DomainGroup, ExportFormat, GroupColor, SortMode } from "@/lib/types";

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
  regexSource: string;
  regexFlags: string;
  patternOpen: boolean;
  dedupeArmed: boolean;
  copyFormat: ClipboardFormat;
  status: Status;
}

type Action =
  | { type: "dataLoaded"; data: PopupData }
  | { type: "regexSourceChanged"; source: string }
  | { type: "caseFlagToggled" }
  | { type: "presetApplied"; source: string; flags: string }
  | { type: "patternToggled" }
  | { type: "dedupeArmed" }
  | { type: "dedupeDisarmed" }
  | { type: "copyFormatChanged"; format: ClipboardFormat }
  | { type: "statusSet"; status: Status };

const IDLE_STATUS: Status = { message: "", tone: "idle" };

const initialState: State = {
  data: null,
  regexSource: "",
  regexFlags: "i",
  patternOpen: false,
  dedupeArmed: false,
  copyFormat: "markdown",
  status: IDLE_STATUS,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "dataLoaded":
      return { ...state, data: action.data };
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
  const { data, regexSource, regexFlags, patternOpen, dedupeArmed, copyFormat, status } = state;
  const { pending, run } = useAsyncAction();
  const [tidyPending, setTidyPending] = useState(false);
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

  // Defer the heavy match computation off the keystroke so a slow pattern never
  // blocks typing; matchPattern owns the safety cap that bounds backtracking cost.
  const deferredSource = useDeferredValue(regexSource);

  const regexPreview = useMemo(() => {
    if (data === null || deferredSource.trim().length === 0) {
      return { count: 0, error: "" };
    }

    const result = matchPattern(data.tabs, deferredSource, regexFlags);

    return result.ok
      ? { count: result.ids.length, error: "" }
      : { count: 0, error: reasonToString(result.reason) };
  }, [data, regexFlags, deferredSource]);

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
    setTidyPending(true);
    void runWithStatus(async () => {
      const result = await runTidy();
      await loadData();

      if (result.moved === 0 && result.grouped === 0) {
        dispatch({ type: "statusSet", status: { message: "Already tidy.", tone: "success" } });
        return;
      }

      const dots = result.createdGroups.map((group) => group.color);

      dispatch({
        type: "statusSet",
        status: {
          message: `Grouped ${result.grouped} tabs into ${result.createdGroups.length} groups · ${result.moved} moved`,
          tone: "success",
          dots,
        },
      });
    }).finally(() => setTidyPending(false));
  }

  function handleSort(mode: SortMode) {
    void runWithStatus(async () => {
      const result = await runSort(mode);
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
    if (!dedupeArmed) {
      dispatch({ type: "dedupeArmed" });
      window.clearTimeout(dedupeTimerRef.current);
      dedupeTimerRef.current = window.setTimeout(disarmDedupe, DEDUPE_ARM_MS);
      return;
    }

    disarmDedupe();
    void runWithStatus(async () => {
      const result = await runDedupe({ confirm: true });
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
    void runWithStatus(async () => {
      const result = await runUndo();
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

  function handleDomainExtract(group: DomainGroup) {
    void runWithStatus(async () => {
      const result = await runExtract({ type: "domain", domain: group.domain });
      await loadData();

      dispatch({
        type: "statusSet",
        status: {
          message:
            result.moved === 0
              ? "No tabs match that domain."
              : `Moved ${result.moved} tabs to a new window.`,
          tone: "success",
        },
      });

      if (result.moved > 0) {
        window.setTimeout(() => window.close(), 300);
      }
    });
  }

  function handleRegexExtract() {
    if (regexSource.trim().length === 0) {
      dispatch({
        type: "statusSet",
        status: { message: "Enter a pattern first.", tone: "error" },
      });
      return;
    }

    void runWithStatus(async () => {
      const result = await runExtract({ type: "regex", source: regexSource, flags: regexFlags });
      await loadData();

      dispatch({
        type: "statusSet",
        status: {
          message:
            result.moved === 0
              ? "No tabs match that pattern."
              : `Moved ${result.moved} tabs to a new window.`,
          tone: "success",
        },
      });

      if (result.moved > 0) {
        window.setTimeout(() => window.close(), 300);
      }
    });
  }

  function handleCopy() {
    disarmDedupe();

    void run(
      async () => {
        const tabs = await getSelectedTabs();
        await writeClipboard(buildClipboardContent(tabs, copyFormat));

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
        downloadFile(buildUrlExport(tabs, format));
      },
      () => {
        dispatch({
          type: "statusSet",
          status: { message: "Couldn't download tabs.", tone: "error" },
        });
      },
    );
  }

  const isEmpty = data !== null && data.totalTabs <= 1;
  const isErrorTone = status.tone === "error";
  const moveLabel =
    regexPreview.error.length === 0 && regexPreview.count > 0
      ? `Move ${pluralize(regexPreview.count, "tab")} to new window`
      : "Move to new window";

  return (
    <main className="popup-shell">
      <div className="header">
        <span className="app-icon">
          <IconSparkle />
        </span>
        <div className="brand">
          <span className="app-name">Tab Sorter</span>
        </div>
        <button
          aria-label="Open settings"
          className="icon-btn"
          onClick={() => void openOptionsPage()}
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
            ) : null}
            {data.canUndo ? (
              <button className="undo-pill" disabled={pending} onClick={handleUndo} type="button">
                <IconUndo />
                Undo
                <kbd>⌥⇧Z</kbd>
              </button>
            ) : null}
          </div>

          <button
            autoFocus
            className="hero-tidy"
            disabled={pending}
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

          <div aria-label="Sort tabs" className="sort-row" role="group">
            <button
              className="chip-btn"
              disabled={pending}
              onClick={() => handleSort("title")}
              type="button"
            >
              <IconSort />
              A to Z<kbd>⌥⇧T</kbd>
            </button>
            <button
              className="chip-btn"
              disabled={pending}
              onClick={() => handleSort("domain")}
              type="button"
            >
              <IconDomain />
              By domain
            </button>
          </div>

          {data.duplicateCount > 0 ? (
            <div>
              <div className="dedupe-row">
                <span className="dedupe-icon">
                  <IconDuplicate />
                </span>
                <span className="dedupe-text num">{data.duplicateCount} duplicates found</span>
                <button
                  className={dedupeArmed ? "btn-danger-armed" : "btn-outline"}
                  disabled={pending}
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

          <div>
            <h3 className="section-label">Extract a domain</h3>
            {data.domainGroups.length === 0 ? (
              <p className="empty-sub">No movable tabs found.</p>
            ) : (
              <ul className="domain-list">
                {data.domainGroups.map((group) => (
                  <li key={group.domain}>
                    <button
                      className="domain-row"
                      disabled={pending}
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
                    : `Matches ${regexPreview.count} of ${data.tabs.length} tabs`}
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
                disabled={pending || regexPreview.error.length > 0 || regexPreview.count === 0}
                onClick={handleRegexExtract}
                type="button"
              >
                {moveLabel}
              </button>
            </div>
          ) : null}

          <div className="copy-row">
            <span className="copy-label">Copy tabs</span>
            <div aria-label="Copy format" className="format-group" role="group">
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
            </div>
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
            <div aria-label="Download format" className="format-group" role="group">
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
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
