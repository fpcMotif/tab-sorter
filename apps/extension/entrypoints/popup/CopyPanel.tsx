import { useCallback, useEffect, useState } from "react";

import {
  getCopyPopupData,
  runCopy,
  type CopyFormatView,
  type CopyScopeView,
} from "@/lib/orchestration";
import type { FormatId } from "@/lib/copy/format";
import type { ScopeId } from "@/lib/copy/types";
import { ClipboardSink } from "@/lib/sinks/clipboard-sink";

// ── Icon map ────────────────────────────────────────────────────────────────
// Soft Editorial: no emoji. Using plain unicode / ASCII stand-ins.
const FORMAT_ICONS: Record<string, string> = {
  link: "\u{1F517}",     // 🔗  link symbol — acceptable as symbol, not emoji presentation
  url: "🌐",  // 🌐  globe
  titleUrl1Line: "≡",  // ≡  triple bar
  titleUrl2Line: "≡",
  title: "≡",
  markdown: "M↓",  // M↓
  csv: "■",        // ■
  json: "{ }",
  htmlTable: "☰",  // ☰
};

function getIcon(formatId: string): string {
  return FORMAT_ICONS[formatId] ?? "▦";
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CopyPanelState {
  loading: boolean;
  scopes: CopyScopeView[];
  formats: CopyFormatView[];
  selectedScope: ScopeId;
  selectedFormat: FormatId;
}

type CopyStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; count: number }
  | { kind: "error"; message: string };

// ── Component ────────────────────────────────────────────────────────────────

export function CopyPanel() {
  const [state, setState] = useState<CopyPanelState>({
    loading: true,
    scopes: [],
    formats: [],
    selectedScope: "window-tabs",
    selectedFormat: "link",
  });
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({ kind: "idle" });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const data = await getCopyPopupData();
    setState({
      loading: false,
      scopes: data.scopes,
      formats: data.formats,
      selectedScope: "window-tabs",
      selectedFormat: data.defaultFormatId,
    });
  }, []);

  useEffect(() => {
    void load().catch((err) => {
      console.error(err);
      setState((prev) => ({ ...prev, loading: false }));
      setCopyStatus({ kind: "error", message: "Could not load copy data." });
    });
  }, [load]);

  function handleScopeSelect(id: ScopeId) {
    setState((prev) => ({ ...prev, selectedScope: id }));
    setCopyStatus({ kind: "idle" });
  }

  function handleFormatSelect(id: FormatId) {
    setState((prev) => ({ ...prev, selectedFormat: id }));
    setCopyStatus({ kind: "idle" });
  }

  function handleCopy() {
    if (copyStatus.kind === "pending") return;
    setCopyStatus({ kind: "pending" });

    const { selectedScope, selectedFormat } = state;

    void (async () => {
      try {
        const result = await runCopy(selectedScope, selectedFormat, new ClipboardSink());
        setCopyStatus({ kind: "success", count: result.count });
      } catch (err) {
        console.error(err);
        setCopyStatus({ kind: "error", message: "Copy failed." });
      }
    })();
  }

  // Derived values
  const activeScope = state.scopes.find((s) => s.id === state.selectedScope);
  const activeFormat = state.formats.find((f) => f.id === state.selectedFormat);
  const tabCount = activeScope?.count ?? 0;
  const pending = copyStatus.kind === "pending";

  return (
    <section className="cp-section" aria-label="Copy tabs">
      {/* ── Section label ─────────────────────────────────────────────── */}
      <div className="cp-cap-row">
        <span className="cp-cap">Copy</span>
      </div>

      {state.loading ? (
        <p className="cp-muted">Loading…</p>
      ) : (
        <>
          {/* ── Scope grid ────────────────────────────────────────────── */}
          <div className="cp-scope-header">
            <span className="cp-cap">Scope</span>
          </div>
          <div className="cp-scope-grid" role="radiogroup" aria-label="Copy scope">
            {state.scopes.map((scope) => {
              const active = scope.id === state.selectedScope;
              return (
                <button
                  aria-checked={active}
                  aria-label={`${scope.label} (${scope.count} tabs)`}
                  className={`cp-scope-tile${active ? " cp-scope-tile--active" : ""}`}
                  disabled={pending}
                  key={scope.id}
                  onClick={() => handleScopeSelect(scope.id as ScopeId)}
                  role="radio"
                  type="button"
                >
                  <span className="cp-scope-label">{scope.label}</span>
                  <span className={`cp-badge${active ? " cp-badge--active" : ""}`}>
                    {scope.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Format list ───────────────────────────────────────────── */}
          <div className="cp-format-header">
            <span className="cp-cap">Format</span>
          </div>
          <div className="cp-format-list" role="radiogroup" aria-label="Copy format">
            {state.formats.map((fmt) => {
              const active = fmt.id === state.selectedFormat;
              return (
                <button
                  aria-checked={active}
                  className={`cp-format-row${active ? " cp-format-row--active" : ""}`}
                  disabled={pending}
                  key={fmt.id}
                  onClick={() => handleFormatSelect(fmt.id as FormatId)}
                  role="radio"
                  type="button"
                >
                  <span aria-hidden="true" className="cp-format-icon">
                    {getIcon(fmt.id)}
                  </span>
                  <span className="cp-format-text">
                    <span className="cp-format-label">{fmt.label}</span>
                    {fmt.description ? (
                      <span className="cp-format-desc">{fmt.description}</span>
                    ) : null}
                  </span>
                  {fmt.isDefault ? (
                    <span className="cp-default-pill">Default</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="cp-footer">
            <button
              className="cp-copy-btn"
              disabled={pending || tabCount === 0}
              onClick={handleCopy}
              type="button"
            >
              {pending
                ? "Copying…"
                : tabCount === 0
                  ? "No tabs to copy"
                  : `Copy ${tabCount} tab${tabCount === 1 ? "" : "s"} as ${activeFormat?.label ?? ""}`}
            </button>
            <kbd className="cp-kbd">
              {"⌘"}C
            </kbd>
          </div>

          {/* ── Copy status ───────────────────────────────────────────── */}
          {copyStatus.kind !== "idle" && copyStatus.kind !== "pending" ? (
            <p
              aria-live="polite"
              className={`cp-status cp-status--${copyStatus.kind}`}
              role="status"
            >
              {copyStatus.kind === "success"
                ? `Copied ${copyStatus.count} tab${copyStatus.count === 1 ? "" : "s"}`
                : copyStatus.message}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
