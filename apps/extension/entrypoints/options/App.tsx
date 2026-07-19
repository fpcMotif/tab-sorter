import { useEffect, useReducer, useRef, useState } from "react";

import { useAsyncAction } from "@/hooks/use-async-action";
import { reasonToString, validatePattern } from "@/lib/match";
import { requestPrefsPatch } from "@/lib/runtime";
import { getPrefs, onPrefsChanged } from "@/lib/storage";
import type { GroupColor, GroupOrder, Prefs, RegexPreset, SortMode } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

import "./App.css";

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

// Mirrors storage.ts' normalizeMinGroupSize bounds — a value outside this
// range would just be clamped back to DEFAULT_PREFS on the next load, so the
// input rejects it up front instead of silently persisting a value that
// won't stick. Floor is 2, not 1: a "group" of one tab is the exact noise
// this pref exists to prevent (DESIGN-SPEC's stepper floor agrees).
const MIN_GROUP_SIZE_FLOOR = 2;
const MIN_GROUP_SIZE_CEIL = 99;
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

function IconSparkle() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 3.2l1.9 5.3 5.3 1.9-5.3 1.9L11 17.6l-1.9-5.3L3.8 10.4l5.3-1.9L11 3.2z" />
      <path d="M18.3 2.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 3.3 22 20H2z" />
      <line x1="12" x2="12" y1="9.5" y2="14.5" />
      <circle cx="12" cy="17.3" fill="currentColor" r=".9" stroke="none" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
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

