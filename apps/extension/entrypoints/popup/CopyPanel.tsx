import type { ReactNode } from "react";
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

// ── Format-row line icons ─────────────────────────────────────────────────────
// Tabler-style line icons; color comes from `.cp-format-icon` (stroke=currentColor)
// so the active row tints sage via CSS. The `aria-hidden` wrapper carries the slot.

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const LinkIcon = (
  <svg {...ICON_PROPS}>
    <path d="M10 14a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-.5.5" />
    <path d="M14 10a3.5 3.5 0 0 0-5 0l-4 4a3.5 3.5 0 0 0 5 5l.5-.5" />
  </svg>
);

const GlobeIcon = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.6 9h16.8M3.6 15h16.8" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
  </svg>
);

const FileTextIcon = (
  <svg {...ICON_PROPS}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M9 9h1M9 13h6M9 17h6" />
  </svg>
);

const MarkdownIcon = (
  <svg {...ICON_PROPS}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 15V9l2.5 3L12 9v6" />
    <path d="M17 9v6m0 0-2-2.5M17 15l2-2.5" />
  </svg>
);

const TableIcon = (
  <svg {...ICON_PROPS}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M10 5v14" />
  </svg>
);

const CodeIcon = (
  <svg {...ICON_PROPS}>
    <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" />
  </svg>
);

// id → icon. Unmapped/custom ids fall through to FileTextIcon.
const FORMAT_ICONS: Record<FormatId, ReactNode> = {
  link: LinkIcon,
  url: GlobeIcon,
  titleUrl1Line: FileTextIcon,
  titleUrl2Line: FileTextIcon,
  title: FileTextIcon,
  markdown: MarkdownIcon,
  csv: TableIcon,
  json: CodeIcon,
  htmlTable: CodeIcon,
};

function getIcon(formatId: FormatId): ReactNode {
  return FORMAT_ICONS[formatId] ?? FileTextIcon;
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

  let statusMessage = "";
  let statusKind = "";
  if (copyStatus.kind === "success") {
    statusMessage = `Copied ${copyStatus.count} tab${copyStatus.count === 1 ? "" : "s"}`;
    statusKind = "success";
  } else if (copyStatus.kind === "error") {
    statusMessage = copyStatus.message;
    statusKind = "error";
  }

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
                  onClick={() => handleScopeSelect(scope.id)}
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
                  onClick={() => handleFormatSelect(fmt.id)}
                  role="radio"
                  type="button"
                >
                  <span className="cp-format-icon">{getIcon(fmt.id)}</span>
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
        </>
      )}

      {/* ── Copy status ─────────────────────────────────────────────────
          Always mounted (empty when idle) so the live region reliably
          announces updates instead of mounting fresh with content. */}
      <p
        aria-live="polite"
        className={statusKind ? `cp-status cp-status--${statusKind}` : "cp-status"}
        hidden={statusMessage.length === 0}
        role="status"
      >
        {statusMessage}
      </p>
    </section>
  );
}
