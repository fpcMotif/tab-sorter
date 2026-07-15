import { useEffect, useReducer, useRef, useState } from "react";

import { useAsyncAction } from "@/hooks/use-async-action";
import {
  getPrefs,
  MIN_GROUP_SIZE_CEIL,
  MIN_GROUP_SIZE_ERROR,
  MIN_GROUP_SIZE_FLOOR,
  onPrefsChanged,
  parseMinGroupSize,
  setPrefs,
  validatePreset,
} from "@/lib/storage";
import type { GroupOrder, Prefs, RegexPreset, SortMode } from "@/lib/types";

import "./App.css";

import {
  DuplicatesSection,
  PresetsSection,
  SettingsHeader,
  ShortcutsSection,
  SortingSection,
  TidySection,
  type PresetDraft,
} from "./components";
import { INITIAL_SAVE_STATE, saveReducer } from "./save-state";

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
        const nextPrefs = await setPrefs(patch);
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
      <SettingsHeader saveVisible={saveVisible} />

      <SortingSection
        defaultSort={prefs.defaultSort}
        ignorePinned={prefs.ignorePinned}
        onDefaultSortChange={handleDefaultSortChange}
        onIgnorePinnedChange={handleIgnorePinnedChange}
        pending={pending}
      />

      <TidySection
        collapseAfterTidy={prefs.collapseAfterTidy}
        groupOrder={prefs.groupOrder}
        minGroupSize={prefs.minGroupSize}
        minGroupSizeDraft={minGroupSizeDraft}
        minGroupSizeError={minGroupSizeError}
        onCollapseAfterTidyChange={handleCollapseAfterTidyChange}
        onGroupOrderChange={handleGroupOrderChange}
        onMinGroupSizeInput={handleMinGroupSizeInput}
        onMinGroupSizeStep={handleMinGroupSizeStep}
        onRegroupExistingChange={handleRegroupExistingChange}
        pending={pending}
        regroupExisting={prefs.regroupExisting}
      />

      <DuplicatesSection
        dedupeIgnoreHash={prefs.dedupeIgnoreHash}
        dedupeIgnoreQuery={prefs.dedupeIgnoreQuery}
        onDedupeIgnoreHashChange={handleDedupeIgnoreHashChange}
        onDedupeIgnoreQueryChange={handleDedupeIgnoreQueryChange}
        pending={pending}
      />

      <PresetsSection
        draft={draft}
        error={error}
        onAddPreset={handleAddPreset}
        onDeletePreset={handleDeletePreset}
        onFlagsChange={(flags) => setDraft((current) => ({ ...current, flags }))}
        onLabelChange={(label) => setDraft((current) => ({ ...current, label }))}
        onSourceChange={(source) => setDraft((current) => ({ ...current, source }))}
        pending={pending}
        regexPresets={prefs.regexPresets}
      />

      <ShortcutsSection />

      <p className="footer-mark">Tab Sorter</p>
    </main>
  );
}

export default App;
