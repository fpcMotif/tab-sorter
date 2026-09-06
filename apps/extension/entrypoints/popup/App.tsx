import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import * as stylex from "@stylexjs/stylex";

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
import { tokens } from "@/assets/tokens.stylex";

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

const spinKeyframes = stylex.keyframes({
  to: {
    transform: "rotate(360deg)",
  },
});

const styles = stylex.create({
  popupShell: {
    backgroundColor: tokens["--surface-container-lowest"],
    color: tokens["--on-surface"],
    display: "flex",
    flexDirection: "column",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: 10,
    padding: "14px 14px 6px",
  },
  appIcon: {
    alignItems: "center",
    backgroundColor: tokens["--primary-container"],
    borderRadius: 9,
    display: "flex",
    flexShrink: 0,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  appIconSvg: {
    color: tokens["--on-primary-container"],
    height: 18,
    width: 18,
  },
  brand: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  },
  appName: {
    color: tokens["--on-surface"],
    fontFamily: tokens["--font-display"],
    fontSize: 14.5,
    fontWeight: 500,
    lineHeight: 1.2,
    margin: 0,
  },
  iconBtn: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: "50%",
    borderStyle: "none",
    borderWidth: 0,
    borderColor: "currentColor",
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-high"],
      filter: "none",
    },
  },
  iconBtnSvg: {
    height: 19,
    width: 19,
  },
  factsLine: {
    alignItems: "center",
    color: tokens["--on-surface-variant"],
    display: "flex",
    fontSize: 12.5,
    fontVariantNumeric: "tabular-nums",
    gap: 6,
    padding: "0 14px",
  },
  popupScroll: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxHeight: 508,
    overflowY: "auto",
    padding: "8px 14px 14px",
  },
  heroTidy: {
    alignItems: "center",
    backgroundColor: tokens["--primary"],
    borderRadius: 28,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: tokens["--elevation-1"],
    color: tokens["--on-primary"],
    cursor: "pointer",
    display: "flex",
    gap: 12,
    padding: "11px 16px 11px 18px",
    textAlign: "left",
    width: "100%",
    ":hover:not(:disabled)": {
      filter: "brightness(1.06)",
    },
    ":focus-visible": {
      outline: "2px solid var(--on-primary-container)",
      outlineOffset: 2,
    },
    ":disabled": {
      filter: "none",
      opacity: 0.85,
    },
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "hsl(0 0% 100% / 0.16)",
    borderRadius: "50%",
    display: "flex",
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  heroText: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontFamily: tokens["--font-display"],
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.25,
  },
  heroSub: {
    fontSize: 12,
    lineHeight: 1.2,
    opacity: 0.86,
  },
  heroKeys: {
    display: "flex",
    flexShrink: 0,
    gap: 3,
  },
  heroKbd: {
    backgroundColor: tokens["--hero-kbd-bg"],
    borderColor: tokens["--hero-kbd-border"],
    borderRadius: 5,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens["--on-primary"],
    fontFamily: tokens["--font-sans"],
    fontSize: 11,
    padding: "2px 5px",
  },
  sortRow: {
    borderStyle: "none",
    borderWidth: 0,
    display: "flex",
    gap: 8,
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  chipBtn: {
    alignItems: "center",
    backgroundColor: tokens["--surface-container-lowest"],
    borderColor: tokens["--outline-variant"],
    borderRadius: 20,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    display: "flex",
    flex: 1,
    fontSize: 12.5,
    fontWeight: 500,
    gap: 6,
    justifyContent: "center",
    padding: "8px 10px",
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-high"],
    },
  },
  chipBtnSvg: {
    flexShrink: 0,
    height: 15,
    width: 15,
  },
  dedupeRow: {
    alignItems: "center",
    backgroundColor: tokens["--surface-container-low"],
    borderRadius: 14,
    display: "flex",
    gap: 10,
    padding: "8px 10px",
  },
  dedupeIcon: {
    color: tokens["--on-surface-variant"],
    display: "flex",
    flexShrink: 0,
  },
  dedupeIconSvg: {
    height: 17,
    width: 17,
  },
  dedupeText: {
    color: tokens["--on-surface-variant"],
    flex: 1,
    fontSize: 12.5,
    fontVariantNumeric: "tabular-nums",
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderColor: tokens["--outline"],
    borderRadius: 20,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "none",
    color: tokens["--on-surface"],
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
    padding: "7px 14px",
    whiteSpace: "nowrap",
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-high"],
    },
  },
  btnDangerArmed: {
    backgroundColor: tokens["--error"],
    borderRadius: 20,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: tokens["--elevation-1"],
    color: tokens["--on-error"],
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
    padding: "7px 14px",
    whiteSpace: "nowrap",
    ":focus-visible": {
      outline: "2px solid var(--error)",
      outlineOffset: 2,
    },
  },
  armedHint: {
    color: tokens["--on-surface-variant"],
    fontSize: 11,
    marginTop: -6,
    padding: "0 2px",
  },
  rule: {
    borderStyle: "none",
    borderTopColor: tokens["--outline-variant"],
    borderTopStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    margin: 0,
  },
  sectionLabel: {
    color: tokens["--on-surface-variant"],
    fontFamily: tokens["--font-display"],
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.05em",
    margin: "0 0 6px 2px",
    textTransform: "uppercase",
  },
  domainList: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  domainRow: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 10,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface"],
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 400,
    gap: 10,
    padding: "7px 8px",
    textAlign: "left",
    width: "100%",
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-low"],
    },
    ":focus-visible": {
      outline: "2px solid var(--primary)",
      outlineOffset: -1,
    },
  },
  domainName: {
    flex: 1,
    fontSize: 13,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  domainNameMuted: {
    color: tokens["--on-surface-variant"],
    fontStyle: "italic",
  },
  rowGo: {
    color: tokens["--on-surface-variant"],
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  countBadge: {
    backgroundColor: tokens["--surface-container-high"],
    borderRadius: 10,
    color: tokens["--on-surface-variant"],
    flexShrink: 0,
    fontFamily: tokens["--font-mono"],
    fontSize: 11.5,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    minWidth: 22,
    padding: "2px 8px",
    textAlign: "center",
  },
  dot: {
    borderRadius: "50%",
    flexShrink: 0,
    height: 10,
    width: 10,
  },
  dot_grey: { backgroundColor: tokens["--g-grey-dot"] },
  dot_blue: { backgroundColor: tokens["--g-blue-dot"] },
  dot_red: { backgroundColor: tokens["--g-red-dot"] },
  dot_yellow: { backgroundColor: tokens["--g-yellow-dot"] },
  dot_green: { backgroundColor: tokens["--g-green-dot"] },
  dot_pink: { backgroundColor: tokens["--g-pink-dot"] },
  dot_purple: { backgroundColor: tokens["--g-purple-dot"] },
  dot_cyan: { backgroundColor: tokens["--g-cyan-dot"] },
  dot_orange: { backgroundColor: tokens["--g-orange-dot"] },
  disclosureRow: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 12,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface"],
    cursor: "pointer",
    display: "flex",
    fontSize: 13,
    fontWeight: 400,
    gap: 10,
    padding: "9px 8px",
    textAlign: "left",
    width: "100%",
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-low"],
    },
    ":focus-visible": {
      outline: "2px solid var(--primary)",
      outlineOffset: -1,
    },
  },
  disclosureIcon: {
    color: tokens["--on-surface-variant"],
    display: "flex",
    flexShrink: 0,
  },
  disclosureIconSvg: {
    height: 17,
    width: 17,
  },
  disclosureLabel: {
    flex: 1,
    fontWeight: 500,
  },
  chevron: {
    color: tokens["--on-surface-variant"],
    display: "flex",
    flexShrink: 0,
    transition: `transform ${tokens["--dur"]} ${tokens["--ease"]}`,
  },
  chevronExpanded: {
    transform: "rotate(180deg)",
  },
  patternPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "10px 8px 4px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fieldLabel: {
    color: tokens["--on-surface-variant"],
    fontSize: 11,
    fontWeight: 500,
  },
  regexInput: {
    backgroundColor: tokens["--surface-container-low"],
    borderColor: tokens["--outline-variant"],
    borderRadius: tokens["--radius-s"],
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens["--on-surface"],
    fontFamily: tokens["--font-mono"],
    fontSize: 12.5,
    padding: "8px 10px",
    width: "100%",
    ":hover": {
      borderColor: tokens["--outline"],
    },
  },
  regexInputInvalid: {
    borderColor: tokens["--error"],
  },
  flagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  flagChip: {
    backgroundColor: "transparent",
    borderColor: tokens["--outline-variant"],
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    fontSize: 11.5,
    fontWeight: 500,
    padding: "5px 10px",
  },
  flagChipOn: {
    backgroundColor: tokens["--primary-container"],
    borderColor: "transparent",
    color: tokens["--on-primary-container"],
  },
  matchCount: {
    color: tokens["--on-surface-variant"],
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  matchCountInvalid: {
    color: tokens["--error"],
  },
  presetChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  presetChip: {
    backgroundColor: tokens["--surface-container-lowest"],
    borderColor: tokens["--outline-variant"],
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    fontSize: 11.5,
    padding: "5px 10px",
  },
  moveBtn: {
    alignSelf: "flex-start",
    backgroundColor: tokens["--primary-container"],
    borderRadius: 20,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-primary-container"],
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
    padding: "8px 16px",
  },
  copyRow: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    padding: "2px 4px",
  },
  copyLabel: {
    color: tokens["--on-surface-variant"],
    flexShrink: 0,
    fontSize: 12,
  },
  formatGroup: {
    borderColor: tokens["--outline-variant"],
    borderRadius: 16,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flex: 1,
    margin: 0,
    minInlineSize: 0,
    overflow: "hidden",
    padding: 0,
  },
  formatChip: {
    backgroundColor: "transparent",
    borderColor: tokens["--outline-variant"],
    borderRadius: 0,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    flex: 1,
    fontSize: 11,
    fontWeight: 500,
    padding: "6px 0",
    ":focus-visible": {
      outlineOffset: -2,
    },
  },
  formatChipLast: {
    borderRightWidth: 0,
  },
  formatChipSelected: {
    backgroundColor: tokens["--primary-container"],
    color: tokens["--on-primary-container"],
  },
  scopeToggle: {
    borderColor: tokens["--outline-variant"],
    borderRadius: 16,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    margin: "0 0 12px",
    overflow: "hidden",
    padding: 0,
  },
  scopeChip: {
    backgroundColor: "transparent",
    borderColor: tokens["--outline-variant"],
    borderRadius: 0,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    flex: 1,
    fontSize: 12,
    fontWeight: 500,
    padding: "7px 0",
    ":focus-visible": {
      outlineOffset: -2,
    },
  },
  scopeChipLast: {
    borderRightWidth: 0,
  },
  scopeChipSelected: {
    backgroundColor: tokens["--primary-container"],
    color: tokens["--on-primary-container"],
  },
  copyBtn: {
    backgroundColor: tokens["--surface-container-high"],
    boxShadow: "none",
    color: tokens["--on-surface"],
    position: "relative",
  },
  copyBtnCopied: {
    backgroundColor: tokens["--g-green-bg"],
    color: tokens["--g-green-fg"],
  },
  srOnly: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  toastSlot: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  toast: {
    alignItems: "flex-start",
    backgroundColor: tokens["--g-green-bg"],
    borderRadius: 14,
    color: tokens["--g-green-fg"],
    display: "flex",
    gap: 9,
    padding: 10,
  },
  toastError: {
    backgroundColor: tokens["--error-container"],
    color: tokens["--on-error-container"],
  },
  toastSvg: {
    flexShrink: 0,
    height: 18,
    marginTop: 1,
    width: 18,
  },
  toastBody: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 1.35,
  },
  groupDots: {
    display: "inline-flex",
    gap: 3,
    marginLeft: 6,
    verticalAlign: "middle",
  },
  groupDot: {
    borderRadius: "50%",
    height: 6,
    width: 6,
  },
  toastClose: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: "50%",
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    height: 22,
    justifyContent: "center",
    opacity: 0.7,
    width: 22,
    ":hover:not(:disabled)": {
      opacity: 1,
    },
    ":focus-visible": {
      outline: "2px solid currentColor",
      outlineOffset: 1,
    },
  },
  toastCloseSvg: {
    height: 14,
    width: 14,
  },
  undoPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: tokens["--primary-container"],
    borderRadius: 20,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-primary-container"],
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 12.5,
    fontWeight: 500,
    gap: 6,
    padding: "7px 14px 7px 12px",
  },
  undoPillSvg: {
    height: 15,
    width: 15,
  },
  loadingBlock: {
    alignItems: "center",
    color: tokens["--on-surface-variant"],
    display: "flex",
    flexDirection: "column",
    gap: 12,
    justifyContent: "center",
    padding: "56px 20px 60px",
  },
  spinner: {
    color: tokens["--primary"],
    height: 28,
    width: 28,
  },
  spin: {
    animationDuration: "900ms",
    animationIterationCount: "infinite",
    animationName: spinKeyframes,
    animationTimingFunction: "linear",
  },
  loadingText: {
    fontSize: 13,
  },
  skeleton: {
    backgroundColor: tokens["--surface-container-high"],
    borderRadius: 10,
    height: 34,
    overflow: "hidden",
    position: "relative",
  },
  emptyBlock: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "44px 24px 50px",
    textAlign: "center",
  },
  emptyIcon: {
    color: tokens["--outline"],
    height: 40,
    width: 40,
  },
  emptyTitle: {
    color: tokens["--on-surface"],
    fontFamily: tokens["--font-display"],
    fontSize: 14.5,
    fontWeight: 500,
  },
  emptySub: {
    color: tokens["--on-surface-variant"],
    fontSize: 12.5,
    lineHeight: 1.4,
    maxWidth: 220,
  },
  kbd: {
    backgroundColor: tokens["--surface-container-high"],
    borderColor: tokens["--outline-variant"],
    borderRadius: 5,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens["--on-surface-variant"],
    fontFamily: tokens["--font-sans"],
    fontSize: 11,
    padding: "2px 5px",
  },
});

