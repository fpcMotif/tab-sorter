import type { Rendered } from "@/lib/copy/types.ts";

import { buildClipboardItem } from "./clipboard-item.ts";

// Popup / focused-document write path only. The service worker must NOT call
// this — navigator.clipboard.write fails silently when unfocused (see design
// §4.3); the background path goes through the offscreen client (Module M2).
export async function writeToClipboard(rendered: Rendered): Promise<void> {
  const parts = buildClipboardItem(rendered);

  const items: Record<string, Blob> = {};
  for (const part of parts) {
    items[part.mimeType] = new Blob([part.data], { type: part.mimeType });
  }

  await navigator.clipboard.write([new ClipboardItem(items)]);
}
