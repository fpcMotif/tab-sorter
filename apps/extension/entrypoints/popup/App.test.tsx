import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFS } from "@tab-sorter/core/types";

import App from "./App";

const mocks = vi.hoisted(() => ({
  getPopupData: vi.fn(),
  getSelectedTabs: vi.fn(),
  getAllWindowsExtract: vi.fn(),
  requestMutation: vi.fn(),
}));

vi.mock("@/lib/window-queries", () => ({
  getPopupData: mocks.getPopupData,
  getSelectedTabs: mocks.getSelectedTabs,
  getAllWindowsExtract: mocks.getAllWindowsExtract,
}));

vi.mock("@/lib/runtime", () => ({
  requestMutation: mocks.requestMutation,
}));

function popupData(totalTabs: number, canUndo = false, windowCount = 1) {
  return {
    windowId: 42,
    domainGroups: [],
    prefs: DEFAULT_PREFS,
    tabs: [],
    totalTabs,
    duplicateCount: 0,
    windowCount,
    canUndo,
    recoveryRequired: false,
  };
}

describe("popup mutation routing", () => {
  beforeEach(() => {
    mocks.getPopupData.mockReset();
    mocks.getSelectedTabs.mockReset();
    mocks.getAllWindowsExtract.mockReset();
    mocks.requestMutation.mockReset();
  });

  it("keeps Undo visible for a one-tab window", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(1, true));

    render(<App />);

    expect(await screen.findByRole("button", { name: /undo/i })).toBeVisible();
  });

  it("sends the viewed window id with a mutation intent", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(2));
    mocks.requestMutation.mockResolvedValue({
      type: "tidy",
      changed: false,
      moved: 0,
      grouped: 0,
      groupsCreated: 0,
      createdGroups: [],
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /tidy this window/i }));

    await waitFor(() => {
      expect(mocks.requestMutation).toHaveBeenCalledWith({ type: "tidy", windowId: 42 });
    });
  });

  it("offers recovery and blocks a new mutation while recovery is pending", async () => {
    mocks.getPopupData.mockResolvedValue({
      ...popupData(2, true),
      recoveryRequired: true,
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: /recover/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /tidy this window/i })).toBeDisabled();
  });

  it("hides the scope toggle when only one window is open", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(3, false, 1));

    render(<App />);
    await screen.findByRole("button", { name: /tidy this window/i });

    expect(screen.queryByRole("button", { name: "All windows" })).toBeNull();
  });

  it("shows the scope toggle when more than one window is open", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(3, false, 2));

    render(<App />);

    expect(await screen.findByRole("button", { name: "All windows" })).toBeVisible();
    expect(screen.getByRole("button", { name: "This window" })).toBeVisible();
  });

  it("lazily loads cross-window domain counts when switched to all windows", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(3, false, 2));
    mocks.getAllWindowsExtract.mockResolvedValue({
      domainGroups: [{ domain: "github.com", count: 5, tabIds: [1, 2, 3, 4, 5] }],
      tabs: [],
      windowCount: 2,
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "All windows" }));

    expect(await screen.findByText("github.com")).toBeVisible();
    expect(screen.getByText("5")).toBeVisible();
    expect(mocks.getAllWindowsExtract).toHaveBeenCalledTimes(1);
  });

  it("summarizes an all-windows extract and offers the new window without auto-closing", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(3, false, 2));
    mocks.getAllWindowsExtract.mockResolvedValue({
      domainGroups: [{ domain: "github.com", count: 5, tabIds: [1, 2, 3, 4, 5] }],
      tabs: [],
      windowCount: 2,
    });
    mocks.requestMutation.mockResolvedValue({
      type: "extract",
      changed: true,
      moved: 5,
      windowsAffected: 2,
      newWindowId: 900,
    });
    const close = vi.spyOn(window, "close").mockImplementation(() => {});

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "All windows" }));
    fireEvent.click(await screen.findByRole("button", { name: /github\.com/i }));

    expect(
      await screen.findByText(/Moved 5 tabs from 2 windows into a new window\./i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /show new window/i })).toBeVisible();
    expect(mocks.requestMutation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "extract", windowId: 42, scope: "all" }),
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("shows the named block message when another window needs recovery", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(3, false, 2));
    mocks.getAllWindowsExtract.mockResolvedValue({
      domainGroups: [{ domain: "github.com", count: 2, tabIds: [1, 2] }],
      tabs: [],
      windowCount: 2,
    });
    mocks.requestMutation.mockRejectedValue(
      Object.assign(new Error("The window showing “CI · Actions” has an unfinished change."), {
        code: "RECOVERY_REQUIRED",
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "All windows" }));
    fireEvent.click(await screen.findByRole("button", { name: /github\.com/i }));

    expect(await screen.findByText(/CI · Actions/)).toBeVisible();
  });

  it("defaults to all windows when the current window is trivial but others are open", async () => {
    mocks.getPopupData.mockResolvedValue(popupData(1, false, 3));
    mocks.getAllWindowsExtract.mockResolvedValue({
      domainGroups: [{ domain: "github.com", count: 4, tabIds: [1, 2, 3, 4] }],
      tabs: [],
      windowCount: 3,
    });

    render(<App />);

    await waitFor(() => expect(mocks.getAllWindowsExtract).toHaveBeenCalled());
    expect(await screen.findByText("github.com")).toBeVisible();
  });
});
