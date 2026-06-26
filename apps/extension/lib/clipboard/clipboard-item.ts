import type { Rendered } from "@/lib/copy/types.ts";

// A pure description of one clipboard representation: a mime type mapped to its
// string payload. The adapter (navigator-clipboard.ts) turns these into Blobs.
export interface ClipboardPart {
  mimeType: string;
  data: string;
}

// Mirrors the donor's `clipboardWrite` mime map (text/plain always; text/html
// only when html is present), minus the dropped nxs web custom format.
export function buildClipboardItem(rendered: Rendered): ClipboardPart[] {
  const parts: ClipboardPart[] = [{ mimeType: "text/plain", data: rendered.text }];
  if (rendered.html) {
    parts.push({ mimeType: "text/html", data: rendered.html });
  }
  return parts;
}
