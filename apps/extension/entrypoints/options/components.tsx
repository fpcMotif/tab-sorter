import { IconCheck, IconSparkle, IconTrash, IconWarning } from "@/components/icons";
import {
  MAX_PRESET_LABEL_LENGTH,
  MAX_PRESET_SOURCE_LENGTH,
  MIN_GROUP_SIZE_CEIL,
  MIN_GROUP_SIZE_FLOOR,
} from "@/lib/storage";
import type { GroupColor, GroupOrder, RegexPreset, SortMode } from "@/lib/types";

interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

// The persisted-choice control (DESIGN-SPEC §4.2 `.segmented`) — distinct
// from the popup's `.chip-btn`, which is a momentary action, not a selection.
export function Segmented<T extends string>({
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
    <div aria-labelledby={labelledBy} className="segmented" role="group">
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
    </div>
  );
}

// A real <input type="checkbox"> wearing a track (DESIGN-SPEC §4.9) rather
// than a hand-rolled `<button role="switch">`, so Space toggles it for free
// and its accessible name comes from the sibling `<label for>` in each
// pref-row, not a duplicated aria-label here.
export function Switch({
  checked,
  disabled,
  id,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  id: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <input
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="track" />
    </label>
  );
}

interface SettingsHeaderProps {
  saveVisible: boolean;
}

export function SettingsHeader({ saveVisible }: SettingsHeaderProps) {
  return (
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
      <span
        aria-live="polite"
        className={`save-indicator${saveVisible ? " is-visible" : ""}`}
        role="status"
      >
        <IconCheck />
        Saved
      </span>
    </div>
  );
}

const DEFAULT_SORT_OPTIONS: readonly { label: string; value: SortMode }[] = [
  { label: "A to Z", value: "title" },
  { label: "By domain", value: "domain" },
];

interface SortingSectionProps {
  defaultSort: SortMode;
  ignorePinned: boolean;
  onDefaultSortChange: (defaultSort: SortMode) => void;
  onIgnorePinnedChange: (ignorePinned: boolean) => void;
  pending: boolean;
}

export function SortingSection({
  defaultSort,
  ignorePinned,
  onDefaultSortChange,
  onIgnorePinnedChange,
  pending,
}: SortingSectionProps) {
  return (
    <section aria-labelledby="sorting-h" className="settings-section">
      <h2 id="sorting-h">Sorting</h2>

      <div className="pref-row">
        <div className="pref-text">
          <label id="lbl-default-sort">Default sort</label>
          <p className="consequence">
            Used when you click Sort without choosing A to Z or By domain.
          </p>
        </div>
        <div className="pref-control">
          <Segmented
            disabled={pending}
            labelledBy="lbl-default-sort"
            onChange={onDefaultSortChange}
            options={DEFAULT_SORT_OPTIONS}
            value={defaultSort}
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
            checked={ignorePinned}
            disabled={pending}
            id="toggle-pinned"
            onChange={onIgnorePinnedChange}
          />
        </div>
      </div>
    </section>
  );
}

const GROUP_ORDER_OPTIONS: readonly { label: string; value: GroupOrder }[] = [
  { label: "Alphabetical", value: "alpha" },
  { label: "Largest first", value: "sizeDesc" },
];

interface TidySectionProps {
  collapseAfterTidy: boolean;
  groupOrder: GroupOrder;
  minGroupSize: number;
  minGroupSizeDraft: string;
  minGroupSizeError: string;
  onCollapseAfterTidyChange: (collapseAfterTidy: boolean) => void;
  onGroupOrderChange: (groupOrder: GroupOrder) => void;
  onMinGroupSizeInput: (raw: string) => void;
  onMinGroupSizeStep: (delta: number) => void;
  onRegroupExistingChange: (regroupExisting: boolean) => void;
  pending: boolean;
  regroupExisting: boolean;
}

