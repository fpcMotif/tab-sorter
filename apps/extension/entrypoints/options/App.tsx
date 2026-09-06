import { useEffect, useReducer, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { useAsyncAction } from "@/hooks/use-async-action";
import { reasonToString, validatePattern } from "@tab-sorter/core/match";
import { requestPrefsPatch } from "@/lib/runtime";
import { getPrefs, onPrefsChanged } from "@/lib/storage";
import type { GroupColor, GroupOrder, Prefs, RegexPreset, SortMode } from "@tab-sorter/core/types";
import { DEFAULT_PREFS } from "@tab-sorter/core/types";
import { MIN_GROUP_SIZE_CEIL, MIN_GROUP_SIZE_FLOOR } from "@tab-sorter/core/prefs";
import { tokens } from "@/assets/tokens.stylex";

interface PresetDraft {
  label: string;
  source: string;
  flags: string;
}

// Bounds keep the whole prefs object well under chrome.storage.sync's
// ~8KB-per-item quota, beyond which every save (not just presets) would fail.
const MAX_PRESETS = 50;
const MAX_PRESET_SOURCE_LENGTH = 500;
const MAX_PRESET_LABEL_LENGTH = 60;

function validatePreset(draft: PresetDraft, existingCount: number): string {
  if (draft.label.trim().length === 0) {
    return "Preset label is required.";
  }

  if (draft.label.length > MAX_PRESET_LABEL_LENGTH) {
    return `Label is too long (max ${MAX_PRESET_LABEL_LENGTH} characters).`;
  }

  if (draft.source.trim().length === 0) {
    return "Pattern is required.";
  }

  if (draft.source.length > MAX_PRESET_SOURCE_LENGTH) {
    return `Pattern is too long (max ${MAX_PRESET_SOURCE_LENGTH} characters).`;
  }

  if (existingCount >= MAX_PRESETS) {
    return `Preset limit reached (${MAX_PRESETS}). Delete one to add another.`;
  }

  const verdict = validatePattern(draft.source, draft.flags);

  if (!verdict.ok) {
    return reasonToString(verdict.reason);
  }

  return "";
}

const MIN_GROUP_SIZE_ERROR = `Enter a whole number from ${MIN_GROUP_SIZE_FLOOR} to ${MIN_GROUP_SIZE_CEIL}.`;

function parseMinGroupSize(raw: string): number | undefined {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const value = Number(trimmed);

  return value >= MIN_GROUP_SIZE_FLOOR && value <= MIN_GROUP_SIZE_CEIL ? value : undefined;
}

// Cycled onto preset rows purely for visual scannability — presets have no
// GroupColor of their own the way a live tidy group does.
const PRESET_DOT_COLORS: readonly GroupColor[] = ["blue", "cyan", "orange", "purple", "grey"];

const DEFAULT_SORT_OPTIONS: readonly { label: string; value: SortMode }[] = [
  { label: "A to Z", value: "title" },
  { label: "By domain", value: "domain" },
];

const GROUP_ORDER_OPTIONS: readonly { label: string; value: GroupOrder }[] = [
  { label: "Alphabetical", value: "alpha" },
  { label: "Largest first", value: "sizeDesc" },
];

const styles = stylex.create({
  page: {
    margin: "0 auto",
    maxWidth: 640,
  },
  pageHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerLeft: {
    alignItems: "flex-start",
    display: "flex",
    gap: 14,
  },
  appIcon: {
    alignItems: "center",
    backgroundColor: tokens["--primary-container"],
    borderRadius: 12,
    display: "flex",
    flexShrink: 0,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  appIconSvg: {
    color: tokens["--on-primary-container"],
    height: 22,
    width: 22,
  },
  h1: {
    color: tokens["--on-surface"],
    fontFamily: tokens["--font-display"],
    fontSize: 22,
    fontWeight: 500,
    margin: "2px 0 4px",
  },
  headerSub: {
    color: tokens["--on-surface-variant"],
    fontSize: 13.5,
    lineHeight: 1.45,
    margin: 0,
    maxWidth: 440,
  },
  saveIndicator: {
    alignItems: "center",
    backgroundColor: tokens["--success-container"],
    borderRadius: 16,
    color: tokens["--on-success-container"],
    display: "flex",
    flexShrink: 0,
    fontSize: 12.5,
    fontWeight: 500,
    gap: 6,
    marginTop: 2,
    opacity: 0,
    padding: "6px 12px 6px 10px",
    transition: `opacity ${tokens["--dur"]} ${tokens["--ease"]}`,
  },
  saveIndicatorVisible: {
    opacity: 1,
  },
  saveIndicatorSvg: {
    height: 15,
    width: 15,
  },
  settingsSection: {
    backgroundColor: tokens["--surface-container-lowest"],
    borderColor: tokens["--outline-variant"],
    borderRadius: tokens["--radius-l"],
    borderStyle: "solid",
    borderWidth: 1,
    marginBottom: 20,
    padding: "6px 22px 10px",
  },
  h2: {
    color: tokens["--on-surface"],
    fontFamily: tokens["--font-display"],
    fontSize: 15.5,
    fontWeight: 500,
    margin: 0,
    padding: "16px 0 2px",
  },
  sectionSub: {
    color: tokens["--on-surface-variant"],
    fontSize: 12.5,
    lineHeight: 1.45,
    margin: "0 0 8px",
  },
  prefRow: {
    alignItems: "center",
    borderTopColor: tokens["--outline-variant"],
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: 24,
    justifyContent: "space-between",
    padding: "14px 0",
  },
  prefRowNoBorder: {
    borderTopColor: "currentColor",
    borderTopStyle: "none",
    borderTopWidth: 0,
  },
  prefText: {
    flex: 1,
    minWidth: 0,
  },
  prefLabel: {
    color: tokens["--on-surface"],
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 2,
  },
  consequence: {
    color: tokens["--on-surface-variant"],
    fontSize: 12.5,
    lineHeight: 1.4,
    margin: 0,
  },
  prefControl: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
  },
  segmented: {
    borderColor: tokens["--outline-variant"],
    borderRadius: 18,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    margin: 0,
    minInlineSize: 0,
    overflow: "hidden",
    padding: 0,
  },
  segmentedBtn: {
    backgroundColor: "transparent",
    borderColor: "currentColor",
    borderRadius: 0,
    borderRightColor: tokens["--outline-variant"],
    borderRightStyle: "solid",
    borderRightWidth: 1,
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    fontSize: 12.5,
    padding: "7px 14px",
    transition: `background-color ${tokens["--dur"]} ${tokens["--ease"]}, color ${tokens["--dur"]} ${tokens["--ease"]}`,
    whiteSpace: "nowrap",
    ":focus-visible": {
      outlineOffset: -2,
    },
  },
  segmentedBtnHover: {
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-high"],
      filter: "none",
    },
  },
  segmentedBtnLast: {
    borderRightColor: "currentColor",
    borderRightStyle: "none",
    borderRightWidth: 0,
  },
  segmentedBtnSelected: {
    backgroundColor: tokens["--primary-container"],
    color: tokens["--on-primary-container"],
  },
  switchContainer: {
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: 22,
    position: "relative",
    width: 38,
  },
  switchInput: {
    cursor: "pointer",
    height: "100%",
    inset: 0,
    margin: 0,
    opacity: 0,
    position: "absolute",
    width: "100%",
  },
  track: {
    backgroundColor: tokens["--outline-variant"],
    borderRadius: 11,
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
    transition: `background-color ${tokens["--dur"]} ${tokens["--ease"]}`,
    "::after": {
      backgroundColor: tokens["--surface-container-lowest"],
      borderRadius: "50%",
      boxShadow: "0 1px 2px hsl(var(--shadow-color) / 35%)",
      content: '""',
      height: 18,
      left: 2,
      position: "absolute",
      top: 2,
      transition: `background-color ${tokens["--dur"]} ${tokens["--ease"]}, transform ${tokens["--dur"]} ${tokens["--ease"]}`,
      width: 18,
    },
  },
  trackChecked: {
    backgroundColor: tokens["--primary"],
    "::after": {
      backgroundColor: tokens["--on-primary"],
      transform: "translateX(16px)",
    },
  },
  trackDisabled: {
    opacity: 0.55,
  },
  stepper: {
    alignItems: "center",
    borderColor: tokens["--outline-variant"],
    borderRadius: 18,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: 2,
    margin: 0,
    minInlineSize: 0,
    padding: 2,
    transition: `border-color ${tokens["--dur"]} ${tokens["--ease"]}`,
  },
  stepperError: {
    borderColor: tokens["--error"],
  },
  stepperBtn: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "currentColor",
    borderRadius: "50%",
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface"],
    cursor: "pointer",
    display: "flex",
    fontSize: 16,
    height: 28,
    justifyContent: "center",
    lineHeight: 1,
    width: 28,
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--surface-container-high"],
      filter: "none",
    },
    ":disabled": {
      cursor: "default",
      opacity: 0.4,
    },
    ":focus-visible": {
      outlineOffset: 1,
    },
  },
  stepperInput: {
    backgroundColor: "transparent",
    borderColor: {
      default: "currentColor",
      ":hover": tokens["--outline"],
    },
    borderStyle: "none",
    borderWidth: 0,
    color: tokens["--on-surface"],
    fontFamily: "inherit",
    fontSize: 13.5,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    textAlign: "center",
    width: 34,
    ":focus-visible": {
      outlineOffset: 1,
    },
  },
  stepperInputInvalid: {
    color: tokens["--error"],
  },
  fieldError: {
    color: tokens["--error"],
    fontSize: 11.5,
    margin: "-8px 0 12px",
  },
  warningNote: {
    alignItems: "flex-start",
    backgroundColor: tokens["--warning-container"],
    borderRadius: 12,
    color: tokens["--on-warning-container"],
    display: "flex",
    fontSize: 12.5,
    gap: 8,
    lineHeight: 1.4,
    margin: "0 0 12px",
    padding: "9px 12px",
  },
  warningNoteSvg: {
    flexShrink: 0,
    height: 16,
    marginTop: 1,
    width: 16,
  },
  presetForm: {
    alignItems: "end",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1fr 1fr 64px auto",
    padding: "14px 0 16px",
  },
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  formFieldLabel: {
    color: tokens["--on-surface-variant"],
    fontSize: 11,
    fontWeight: 500,
  },
  formFieldInput: {
    backgroundColor: tokens["--surface-container-low"],
    borderColor: tokens["--outline-variant"],
    borderRadius: tokens["--radius-s"],
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens["--on-surface"],
    fontFamily: "inherit",
    fontSize: 13,
    minWidth: 0,
    padding: "8px 10px",
    transition: `border-color ${tokens["--dur"]} ${tokens["--ease"]}`,
    ":hover": {
      borderColor: tokens["--outline"],
    },
    ":focus-visible": {
      outlineOffset: 1,
    },
  },
  monoInput: {
    fontFamily: tokens["--font-mono"],
  },
  formError: {
    color: tokens["--error"],
    fontSize: 11.5,
    gridColumn: "1 / -1",
    marginTop: -4,
  },
  btnFilled: {
    backgroundColor: tokens["--primary"],
    borderColor: "transparent",
    borderRadius: 18,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens["--elevation-1"],
    color: tokens["--on-primary"],
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    padding: "9px 16px",
    whiteSpace: "nowrap",
    ":hover:not(:disabled)": {
      filter: "brightness(1.06)",
    },
    ":active:not(:disabled)": {
      transform: "scale(0.98)",
    },
  },
  presetList: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    listStyle: "none",
    margin: 0,
    padding: "2px 0 14px",
  },
  presetRow: {
    alignItems: "center",
    borderRadius: 12,
    display: "flex",
    gap: 10,
    padding: "9px 8px",
    transition: `background-color ${tokens["--dur"]} ${tokens["--ease"]}`,
    ":hover": {
      backgroundColor: tokens["--surface-container-low"],
    },
  },
  presetDot: {
    borderRadius: "50%",
    flexShrink: 0,
    height: 9,
    width: 9,
  },
  presetDot_blue: { backgroundColor: tokens["--g-blue-dot"] },
  presetDot_cyan: { backgroundColor: tokens["--g-cyan-dot"] },
  presetDot_orange: { backgroundColor: tokens["--g-orange-dot"] },
  presetDot_purple: { backgroundColor: tokens["--g-purple-dot"] },
  presetDot_grey: { backgroundColor: tokens["--g-grey-dot"] },
  presetLabel: {
    color: tokens["--on-surface"],
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: 140,
  },
  presetPattern: {
    backgroundColor: tokens["--surface-container-low"],
    borderRadius: 8,
    color: tokens["--on-surface-variant"],
    flex: 1,
    fontFamily: tokens["--font-mono"],
    fontSize: 12,
    minWidth: 0,
    overflow: "hidden",
    padding: "3px 8px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  presetFlags: {
    backgroundColor: tokens["--surface-container-high"],
    borderRadius: 8,
    color: tokens["--on-surface-variant"],
    flexShrink: 0,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    padding: "2px 7px",
  },
  iconBtn: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "currentColor",
    borderRadius: "50%",
    borderStyle: "none",
    borderWidth: 0,
    boxShadow: "none",
    color: tokens["--on-surface-variant"],
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    height: 30,
    justifyContent: "center",
    transition: `background-color ${tokens["--dur"]} ${tokens["--ease"]}, color ${tokens["--dur"]} ${tokens["--ease"]}`,
    width: 30,
    ":hover:not(:disabled)": {
      backgroundColor: tokens["--error-container"],
      color: tokens["--on-error-container"],
      filter: "none",
    },
    ":focus-visible": {
      outlineOffset: 1,
    },
  },
  iconBtnSvg: {
    height: 16,
    width: 16,
  },
  emptyPresets: {
    color: tokens["--on-surface-variant"],
    fontSize: 12.5,
    padding: "10px 8px",
  },
  shortcutList: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    listStyle: "none",
    margin: 0,
    padding: "2px 0 16px",
  },
  shortcutRow: {
    alignItems: "center",
    borderRadius: 12,
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    padding: "10px 8px",
  },
  shortcutName: {
    color: tokens["--on-surface"],
    fontSize: 13.5,
  },
  kbdGroup: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 4,
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
  kbdPlus: {
    color: tokens["--on-surface-variant"],
    fontSize: 11,
  },
  shortcutsNote: {
    color: tokens["--on-surface-variant"],
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    padding: "0 8px 16px",
  },
  shortcutsCode: {
    backgroundColor: tokens["--surface-container-high"],
    borderRadius: 6,
    fontFamily: tokens["--font-mono"],
    fontSize: 11.5,
    padding: "1px 6px",
  },
  footerMark: {
    color: tokens["--on-surface-variant"],
    fontSize: 11.5,
    opacity: 0.75,
    paddingTop: 8,
    textAlign: "center",
  },
});