const DOT_STYLE_BY_COLOR: Record<GroupColor, stylex.StyleXStyles> = {
  grey: styles.dot_grey,
  blue: styles.dot_blue,
  red: styles.dot_red,
  yellow: styles.dot_yellow,
  green: styles.dot_green,
  pink: styles.dot_pink,
  purple: styles.dot_purple,
  cyan: styles.dot_cyan,
  orange: styles.dot_orange,
};

interface IconProps {
  sx?: stylex.StyleXStyles;
}

function IconSparkle({ sx }: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...stylex.props(sx)}>
      <path d="M11 3.2l1.9 5.3 5.3 1.9-5.3 1.9L11 17.6l-1.9-5.3L3.8 10.4l5.3-1.9L11 3.2z" />
      <path d="M18.3 2.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

function IconSort({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(sx)}
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="15" y1="12" y2="12" />
      <line x1="4" x2="10" y1="18" y2="18" />
    </svg>
  );
}

function IconDomain({ sx }: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...stylex.props(sx)}>
      <rect height="7.5" rx="2" width="7.5" x="3" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="3" y="13.5" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="13.5" />
    </svg>
  );
}

function IconGear({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 24 24"
      {...stylex.props(styles.iconBtnSvg, sx)}
    >
      <path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm7.4-3.5c0-.4 0-.8-.1-1.2l1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 00-2-1.2L14.6 3H9.4l-.4 2.7a7.6 7.6 0 00-2 1.2l-2.3-.9L2.8 9.3l1.9 1.5c-.1.4-.1.8-.1 1.2s0 .8.1 1.2L2.8 14.7l1.9 3.3 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.7h5.2l.4-2.7c.7-.3 1.4-.7 2-1.2l2.3.9 1.9-3.3-1.9-1.5c.1-.4.1-.8.1-1.2z" />
    </svg>
  );
}

