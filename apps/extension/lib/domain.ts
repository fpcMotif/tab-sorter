const SPECIAL_SCHEME_BUCKETS = new Map([
  ["about:", "(about)"],
  ["chrome:", "(chrome)"],
  ["chrome-extension:", "(extension)"],
  ["edge:", "(edge)"],
  ["file:", "(file)"],
  ["moz-extension:", "(extension)"],
]);

export function getDomain(url: string): string {
  const trimmedUrl = url.trim();

  if (trimmedUrl.length === 0) {
    return "(unknown)";
  }

  try {
    const parsed = new URL(trimmedUrl);
    const specialBucket = SPECIAL_SCHEME_BUCKETS.get(parsed.protocol);

    if (specialBucket !== undefined) {
      return specialBucket;
    }

    const host = parsed.hostname.toLowerCase();

    if (host.length === 0) {
      return `(${parsed.protocol.replace(":", "")})`;
    }

    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "(unknown)";
  }
}