const PRESET_DOT_STYLE_BY_COLOR: Record<GroupColor, stylex.StyleXStyles> = {
  blue: styles.presetDot_blue,
  cyan: styles.presetDot_cyan,
  orange: styles.presetDot_orange,
  purple: styles.presetDot_purple,
  grey: styles.presetDot_grey,
  red: styles.presetDot_grey,
  yellow: styles.presetDot_grey,
  green: styles.presetDot_grey,
  pink: styles.presetDot_grey,
};

function IconSparkle({ sx }: { sx?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 24 24"
      {...stylex.props(styles.appIconSvg, sx)}
    >
      <path d="M11 3.2l1.9 5.3 5.3 1.9-5.3 1.9L11 17.6l-1.9-5.3L3.8 10.4l5.3-1.9L11 3.2z" />
      <path d="M18.3 2.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

function IconCheck({ sx }: { sx?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
      {...stylex.props(styles.saveIndicatorSvg, sx)}
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function IconWarning({ sx }: { sx?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.warningNoteSvg, sx)}
    >
      <path d="M12 3.3 22 20H2z" />
      <line x1="12" x2="12" y1="9.5" y2="14.5" />
      <circle cx="12" cy="17.3" fill="currentColor" r=".9" stroke="none" />
    </svg>
  );
}

function IconTrash({ sx }: { sx?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...stylex.props(styles.iconBtnSvg, sx)}
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

function Segmented<T extends string>({
  disabled,
  labelledBy,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  labelledBy: string;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  value: T;
}) {
  return (
    <fieldset aria-labelledby={labelledBy} {...stylex.props(styles.segmented)}>
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isLast = index === options.length - 1;
        return (
          <button
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
            {...stylex.props(
              styles.segmentedBtn,
              isLast && styles.segmentedBtnLast,
              isSelected ? styles.segmentedBtnSelected : styles.segmentedBtnHover,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function Switch({
  checked,
  disabled,
  id,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  id: string;
  labelledBy: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span {...stylex.props(styles.switchContainer)}>
      <input
        aria-labelledby={labelledBy}
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        {...stylex.props(styles.switchInput)}
      />
      <span
        aria-hidden="true"
        {...stylex.props(
          styles.track,
          checked && styles.trackChecked,
          disabled && styles.trackDisabled,
        )}
      />
    </span>
  );
}

interface SaveState {
  prefs: Prefs;
  status: string;
  error: string;
}

type SaveAction =
  | { type: "prefsLoaded"; prefs: Prefs }
  | { type: "loadFailed" }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; prefs: Prefs }
  | { type: "saveFailed" }
  | { type: "validationFailed"; error: string };

const INITIAL_SAVE_STATE: SaveState = {
  prefs: DEFAULT_PREFS,
  status: "",
  error: "",
};

function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case "prefsLoaded":
      return { ...state, prefs: action.prefs };
    case "loadFailed":
      return { ...state, error: "Could not load preferences." };
    case "saveStarted":
      return { ...state, error: "", status: "" };
    case "saveSucceeded":
      return { ...state, prefs: action.prefs, status: "Saved." };
    case "saveFailed":
      return { ...state, error: "Could not save preferences." };
    case "validationFailed":
      return { ...state, error: action.error };
  }
}

function App() {
  const [{ prefs, status, error }, dispatch] = useReducer(saveReducer, INITIAL_SAVE_STATE);
  const [draft, setDraft] = useState<PresetDraft>({ label: "", source: "", flags: "i" });
  const { pending, run } = useAsyncAction();

  const [minGroupSizeDraft, setMinGroupSizeDraft] = useState(() => String(prefs.minGroupSize));
  const [minGroupSizeError, setMinGroupSizeError] = useState("");

  const [saveVisible, setSaveVisible] = useState(false);
  const saveTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void getPrefs()
      .then((loaded) => dispatch({ type: "prefsLoaded", prefs: loaded }))
      .catch(() => {
        dispatch({ type: "loadFailed" });
      });

    return onPrefsChanged((loaded) => dispatch({ type: "prefsLoaded", prefs: loaded }));
  }, []);

  useEffect(() => {
    setMinGroupSizeDraft(String(prefs.minGroupSize));
    setMinGroupSizeError("");
  }, [prefs.minGroupSize]);

  useEffect(() => {
    if (status.length === 0) {
      return;
    }

    setSaveVisible(true);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveVisible(false), 1600);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [status]);

  function persistPrefs(patch: Partial<Prefs>): Promise<void> {
    dispatch({ type: "saveStarted" });

    return run(
      async () => {
        const nextPrefs = await requestPrefsPatch(patch);
        dispatch({ type: "saveSucceeded", prefs: nextPrefs });
      },
      () => {
        dispatch({ type: "saveFailed" });
      },
    );
  }

  function handleDefaultSortChange(defaultSort: SortMode) {
    void persistPrefs({ defaultSort });
  }

  function handleIgnorePinnedChange(ignorePinned: boolean) {
    void persistPrefs({ ignorePinned });
  }

  function handleCollapseAfterTidyChange(collapseAfterTidy: boolean) {
    void persistPrefs({ collapseAfterTidy });
  }

  function handleGroupOrderChange(groupOrder: GroupOrder) {
    void persistPrefs({ groupOrder });
  }

  function handleRegroupExistingChange(regroupExisting: boolean) {
    void persistPrefs({ regroupExisting });
  }

  function handleDedupeIgnoreHashChange(dedupeIgnoreHash: boolean) {
    void persistPrefs({ dedupeIgnoreHash });
  }

  function handleDedupeIgnoreQueryChange(dedupeIgnoreQuery: boolean) {
    void persistPrefs({ dedupeIgnoreQuery });
  }

  function handleMinGroupSizeInput(raw: string) {
    setMinGroupSizeDraft(raw);

    const parsed = parseMinGroupSize(raw);

    if (parsed === undefined) {
      setMinGroupSizeError(MIN_GROUP_SIZE_ERROR);
      return;
    }

    setMinGroupSizeError("");
    void persistPrefs({ minGroupSize: parsed });
  }

  function handleMinGroupSizeStep(delta: number) {
    const next = Math.max(
      MIN_GROUP_SIZE_FLOOR,
      Math.min(MIN_GROUP_SIZE_CEIL, prefs.minGroupSize + delta),
    );

    setMinGroupSizeDraft(String(next));
    setMinGroupSizeError("");
    void persistPrefs({ minGroupSize: next });
  }

  function handleAddPreset() {
    const validationError = validatePreset(draft, prefs.regexPresets.length);

    if (validationError.length > 0) {
      dispatch({ type: "validationFailed", error: validationError });
      return;
    }

    const preset: RegexPreset = {
      label: draft.label.trim(),
      source: draft.source,
      flags: draft.flags,
    };

    void persistPrefs({ regexPresets: [...prefs.regexPresets, preset] });
    setDraft({ label: "", source: "", flags: "i" });
  }

  function handleDeletePreset(indexToDelete: number) {
    void persistPrefs({
      regexPresets: prefs.regexPresets.filter((_, index) => index !== indexToDelete),
    });
  }

  const hasMinGroupError = minGroupSizeError.length > 0;

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.pageHeader)}>
        <div {...stylex.props(styles.headerLeft)}>
          <span {...stylex.props(styles.appIcon)}>
            <IconSparkle />
          </span>
          <div>
            <h1 {...stylex.props(styles.h1)}>Tab Sorter settings</h1>
            <p {...stylex.props(styles.headerSub)}>
              Defaults that shape every tidy, sort, and duplicate check across all your windows.
            </p>
          </div>
        </div>
        <output
          aria-live="polite"
          {...stylex.props(styles.saveIndicator, saveVisible && styles.saveIndicatorVisible)}
        >
          <IconCheck />
          Saved
        </output>
      </div>

      <section aria-labelledby="sorting-h" {...stylex.props(styles.settingsSection)}>
        <h2 id="sorting-h" {...stylex.props(styles.h2)}>
          Sorting
        </h2>

        <div {...stylex.props(styles.prefRow, styles.prefRowNoBorder)}>
          <div {...stylex.props(styles.prefText)}>
            <span id="lbl-default-sort">Default sort</span>
            <p {...stylex.props(styles.consequence)}>
              Used when you click Sort without choosing A to Z or By domain.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Segmented
              disabled={pending}
              labelledBy="lbl-default-sort"
              onChange={handleDefaultSortChange}
              options={DEFAULT_SORT_OPTIONS}
              value={prefs.defaultSort}
            />
          </div>
        </div>

        <div {...stylex.props(styles.prefRow)}>
          <div {...stylex.props(styles.prefText)}>
            <label htmlFor="toggle-pinned" id="lbl-pinned" {...stylex.props(styles.prefLabel)}>
              Keep pinned tabs fixed
            </label>
            <p {...stylex.props(styles.consequence)}>
              Pinned tabs stay in place and are never moved or grouped.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Switch
              checked={prefs.ignorePinned}
              disabled={pending}
              id="toggle-pinned"
              labelledBy="lbl-pinned"
              onChange={handleIgnorePinnedChange}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="tidy-h" {...stylex.props(styles.settingsSection)}>
        <h2 id="tidy-h" {...stylex.props(styles.h2)}>
          Tidy
        </h2>

        <div {...stylex.props(styles.prefRow, styles.prefRowNoBorder)}>
          <div {...stylex.props(styles.prefText)}>
            <label htmlFor="toggle-collapse" id="lbl-collapse" {...stylex.props(styles.prefLabel)}>
              Collapse groups after tidying
            </label>
            <p {...stylex.props(styles.consequence)}>
              New groups start collapsed so the tab strip stays short.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Switch
              checked={prefs.collapseAfterTidy}
              disabled={pending}
              id="toggle-collapse"
              labelledBy="lbl-collapse"
              onChange={handleCollapseAfterTidyChange}
            />
          </div>
        </div>

        <div {...stylex.props(styles.prefRow)}>
          <div {...stylex.props(styles.prefText)}>
            <span id="lbl-min-size">Minimum tabs to form a group</span>
            <p {...stylex.props(styles.consequence)}>
              Sites with fewer tabs than this stay loose instead of becoming a group.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <fieldset
              aria-labelledby="lbl-min-size"
              {...stylex.props(styles.stepper, hasMinGroupError && styles.stepperError)}
            >
              <button
                aria-label="Decrease"
                disabled={pending || prefs.minGroupSize <= MIN_GROUP_SIZE_FLOOR}
                onClick={() => handleMinGroupSizeStep(-1)}
                type="button"
                {...stylex.props(styles.stepperBtn)}
              >
                −
              </button>
              <input
                aria-describedby={hasMinGroupError ? "min-group-size-error" : undefined}
                aria-invalid={hasMinGroupError}
                aria-label="Minimum tabs to form a group"
                disabled={pending}
                inputMode="numeric"
                onChange={(event) => handleMinGroupSizeInput(event.target.value)}
                type="text"
                value={minGroupSizeDraft}
                {...stylex.props(
                  styles.stepperInput,
                  hasMinGroupError && styles.stepperInputInvalid,
                )}
              />
              <button
                aria-label="Increase"
                disabled={pending || prefs.minGroupSize >= MIN_GROUP_SIZE_CEIL}
                onClick={() => handleMinGroupSizeStep(1)}
                type="button"
                {...stylex.props(styles.stepperBtn)}
              >
                +
              </button>
            </fieldset>
          </div>
        </div>
        {hasMinGroupError ? (
          <p id="min-group-size-error" role="alert" {...stylex.props(styles.fieldError)}>
            {minGroupSizeError}
          </p>
        ) : null}

        <div {...stylex.props(styles.prefRow)}>
          <div {...stylex.props(styles.prefText)}>
            <span id="lbl-group-order">Group order</span>
            <p {...stylex.props(styles.consequence)}>
              Controls left-to-right placement of new groups in the tab strip.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Segmented
              disabled={pending}
              labelledBy="lbl-group-order"
              onChange={handleGroupOrderChange}
              options={GROUP_ORDER_OPTIONS}
              value={prefs.groupOrder}
            />
          </div>
        </div>

        <div {...stylex.props(styles.prefRow, styles.prefRowNoBorder)}>
          <div {...stylex.props(styles.prefText)}>
            <label htmlFor="toggle-regroup" id="lbl-regroup" {...stylex.props(styles.prefLabel)}>
              Also regroup tabs already in groups
            </label>
            <p {...stylex.props(styles.consequence)}>
              Off by default so hand-made groups are left alone.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Switch
              checked={prefs.regroupExisting}
              disabled={pending}
              id="toggle-regroup"
              labelledBy="lbl-regroup"
              onChange={handleRegroupExistingChange}
            />
          </div>
        </div>
        <div {...stylex.props(styles.warningNote)}>
          <IconWarning />
          <span>
            Turning this on reshuffles groups you made by hand — Tab Sorter can&rsquo;t tell them
            apart from its own.
          </span>
        </div>
      </section>

      <section aria-labelledby="dupes-h" {...stylex.props(styles.settingsSection)}>
        <h2 id="dupes-h" {...stylex.props(styles.h2)}>
          Duplicates
        </h2>

        <div {...stylex.props(styles.prefRow, styles.prefRowNoBorder)}>
          <div {...stylex.props(styles.prefText)}>
            <label htmlFor="toggle-fragment" id="lbl-frag" {...stylex.props(styles.prefLabel)}>
              Ignore #fragment when comparing
            </label>
            <p {...stylex.props(styles.consequence)}>
              example.com/page#top and example.com/page count as duplicates.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Switch
              checked={prefs.dedupeIgnoreHash}
              disabled={pending}
              id="toggle-fragment"
              labelledBy="lbl-frag"
              onChange={handleDedupeIgnoreHashChange}
            />
          </div>
        </div>

        <div {...stylex.props(styles.prefRow, styles.prefRowNoBorder)}>
          <div {...stylex.props(styles.prefText)}>
            <label htmlFor="toggle-query" id="lbl-query" {...stylex.props(styles.prefLabel)}>
              Ignore ?query when comparing
            </label>
            <p {...stylex.props(styles.consequence)}>
              example.com/search?q=a and ?q=b count as duplicates of the same page.
            </p>
          </div>
          <div {...stylex.props(styles.prefControl)}>
            <Switch
              checked={prefs.dedupeIgnoreQuery}
              disabled={pending}
              id="toggle-query"
              labelledBy="lbl-query"
              onChange={handleDedupeIgnoreQueryChange}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="presets-h" {...stylex.props(styles.settingsSection)}>
        <h2 id="presets-h" {...stylex.props(styles.h2)}>
          Regex presets
        </h2>
        <p {...stylex.props(styles.sectionSub)}>
          Saved patterns appear as preset chips in the popup's pattern extractor.
        </p>

        <div {...stylex.props(styles.presetForm)}>
          <div {...stylex.props(styles.formField)}>
            <label htmlFor="pf-label" {...stylex.props(styles.formFieldLabel)}>
              Label
            </label>
            <input
              disabled={pending}
              id="pf-label"
              maxLength={MAX_PRESET_LABEL_LENGTH}
              onChange={(event) =>
                setDraft((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="Social media"
              type="text"
              value={draft.label}
              {...stylex.props(styles.formFieldInput)}
            />
          </div>
          <div {...stylex.props(styles.formField)}>
            <label htmlFor="pf-pattern" {...stylex.props(styles.formFieldLabel)}>
              Pattern
            </label>
            <input
              disabled={pending}
              id="pf-pattern"
              maxLength={MAX_PRESET_SOURCE_LENGTH}
              onChange={(event) =>
                setDraft((current) => ({ ...current, source: event.target.value }))
              }
              placeholder="facebook|twitter|tiktok"
              type="text"
              value={draft.source}
              {...stylex.props(styles.formFieldInput, styles.monoInput)}
            />
          </div>
          <div {...stylex.props(styles.formField)}>
            <label htmlFor="pf-flags" {...stylex.props(styles.formFieldLabel)}>
              Flags
            </label>
            <input
              disabled={pending}
              id="pf-flags"
              maxLength={4}
              onChange={(event) =>
                setDraft((current) => ({ ...current, flags: event.target.value }))
              }
              placeholder="i"
              type="text"
              value={draft.flags}
              {...stylex.props(styles.formFieldInput, styles.monoInput)}
            />
          </div>
          <button
            disabled={pending}
            onClick={handleAddPreset}
            type="button"
            {...stylex.props(styles.btnFilled)}
          >
            Add preset
          </button>
          <p hidden={error.length === 0} role="alert" {...stylex.props(styles.formError)}>
            {error}
          </p>
        </div>

        {prefs.regexPresets.length === 0 ? (
          <p {...stylex.props(styles.emptyPresets)}>No presets yet.</p>
        ) : (
          <ul {...stylex.props(styles.presetList)}>
            {prefs.regexPresets.map((preset, index) => {
              const dotColor = PRESET_DOT_COLORS[index % PRESET_DOT_COLORS.length] ?? "grey";
              const dotStyle = PRESET_DOT_STYLE_BY_COLOR[dotColor] ?? styles.presetDot_grey;
              return (
                <li
                  key={`${preset.label}:${preset.source}:${preset.flags}`}
                  {...stylex.props(styles.presetRow)}
                >
                  <span {...stylex.props(styles.presetDot, dotStyle)} />
                  <span {...stylex.props(styles.presetLabel)}>{preset.label}</span>
                  <code {...stylex.props(styles.presetPattern)}>{preset.source}</code>
                  <span {...stylex.props(styles.presetFlags)}>
                    {preset.flags.length > 0 ? preset.flags : "—"}
                  </span>
                  <button
                    aria-label={`Delete ${preset.label} preset`}
                    disabled={pending}
                    onClick={() => handleDeletePreset(index)}
                    type="button"
                    {...stylex.props(styles.iconBtn)}
                  >
                    <IconTrash />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="shortcuts-h" {...stylex.props(styles.settingsSection)}>
        <h2 id="shortcuts-h" {...stylex.props(styles.h2)}>
          Keyboard shortcuts
        </h2>
        <p {...stylex.props(styles.sectionSub)}>
          Read-only reference. Change these in chrome://extensions/shortcuts.
        </p>

        <ul {...stylex.props(styles.shortcutList)}>
          <li {...stylex.props(styles.shortcutRow)}>
            <span {...stylex.props(styles.shortcutName)}>Tidy this window</span>
            <span {...stylex.props(styles.kbdGroup)}>
              <kbd {...stylex.props(styles.kbd)}>Alt</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Shift</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Space</kbd>
            </span>
          </li>
          <li {...stylex.props(styles.shortcutRow)}>
            <span {...stylex.props(styles.shortcutName)}>Undo</span>
            <span {...stylex.props(styles.kbdGroup)}>
              <kbd {...stylex.props(styles.kbd)}>Alt</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Shift</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Z</kbd>
            </span>
          </li>
          <li {...stylex.props(styles.shortcutRow)}>
            <span {...stylex.props(styles.shortcutName)}>Sort A to Z</span>
            <span {...stylex.props(styles.kbdGroup)}>
              <kbd {...stylex.props(styles.kbd)}>Alt</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Shift</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>T</kbd>
            </span>
          </li>
          <li {...stylex.props(styles.shortcutRow)}>
            <span {...stylex.props(styles.shortcutName)}>Default sort</span>
            <span {...stylex.props(styles.kbdGroup)}>
              <kbd {...stylex.props(styles.kbd)}>Alt</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>Shift</kbd>
              <span {...stylex.props(styles.kbdPlus)}>+</span>
              <kbd {...stylex.props(styles.kbd)}>S</kbd>
            </span>
          </li>
        </ul>
        <p {...stylex.props(styles.shortcutsNote)}>
          Shortcuts are global to Chrome and may be reassigned by other extensions. Manage all of
          them at <code {...stylex.props(styles.shortcutsCode)}>chrome://extensions/shortcuts</code>
          .
        </p>
      </section>

      <p {...stylex.props(styles.footerMark)}>Tab Sorter</p>
    </main>
  );
}

export default App;
