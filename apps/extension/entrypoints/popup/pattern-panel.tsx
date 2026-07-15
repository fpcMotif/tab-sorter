import { useDeferredValue, useMemo, useState } from "react";

import { IconChevron, IconFilter } from "@/components/icons";
import { MATCH_SAFETY_CAP, matchPattern, reasonToString } from "@/lib/match";
import type { RegexPreset, TabLite } from "@/lib/types";

// Add/remove only the `i` character so a preset's other flags (e.g. the `m` in
// "im") survive the toggle instead of being clobbered.
export function toggleCaseFlag(flags: string): string {
  return flags.includes("i") ? flags.replace("i", "") : `${flags}i`;
}

interface PatternPanelProps {
  tabs: TabLite[];
  presets: RegexPreset[];
  disabled: boolean;
  onExtract: (source: string, flags: string) => void;
  onRequireInput: () => void;
}

// Owns the regex editor's own state (source, flags, open) so a keystroke
// re-renders only this panel, not the whole popup; the match preview is
// deferred and capped here where the pattern surface lives.
export function PatternPanel({
  tabs,
  presets,
  disabled,
  onExtract,
  onRequireInput,
}: PatternPanelProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [flags, setFlags] = useState("i");

  // Defer the heavy match computation off the keystroke so a slow pattern never
  // blocks typing; matchPattern owns the safety cap that bounds backtracking cost.
  const deferredSource = useDeferredValue(source);

  const preview = useMemo(() => {
    if (deferredSource.trim().length === 0) {
      return { count: 0, error: "" };
    }

    const result = matchPattern(tabs, deferredSource, flags);

    return result.ok
      ? { count: result.ids.length, error: "" }
      : { count: 0, error: reasonToString(result.reason) };
  }, [tabs, flags, deferredSource]);

  const moveLabel =
    preview.error.length === 0 && preview.count > 0
      ? `Move ${preview.count} ${preview.count === 1 ? "tab" : "tabs"} to new window`
      : "Move to new window";

  function handleMove() {
    if (source.trim().length === 0) {
      onRequireInput();
      return;
    }

    onExtract(source, flags);
  }

  return (
    <>
      <button
        aria-controls="pattern-panel"
        aria-expanded={open}
        className="disclosure-row"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="disclosure-icon">
          <IconFilter />
        </span>
        <span className="disclosure-label">Extract by pattern</span>
        <span className="chevron">
          <IconChevron />
        </span>
      </button>

      {open ? (
        <div className="pattern-panel" id="pattern-panel">
          <div className="field">
            <label htmlFor="regex-input">Pattern</label>
            <input
              aria-describedby="match-count"
              autoComplete="off"
              className={`regex-input${preview.error.length > 0 ? " is-invalid" : ""}`}
              disabled={disabled}
              id="regex-input"
              maxLength={MATCH_SAFETY_CAP}
              onChange={(event) => setSource(event.target.value)}
              placeholder="github|docs"
              spellCheck={false}
              value={source}
            />
          </div>
          <div className="flags-row">
            <button
              aria-pressed={flags.includes("i")}
              className={`flag-chip${flags.includes("i") ? " on" : ""}`}
              disabled={disabled}
              onClick={() => setFlags(toggleCaseFlag)}
              type="button"
            >
              Case-insensitive
            </button>
          </div>
          <p
            className={`match-count num${preview.error.length > 0 ? " is-invalid" : ""}`}
            id="match-count"
          >
            {preview.error.length > 0
              ? preview.error
              : source.trim().length === 0
                ? "Enter a pattern to preview matches."
                : `Matches ${preview.count} of ${tabs.length} tabs`}
          </p>
          <div className="preset-chips">
            {presets.map((preset) => (
              <button
                className="preset-chip"
                disabled={disabled}
                key={`${preset.label}:${preset.source}:${preset.flags}`}
                onClick={() => {
                  setSource(preset.source);
                  setFlags(preset.flags);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            className="move-btn"
            disabled={disabled || preview.error.length > 0 || preview.count === 0}
            onClick={handleMove}
            type="button"
          >
            {moveLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
