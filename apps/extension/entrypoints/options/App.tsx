import { useEffect, useState } from "react";

import { getPrefs, setPrefs } from "../../lib/storage";
import type { Prefs, RegexPreset, SortMode } from "../../lib/types";

import "./App.css";

const emptyPreset: RegexPreset = { label: "", source: "", flags: "i" };

function App() {
  const [prefs, setLocalPrefs] = useState<Prefs | null>(null);
  const [draftPreset, setDraftPreset] = useState<RegexPreset>(emptyPreset);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPrefs(): Promise<void> {
      try {
        setLocalPrefs(await getPrefs());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load options.");
      }
    }

    void loadPrefs();
  }, []);

  async function savePrefs(nextPrefs: Prefs, successMessage: string): Promise<void> {
    setError("");
    await setPrefs(nextPrefs);
    setLocalPrefs(nextPrefs);
    setMessage(successMessage);
  }

  async function updateDefaultSort(defaultSort: SortMode): Promise<void> {
    if (!prefs) {
      return;
    }

    await savePrefs({ ...prefs, defaultSort }, "Default sort saved.");
  }

  async function updateIgnorePinned(ignorePinned: boolean): Promise<void> {
    if (!prefs) {
      return;
    }

    await savePrefs({ ...prefs, ignorePinned }, "Pinned-tab preference saved.");
  }

  function validatePreset(preset: RegexPreset): string | null {
    if (!preset.label.trim()) {
      return "Preset label is required.";
    }

    if (!preset.source.trim()) {
      return "Preset pattern is required.";
    }

    try {
      new RegExp(preset.source, preset.flags);
      return null;
    } catch (validationError) {
      return validationError instanceof Error ? validationError.message : "Invalid regular expression.";
    }
  }

  async function savePreset(): Promise<void> {
    if (!prefs) {
      return;
    }

    const validationError = validatePreset(draftPreset);

    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedPreset = {
      label: draftPreset.label.trim(),
      source: draftPreset.source,
      flags: draftPreset.flags,
    };
    const regexPresets = [...prefs.regexPresets];

    if (editingIndex === null) {
      regexPresets.push(normalizedPreset);
    } else {
      regexPresets[editingIndex] = normalizedPreset;
    }

    await savePrefs({ ...prefs, regexPresets }, editingIndex === null ? "Preset added." : "Preset updated.");
    setDraftPreset(emptyPreset);
    setEditingIndex(null);
  }

  async function deletePreset(index: number): Promise<void> {
    if (!prefs) {
      return;
    }

    const regexPresets = prefs.regexPresets.filter((_, presetIndex) => presetIndex !== index);
    await savePrefs({ ...prefs, regexPresets }, "Preset deleted.");

    if (editingIndex === index) {
      setDraftPreset(emptyPreset);
      setEditingIndex(null);
    }
  }

  function editPreset(preset: RegexPreset, index: number): void {
    setDraftPreset(preset);
    setEditingIndex(index);
    setMessage("");
    setError("");
  }

  if (!prefs) {
    return <main className="options-shell">Loading options...</main>;
  }

  return (
    <main className="options-shell">
      <header>
        <p className="eyebrow">Tab Sorter</p>
        <h1>Options</h1>
      </header>

      <section className="panel">
        <h2>Default action</h2>
        <label>
          Default sort
          <select onChange={(event) => void updateDefaultSort(event.target.value as SortMode)} value={prefs.defaultSort}>
            <option value="title">A to Z by title</option>
            <option value="domain">By domain</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input checked={prefs.ignorePinned} onChange={(event) => void updateIgnorePinned(event.target.checked)} type="checkbox" />
          Keep pinned tabs fixed and skip them during extract
        </label>
      </section>

      <section className="panel">
        <h2>Regex presets</h2>
        <div className="preset-form">
          <label>
            Label
            <input onChange={(event) => setDraftPreset({ ...draftPreset, label: event.target.value })} value={draftPreset.label} />
          </label>
          <label>
            Pattern
            <input onChange={(event) => setDraftPreset({ ...draftPreset, source: event.target.value })} value={draftPreset.source} />
          </label>
          <label>
            Flags
            <input onChange={(event) => setDraftPreset({ ...draftPreset, flags: event.target.value })} value={draftPreset.flags} />
          </label>
          <button onClick={() => void savePreset()} type="button">
            {editingIndex === null ? "Add preset" : "Update preset"}
          </button>
          {editingIndex !== null ? (
            <button className="secondary" onClick={() => { setDraftPreset(emptyPreset); setEditingIndex(null); }} type="button">
              Cancel edit
            </button>
          ) : null}
        </div>

        {prefs.regexPresets.length === 0 ? (
          <p className="muted">No presets saved yet.</p>
        ) : (
          <div className="preset-list">
            {prefs.regexPresets.map((preset, index) => (
              <article key={`${preset.label}-${preset.source}-${preset.flags}`}>
                <div>
                  <strong>{preset.label}</strong>
                  <code>/{preset.source}/{preset.flags}</code>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={() => editPreset(preset, index)} type="button">
                    Edit
                  </button>
                  <button className="danger" onClick={() => void deletePreset(index)} type="button">
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}
    </main>
  );
}

export default App;
