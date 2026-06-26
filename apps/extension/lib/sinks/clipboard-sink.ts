import { writeToClipboard } from "@/lib/clipboard/navigator-clipboard.ts";
import type { CopyPayload } from "@/lib/copy/types.ts";
import type { Sink } from "./sink.ts";

export class ClipboardSink implements Sink {
  async consume(payload: CopyPayload): Promise<void> {
    if (payload.rendered === undefined) {
      throw new Error("ClipboardSink requires a rendered payload (clipboard requires rendered output)");
    }

    await writeToClipboard(payload.rendered);
  }
}
