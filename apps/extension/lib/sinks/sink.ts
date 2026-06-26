import type { CopyPayload } from "@/lib/copy/types.ts";

// The core seam (spec §4.2): one method. String sinks read payload.rendered;
// record sinks (sub-project B) read payload.entries / payload.windows.
export interface Sink {
  consume(payload: CopyPayload): Promise<void>;
}
