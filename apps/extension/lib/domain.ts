const SPECIAL_SCHEMES = new Set(["about", "chrome", "edge", "file"]);
const EXTENSION_SCHEMES = new Set(["chrome-extension", "moz-extension"]);

export function getDomain(url: string): string {
  const value = url.trim();

  if (!value) {
    return "(unknown)";
  }

  try {
    const parsed = new URL(value);
    const scheme = parsed.protocol.replace(":", "").toLowerCase();

    if (EXTENSION_SCHEMES.has(scheme)) {
      return "(extension)";
    }

    if (SPECIAL_SCHEMES.has(scheme)) {
      return `(${scheme})`;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || `(${scheme || "unknown"})`;
  } catch {
    return "(unknown)";
  }
}
