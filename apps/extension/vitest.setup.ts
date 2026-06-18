import "@testing-library/jest-dom";
import { fakeBrowser } from "@webext-core/fake-browser";

// Provide a fake chrome global for code that uses chrome.* directly.
globalThis.chrome = fakeBrowser as unknown as typeof chrome;
