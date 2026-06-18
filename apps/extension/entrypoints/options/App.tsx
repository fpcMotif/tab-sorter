import { useEffect, useState } from "react";

import { getPrefs, setPrefs } from "@/lib/storage";
import type { Prefs, RegexPreset, SortMode } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

import "./App.css";

interface PresetDraft {
  label: string;
  source: string;
  flags: string;
}

function validatePreset(draft: PresetDraft): string {
  if (draft.label.trim().length === 0) {
    return "Preset label is required.";
  }

  if (draft.source.trim().length === 0) {
    return "Pattern is required.";
  }

  try {
    new RegExp(draft.source, draft.flags);
  } catch {
    return "Pattern or flags are not a valid regular expression.";
  }

  return "";
}

function App() {
  const [prefs, setLocalPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [draft, setDraft] = useState<PresetDraft>({ label: "", source: "", flags: "i" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getPrefs()
      .then(setLocalPrefs)
      .catch((loadError) => {
        console.error(loadError);
        setError("Could not load preferences.");
      });
  }, []);

  async function persistPrefs(patch: Partial<Prefs>) {
    setPending(true);
    setError("");
    setStatus("");

    try {
      const nextPrefs = await setPrefs(patch);
      setLocalPrefs(nextPrefs);
      setStatus("Saved.");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not save preferences.");
    } finally {
      setPending(false);
    }
  }

  function handleDefaultSortChange(defaultSort: SortMode) {
    void persistPrefs({ defaultSort });
  }

  function handleIgnorePinnedChange(ignorePinned: boolean) {
    void persistPrefs({ ignorePinned });
  }

  function handleAddPreset() {
    const validationError = validatePreset(draft);

    if (validationError.length > 0) {
      setError(validationError);
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
    <main className="options-shell">
      <header>
        <p className="eyebrow">Tab Sorter</p>
        <h1>Options</h1>
      </header>

      <section className="panel">
        <h2>Sorting</h2>
        <label>
          Default sort for background actions
          <select
            disabled={pending}
            onChange={(event) => handleDefaultSortChange(event.target.value as SortMode)}
            value={prefs.defaultSort}
          >
            <option value="title">A to Z by title</option>
            <option value="domain">By domain</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input
            checked={prefs.ignorePinned}
            disabled={pending}
            onChange={(event) => handleIgnorePinnedChange(event.target.checked)}
            type="checkbox"
          />
          Keep pinned tabs fixed and skip them during extract
        </label>
      </section>

      <section className="panel">
        <h2>Regex presets</h2>
        <div className="preset-form">
          <label>
            Label
            <input
              disabled={pending}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              placeholder="Docs"
              value={draft.label}
            />
          </label>
          <label>
            Pattern
            <input
              disabled={pending}
              onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
              placeholder="docs|guide"
              value={draft.source}
            />
          </label>
          <label>
            Flags
            <input
              disabled={pending}
              onChange={(event) => setDraft((current) => ({ ...current, flags: event.target.value }))}
              placeholder="i"
              value={draft.flags}
            />
          </label>
          <button disabled={pending} onClick={handleAddPreset} type="button">
            Add preset
          </button>
        </div>

        {prefs.regexPresets.length === 0 ? <p className="muted">No presets yet.</p> : null}
        <ul className="preset-list">
          {prefs.regexPresets.map((preset, index) => (
            <li key={`${preset.label}:${preset.source}:${preset.flags}`}>
              <span>
                <strong>{preset.label}</strong>
                <code>
                  /{preset.source}/{preset.flags}
                </code>
              </span>
              <button disabled={pending} onClick={() => handleDeletePreset(index)} type="button">
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {error.length > 0 ? <p className="status error">{error}</p> : null}
      {status.length > 0 ? <p className="status success">{status}</p> : null}
    </main>
  );
}

export default App;
