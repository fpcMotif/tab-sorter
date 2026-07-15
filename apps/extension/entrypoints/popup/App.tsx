import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import "./App.css";

import { useAsyncAction } from "@/hooks/use-async-action";
import { downloadFile, writeClipboard } from "@/lib/deliver";
import { buildClipboardContent, buildUrlExport, COPY_FORMATS } from "@/lib/export";
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
import type { DomainGroup, ExportFormat, SortMode } from "@/lib/types";

import {
  CopyRow,
  DedupeRow,
  DomainList,
  DownloadRow,
  EmptyState,
  Header,
  LoadingState,
  SortRow,
  TidyHero,
  ToastSlot,
} from "./components";
import { PatternPanel } from "./pattern-panel";
import { IDLE_STATUS, initialState, reducer } from "./state";

// Esc, any other action, or this timeout disarms the two-step dedupe confirm
// (DESIGN-SPEC §4.3's armed state: a 4-second timer).
const DEDUPE_ARM_MS = 4000;

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

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { data, dedupeArmed, copyFormat, status } = state;
  const { pending, pendingKey, run } = useAsyncAction();
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

  function runWithStatus(action: () => Promise<void>, key?: string): Promise<void> {
    disarmDedupe();
    dispatch({ type: "statusSet", status: IDLE_STATUS });

    return run(
      action,
      () => {
        dispatch({
          type: "statusSet",
          status: { message: "Couldn't complete that action.", tone: "error" },
        });
      },
      key,
    );
  }

  function handleTidy() {
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
    }, "tidy");
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

  function handleRegexExtract(source: string, flags: string) {
    void runWithStatus(async () => {
      const result = await runExtract({ type: "regex", source, flags });
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

  function handleRequireInput() {
    dispatch({
      type: "statusSet",
      status: { message: "Enter a pattern first.", tone: "error" },
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

  return (
    <main className="popup-shell">
      <Header onOpenSettings={() => void openOptionsPage()} />

      <p className="facts-line num">
        {data === null
          ? isErrorTone
            ? "Couldn't read this window."
            : "Reading this window…"
          : factsLine(data)}
      </p>

      {data === null ? (
        <LoadingState isError={isErrorTone} message={status.message} />
      ) : isEmpty ? (
        <EmptyState tabLabel={pluralize(data.totalTabs, "tab")} />
      ) : (
        <div className="popup-scroll">
          <ToastSlot
            canUndo={data.canUndo}
            onDismiss={() => dispatch({ type: "statusSet", status: IDLE_STATUS })}
            onUndo={handleUndo}
            pending={pending}
            status={status}
          />

          <TidyHero onTidy={handleTidy} pending={pending} tidyPending={pendingKey === "tidy"} />

          <SortRow onSort={handleSort} pending={pending} />

          {data.duplicateCount > 0 ? (
            <DedupeRow
              dedupeArmed={dedupeArmed}
              duplicateCount={data.duplicateCount}
              onDedupeClick={handleDedupeClick}
              pending={pending}
            />
          ) : null}

          <hr className="rule" />

          <DomainList
            domainGroups={data.domainGroups}
            onExtract={handleDomainExtract}
            pending={pending}
          />

          <hr className="rule" />

          <PatternPanel
            disabled={pending}
            onExtract={handleRegexExtract}
            onRequireInput={handleRequireInput}
            presets={data.prefs.regexPresets}
            tabs={data.tabs}
          />

          <CopyRow
            copyAnnounce={copyAnnounce}
            copyDone={copyDone}
            copyFormat={copyFormat}
            onCopy={handleCopy}
            onFormatChange={(format) => dispatch({ type: "copyFormatChanged", format })}
            pending={pending}
          />

          <DownloadRow onDownload={handleDownload} pending={pending} />
        </div>
      )}
    </main>
  );
}

export default App;
