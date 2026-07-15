import {
  IconCheck,
  IconCheckCircle,
  IconClose,
  IconCopy,
  IconDomain,
  IconDuplicate,
  IconGear,
  IconOpenNew,
  IconSort,
  IconSparkle,
  IconSpinner,
  IconUndo,
  IconWarning,
  IconWindow,
} from "@/components/icons";
import { assignColor } from "@/lib/domain";
import { COPY_FORMATS, DOWNLOAD_FORMATS } from "@/lib/export";
import type { ClipboardFormat, DomainGroup, ExportFormat, SortMode } from "@/lib/types";

import type { Status } from "./state";

const FORMAT_SHORT_LABELS: Record<ClipboardFormat, string> = {
  markdown: "MD",
  json: "JSON",
  url: "URL",
  html: "HTML",
};

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  return (
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
        onClick={onOpenSettings}
        type="button"
      >
        <IconGear />
      </button>
    </div>
  );
}

interface LoadingStateProps {
  isError: boolean;
  message: string;
}

export function LoadingState({ isError, message }: LoadingStateProps) {
  return (
    <div className="popup-scroll">
      {isError ? (
        <div aria-live="assertive" className="toast is-error" role="alert">
          <IconWarning />
          <span className="toast-body">{message}</span>
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
  );
}

interface EmptyStateProps {
  tabLabel: string;
}

export function EmptyState({ tabLabel }: EmptyStateProps) {
  return (
    <div className="popup-scroll">
      <div className="empty-block">
        <IconWindow className="empty-icon" />
        <span className="empty-title">Nothing to tidy</span>
        <span className="empty-sub">
          This window has {tabLabel}. Open a few more and Tab Sorter will find a shape worth
          grouping.
        </span>
      </div>
    </div>
  );
}

interface ToastSlotProps {
  status: Status;
  canUndo: boolean;
  pending: boolean;
  onDismiss: () => void;
  onUndo: () => void;
}

export function ToastSlot({ status, canUndo, pending, onDismiss, onUndo }: ToastSlotProps) {
  const isErrorTone = status.tone === "error";

  return (
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
          <button aria-label="Dismiss" className="toast-close" onClick={onDismiss} type="button">
            <IconClose />
          </button>
        </div>
      ) : null}
      {canUndo ? (
        <button className="undo-pill" disabled={pending} onClick={onUndo} type="button">
          <IconUndo />
          Undo
          <kbd>⌥⇧Z</kbd>
        </button>
      ) : null}
    </div>
  );
}

interface TidyHeroProps {
  pending: boolean;
  tidyPending: boolean;
  onTidy: () => void;
}

export function TidyHero({ pending, tidyPending, onTidy }: TidyHeroProps) {
  return (
    <button autoFocus className="hero-tidy" disabled={pending} onClick={onTidy} type="button">
      <span className="hero-icon">
        {tidyPending ? <IconSpinner className="spin" /> : <IconSparkle />}
      </span>
      <span className="hero-text">
        <span className="hero-title">{tidyPending ? "Tidying window…" : "Tidy this window"}</span>
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
  );
}

interface SortRowProps {
  pending: boolean;
  onSort: (mode: SortMode) => void;
}

export function SortRow({ pending, onSort }: SortRowProps) {
  return (
    <div aria-label="Sort tabs" className="sort-row" role="group">
      <button className="chip-btn" disabled={pending} onClick={() => onSort("title")} type="button">
        <IconSort />
        A to Z<kbd>⌥⇧T</kbd>
      </button>
      <button
        className="chip-btn"
        disabled={pending}
        onClick={() => onSort("domain")}
        type="button"
      >
        <IconDomain />
        By domain
      </button>
    </div>
  );
}

interface DedupeRowProps {
  duplicateCount: number;
  dedupeArmed: boolean;
  pending: boolean;
  onDedupeClick: () => void;
}

export function DedupeRow({ duplicateCount, dedupeArmed, pending, onDedupeClick }: DedupeRowProps) {
  return (
    <div>
      <div className="dedupe-row">
        <span className="dedupe-icon">
          <IconDuplicate />
        </span>
        <span className="dedupe-text num">{duplicateCount} duplicates found</span>
        <button
          className={dedupeArmed ? "btn-danger-armed" : "btn-outline"}
          disabled={pending}
          onClick={onDedupeClick}
          type="button"
        >
          Close {duplicateCount} duplicates{dedupeArmed ? "?" : ""}
        </button>
      </div>
      {dedupeArmed ? (
        <p className="armed-hint">Press again to confirm — closes the newer copy of each</p>
      ) : null}
    </div>
  );
}

interface DomainListProps {
  domainGroups: DomainGroup[];
  pending: boolean;
  onExtract: (group: DomainGroup) => void;
}

export function DomainList({ domainGroups, pending, onExtract }: DomainListProps) {
  return (
    <div>
      <h3 className="section-label">Extract a domain</h3>
      {domainGroups.length === 0 ? (
        <p className="empty-sub">No movable tabs found.</p>
      ) : (
        <ul className="domain-list">
          {domainGroups.map((group) => (
            <li key={group.domain}>
              <button
                className="domain-row"
                disabled={pending}
                onClick={() => onExtract(group)}
                type="button"
              >
                <span className={`dot dot-${assignColor(group.domain)}`} />
                <span className={`domain-name${group.domain.startsWith("(") ? " muted" : ""}`}>
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
  );
}

interface CopyRowProps {
  copyFormat: ClipboardFormat;
  pending: boolean;
  copyDone: boolean;
  copyAnnounce: string;
  onFormatChange: (format: ClipboardFormat) => void;
  onCopy: () => void;
}

export function CopyRow({
  copyFormat,
  pending,
  copyDone,
  copyAnnounce,
  onFormatChange,
  onCopy,
}: CopyRowProps) {
  return (
    <div className="copy-row">
      <span className="copy-label">Copy tabs</span>
      <div aria-label="Copy format" className="format-group" role="group">
        {COPY_FORMATS.map((option) => (
          <button
            className={`format-chip${copyFormat === option.format ? " is-selected" : ""}`}
            disabled={pending}
            key={option.format}
            onClick={() => onFormatChange(option.format)}
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
        onClick={onCopy}
        type="button"
      >
        {copyDone ? <IconCheck /> : <IconCopy />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copyAnnounce}
      </span>
    </div>
  );
}

interface DownloadRowProps {
  pending: boolean;
  onDownload: (format: ExportFormat) => void;
}

export function DownloadRow({ pending, onDownload }: DownloadRowProps) {
  return (
    <div className="copy-row">
      <span className="copy-label">Download tabs</span>
      <div aria-label="Download format" className="format-group" role="group">
        {DOWNLOAD_FORMATS.map((option) => (
          <button
            className="format-chip"
            disabled={pending}
            key={option.format}
            onClick={() => onDownload(option.format)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
