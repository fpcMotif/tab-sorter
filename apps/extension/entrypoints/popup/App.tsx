import { useEffect, useMemo, useState } from "react";

import { InvalidPatternError } from "../../lib/match";
import { getDomainGroups, previewRegexMatches, runExtract, runSort } from "../../lib/orchestration";
import { getPrefs } from "../../lib/storage";
import type { DomainGroup, RegexPreset, SortMode } from "../../lib/types";

import "./App.css";

function formatMoved(count: number): string {
  return count === 0 ? "No tabs needed to move." : `Moved ${count} tab${count === 1 ? "" : "s"}.`;
}

function App() {
  const [domainGroups, setDomainGroups] = useState<DomainGroup[]>([]);
  const [presets, setPresets] = useState<RegexPreset[]>([]);
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("i");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const canExtractRegex = useMemo(() => pattern.trim().length > 0 && !error && !busy, [busy, error, pattern]);

  useEffect(() => {
    let cancelled = false;

    async function loadData(): Promise<void> {
      try {
        const [groups, prefs] = await Promise.all([getDomainGroups(), getPrefs()]);

        if (!cancelled) {
          setDomainGroups(groups);
          setPresets(prefs.regexPresets);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to read tabs.");
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadMatchCount(): Promise<void> {
      if (!pattern.trim()) {
        setMatchCount(null);
        setError("");
        return;
      }

      try {
        const count = await previewRegexMatches(pattern, flags);

        if (!cancelled) {
          setMatchCount(count);
          setError("");
        }
      } catch (previewError) {
        if (!cancelled) {
          setMatchCount(null);
          setError(previewError instanceof InvalidPatternError ? previewError.message : "Unable to preview matches.");
        }
      }
    }

    void loadMatchCount();

    return () => {
      cancelled = true;
    };
  }, [flags, pattern, refreshToken]);

  async function runAction(action: () => Promise<{ moved: number }>, successPrefix: string): Promise<void> {
    setBusy(true);
    setStatus("");

    try {
      const result = await action();
      setStatus(`${successPrefix} ${formatMoved(result.moved)}`);
      setRefreshToken((value) => value + 1);
    } catch (actionError) {
      setStatus("");
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSort(mode: SortMode): Promise<void> {
    await runAction(() => runSort(mode), mode === "title" ? "Sorted by title." : "Sorted by domain.");
  }

  async function handleDomainExtract(domain: string): Promise<void> {
    await runAction(() => runExtract({ type: "domain", domain }), `Extracted ${domain}.`);
  }

  async function handleRegexExtract(): Promise<void> {
    if (!pattern.trim()) {
      setError("Enter a regex or substring first.");
      return;
    }

    await runAction(() => runExtract({ type: "regex", source: pattern, flags }), "Extracted matches.");
  }

  function applyPreset(preset: RegexPreset): void {
    setPattern(preset.source);
    setFlags(preset.flags);
    setStatus("");
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Current window</p>
          <h1>Tab Sorter</h1>
        </div>
        <button className="ghost-button" disabled={busy} onClick={() => setRefreshToken((value) => value + 1)} type="button">
          Refresh
        </button>
      </header>

      <section className="panel">
        <h2>Sort</h2>
        <div className="button-row">
          <button disabled={busy} onClick={() => void handleSort("title")} type="button">
            A to Z by title
          </button>
          <button disabled={busy} onClick={() => void handleSort("domain")} type="button">
            By domain
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Extract by domain</h2>
        {domainGroups.length === 0 ? (
          <p className="muted">No movable tabs found in this window.</p>
        ) : (
          <div className="domain-list">
            {domainGroups.map((group) => (
              <button disabled={busy} key={group.domain} onClick={() => void handleDomainExtract(group.domain)} type="button">
                <span>{group.domain}</span>
                <strong>{group.count}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Extract by regex</h2>
        <label>
          Pattern
          <input onChange={(event) => setPattern(event.target.value)} placeholder="github|jira|docs" value={pattern} />
        </label>
        <label>
          Flags
          <input onChange={(event) => setFlags(event.target.value)} placeholder="i" value={flags} />
        </label>
        <div className="button-row align-center">
          <button disabled={!canExtractRegex} onClick={() => void handleRegexExtract()} type="button">
            Extract matches
          </button>
          {matchCount !== null ? <span className="muted">{matchCount} match{matchCount === 1 ? "" : "es"}</span> : null}
        </div>
        {presets.length > 0 ? (
          <div className="preset-row" aria-label="Regex presets">
            {presets.map((preset) => (
              <button className="chip" key={`${preset.label}-${preset.source}-${preset.flags}`} onClick={() => applyPreset(preset)} type="button">
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="message error">{error}</p> : null}
      {status ? <p className="message success">{status}</p> : null}
    </main>
  );
}

export default App;