function IconChevron({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(sx)}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconUndo({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.undoPillSvg, sx)}
    >
      <path d="M4.5 10.8a7.7 7.7 0 1 1 2 6.4" />
      <polyline points="4 4.5 4.5 10.8 10.7 10" />
    </svg>
  );
}

function IconClose({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.toastCloseSvg, sx)}
    >
      <line x1="6" x2="18" y1="6" y2="18" />
      <line x1="18" x2="6" y1="6" y2="18" />
    </svg>
  );
}

function IconWarning({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.toastSvg, sx)}
    >
      <path d="M12 3.3 22 20H2z" />
      <line x1="12" x2="12" y1="9.5" y2="14.5" />
      <circle cx="12" cy="17.3" fill="currentColor" r=".9" stroke="none" />
    </svg>
  );
}

function IconCheckCircle({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.toastSvg, sx)}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="7.5 12.5 10.5 15.5 16.5 9" />
    </svg>
  );
}

function IconCheck({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
      {...stylex.props(sx)}
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function IconOpenNew({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.rowGo, sx)}
    >
      <path d="M9 5h10v10" />
      <line x1="19" x2="9.5" y1="5" y2="14.5" />
      <path d="M15 19H5V9" />
    </svg>
  );
}

function IconFilter({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 24 24"
      {...stylex.props(styles.disclosureIconSvg, sx)}
    >
      <path d="M3.5 4h17l-6.3 7.6v6l-4.4 2.2v-8.2z" />
    </svg>
  );
}