export function TidySection({
  collapseAfterTidy,
  groupOrder,
  minGroupSize,
  minGroupSizeDraft,
  minGroupSizeError,
  onCollapseAfterTidyChange,
  onGroupOrderChange,
  onMinGroupSizeInput,
  onMinGroupSizeStep,
  onRegroupExistingChange,
  pending,
  regroupExisting,
}: TidySectionProps) {
  return (
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
            checked={collapseAfterTidy}
            disabled={pending}
            id="toggle-collapse"
            onChange={onCollapseAfterTidyChange}
          />
        </div>
      </div>

      <div className="pref-row">
        <div className="pref-text">
          <label id="lbl-min-size">Minimum tabs to form a group</label>
          <p className="consequence">
            Sites with fewer tabs than this stay loose instead of becoming a group.
          </p>
        </div>
        <div className="pref-control">
          <div
            aria-labelledby="lbl-min-size"
            className={`stepper${minGroupSizeError.length > 0 ? " has-error" : ""}`}
            role="group"
          >
            <button
              aria-label="Decrease"
              disabled={pending || minGroupSize <= MIN_GROUP_SIZE_FLOOR}
              onClick={() => onMinGroupSizeStep(-1)}
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
              onChange={(event) => onMinGroupSizeInput(event.target.value)}
              type="text"
              value={minGroupSizeDraft}
            />
            <button
              aria-label="Increase"
              disabled={pending || minGroupSize >= MIN_GROUP_SIZE_CEIL}
              onClick={() => onMinGroupSizeStep(1)}
              type="button"
            >
              +
            </button>
          </div>
        </div>
      </div>
      {minGroupSizeError.length > 0 ? (
        <p className="field-error" id="min-group-size-error" role="alert">
          {minGroupSizeError}
        </p>
      ) : null}

      <div className="pref-row">
        <div className="pref-text">
          <label id="lbl-group-order">Group order</label>
          <p className="consequence">
            Controls left-to-right placement of new groups in the tab strip.
          </p>
        </div>
        <div className="pref-control">
          <Segmented
            disabled={pending}
            labelledBy="lbl-group-order"
            onChange={onGroupOrderChange}
            options={GROUP_ORDER_OPTIONS}
            value={groupOrder}
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
            checked={regroupExisting}
            disabled={pending}
            id="toggle-regroup"
            onChange={onRegroupExistingChange}
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
  );
}

interface DuplicatesSectionProps {
  dedupeIgnoreHash: boolean;
  dedupeIgnoreQuery: boolean;
  onDedupeIgnoreHashChange: (dedupeIgnoreHash: boolean) => void;
  onDedupeIgnoreQueryChange: (dedupeIgnoreQuery: boolean) => void;
  pending: boolean;
}

export function DuplicatesSection({
  dedupeIgnoreHash,
  dedupeIgnoreQuery,
  onDedupeIgnoreHashChange,
  onDedupeIgnoreQueryChange,
  pending,
}: DuplicatesSectionProps) {
  return (
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
            checked={dedupeIgnoreHash}
            disabled={pending}
            id="toggle-fragment"
            onChange={onDedupeIgnoreHashChange}
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
            checked={dedupeIgnoreQuery}
            disabled={pending}
            id="toggle-query"
            onChange={onDedupeIgnoreQueryChange}
          />
        </div>
      </div>
    </section>
  );
}

export interface PresetDraft {
  label: string;
  source: string;
  flags: string;
}

// Cycled onto preset rows purely for visual scannability — presets have no
// GroupColor of their own the way a live tidy group does.
const PRESET_DOT_COLORS: readonly GroupColor[] = ["blue", "cyan", "orange", "purple", "grey"];

interface PresetsSectionProps {
  draft: PresetDraft;
  error: string;
  onAddPreset: () => void;
  onDeletePreset: (index: number) => void;
  onFlagsChange: (flags: string) => void;
  onLabelChange: (label: string) => void;
  onSourceChange: (source: string) => void;
  pending: boolean;
  regexPresets: RegexPreset[];
}

export function PresetsSection({
  draft,
  error,
  onAddPreset,
  onDeletePreset,
  onFlagsChange,
  onLabelChange,
  onSourceChange,
  pending,
  regexPresets,
}: PresetsSectionProps) {
  return (
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
            onChange={(event) => onLabelChange(event.target.value)}
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
            onChange={(event) => onSourceChange(event.target.value)}
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
            onChange={(event) => onFlagsChange(event.target.value)}
            placeholder="i"
            type="text"
            value={draft.flags}
          />
        </div>
        <button className="btn-filled" disabled={pending} onClick={onAddPreset} type="button">
          Add preset
        </button>
        <p className="form-error" hidden={error.length === 0} role="alert">
          {error}
        </p>
      </div>

      {regexPresets.length === 0 ? (
        <p className="empty-presets">No presets yet.</p>
      ) : (
        <ul className="preset-list">
          {regexPresets.map((preset, index) => (
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
                onClick={() => onDeletePreset(index)}
                type="button"
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShortcutsSection() {
  return (
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
        Shortcuts are global to Chrome and may be reassigned by other extensions. Manage all of them
        at <code>chrome://extensions/shortcuts</code>.
      </p>
    </section>
  );
}
