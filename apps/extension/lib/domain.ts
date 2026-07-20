import { GROUP_COLORS } from "@tab-sorter/core/types";
import type { GroupColor } from "@tab-sorter/core/types";

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

    // A fully-qualified `example.com.` and a bare `example.com` are the same site;
    // drop the root-zone trailing dot so they share one group.
    const rooted = host.length > 1 && host.endsWith(".") ? host.slice(0, -1) : host;

    return rooted.startsWith("www.") ? rooted.slice(4) : rooted;
  } catch {
    return "(unknown)";
  }
}

// Deterministic domain -> palette color, so the same domain always gets the
// same swatch across tidy runs (a djb2 string hash needs no shared state or
// storage). Collisions across the 9-color palette are expected and accepted
// per the PRD ("Many domains > 9 colors" — title disambiguates).
export function assignColor(domain: string): GroupColor {
  let hash = 5381;

  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 33 + domain.charCodeAt(i)) | 0;
  }

  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]!;
}
