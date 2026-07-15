import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadFile, writeClipboard } from "./deliver";

describe("writeClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes text through navigator.clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(writeClipboard("hello")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});

describe("downloadFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds a blob url, clicks a download anchor, and revokes the url", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadFile({ content: "body", filename: "tab-sorter-export.md", mimeType: "text/markdown" });

    expect(createElement).toHaveBeenCalledWith("a");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe("text/markdown");
    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("tab-sorter-export.md");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
