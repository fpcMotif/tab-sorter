import { describe, expect, it, vi } from "vitest";

import type { CopyPayload, Rendered } from "@/lib/copy/types.ts";

vi.mock("@/lib/clipboard/navigator-clipboard.ts", () => ({
  writeToClipboard: vi.fn(async (_rendered: Rendered) => {}),
}));

import { writeToClipboard } from "@/lib/clipboard/navigator-clipboard.ts";
import { ClipboardSink } from "./clipboard-sink.ts";

const rendered: Rendered = { text: "https://example.com/", html: "<a>x</a>" };

const tabPayload: CopyPayload = {
  scope: "tab",
  entries: [{ title: "Example", url: "https://example.com/", globalSeq: 1 }],
  rendered,
};

describe("ClipboardSink", () => {
  it("forwards payload.rendered to the navigator-clipboard adapter", async () => {
    const sink = new ClipboardSink();
    await sink.consume(tabPayload);
    expect(writeToClipboard).toHaveBeenCalledWith(rendered);
  });

  it("throws when the payload has no rendered channel (string sinks require it)", async () => {
    const sink = new ClipboardSink();
    const noRender: CopyPayload = { scope: "tab", entries: [] };
    await expect(sink.consume(noRender)).rejects.toThrow(/rendered/i);
  });
});
