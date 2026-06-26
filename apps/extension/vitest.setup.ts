import "@testing-library/jest-dom";
import { fakeBrowser } from "@webext-core/fake-browser";

// Provide a fake chrome global for code that uses chrome.* directly.
globalThis.chrome = fakeBrowser as unknown as typeof chrome;

// jsdom's Blob (used in the test environment) does not implement the
// Blob.prototype.text() method that the WHATWG spec and modern browsers provide.
// Polyfill it so FileSink tests can read blob content via `.text()`.
if (typeof Blob !== "undefined" && !("text" in Blob.prototype)) {
  (Blob.prototype as { text?: () => Promise<string> }).text = function (
    this: Blob,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
