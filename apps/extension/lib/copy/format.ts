import type {
  Hooks,
  TabCtx,
  TabLite,
  Transforms,
  WindowCtx,
} from "@/lib/copy/types.ts";
import { encodeHtml, sentenceCase } from "@/lib/copy/string.ts";

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

// --- format-output helpers (donor format.ts:607-635)

const DEFAULT_LINK_PLAINTEXT_FALLBACK = "url";
const DEFAULT_TITLE_URL_1_LINE_SEPARATOR = ": ";

// donor getNumberedWindowText (format.ts:633-635): `${sentenceCase("window")} N`
function numberedWindowText(seq: number): string {
  return `${sentenceCase("window")} ${seq}`;
}

// donor getTitleUrlText (format.ts:619-625)
function titleUrlText(
  url: string,
  title: string,
  separator = DEFAULT_TITLE_URL_1_LINE_SEPARATOR,
): string {
  return `${title || "(untitled)"}${separator}${url}`;
}

// donor getAnchorTagHtml (format.ts:627-631)
function anchorTagHtml(tab: TabLite): string {
  return tab.url
    ? `<a href="${tab.url}">${encodeHtml(tab.title || tab.url)}</a>`
    : "";
}

// donor urlTextTransform (format.ts:609-617)
const urlTextHooks: Hooks = {
  windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
  tab: ({ tab }: TabCtx) => tab.url,
  tabDelimiter: "\n",
  windowDelimiter: "\n\n",
};

// link delegates its text channel to a fallback builtin (never itself).
// donor getLinkPlaintextFallbackFormat (format.ts:713-719).
function linkTextHooks(plaintextFallback?: string): Hooks {
  const fallbackId =
    plaintextFallback &&
    isFormatId(plaintextFallback) &&
    plaintextFallback !== "link"
      ? plaintextFallback
      : DEFAULT_LINK_PLAINTEXT_FALLBACK;
  return getFormat(fallbackId as FormatId).transforms().text;
}

// --- builtin registry (donor format.ts:49-331)

const builtinFormats: Format<unknown>[] = [
  defineFormat<{ plaintextFallback: string }>({
    id: "link",
    label: () => "Link",
    transforms: (opts) => ({
      text: linkTextHooks(opts?.plaintextFallback),
      html: {
        windowStart: ({ seq }: WindowCtx) =>
          `${numberedWindowText(seq)}<br>\n<br>\n`,
        tab: ({ tab }: TabCtx) => anchorTagHtml(tab),
        tabDelimiter: "<br>\n",
        windowDelimiter: "<br>\n<br>\n",
      },
    }),
    defaultOpts: { plaintextFallback: DEFAULT_LINK_PLAINTEXT_FALLBACK },
  }) as Format<unknown>,

  defineFormat({
    id: "url",
    label: () => "URL",
    transforms: (): Transforms => ({ text: urlTextHooks }),
  }) as Format<unknown>,

  defineFormat<{ separator: string }>({
    id: "titleUrl1Line",
    label: () => "Title: URL",
    transforms: (opts) => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) =>
          titleUrlText(url, title, opts?.separator),
        tabDelimiter: "\n",
        windowDelimiter: "\n\n",
      },
    }),
    defaultOpts: { separator: DEFAULT_TITLE_URL_1_LINE_SEPARATOR },
  }) as Format<unknown>,

  defineFormat({
    id: "titleUrl2Line",
    label: () => "Title & URL",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) => titleUrlText(url, title, "\n"),
        tabDelimiter: "\n\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat({
    id: "title",
    label: () => "Title",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) => title || url,
        tabDelimiter: "\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat({
    id: "markdown",
    label: () => "Markdown",
    transforms: (): Transforms => ({
      text: {
        windowStart: ({ seq }: WindowCtx) => `## ${numberedWindowText(seq)}\n\n`,
        tab: ({ tab: { title, url } }: TabCtx) =>
          `[${(title || url)
            .replace(/\[/g, "\\[")
            .replace(/\]/g, "\\]")}](${url
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")})`,
        tabDelimiter: "\n\n",
        windowDelimiter: "\n\n",
      },
    }),
  }) as Format<unknown>,
];

// --- lookup (donor getFormat, but SOUND: explicit throw instead of `as`)

export function getFormat(id: FormatId): Format {
  const found = builtinFormats.find((f) => f.id === id);
  if (!found) {
    throw new Error(`Unknown format id: ${id}`);
  }
  return found;
}
