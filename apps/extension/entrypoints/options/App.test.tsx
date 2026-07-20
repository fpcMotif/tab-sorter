import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS } from "@tab-sorter/core/types";

import App from "./App";

const mocks = vi.hoisted(() => ({
  getPrefs: vi.fn(),
  onPrefsChanged: vi.fn(),
  requestPrefsPatch: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getPrefs: mocks.getPrefs,
  onPrefsChanged: mocks.onPrefsChanged,
}));

vi.mock("@/lib/runtime", () => ({
  requestPrefsPatch: mocks.requestPrefsPatch,
}));

describe("options preference routing", () => {
  beforeEach(() => {
    mocks.getPrefs.mockReset();
    mocks.onPrefsChanged.mockReset();
    mocks.requestPrefsPatch.mockReset();

    mocks.getPrefs.mockResolvedValue(DEFAULT_PREFS);
    mocks.onPrefsChanged.mockReturnValue(() => undefined);
    mocks.requestPrefsPatch.mockImplementation(async (patch) => ({
      ...DEFAULT_PREFS,
      ...patch,
    }));
  });

  it("sends preference patches through the background writer", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "Keep pinned tabs fixed" }));

    await waitFor(() => {
      expect(mocks.requestPrefsPatch).toHaveBeenCalledWith({ ignorePinned: false });
    });
  });
});
