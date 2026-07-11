import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import "./App.css";

import { buildUrlExport } from "@/lib/export";
import { InvalidPatternError, matchByRegex } from "@/lib/match";
import { getPopupData, runExtract, runSort, type PopupData } from "@/lib/orchestration";
import type { DomainGroup, ExportFormat, SortMode } from "@/lib/types";

type StatusTone = "idle" | "success" | "error";

interface Status {
  message: string;
  tone: StatusTone;
}

const MAX_PATTERN_LENGTH = 1000;

function App() {
  const [data, setData] = useState<PopupData | null>(null);
  const [regexSource, setRegexSource] = useState("");
  const [regexFlags, setRegexFlags] = useState("i");
  const [status, setStatus] = useState<Status>({ message: "", tone: "idle" });
  const [pending, setPending] = useState(false);

  const loadData = useCallback(async () => {
    setData(await getPopupData());
  }, []);

  useEffect(() => {
    void loadData().catch((error) => {
      console.error(error);
      setStatus({ message: "Could not load tabs.", tone: "error" });
    });
  }, [loadData]);

  // Defer the heavy match computation off the keystroke so a slow pattern never
  // blocks typing; also cap pattern length to bound regex backtracking cost.
  const deferredSource = useDeferredValue(regexSource);

  const regexPreview = useMemo(() => {
    if (data === null || deferredSource.trim().length === 0) {
      return { count: 0, error: "" };
    }

    if (deferredSource.length > MAX_PATTERN_LENGTH) {
      return { count: 0, error: "Pattern is too long." };
    }

    try {
      return {
        count: matchByRegex(data.tabs, deferredSource, regexFlags).length,
        error: "",
      };
    } catch (error) {
      if (error instanceof InvalidPatternError) {
        // Distinguish a bad flags string from a bad pattern for a clearer message.
        try {
          new RegExp(deferredSource);
          return { count: 0, error: "Invalid regex flags." };
        } catch {
          return { count: 0, error: "Invalid regular expression." };
        }
      }

      throw error;
    }
  }, [data, regexFlags, deferredSource]);

  async function runWithStatus(action: () => Promise<void>) {
    setPending(true);
    setStatus({ message: "", tone: "idle" });

    try {
      await action();
    } catch (error) {
      console.error(error);
      setStatus({
        message:
          error instanceof InvalidPatternError ? "Invalid regular expression." : "Action failed.",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  function handleSort(mode: SortMode) {
    void runWithStatus(async () => {
      const result = await runSort(mode);

      setStatus({
        message: result.moved === 0 ? "Tabs already look sorted." : `Sorted ${result.moved} tabs.`,
        tone: "success",
      });
      await loadData();
    });
  }

  function handleDomainExtract(group: DomainGroup) {
    void runWithStatus(async () => {
      const result = await runExtract({ type: "domain", domain: group.domain });

      setStatus({
        message: result.moved === 0 ? "No tabs match that domain." : `Moved ${result.moved} tabs.`,
        tone: "success",
      });

      if (result.moved > 0) {
        window.setTimeout(() => window.close(), 300);
      }
    });
  }

  function handleRegexExtract() {
    if (regexSource.trim().length === 0) {
      setStatus({ message: "Enter a regex or substring first.", tone: "error" });
      return;
    }

    void runWithStatus(async () => {
      const result = await runExtract({ type: "regex", source: regexSource, flags: regexFlags });

      setStatus({
        message: result.moved === 0 ? "No tabs match that pattern." : `Moved ${result.moved} tabs.`,
        tone: "success",
      });

      if (result.moved > 0) {
        window.setTimeout(() => window.close(), 300);
      }
    });
  }

  function applyPreset(source: string, flags: string) {
    setRegexSource(source);
    setRegexFlags(flags);
  }

  function handleExport(format: ExportFormat) {
    if (data === null) return;

    try {
      const { content, extension, mimeType } = buildUrlExport(data.tabs, format);
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tabs-export.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ message: "Export successful.", tone: "success" });
    } catch (error) {
      console.error(error);
      setStatus({ message: "Export failed.", tone: "error" });
    }
  }

  return (
    <main className="popup-shell">
      <header>
        <p className="eyebrow">Tab Sorter</p>
        <h1>Clean up this window</h1>
      </header>

      <section className="panel">
        <h2>Sort tabs</h2>
        <div className="button-row">
          <button disabled={pending} onClick={() => handleSort("title")} type="button">
            A to Z by title
          </button>
          <button disabled={pending} onClick={() => handleSort("domain")} type="button">
            By domain
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Extract a domain</h2>
        {data === null ? <p className="muted">Loading tabs...</p> : null}
        {data !== null && data.domainGroups.length === 0 ? (
          <p className="muted">No movable tabs found.</p>
        ) : null}
        <div className="domain-list">
          {data?.domainGroups.map((group) => (
            <button
              className="domain-button"
              disabled={pending}
              key={group.domain}
              onClick={() => handleDomainExtract(group)}
              type="button"
            >
              <span>{group.domain}</span>
              <strong>{group.count}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Extract by regex</h2>
        <label>
          Pattern
          <input
            aria-describedby="regex-preview"
            disabled={pending}
            maxLength={MAX_PATTERN_LENGTH}
            onChange={(event) => setRegexSource(event.target.value)}
            placeholder="github|docs"
            value={regexSource}
          />
        </label>
        <label>
          Flags
          <input
            aria-describedby="regex-preview"
            disabled={pending}
            onChange={(event) => setRegexFlags(event.target.value)}
            placeholder="i"
            value={regexFlags}
          />
        </label>
        {regexPreview.error.length > 0 ? (
          <p className="inline-error" id="regex-preview" role="alert">
            {regexPreview.error}
          </p>
        ) : (
          <p className="muted" id="regex-preview">
            {regexSource.trim().length === 0
              ? "Enter a pattern to preview matches."
              : `${regexPreview.count} matches`}
          </p>
        )}
        <div className="preset-row">
          {data?.prefs.regexPresets.map((preset) => (
            <button
              className="preset-chip"
              disabled={pending}
              key={`${preset.label}:${preset.source}:${preset.flags}`}
              onClick={() => applyPreset(preset.source, preset.flags)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          disabled={pending || regexPreview.error.length > 0}
          onClick={handleRegexExtract}
          type="button"
        >
          Move matches to new window
        </button>
      </section>

      <section className="panel">
        <h2>Export tabs</h2>
        <div className="button-row">
          <button
            disabled={pending || data === null}
            onClick={() => handleExport("markdown")}
            type="button"
          >
            As Markdown
          </button>
          <button
            disabled={pending || data === null}
            onClick={() => handleExport("text")}
            type="button"
          >
            As Plain Text
          </button>
        </div>
      </section>

      <p
        aria-live="polite"
        className={`status ${status.tone}`}
        hidden={status.message.length === 0}
        role="status"
      >
        {status.message}
      </p>
    </main>
  );
}

export default App;
