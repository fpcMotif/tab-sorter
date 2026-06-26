import { describe, expect, it, vi } from "vitest";

import type { CopyPayload } from "@/lib/copy/types.ts";
import { FileSink } from "./file-download-sink.ts";

const payload: CopyPayload = {
  scope: "tab",
  entries: [
    { title: "Example", url: "https://example.com/", globalSeq: 1 },
    { title: "GitHub", url: "https://github.com/", globalSeq: 2 },
  ],
  rendered: { text: "https://example.com/\nhttps://github.com/" },
};

describe("FileSink", () => {
  it("downloads with a format-derived filename and mime", async () => {
    const triggered: { blob: Blob; filename: string }[] = [];
    const sink = new FileSink("markdown", {
      triggerDownload: async (blob, filename) => {
        triggered.push({ blob, filename });
      },
    });

    await sink.consume(payload);

    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.filename).toBe("tabs-2.md");
    expect(triggered[0]!.blob.type).toBe("text/markdown");
    expect(await triggered[0]!.blob.text()).toBe(
      "https://example.com/\nhttps://github.com/",
    );
  });

  it("derives a .txt download for plain-text formats", async () => {
    const triggered: { blob: Blob; filename: string }[] = [];
    const sink = new FileSink("url", {
      triggerDownload: async (blob, filename) => {
        triggered.push({ blob, filename });
      },
    });

    await sink.consume(payload);

    expect(triggered[0]!.filename).toBe("tabs-2.txt");
    expect(triggered[0]!.blob.type).toBe("text/plain");
  });

  it("throws when the payload has no rendered text", async () => {
    const sink = new FileSink("markdown", {
      triggerDownload: vi.fn(),
    });
    const noRender: CopyPayload = { scope: "tab", entries: [] };
    await expect(sink.consume(noRender)).rejects.toThrow(/rendered/i);
  });
});
