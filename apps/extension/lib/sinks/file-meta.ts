import type { FormatId } from "@/lib/copy/format.ts";

export interface FileMeta {
  filename: string;
  extension: string;
  mimeType: string;
}

// Target-native derivation (donor is clipboard-only). Extension/mime map ports
// the target lib/export.ts pairing (markdown -> md/text/markdown) and extends it
// to the full builtin format set. Markup formats use the donor's text/html mime
// (tab-copy-master/src/util/clipboard.ts); everything else defaults to plain text.
function metaForFormat(id: string): { extension: string; mimeType: string } {
  if (id === "markdown") return { extension: "md", mimeType: "text/markdown" };
  if (id === "csv") return { extension: "csv", mimeType: "text/csv" };
  if (id === "json") return { extension: "json", mimeType: "application/json" };
  if (id === "html" || id === "htmlTable") return { extension: "html", mimeType: "text/html" };
  return { extension: "txt", mimeType: "text/plain" };
}

export function deriveFileMeta(id: FormatId | (string & {}), tabCount: number): FileMeta {
  const { extension, mimeType } = metaForFormat(id);

  return {
    filename: `tabs-${tabCount}.${extension}`,
    extension,
    mimeType,
  };
}
