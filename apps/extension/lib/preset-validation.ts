export interface PresetDraft {
  label: string;
  source: string;
  flags: string;
}

// Bounds keep the whole prefs object well under chrome.storage.sync's
// ~8KB-per-item quota, beyond which every save (not just presets) would fail.
export const MAX_PRESETS = 50;
export const MAX_PRESET_SOURCE_LENGTH = 500;
export const MAX_PRESET_LABEL_LENGTH = 60;

export function validatePreset(draft: PresetDraft, existingCount: number): string {
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

  try {
    new RegExp(draft.source, draft.flags);
  } catch {
    return "Pattern or flags are not a valid regular expression.";
  }

  return "";
}
