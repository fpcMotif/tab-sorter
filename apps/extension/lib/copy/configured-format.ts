import type { Transforms } from "./types.ts";
import type { Format, FormatId } from "./format.ts";

// Module E contract: opts already applied, whole-object overlay.
export interface ConfiguredFormat {
  id: FormatId;
  label: string;
  transforms: Transforms;
}

// The plaintext fallback id carried by the `link` format's opts.
type LinkOpts = { plaintextFallback: FormatId };

/**
 * Resolve a registry Format + persisted opts into a flat ConfiguredFormat.
 *
 * Opts overlay is a WHOLE-OBJECT replace: when storedOpts is present it
 * fully replaces format.defaultOpts (donor configured-format.ts uses
 * `storedOpts ?? defaultOpts`, never a per-key merge). Parity-critical.
 *
 * getFormatById is injected so `link` can resolve its plaintext fallback
 * format; the fallback id is guarded `!== "link"` to prevent recursion.
 */
export function resolveConfiguredFormat(
  format: Format<any>,
  // Storage boundary: persisted opts are untrusted JSON. This `unknown` is the
  // single acceptable cast point — the storage adapter is the only caller that
  // produces storedOpts, and the whole-object overlay never inspects key shape.
  storedOpts: unknown,
  getFormatById: (id: FormatId) => Format<any>,
): ConfiguredFormat {
  // Whole-object overlay: stored opts replace defaults entirely (NOT a merge).
  // Donor: `(await getFormatOpts(id)) ?? (format as FormatWithOpts).opts`
  const opts = (storedOpts ?? format.defaultOpts) as Record<string, unknown> | undefined;

  const transforms = format.transforms(opts);

  // Link's text channel delegates to a fallback format's text transform.
  // Guard the fallback id against "link" to avoid infinite recursion.
  // Donor format.ts line 715: `formatId && isFormatId(formatId) && formatId !== 'link'`
  if (format.id === "link") {
    const fallbackId = (opts as LinkOpts | undefined)?.plaintextFallback;
    const resolvedFallbackId: FormatId =
      fallbackId && fallbackId !== "link" ? fallbackId : "url";
    const fallbackFormat = getFormatById(resolvedFallbackId);
    transforms.text = fallbackFormat.transforms(fallbackFormat.defaultOpts).text;
  }

  return {
    id: format.id,
    label: format.label(opts),
    transforms,
  } satisfies ConfiguredFormat;
}
