import type { TabCtx, Transforms } from "@/lib/copy/types.ts";
import { sentenceCase } from "@/lib/copy/string.ts";

// --- Format type machinery (donor: tab-copy-master/src/format.ts Format<T>, but
// O is INFERRED from defaultOpts via defineFormat so callbacks are typed — removes
// donor `Record<string, any>` + ~8 `as` casts; deviation log #4, compile-time only).

export type Format<O = unknown> = {
  id: FormatId;
  label(opts?: O): string;
  description?(opts?: O): string;
  transforms(opts?: O): Transforms;
  defaultOpts?: O;
  isInvalid?(opts: O): boolean;
};

// identity helper: returns the spec unchanged, inferring O from defaultOpts (or
// from the callback param types when no defaultOpts is present).
export function defineFormat<O>(spec: Format<O>): Format<O> {
  return spec;
}

// Builtin ids are the keys of the registry, filled in by later tasks. Seeded with
// a single trivial `url` format so the registry/guards are exercisable now.
const builtinFormats: Format<unknown>[] = [
  defineFormat({
    id: "url" as FormatId,
    label: () => "URL",
    transforms: (): Transforms => ({
      text: {
        tab: ({ tab }: TabCtx) => tab.url,
      },
    }),
  }),
];

// donor: FormatId = builtin ids | `custom-${string}`
export type BuiltinFormatId =
  | "link"
  | "url"
  | "titleUrl1Line"
  | "titleUrl2Line"
  | "title"
  | "markdown"
  | "csv"
  | "json"
  | "htmlTable";

// The canonical catalog of builtin ids. `isFormatId` validates against this
// (not the runtime `builtinFormats` registry) so the guard is complete even
// while later sub-tasks (D2/D3) are still seeding the registry array.
export const BUILTIN_FORMAT_IDS = [
  "link",
  "url",
  "titleUrl1Line",
  "titleUrl2Line",
  "title",
  "markdown",
  "csv",
  "json",
  "htmlTable",
] as const satisfies readonly BuiltinFormatId[];
export type CustomFormatId = `custom-${string}`;
export type FormatId = BuiltinFormatId | CustomFormatId;

// donor: FormatOpts is a key-remapped mapped type; opts-less builtins map to
// `?: undefined`. Filled out as builtins land; declared here for downstream modules.
export type FormatOpts = {
  link: { plaintextFallback: string };
  titleUrl1Line: { separator: string };
  json: {
    properties: ("title" | "url" | "favIconUrl")[];
    pretty: boolean;
    indent: string;
  };
  htmlTable: { includeHeader: boolean };
  url?: undefined;
  titleUrl2Line?: undefined;
  title?: undefined;
  markdown?: undefined;
  csv?: undefined;
} & { [k: CustomFormatId]: { name: string; template: Record<string, string> } };

// --- guards (donor isFormatId / isCustomFormatId)

export function isCustomFormatId(id: string): id is CustomFormatId {
  return id.startsWith("custom-");
}

export function isFormatId(id: string): id is FormatId {
  return (
    isCustomFormatId(id) ||
    (BUILTIN_FORMAT_IDS as readonly string[]).includes(id)
  );
}

// --- lookup (donor getFormat, but SOUND: explicit throw instead of `as`)

export function getFormat(id: FormatId): Format {
  const found = builtinFormats.find((f) => f.id === id);
  if (!found) {
    throw new Error(`Unknown format id: ${id}`);
  }
  return found;
}

// keep sentenceCase referenced for later tasks (label helpers); re-export for D2/D3.
export { sentenceCase };
