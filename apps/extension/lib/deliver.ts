// Page-context delivery adapters: the popup's clipboard and download side
// effects behind a seam, so the UI never reaches for navigator/URL/Blob
// directly and stays testable through this interface.

export function writeClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadFile(file: { content: string; filename: string; mimeType: string }): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
