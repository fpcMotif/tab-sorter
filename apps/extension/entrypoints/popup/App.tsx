import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";

import { InvalidPatternError, matchByRegex } from "@/lib/match";
import { getPopupData, runExtract, runSort, type PopupData } from "@/lib/orchestration";
import type { DomainGroup, SortMode } from "@/lib/types";

type StatusTone = "idle" | "success" | "error";

interface Status {
  message: string;
  tone: StatusTone;
}

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

  const regexPreview = useMemo(() => {
    if (data === null || regexSource.trim().length === 0) {
      return { count: 0, error: "" };
    }

    try {
      return {
        count: matchByRegex(data.tabs, regexSource, regexFlags).length,
        error: "",
      };
    } catch (error) {
      if (error instanceof InvalidPatternError) {
        return { count: 0, error: "Invalid regular expression." };
      }

      throw error;
    }
  }, [data, regexFlags, regexSource]);

  async function runWithStatus(action: () => Promise<void>) {
    setPending(true);
    setStatus({ message: "", tone: "idle" });

    try {
      await action();
    } catch (error) {
      console.error(error);
      setStatus({
        message: error instanceof InvalidPatternError ? "Invalid regular expression." : "Action failed.",
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
        {data !== null && data.domainGroups.length === 0 ? <p className="muted">No movable tabs found.</p> : null}
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
            disabled={pending}
            onChange={(event) => setRegexSource(event.target.value)}
            placeholder="github|docs"
            value={regexSource}
          />
        </label>
        <label>
          Flags
          <input
            disabled={pending}
            onChange={(event) => setRegexFlags(event.target.value)}
            placeholder="i"
            value={regexFlags}
          />
        </label>
        {regexPreview.error.length > 0 ? (
          <p className="inline-error">{regexPreview.error}</p>
        ) : (
          <p className="muted">{regexSource.trim().length === 0 ? "Enter a pattern to preview matches." : `${regexPreview.count} matches`}</p>
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
        <button disabled={pending || regexPreview.error.length > 0} onClick={handleRegexExtract} type="button">
          Move matches to new window
        </button>
      </section>

      {status.message.length > 0 ? <p className={`status ${status.tone}`}>{status.message}</p> : null}
    </main>
  );
}

export default App;
