import { describe, expect, it } from "vitest";

import {
  validatePreset,
  type PresetDraft,
  MAX_PRESETS,
  MAX_PRESET_LABEL_LENGTH,
  MAX_PRESET_SOURCE_LENGTH,
} from "./preset-validation";

describe("validatePreset", () => {
  it("returns an empty string for a valid preset", () => {
    const draft: PresetDraft = { label: "Docs", source: "docs|guide", flags: "i" };
    expect(validatePreset(draft, 0)).toBe("");
  });

  it("requires a label", () => {
    const draft: PresetDraft = { label: "   ", source: "docs|guide", flags: "i" };
    expect(validatePreset(draft, 0)).toBe("Preset label is required.");
  });

  it("enforces maximum label length", () => {
    const draft: PresetDraft = {
      label: "a".repeat(MAX_PRESET_LABEL_LENGTH + 1),
      source: "docs|guide",
      flags: "i",
    };
    expect(validatePreset(draft, 0)).toBe(
      `Label is too long (max ${MAX_PRESET_LABEL_LENGTH} characters).`,
    );
  });

  it("requires a pattern source", () => {
    const draft: PresetDraft = { label: "Docs", source: "   ", flags: "i" };
    expect(validatePreset(draft, 0)).toBe("Pattern is required.");
  });

  it("enforces maximum pattern length", () => {
    const draft: PresetDraft = {
      label: "Docs",
      source: "a".repeat(MAX_PRESET_SOURCE_LENGTH + 1),
      flags: "i",
    };
    expect(validatePreset(draft, 0)).toBe(
      `Pattern is too long (max ${MAX_PRESET_SOURCE_LENGTH} characters).`,
    );
  });

  it("enforces a maximum number of presets", () => {
    const draft: PresetDraft = { label: "Docs", source: "docs|guide", flags: "i" };
    expect(validatePreset(draft, MAX_PRESETS)).toBe(
      `Preset limit reached (${MAX_PRESETS}). Delete one to add another.`,
    );
  });

  it("returns an error for invalid regular expressions", () => {
    const draft: PresetDraft = { label: "Docs", source: "[a-z", flags: "i" };
    expect(validatePreset(draft, 0)).toBe("Pattern or flags are not a valid regular expression.");
  });

  it("returns an error for invalid flags", () => {
    const draft: PresetDraft = { label: "Docs", source: "docs|guide", flags: "invalid" };
    expect(validatePreset(draft, 0)).toBe("Pattern or flags are not a valid regular expression.");
  });
});
