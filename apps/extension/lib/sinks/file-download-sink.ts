import type { FormatId } from "@/lib/copy/format.ts";
import type { CopyPayload } from "@/lib/copy/types.ts";
import { deriveFileMeta } from "./file-meta.ts";
import type { Sink } from "./sink.ts";

// Injected so the pure derivation is unit-testable without a DOM. The default
// uses the browser download path (Blob URL + transient anchor click).
export type TriggerDownload = (blob: Blob, filename: string) => Promise<void>;

const defaultTriggerDownload: TriggerDownload = async (blob, filename) => {
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export interface FileSinkDeps {
  triggerDownload?: TriggerDownload;
}

// DEVIATION #7: donor-parity render() output (payload.rendered.text) is the
// canonical file content. The legacy domain-grouped Markdown in lib/export.ts is
// demoted to a future opt and is no longer the default file body.
export class FileSink implements Sink {
  private readonly triggerDownload: TriggerDownload;

  constructor(
    private readonly formatId: FormatId,
    deps: FileSinkDeps = {},
  ) {
    this.triggerDownload = deps.triggerDownload ?? defaultTriggerDownload;
  }

  async consume(payload: CopyPayload): Promise<void> {
    if (payload.rendered === undefined) {
      throw new Error("FileSink requires a rendered payload");
    }

    const tabCount = payload.entries.length;
    const { filename, mimeType } = deriveFileMeta(this.formatId, tabCount);
    const blob = new Blob([payload.rendered.text], { type: mimeType });

    await this.triggerDownload(blob, filename);
  }
}
