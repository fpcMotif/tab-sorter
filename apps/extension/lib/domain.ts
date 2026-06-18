import type { TabLite } from "./types.ts";

const SCHEME_BUCKET = new Set(["about", "chrome", "edge", "file", "javascript", "data"]);

export function getDomain(url: string): string {
  if (!url) {
    return "(empty)";
  }

  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(":", "");

    if (SCHEME_BUCKET.has(scheme)) {
      return `(${scheme})`;
    }

    if (scheme === "extension") {
      return "(extension)";
    }

    const host = parsed.hostname.toLowerCase();
    if (!host) {
      return `(${scheme})`;
    }

    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "(invalid)";
  }
}

export function getDomainForTab(tab: Pick<TabLite, "url">): string {
  return getDomain(tab.url);
}