function IconCopy({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(sx)}
    >
      <rect height="12" rx="2" width="11" x="3.5" y="8.5" />
      <path d="M7.5 8.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" />
    </svg>
  );
}

function IconDuplicate({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.dedupeIconSvg, sx)}
    >
      <rect height="12" rx="1.5" width="11" x="5" y="8" />
      <path d="M9 8V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

function IconWindow({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      {...stylex.props(sx)}
    >
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <line x1="3" x2="21" y1="9.4" y2="9.4" />
      <rect fill="currentColor" height="2" rx="1" stroke="none" width="6" x="5.2" y="6.4" />
    </svg>
  );
}

function IconSpinner({ sx }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
      {...stylex.props(styles.spinner, sx)}
    >
      <circle cx="12" cy="12" r="9.5" strokeDasharray="38 60" />
    </svg>
  );
}

type StatusTone = "idle" | "success" | "error";

interface Status {
  message: string;
  tone: StatusTone;
  dots?: GroupColor[];
}

const IDLE_STATUS: Status = { message: "", tone: "idle" };

function extractErrorStatus(error: unknown): Status {
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

interface State {
  data: PopupData | null;
  extractScope: ExtractScope;
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
    allWindows,
    copyFormat,
    data,
    dedupeArmed,
    extractScope,
    patternOpen,
    regexFlags,
    regexSource,
    status,
  } = state;
  const { pending, run } = useAsyncAction();
  const [tidyPending, setTidyPending] = useState(false);
  const [newWindowId, setNewWindowId] = useState<number | undefined>(undefined);
  const [copyDone, setCopyDone] = useState(false);
  const [copyAnnounce, setCopyAnnounce] = useState("");
  const dedupeTimerRef = useRef<number | undefined>(undefined);

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

        const label = FORMAT_SHORT_LABELS[copyFormat];

        setCopyDone(true);
        window.setTimeout(() => setCopyDone(false), 1200);
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
    <main {...stylex.props(styles.popupShell)}>
      <div {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.appIcon)}>
          <IconSparkle sx={styles.appIconSvg} />
        </span>
        <div {...stylex.props(styles.brand)}>
          <h1 {...stylex.props(styles.appName)}>Tab Sorter</h1>
        </div>
        <button
          aria-label="Open settings"
          onClick={() => void browser.runtime.openOptionsPage()}
          type="button"
          {...stylex.props(styles.iconBtn)}
        >
          <IconGear sx={styles.iconBtnSvg} />
        </button>
      </div>

      <p {...stylex.props(styles.factsLine)}>
        {data === null
          ? isErrorTone
            ? "Couldn't read this window."
            : "Reading this window…"
          : factsLine(data)}
      </p>

      {data === null ? (
        <div {...stylex.props(styles.popupScroll)}>
          {isErrorTone ? (
            <div
              aria-live="assertive"
              role="alert"
              {...stylex.props(styles.toast, styles.toastError)}
            >
              <IconWarning />
              <span {...stylex.props(styles.toastBody)}>{status.message}</span>
            </div>
          ) : (
            <>
              <div {...stylex.props(styles.loadingBlock)}>
                <IconSpinner sx={[styles.spinner, styles.spin]} />
                <span {...stylex.props(styles.loadingText)}>Counting tabs and sites…</span>
              </div>
              <div {...stylex.props(styles.skeleton)} />
              <div style={{ opacity: 0.7 }} {...stylex.props(styles.skeleton)} />
              <div style={{ opacity: 0.45 }} {...stylex.props(styles.skeleton)} />
            </>
          )}
        </div>
      ) : isEmpty ? (
        <div {...stylex.props(styles.popupScroll)}>
          <div {...stylex.props(styles.emptyBlock)}>
            <IconWindow sx={styles.emptyIcon} />
            <span {...stylex.props(styles.emptyTitle)}>Nothing to tidy</span>
            <span {...stylex.props(styles.emptySub)}>
              This window has {pluralize(data.totalTabs, "tab")}. Open a few more and Tab Sorter
              will find a shape worth grouping.
            </span>
          </div>
        </div>
      ) : (
        <div {...stylex.props(styles.popupScroll)}>
          <div
            aria-live={isErrorTone ? "assertive" : "polite"}
            role={isErrorTone ? "alert" : "status"}
            {...stylex.props(styles.toastSlot)}
          >
            {status.message.length > 0 ? (
              <div {...stylex.props(styles.toast, isErrorTone && styles.toastError)}>
                {isErrorTone ? <IconWarning /> : <IconCheckCircle />}
                <span {...stylex.props(styles.toastBody)}>
                  {status.message}
                  {status.dots !== undefined && status.dots.length > 0 ? (
                    <span aria-hidden="true" {...stylex.props(styles.groupDots)}>
                      {status.dots.map((color, index) => {
                        const dotColorStyle = DOT_STYLE_BY_COLOR[color] ?? styles.dot_grey;
                        return (
                          <span
                            key={`${color}-${index}`}
                            {...stylex.props(styles.groupDot, dotColorStyle)}
                          />
                        );
                      })}
                    </span>
                  ) : null}
                </span>
                <button
                  aria-label="Dismiss"
                  onClick={() => dispatch({ type: "statusSet", status: IDLE_STATUS })}
                  type="button"
                  {...stylex.props(styles.toastClose)}
                >
                  <IconClose />
                </button>
              </div>
            ) : data.recoveryRequired ? (
              <div {...stylex.props(styles.toast, styles.toastError)}>
                <IconWarning />
                <span {...stylex.props(styles.toastBody)}>
                  An interrupted change needs recovery.
                </span>
              </div>
            ) : null}
            {data.canUndo ? (
              <button
                disabled={pending}
                onClick={handleUndo}
                type="button"
                {...stylex.props(styles.undoPill)}
              >
                <IconUndo />
                {data.recoveryRequired ? "Recover" : "Undo"}
                <kbd {...stylex.props(styles.kbd)}>⌥⇧Z</kbd>
              </button>
            ) : null}
            {newWindowId !== undefined ? (
              <button
                onClick={() => void browser.windows.update(newWindowId, { focused: true })}
                type="button"
                {...stylex.props(styles.undoPill)}
              >
                <IconWindow />
                Show new window
              </button>
            ) : null}
          </div>

          <button
            disabled={mutationDisabled}
            onClick={handleTidy}
            type="button"
            {...stylex.props(styles.heroTidy)}
          >
            <span {...stylex.props(styles.heroIcon)}>
              {tidyPending ? <IconSpinner sx={styles.spin} /> : <IconSparkle />}
            </span>
            <span {...stylex.props(styles.heroText)}>
              <span {...stylex.props(styles.heroTitle)}>
                {tidyPending ? "Tidying window…" : "Tidy this window"}
              </span>
              <span {...stylex.props(styles.heroSub)}>
                {tidyPending ? "Sorting and grouping by site" : "Sort and group by site"}
              </span>
            </span>
            <span {...stylex.props(styles.heroKeys)}>
              <kbd {...stylex.props(styles.heroKbd)}>⌥</kbd>
              <kbd {...stylex.props(styles.heroKbd)}>⇧</kbd>
              <kbd {...stylex.props(styles.heroKbd)}>Space</kbd>
            </span>
          </button>

          <fieldset aria-label="Sort tabs" {...stylex.props(styles.sortRow)}>
            <button
              disabled={mutationDisabled}
              onClick={() => handleSort("title")}
              type="button"
              {...stylex.props(styles.chipBtn)}
            >
              <IconSort sx={styles.chipBtnSvg} />
              A to Z<kbd {...stylex.props(styles.kbd)}>⌥⇧T</kbd>
            </button>
            <button
              disabled={mutationDisabled}
              onClick={() => handleSort("domain")}
              type="button"
              {...stylex.props(styles.chipBtn)}
            >
              <IconDomain sx={styles.chipBtnSvg} />
              By domain
            </button>
          </fieldset>

          {data.duplicateCount > 0 ? (
            <div>
              <div {...stylex.props(styles.dedupeRow)}>
                <span {...stylex.props(styles.dedupeIcon)}>
                  <IconDuplicate />
                </span>
                <span {...stylex.props(styles.dedupeText)}>
                  {data.duplicateCount} duplicates found
                </span>
                <button
                  disabled={mutationDisabled}
                  onClick={handleDedupeClick}
                  type="button"
                  {...stylex.props(dedupeArmed ? styles.btnDangerArmed : styles.btnOutline)}
                >
                  Close {data.duplicateCount} duplicates{dedupeArmed ? "?" : ""}
                </button>
              </div>
              {dedupeArmed ? (
                <p {...stylex.props(styles.armedHint)}>
                  Press again to confirm — closes the newer copy of each
                </p>
              ) : null}
            </div>
          ) : null}

          <hr {...stylex.props(styles.rule)} />

          {showScopeToggle ? (
            <fieldset aria-label="Extract scope" {...stylex.props(styles.scopeToggle)}>
              <button
                aria-pressed={extractScope === "window"}
                disabled={pending}
                onClick={() => dispatch({ type: "scopeChanged", scope: "window" })}
                type="button"
                {...stylex.props(
                  styles.scopeChip,
                  extractScope === "window" && styles.scopeChipSelected,
                )}
              >
                This window
              </button>
              <button
                aria-pressed={extractScope === "all"}
                disabled={pending}
                onClick={() => dispatch({ type: "scopeChanged", scope: "all" })}
                type="button"
                {...stylex.props(
                  styles.scopeChip,
                  styles.scopeChipLast,
                  extractScope === "all" && styles.scopeChipSelected,
                )}
              >
                All windows
              </button>
            </fieldset>
          ) : null}

          <div>
            <h2 {...stylex.props(styles.sectionLabel)}>Extract a domain</h2>
            {scopeScanning ? (
              <p {...stylex.props(styles.emptySub)}>Scanning all windows…</p>
            ) : scopeGroups.length === 0 ? (
              <p {...stylex.props(styles.emptySub)}>No movable tabs found.</p>
            ) : (
              <ul {...stylex.props(styles.domainList)}>
                {scopeGroups.map((group) => {
                  const assignedCol = assignColor(group.domain);
                  const dotColorStyle = DOT_STYLE_BY_COLOR[assignedCol] ?? styles.dot_grey;
                  const isMuted = group.domain.startsWith("(");
                  return (
                    <li key={group.domain}>
                      <button
                        disabled={mutationDisabled}
                        onClick={() => handleDomainExtract(group)}
                        type="button"
                        {...stylex.props(styles.domainRow)}
                      >
                        <span {...stylex.props(styles.dot, dotColorStyle)} />
                        <span
                          {...stylex.props(styles.domainName, isMuted && styles.domainNameMuted)}
                        >
                          {group.domain}
                        </span>
                        <IconOpenNew />
                        <span {...stylex.props(styles.countBadge)}>{group.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <hr {...stylex.props(styles.rule)} />

          <button
            aria-controls="pattern-panel"
            aria-expanded={patternOpen}
            onClick={() => dispatch({ type: "patternToggled" })}
            type="button"
            {...stylex.props(styles.disclosureRow)}
          >
            <span {...stylex.props(styles.disclosureIcon)}>
              <IconFilter />
            </span>
            <span {...stylex.props(styles.disclosureLabel)}>Extract by pattern</span>
            <span {...stylex.props(styles.chevron, patternOpen && styles.chevronExpanded)}>
              <IconChevron />
            </span>
          </button>

          {patternOpen ? (
            <div id="pattern-panel" {...stylex.props(styles.patternPanel)}>
              <div {...stylex.props(styles.field)}>
                <label htmlFor="regex-input" {...stylex.props(styles.fieldLabel)}>
                  Pattern
                </label>
                <input
                  aria-describedby="match-count"
                  autoComplete="off"
                  disabled={pending}
                  id="regex-input"
                  maxLength={MATCH_SAFETY_CAP}
                  onChange={(event) =>
                    dispatch({ type: "regexSourceChanged", source: event.target.value })
                  }
                  placeholder="github|docs"
                  spellCheck={false}
                  value={regexSource}
                  {...stylex.props(
                    styles.regexInput,
                    regexPreview.error.length > 0 && styles.regexInputInvalid,
                  )}
                />
              </div>
              <div {...stylex.props(styles.flagsRow)}>
                <button
                  aria-pressed={regexFlags.includes("i")}
                  disabled={pending}
                  onClick={() => dispatch({ type: "caseFlagToggled" })}
                  type="button"
                  {...stylex.props(styles.flagChip, regexFlags.includes("i") && styles.flagChipOn)}
                >
                  Case-insensitive
                </button>
              </div>
              <p
                id="match-count"
                {...stylex.props(
                  styles.matchCount,
                  regexPreview.error.length > 0 && styles.matchCountInvalid,
                )}
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
              <div {...stylex.props(styles.presetChips)}>
                {data.prefs.regexPresets.map((preset) => (
                  <button
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
                    {...stylex.props(styles.presetChip)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                disabled={
                  mutationDisabled || regexPreview.error.length > 0 || regexPreview.count === 0
                }
                onClick={handleRegexExtract}
                type="button"
                {...stylex.props(styles.moveBtn)}
              >
                {moveLabel}
              </button>
            </div>
          ) : null}

          <div {...stylex.props(styles.copyRow)}>
            <span {...stylex.props(styles.copyLabel)}>Copy tabs</span>
            <fieldset aria-label="Copy format" {...stylex.props(styles.formatGroup)}>
              {COPY_FORMATS.map((option, index) => {
                const isSelected = copyFormat === option.format;
                const isLast = index === COPY_FORMATS.length - 1;
                return (
                  <button
                    disabled={pending}
                    key={option.format}
                    onClick={() => dispatch({ type: "copyFormatChanged", format: option.format })}
                    type="button"
                    {...stylex.props(
                      styles.formatChip,
                      isLast && styles.formatChipLast,
                      isSelected && styles.formatChipSelected,
                    )}
                  >
                    {FORMAT_SHORT_LABELS[option.format]}
                  </button>
                );
              })}
            </fieldset>
            <button
              aria-label="Copy tabs"
              disabled={pending}
              onClick={handleCopy}
              type="button"
              {...stylex.props(styles.iconBtn, styles.copyBtn, copyDone && styles.copyBtnCopied)}
            >
              {copyDone ? <IconCheck /> : <IconCopy />}
            </button>
            <span aria-live="polite" {...stylex.props(styles.srOnly)}>
              {copyAnnounce}
            </span>
          </div>

          <div {...stylex.props(styles.copyRow)}>
            <span {...stylex.props(styles.copyLabel)}>Download tabs</span>
            <fieldset aria-label="Download format" {...stylex.props(styles.formatGroup)}>
              {DOWNLOAD_FORMATS.map((option, index) => {
                const isLast = index === DOWNLOAD_FORMATS.length - 1;
                return (
                  <button
                    disabled={pending}
                    key={option.format}
                    onClick={() => handleDownload(option.format)}
                    type="button"
                    {...stylex.props(styles.formatChip, isLast && styles.formatChipLast)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </fieldset>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
