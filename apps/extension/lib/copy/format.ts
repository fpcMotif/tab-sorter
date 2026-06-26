import type {
  Hooks,
  StartCtx,
  TabCtx,
  TabLite,
  Transforms,
  WindowCtx,
} from "@/lib/copy/types.ts";
import { encodeHtml, indent, sentenceCase } from "@/lib/copy/string.ts";
import { stringifyCSVRow } from "@/lib/copy/csv.ts";

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

// Registry helper: infers O from defaultOpts so each format's label/transforms/
// isInvalid callbacks get a typed `opts` (the deliberate improvement over the
// donor's `Record<string, any>`). When a callback is invoked with no opts it
// substitutes `defaultOpts`, mirroring the donor pipeline where opts are always
// resolved (via getConfiguredFormat) before transforms run — so a bare
// `getFormat(id).transforms()` reflects the format's defaults. `id` and
// `defaultOpts` pass through unchanged.
export function defineFormat<O>(spec: Format<O>): Format<O> {
  if (spec.defaultOpts === undefined) return spec;

  const orElseDefault = (opts: O | undefined): O | undefined =>
    opts ?? spec.defaultOpts;

  return {
    ...spec,
    label: (opts?: O) => spec.label(orElseDefault(opts)),
    transforms: (opts?: O) => spec.transforms(orElseDefault(opts)),
    ...(spec.description && {
      description: (opts?: O) => spec.description!(orElseDefault(opts)),
    }),
    ...(spec.isInvalid && {
      isInvalid: (opts: O) => spec.isInvalid!(orElseDefault(opts) as O),
    }),
  };
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

// --- structured-format helpers (donor format.ts:637-686)

const DEFAULT_INDENT_SIZE = 2;
export const MAX_INDENT_SIZE = 10; // matches JSON.stringify() max

// donor parseIndent (format.ts:680-686): int in [1,10] else undefined
export function parseIndent(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  if (n && n <= MAX_INDENT_SIZE && n >= 1) return n;
  return undefined;
}

// donor wrap/list (format.ts:671-677)
function wrapTag(text: string, tag: string, contentIndent: number): string {
  return `<${tag}>\n${indent(text, contentIndent)}\n</${tag}>`;
}
function joinTruthy(...args: (string | null)[]): string {
  return args.filter(Boolean).join("\n");
}

// donor getHtmlTableHeaderHtml (format.ts:637-652)
function htmlTableHeaderHtml(
  scope: "tab" | "window",
  contentIndent: number,
): string {
  return wrapTag(
    wrapTag(
      joinTruthy(
        scope === "window" ? "<th>Window</th>" : null,
        "<th>Title</th>",
        "<th>URL</th>",
      ),
      "tr",
      contentIndent,
    ),
    "thead",
    contentIndent,
  );
}

// donor getHtmlTableTabHtml (format.ts:654-669)
function htmlTableTabHtml(
  title: string,
  url: string,
  windowSeq: number | undefined,
  contentIndent: number,
): string {
  return wrapTag(
    joinTruthy(
      windowSeq ? `<td>${numberedWindowText(windowSeq)}</td>` : null,
      `<td>${title || ""}</td>`,
      `<td>${url || ""}</td>`,
    ),
    "tr",
    contentIndent,
  );
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

  defineFormat({
    id: "csv",
    label: () => "CSV",
    transforms: (): Transforms => ({
      text: {
        // donor format.ts:189-190
        start: ({ scope, tabCount }: StartCtx) =>
          tabCount ? `${scope === "window" ? "Window," : ""}Title,URL\n` : "",
        // donor format.ts:192-204
        tab: ({ tab: { title, url }, windowSeq }: TabCtx) =>
          stringifyCSVRow(
            [
              windowSeq ? numberedWindowText(windowSeq) : undefined,
              title || null,
              url,
            ].filter((item) => item !== undefined),
          ),
        tabDelimiter: "\n",
        windowDelimiter: "\n",
      },
    }),
  }) as Format<unknown>,

  defineFormat<{
    properties: ("title" | "url" | "favIconUrl")[];
    pretty: boolean;
    indent: string;
  }>({
    id: "json",
    label: () => "JSON",
    transforms: (opts) => {
      const newline = opts?.pretty ? "\n" : "";
      const indentSize = opts?.pretty
        ? parseIndent(opts.indent) || DEFAULT_INDENT_SIZE
        : 0;
      const noProperties = !opts?.properties?.length;
      const wants = (key: "title" | "url" | "favIconUrl") =>
        noProperties || (opts?.properties ?? []).includes(key);
      return {
        text: {
          // donor format.ts:224-268
          start: () => "[",
          windowStart: ({ seq }: WindowCtx) =>
            `${newline}${indent(
              JSON.stringify(
                { title: numberedWindowText(seq), tabs: [] },
                undefined,
                indentSize,
              ).replace(/\[\][\s\n]*\}$/, "["),
              indentSize,
            )}`,
          tab: ({ tab: { title, url, favIconUrl }, windowSeq }: TabCtx) =>
            `${newline}${indent(
              JSON.stringify(
                {
                  ...(title && wants("title") ? { title } : null),
                  ...(url && wants("url") ? { url } : null),
                  ...(favIconUrl && wants("favIconUrl") ? { favIconUrl } : null),
                },
                undefined,
                indentSize,
              ),
              windowSeq ? indentSize * 3 : indentSize,
            )}`,
          tabDelimiter: ",",
          windowEnd: () =>
            `${newline}${indent("]", indentSize * 2)}${newline}${indent(
              "}",
              indentSize,
            )}`,
          windowDelimiter: ",",
          end: ({ tabCount }: StartCtx) => `${tabCount ? newline : ""}]`,
        },
      };
    },
    defaultOpts: {
      properties: ["title", "url"],
      pretty: true,
      indent: `${DEFAULT_INDENT_SIZE}`,
    },
    // donor format.ts:286
    isInvalid: (opts) => !!opts.pretty && !parseIndent(opts.indent),
  }) as Format<unknown>,

  defineFormat<{ includeHeader: boolean }>({
    id: "htmlTable",
    label: () => "HTML table",
    transforms: (opts) => ({
      text: {
        // donor format.ts:310-324
        start: ({ scope, tabCount }: StartCtx) =>
          tabCount
            ? `<table>\n${
                opts?.includeHeader
                  ? `${indent(
                      htmlTableHeaderHtml(scope, DEFAULT_INDENT_SIZE),
                      DEFAULT_INDENT_SIZE,
                    )}\n`
                  : ""
              }${indent("<tbody>", DEFAULT_INDENT_SIZE)}\n`
            : "",
        tab: ({ tab: { title, url }, windowSeq }: TabCtx) =>
          `${indent(
            htmlTableTabHtml(title, url, windowSeq, DEFAULT_INDENT_SIZE),
            DEFAULT_INDENT_SIZE * 2,
          )}\n`,
        end: ({ tabCount }: StartCtx) =>
          tabCount ? `${indent("</tbody>", DEFAULT_INDENT_SIZE)}\n</table>` : "",
      },
    }),
    defaultOpts: { includeHeader: false },
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
