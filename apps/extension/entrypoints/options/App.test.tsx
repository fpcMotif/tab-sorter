import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import App from "./App";
import { fakeBrowser } from "@webext-core/fake-browser";
import { getPrefs, setPrefs } from "@/lib/storage";
import { DEFAULT_PREFS } from "@/lib/types";

// Mock the storage lib functions
vi.mock("@/lib/storage", () => ({
  getPrefs: vi.fn(),
  setPrefs: vi.fn(),
}));

describe("Options App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("browser", fakeBrowser);
    fakeBrowser.reset();

    // Default mock behavior
    vi.mocked(getPrefs).mockResolvedValue(DEFAULT_PREFS);
    vi.mocked(setPrefs).mockImplementation(async (patch) => {
      return { ...DEFAULT_PREFS, ...patch };
    });
  });

  it("loads and displays preferences correctly", async () => {
    render(<App />);

    // Check header
    expect(screen.getByText("Options")).toBeInTheDocument();

    // Verify initial load calls getPrefs
    expect(getPrefs).toHaveBeenCalledTimes(1);

    // Wait for the select value to be set correctly based on DEFAULT_PREFS
    await waitFor(() => {
      const sortSelect = screen.getByLabelText(/Default sort/i) as HTMLSelectElement;
      expect(sortSelect.value).toBe(DEFAULT_PREFS.defaultSort);
    });

    const ignorePinned = screen.getByLabelText(/Keep pinned tabs fixed/i) as HTMLInputElement;
    expect(ignorePinned.checked).toBe(DEFAULT_PREFS.ignorePinned);
  });

  it("updates default sort preference", async () => {
    render(<App />);
    const user = userEvent.setup();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByLabelText(/Default sort/i)).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText(/Default sort/i);
    await user.selectOptions(sortSelect, "domain");

    expect(setPrefs).toHaveBeenCalledWith({ defaultSort: "domain" });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("updates ignore pinned tabs preference", async () => {
    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText(/Keep pinned tabs fixed/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText(/Keep pinned tabs fixed/i);
    await user.click(checkbox);

    expect(setPrefs).toHaveBeenCalledWith({ ignorePinned: !DEFAULT_PREFS.ignorePinned });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("adds a new valid regex preset", async () => {
    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
    });

    const labelInput = screen.getByLabelText(/^Label/);
    const patternInput = screen.getByLabelText(/^Pattern/);
    const addButton = screen.getByRole("button", { name: "Add preset" });

    await user.type(labelInput, "My Preset");
    await user.type(patternInput, "test.*");

    await user.click(addButton);

    expect(setPrefs).toHaveBeenCalledWith({
      regexPresets: [
        ...DEFAULT_PREFS.regexPresets,
        { label: "My Preset", source: "test.*", flags: "i" },
      ],
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows an error when adding a preset with an invalid regex", async () => {
    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
    });

    const labelInput = screen.getByLabelText(/^Label/);
    const patternInput = screen.getByLabelText(/^Pattern/);
    const addButton = screen.getByRole("button", { name: "Add preset" });

    await user.type(labelInput, "Invalid Regex");
    await user.type(patternInput, "[[invalid"); // userEvent parses [ as special character, escaping it with [[

    await user.click(addButton);

    // setPrefs should not be called
    expect(setPrefs).not.toHaveBeenCalled();
    expect(
      screen.getByText("Pattern or flags are not a valid regular expression."),
    ).toBeInTheDocument();
  });

  it("deletes a regex preset", async () => {
    const prefsWithPreset = {
      ...DEFAULT_PREFS,
      regexPresets: [{ label: "Delete Me", source: "delete.*", flags: "i" }],
    };
    vi.mocked(getPrefs).mockResolvedValue(prefsWithPreset);

    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("Delete Me")).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteButton);

    expect(setPrefs).toHaveBeenCalledWith({
      regexPresets: [],
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});
