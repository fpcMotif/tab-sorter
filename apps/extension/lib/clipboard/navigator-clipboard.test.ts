import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeToClipboard } from "./navigator-clipboard.ts";

// Capture what the adapter hands to ClipboardItem / navigator.clipboard.write.
class FakeBlob {
  constructor(
    public parts: string[],
    public options: { type: string },
  ) {}
}

class FakeClipboardItem {
  constructor(public items: Record<string, unknown>) {}
}

const write = vi.fn<(items: unknown[]) => Promise<void>>();

beforeEach(() => {
  write.mockReset();
  write.mockResolvedValue(undefined);
  vi.stubGlobal("Blob", FakeBlob);
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  vi.stubGlobal("navigator", { clipboard: { write } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeToClipboard", () => {
  it("writes a single ClipboardItem with a text/plain Blob", async () => {
    await writeToClipboard({ text: "hello" });

    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0]![0] as FakeClipboardItem[];
    expect(items).toHaveLength(1);
    const blob = items[0]!.items["text/plain"] as FakeBlob;
    expect(blob.parts).toEqual(["hello"]);
    expect(blob.options).toEqual({ type: "text/plain" });
    expect(items[0]!.items["text/html"]).toBeUndefined();
  });

  it("includes a text/html Blob when html is present", async () => {
    await writeToClipboard({ text: "hello", html: "<a>hello</a>" });

    const items = write.mock.calls[0]![0] as FakeClipboardItem[];
    const htmlBlob = items[0]!.items["text/html"] as FakeBlob;
    expect(htmlBlob.parts).toEqual(["<a>hello</a>"]);
    expect(htmlBlob.options).toEqual({ type: "text/html" });
  });

  it("propagates write rejection to the caller", async () => {
    write.mockRejectedValueOnce(new Error("denied"));

    await expect(writeToClipboard({ text: "x" })).rejects.toThrow("denied");
  });
});
