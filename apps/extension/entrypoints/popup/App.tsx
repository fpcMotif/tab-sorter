import { useEffect, useMemo, useState } from "react";

import { buildUrlExport } from "@/lib/export.ts";
import { groupByDomain, matchByRegex } from "@/lib/match.ts";
import { runExtract, runSort } from "@/lib/orchestration.ts";
import { getCurrentWindowTabs } from "@/lib/tabs-service.ts";
import {
  InvalidPatternError,
  type ExportFormat,
  type SortMode,
  type TabLite,
} from "@/lib/types.ts";

import "./App.css";

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [tabs, setTabs] = useState<TabLite[]>([]);
  const [status, setStatus] = useState<string>("");
  const [regex, setRegex] = useState("");
  const [regexError, setRegexError] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("markdown");

  const domainGroups = useMemo(() => groupByDomain(tabs), [tabs]);
  const regexMatches = useMemo(() => {
    if (!regex.trim()) return [];
    try {
      return matchByRegex(tabs, regex, "i");
    } catch {
      return [];
    }
  }, [regex, tabs]);

  useEffect(() => {
    void loadTabs();
  }, []);

  async function loadTabs() {
    const loaded = await getCurrentWindowTabs();
    setTabs(loaded);
  }

  async function handleSort(mode: SortMode) {
    try {
      const result = await runSort(mode);
      setStatus(
        result.count > 0 ? `Sorted ${result.count} tab(s) by ${mode}.` : "Nothing to sort.",
      );
      await loadTabs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sort failed");
    }
  }

  async function handleExtractByDomain(domain: string) {
    try {
      const result = await runExtract({ type: "domain", domain });
      setStatus(
        result.count > 0 ? `Moved ${result.count} tab(s) to a new window.` : "No matching tabs.",
      );
      window.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Extract failed");
    }
  }

  async function handleExtractByRegex() {
    setRegexError("");
    try {
      const result = await runExtract({ type: "regex", source: regex, flags: "i" });
      if (result.count === 0) {
        setStatus("No tabs match the pattern.");
        return;
      }
      window.close();
    } catch (error) {
      if (error instanceof InvalidPatternError) {
        setRegexError(error.message);
      } else {
        setStatus(error instanceof Error ? error.message : "Extract failed");
      }
    }
  }

  async function handleExport() {
    const { content, extension, mimeType } = buildUrlExport(tabs, exportFormat);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadFile(content, `tabs-${timestamp}.${extension}`, mimeType);
    setStatus(`Exported ${tabs.length} tab(s) as ${exportFormat}.`);
  }

  return (
    <div className="popup">
      <header>
        <h1>Tab Sorter</h1>
        <span className="tab-count">{tabs.length} tabs</span>
      </header>

      <section className="section">
        <h2>Sort</h2>
        <div className="button-row">
          <button onClick={() => handleSort("title")} type="button">
            A→Z by title
          </button>
          <button onClick={() => handleSort("domain")} type="button">
            By domain
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Extract by domain</h2>
        {domainGroups.length === 0 ? (
          <p className="empty">No domains found.</p>
        ) : (
          <ul className="domain-list">
            {domainGroups.map((group) => (
              <li key={group.domain}>
                <button
                  onClick={() => handleExtractByDomain(group.domain)}
                  type="button"
                  title={`Move ${group.count} tab(s) from ${group.domain}`}
                >
                  {group.domain} ({group.count})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Extract by regex</h2>
        <input
          type="text"
          value={regex}
          onChange={(e) => {
            setRegex(e.target.value);
            setRegexError("");
          }}
          placeholder="Pattern"
          aria-label="Regex pattern"
        />
        {regex.trim() && <p className="match-count">{regexMatches.length} match(es)</p>}
        {regexError && <p className="error">{regexError}</p>}
        <button
          onClick={handleExtractByRegex}
          disabled={!regex.trim() || regexMatches.length === 0}
          type="button"
        >
          Extract matches
        </button>
      </section>

      <section className="section">
        <h2>Export URLs</h2>
        <div className="button-row">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            aria-label="Export format"
          >
            <option value="markdown">Markdown</option>
            <option value="text">Plain text</option>
          </select>
          <button onClick={handleExport} disabled={tabs.length === 0} type="button">
            Export
          </button>
        </div>
      </section>

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

export default App;
