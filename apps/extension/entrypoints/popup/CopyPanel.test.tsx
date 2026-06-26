/**
 * Smoke test for CopyPanel.
 *
 * Mocks getCopyPopupData and runCopy so the component can render and respond
 * without real browser / clipboard APIs.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/orchestration", () => ({
  getCopyPopupData: vi.fn(),
  runCopy: vi.fn(),
}));

vi.mock("@/lib/sinks/clipboard-sink", () => {
  class ClipboardSink {
    consume() {
      return Promise.resolve();
    }
  }
  return { ClipboardSink };
});

import { getCopyPopupData, runCopy } from "@/lib/orchestration";
import { CopyPanel } from "./CopyPanel";

const mockGetCopyPopupData = getCopyPopupData as ReturnType<typeof vi.fn>;
const mockRunCopy = runCopy as ReturnType<typeof vi.fn>;

const STUB_DATA = {
  scopes: [
    { id: "highlighted-tabs", label: "Highlighted", count: 2 },
    { id: "window-tabs", label: "This window", count: 10 },
    { id: "all-tabs", label: "All tabs", count: 20 },
    { id: "all-windows-and-tabs", label: "All windows", count: 35 },
  ],
  formats: [
    { id: "link", label: "Link", description: "Clickable links · rich HTML", isDefault: true },
    { id: "url", label: "URL", description: undefined, isDefault: false },
    { id: "markdown", label: "Markdown", description: undefined, isDefault: false },
  ],
  defaultFormatId: "link",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CopyPanel", () => {
  beforeEach(() => {
    mockGetCopyPopupData.mockResolvedValue(STUB_DATA);
    mockRunCopy.mockResolvedValue({ count: 10 });
  });

  it("renders all scope tiles from getCopyPopupData", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("radio", { name: /This window/i }));

    expect(screen.getByRole("radio", { name: /Highlighted/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /All tabs/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /All windows/i })).toBeDefined();
  });

  it("renders all format rows from getCopyPopupData", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("radio", { name: /Link/i }));

    expect(screen.getByRole("radio", { name: /URL/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /Markdown/i })).toBeDefined();
  });

  it("shows Default pill on the default format", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByText("Default"));

    const linkRow = screen.getByRole("radio", { name: /Link/i });
    expect(linkRow.getAttribute("aria-checked")).toBe("true");
  });

  it("selects window-tabs scope by default", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("radio", { name: /This window/i }));

    expect(
      screen.getByRole("radio", { name: /This window/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("footer button shows count + format label", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("button", { name: /Copy 10 tabs as Link/i }));
  });

  it("clicking a scope tile updates the footer button", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("radio", { name: /Highlighted/i }));

    act(() => fireEvent.click(screen.getByRole("radio", { name: /Highlighted/i })));

    await waitFor(() =>
      screen.getByRole("button", { name: /Copy 2 tabs as Link/i }),
    );
  });

  it("clicking a format row updates footer button label", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("radio", { name: /Markdown/i }));

    act(() => fireEvent.click(screen.getByRole("radio", { name: /Markdown/i })));

    await waitFor(() =>
      screen.getByRole("button", { name: /Copy 10 tabs as Markdown/i }),
    );
  });

  it("clicking copy button calls runCopy and shows success status", async () => {
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("button", { name: /Copy 10 tabs as Link/i }));

    act(() =>
      fireEvent.click(screen.getByRole("button", { name: /Copy 10 tabs as Link/i })),
    );

    await waitFor(() => {
      expect(mockRunCopy).toHaveBeenCalledWith("window-tabs", "link", expect.any(Object));
      expect(screen.getByText(/Copied 10 tabs/i)).toBeDefined();
    });
  });

  it("shows error status when runCopy rejects", async () => {
    mockRunCopy.mockRejectedValueOnce(new Error("clipboard denied"));
    render(<CopyPanel />);
    await waitFor(() => screen.getByRole("button", { name: /Copy 10 tabs as Link/i }));

    act(() =>
      fireEvent.click(screen.getByRole("button", { name: /Copy 10 tabs as Link/i })),
    );

    await waitFor(() => screen.getByText(/Copy failed/i));
  });
});