// The persisted-choice control (DESIGN-SPEC §4.2 `.segmented`) — distinct
// from the popup's `.chip-btn`, which is a momentary action, not a selection.
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
    <fieldset aria-labelledby={labelledBy} className="segmented">
      {options.map((option) => (
        <button
          className={option.value === value ? "is-selected" : undefined}
          disabled={disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

// A real <input type="checkbox"> wearing a track (DESIGN-SPEC §4.9) rather
// than a hand-rolled `<button role="switch">`, so Space toggles it for free
// and its accessible name comes from the linked visible label in each row.
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
    <span className="switch">
      <input
        aria-labelledby={labelledBy}
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="track" />
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

    // Keep this page in sync when another tab/popup writes prefs, so concurrent
    // edits don't clobber each other from stale local state.
    return onPrefsChanged((loaded) => dispatch({ type: "prefsLoaded", prefs: loaded }));
  }, []);

  // Resyncs the typed draft whenever the committed value actually changes
  // (our own save round-tripping, or another surface writing prefs) — an
  // in-progress invalid keystroke is never clobbered by an unrelated pref save.
  useEffect(() => {
    setMinGroupSizeDraft(String(prefs.minGroupSize));
    setMinGroupSizeError("");
  }, [prefs.minGroupSize]);

  // Quiet "Saved." chip (DESIGN-SPEC §4.9): fades in on every live-save and
  // fades back out on its own 1.6s timer, independent of whatever triggered it.
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

  return (
    <main className="page">
      <div className="page-header">
        <div className="header-left">
          <span className="app-icon">
            <IconSparkle />
          </span>
          <div>
            <h1>Tab Sorter settings</h1>
            <p className="header-sub">
              Defaults that shape every tidy, sort, and duplicate check across all your windows.
            </p>
          </div>
        </div>
        <output aria-live="polite" className={`save-indicator${saveVisible ? " is-visible" : ""}`}>
          <IconCheck />
          Saved
        </output>
      </div>

      <section aria-labelledby="sorting-h" className="settings-section">
        <h2 id="sorting-h">Sorting</h2>

        <div className="pref-row">
          <div className="pref-text">
            <span id="lbl-default-sort">Default sort</span>
            <p className="consequence">
              Used when you click Sort without choosing A to Z or By domain.
            </p>
          </div>
          <div className="pref-control">
            <Segmented
              disabled={pending}
              labelledBy="lbl-default-sort"
              onChange={handleDefaultSortChange}
              options={DEFAULT_SORT_OPTIONS}
              value={prefs.defaultSort}
            />
          </div>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <label htmlFor="toggle-pinned" id="lbl-pinned">
              Keep pinned tabs fixed
            </label>
            <p className="consequence">Pinned tabs stay in place and are never moved or grouped.</p>
          </div>
          <div className="pref-control">
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

      <section aria-labelledby="tidy-h" className="settings-section">
        <h2 id="tidy-h">Tidy</h2>

        <div className="pref-row">
          <div className="pref-text">
            <label htmlFor="toggle-collapse" id="lbl-collapse">
              Collapse groups after tidying
            </label>
            <p className="consequence">New groups start collapsed so the tab strip stays short.</p>
          </div>
          <div className="pref-control">
            <Switch
              checked={prefs.collapseAfterTidy}
              disabled={pending}
              id="toggle-collapse"
              labelledBy="lbl-collapse"
              onChange={handleCollapseAfterTidyChange}
            />
          </div>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <span id="lbl-min-size">Minimum tabs to form a group</span>
            <p className="consequence">
              Sites with fewer tabs than this stay loose instead of becoming a group.
            </p>
          </div>
          <div className="pref-control">
            <fieldset
              aria-labelledby="lbl-min-size"
              className={`stepper${minGroupSizeError.length > 0 ? " has-error" : ""}`}
            >
              <button
                aria-label="Decrease"
                disabled={pending || prefs.minGroupSize <= MIN_GROUP_SIZE_FLOOR}
                onClick={() => handleMinGroupSizeStep(-1)}
                type="button"
              >
                −
              </button>
              <input
                aria-describedby={minGroupSizeError.length > 0 ? "min-group-size-error" : undefined}
                aria-invalid={minGroupSizeError.length > 0}
                aria-label="Minimum tabs to form a group"
                className={`stepper-input${minGroupSizeError.length > 0 ? " is-invalid" : ""}`}
                disabled={pending}
                inputMode="numeric"
                onChange={(event) => handleMinGroupSizeInput(event.target.value)}
                type="text"
                value={minGroupSizeDraft}
              />
              <button
                aria-label="Increase"
                disabled={pending || prefs.minGroupSize >= MIN_GROUP_SIZE_CEIL}
                onClick={() => handleMinGroupSizeStep(1)}
                type="button"
              >
                +
              </button>
            </fieldset>
          </div>
        </div>
        {minGroupSizeError.length > 0 ? (
          <p className="field-error" id="min-group-size-error" role="alert">
            {minGroupSizeError}
          </p>
        ) : null}

        <div className="pref-row">
          <div className="pref-text">
            <span id="lbl-group-order">Group order</span>
            <p className="consequence">
              Controls left-to-right placement of new groups in the tab strip.
            </p>
          </div>
          <div className="pref-control">
            <Segmented
              disabled={pending}
              labelledBy="lbl-group-order"
              onChange={handleGroupOrderChange}
              options={GROUP_ORDER_OPTIONS}
              value={prefs.groupOrder}
            />
          </div>
        </div>

        <div className="pref-row no-border">
          <div className="pref-text">
            <label htmlFor="toggle-regroup" id="lbl-regroup">
              Also regroup tabs already in groups
            </label>
            <p className="consequence">Off by default so hand-made groups are left alone.</p>
          </div>
          <div className="pref-control">
            <Switch
              checked={prefs.regroupExisting}
              disabled={pending}
              id="toggle-regroup"
              labelledBy="lbl-regroup"
              onChange={handleRegroupExistingChange}
            />
          </div>
        </div>
        <div className="warning-note">
          <IconWarning />
          <span>
            Turning this on reshuffles groups you made by hand — Tab Sorter can&rsquo;t tell them
            apart from its own.
          </span>
        </div>
      </section>

      <section aria-labelledby="dupes-h" className="settings-section">
        <h2 id="dupes-h">Duplicates</h2>

        <div className="pref-row">
          <div className="pref-text">
            <label htmlFor="toggle-fragment" id="lbl-frag">
              Ignore #fragment when comparing
            </label>
            <p className="consequence">
              example.com/page#top and example.com/page count as duplicates.
            </p>
          </div>
          <div className="pref-control">
            <Switch
              checked={prefs.dedupeIgnoreHash}
              disabled={pending}
              id="toggle-fragment"
              labelledBy="lbl-frag"
              onChange={handleDedupeIgnoreHashChange}
            />
          </div>
        </div>

        <div className="pref-row no-border">
          <div className="pref-text">
            <label htmlFor="toggle-query" id="lbl-query">
              Ignore ?query when comparing
            </label>
            <p className="consequence">
              example.com/search?q=a and ?q=b count as duplicates of the same page.
            </p>
          </div>
          <div className="pref-control">
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

      <section aria-labelledby="presets-h" className="settings-section">
        <h2 id="presets-h">Regex presets</h2>
        <p className="section-sub">
          Saved patterns appear as preset chips in the popup's pattern extractor.
        </p>

        <div className="preset-form">
          <div className="form-field">
            <label htmlFor="pf-label">Label</label>
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
            />
          </div>
          <div className="form-field">
            <label htmlFor="pf-pattern">Pattern</label>
            <input
              className="mono"
              disabled={pending}
              id="pf-pattern"
              maxLength={MAX_PRESET_SOURCE_LENGTH}
              onChange={(event) =>
                setDraft((current) => ({ ...current, source: event.target.value }))
              }
              placeholder="facebook|twitter|tiktok"
              type="text"
              value={draft.source}
            />
          </div>
          <div className="form-field">
            <label htmlFor="pf-flags">Flags</label>
            <input
              className="mono"
              disabled={pending}
              id="pf-flags"
              maxLength={4}
              onChange={(event) =>
                setDraft((current) => ({ ...current, flags: event.target.value }))
              }
              placeholder="i"
              type="text"
              value={draft.flags}
            />
          </div>
          <button className="btn-filled" disabled={pending} onClick={handleAddPreset} type="button">
            Add preset
          </button>
          <p className="form-error" hidden={error.length === 0} role="alert">
            {error}
          </p>
        </div>

        {prefs.regexPresets.length === 0 ? (
          <p className="empty-presets">No presets yet.</p>
        ) : (
          <ul className="preset-list">
            {prefs.regexPresets.map((preset, index) => (
              <li className="preset-row" key={`${preset.label}:${preset.source}:${preset.flags}`}>
                <span
                  className={`preset-dot dot-${PRESET_DOT_COLORS[index % PRESET_DOT_COLORS.length]}`}
                />
                <span className="preset-label">{preset.label}</span>
                <code className="preset-pattern">{preset.source}</code>
                <span className="preset-flags">{preset.flags.length > 0 ? preset.flags : "—"}</span>
                <button
                  aria-label={`Delete ${preset.label} preset`}
                  className="icon-btn"
                  disabled={pending}
                  onClick={() => handleDeletePreset(index)}
                  type="button"
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="shortcuts-h" className="settings-section">
        <h2 id="shortcuts-h">Keyboard shortcuts</h2>
        <p className="section-sub">
          Read-only reference. Change these in chrome://extensions/shortcuts.
        </p>

        <ul className="shortcut-list">
          <li className="shortcut-row">
            <span className="shortcut-name">Tidy this window</span>
            <span className="kbd-group">
              <kbd>Alt</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Shift</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Space</kbd>
            </span>
          </li>
          <li className="shortcut-row">
            <span className="shortcut-name">Undo</span>
            <span className="kbd-group">
              <kbd>Alt</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Shift</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Z</kbd>
            </span>
          </li>
          <li className="shortcut-row">
            <span className="shortcut-name">Sort A to Z</span>
            <span className="kbd-group">
              <kbd>Alt</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Shift</kbd>
              <span className="kbd-plus">+</span>
              <kbd>T</kbd>
            </span>
          </li>
          <li className="shortcut-row">
            <span className="shortcut-name">Default sort</span>
            <span className="kbd-group">
              <kbd>Alt</kbd>
              <span className="kbd-plus">+</span>
              <kbd>Shift</kbd>
              <span className="kbd-plus">+</span>
              <kbd>S</kbd>
            </span>
          </li>
        </ul>
        <p className="shortcuts-note">
          Shortcuts are global to Chrome and may be reassigned by other extensions. Manage all of
          them at <code>chrome://extensions/shortcuts</code>.
        </p>
      </section>

      <p className="footer-mark">Tab Sorter</p>
    </main>
  );
}

export default App;
