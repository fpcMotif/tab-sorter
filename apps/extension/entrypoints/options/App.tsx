import { useEffect, useState } from "react";

import { DEFAULT_PREFS } from "@/lib/storage.ts";
import { getPrefs, setPrefs } from "@/lib/storage.ts";
import type { Prefs, RegexPreset, SortMode } from "@/lib/types.ts";

import "./App.css";

function App() {
  const [prefs, setLocalPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [newPreset, setNewPreset] = useState<RegexPreset>({
    label: "",
    source: "",
    flags: "i",
  });

  useEffect(() => {
    void getPrefs().then(setLocalPrefs);
  }, []);

  async function save(update: Partial<Prefs>) {
    const next = { ...prefs, ...update };
    setLocalPrefs(next);
    await setPrefs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function addPreset() {
    if (!newPreset.label.trim() || !newPreset.source.trim()) return;
    const presets = [...prefs.regexPresets, { ...newPreset }];
    void save({ regexPresets: presets });
    setNewPreset({ label: "", source: "", flags: "i" });
  }

  function removePreset(index: number) {
    const presets = prefs.regexPresets.filter((_, i) => i !== index);
    void save({ regexPresets: presets });
  }

  return (
    <div className="options">
      <header className="options-header">
        <h1>Tab Sorter</h1>
        <p className="subtitle">Settings</p>
      </header>

      <section className="field">
        <label htmlFor="defaultSort">Default sort mode</label>
        <select
          id="defaultSort"
          value={prefs.defaultSort}
          onChange={(e) => save({ defaultSort: e.target.value as SortMode })}
        >
          <option value="title">A→Z by title</option>
          <option value="domain">By domain</option>
        </select>
      </section>

      <section className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={prefs.ignorePinned}
            onChange={(e) => save({ ignorePinned: e.target.checked })}
          />
          Ignore pinned tabs when sorting or extracting
        </label>
      </section>

      <section className="field">
        <h2>Regex presets</h2>
        <ul className="preset-list">
          {prefs.regexPresets.map((preset, index) => (
            <li key={`${preset.label}:${preset.source}:${preset.flags}:${index}`}>
              <span>
                <strong>{preset.label}</strong> /{preset.source}/{preset.flags}
              </span>
              <button onClick={() => removePreset(index)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="preset-form">
          <input
            type="text"
            placeholder="Label"
            value={newPreset.label}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, label: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Pattern"
            value={newPreset.source}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, source: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Flags"
            value={newPreset.flags}
            onChange={(e) => setNewPreset((prev) => ({ ...prev, flags: e.target.value }))}
          />
          <button onClick={addPreset} type="button">
            Add preset
          </button>
        </div>
      </section>

      <section className="field">
        <h2>Keyboard shortcuts</h2>
        <div className="shortcuts">
          <div className="shortcut-row">
            <span>Sort A→Z by title</span>
            <kbd>Alt + Shift + T</kbd>
          </div>
          <div className="shortcut-row">
            <span>Sort by domain</span>
            <kbd>Alt + Shift + D</kbd>
          </div>
        </div>
      </section>

      {saved && (
        <p className="saved" role="status">
          Saved
        </p>
      )}
    </div>
  );
}

export default App;
