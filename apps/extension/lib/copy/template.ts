import { encodeHtml } from "@/lib/copy/string.ts";
import type { TabLite } from "@/lib/copy/types.ts";

// Normalized sources a token value may draw from. `now`/`parsedUrl` are INJECTED
// (deterministic). DEVIATION #5: an unparseable url is passed as `parsedUrl: null`,
// and url tokens emit "" rather than throwing.
export interface TokenValueSources {
  now?: Date;
  tabSeq?: number;
  windowTabSeq?: number;
  windowSeq?: number;
  tabCount?: number;
  windowTabCount?: number;
  windowCount?: number;
  tab?: TabLite;
  parsedUrl?: URL | null;
  formatName?: string;
  representation?: "text" | "html";
}

export interface Token {
  id: string;
  token: string; // inline token text, e.g. "title" for [title]
  aliases?: string[]; // historic alternate token texts
  value: (source: TokenValueSources) => string;
}

export type TemplateFieldId =
  | "start"
  | "windowStart"
  | "tab"
  | "tabDelimiter"
  | "windowEnd"
  | "windowDelimiter"
  | "end";

// Local regex escape (donor util/regex.ts). Kept private so Module B (string.ts)
// need not own it.
function regExEscape(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Stringify with a special case for undefined (donor `stringify`).
function stringify(val: unknown): string {
  return val === undefined ? "" : `${val}`;
}

function encode(
  value: string | null | undefined,
  representation: "text" | "html" = "text",
): string {
  return representation === "html" ? encodeHtml(value ?? "") : (value ?? "");
}

// Donor getAnchorTagHtml, inlined to avoid a template -> format dependency.
function anchorTagHtml(tab: TabLite): string {
  return tab.url ? `<a href="${tab.url}">${encodeHtml(tab.title || tab.url)}</a>` : "";
}

const tokens: Token[] = [
  {
    id: "tab-number",
    token: "t#",
    aliases: ["#", "number", "tab#", "tabnumber", "tab #", "tab number", "tab-#", "tab-number", "tab+#", "tab+number"],
    value: ({ tabSeq }) => stringify(tabSeq),
  },
  {
    id: "window-tab-number",
    token: "wt#",
    // allow undefined windowTabSeq to fall back to tabSeq for scope flexibility
    value: ({ windowTabSeq, tabSeq }) => stringify(windowTabSeq ?? tabSeq),
  },
  {
    id: "window-number",
    token: "w#",
    value: ({ windowSeq }) => stringify(windowSeq),
  },
  {
    id: "tab-count",
    token: "tcount",
    aliases: ["count"],
    value: ({ tabCount }) => stringify(tabCount),
  },
  {
    id: "window-tab-count",
    token: "wtcount",
    value: ({ windowTabCount }) => stringify(windowTabCount),
  },
  {
    id: "window-count",
    token: "wcount",
    value: ({ windowCount }) => stringify(windowCount),
  },
  {
    id: "tab-title",
    token: "title",
    value: ({ tab, representation }) => encode(tab?.title, representation),
  },
  {
    id: "tab-url",
    token: "url",
    value: ({ tab, representation }) => encode(tab?.url, representation),
  },
  {
    id: "tab-link",
    token: "link",
    value: ({ tab, representation }) =>
      tab ? (representation === "html" ? anchorTagHtml(tab) : (tab.url ?? "")) : "",
  },
  {
    id: "tab-icon",
    token: "icon",
    value: ({ tab, representation }) => encode(tab?.favIconUrl, representation),
  },
  {
    id: "tab-url-schema",
    token: "schema",
    aliases: ["protocol"],
    // DEVIATION #5: parsedUrl is null when URL is unparseable -> emit ""
    value: ({ parsedUrl }) => parsedUrl?.protocol.replace(/:$/, "") ?? "",
  },
  {
    id: "tab-url-host",
    token: "host",
    value: ({ parsedUrl, representation }) => encode(parsedUrl?.host, representation),
  },
  {
    id: "tab-url-path",
    token: "path",
    value: ({ parsedUrl, representation }) =>
      encode(parsedUrl?.pathname.replace(/^\//, ""), representation),
  },
  {
    id: "tab-url-query",
    token: "query",
    value: ({ parsedUrl, representation }) =>
      encode(parsedUrl?.search.replace(/^\?/, ""), representation),
  },
  {
    id: "tab-url-hash",
    token: "hash",
    value: ({ parsedUrl, representation }) =>
      encode(parsedUrl?.hash.replace(/^#/, ""), representation),
  },
  {
    id: "date",
    token: "date",
    value: ({ now, representation }) => encode(now?.toLocaleDateString(), representation),
  },
  {
    id: "time",
    token: "time",
    value: ({ now, representation }) => encode(now?.toLocaleTimeString(), representation),
  },
  {
    id: "date-time",
    token: "date+time",
    aliases: ["datetime", "date time", "date-time"],
    value: ({ now, representation }) => encode(now?.toLocaleString(), representation),
  },
  {
    id: "newline",
    token: "n",
    aliases: ["newline"],
    value: ({ representation }) => (representation === "html" ? "<br>\n" : "\n"),
  },
  {
    id: "tabulator",
    token: "t",
    aliases: ["tab"],
    value: ({ representation }) => (representation === "html" ? "&#9;" : "\t"),
  },
  {
    id: "format-name",
    token: "fname",
    aliases: ["formatname", "format name", "format-name", "format+name"],
    value: ({ formatName, representation }) => encode(formatName, representation),
  },
];

// Creates a regex matching a token (incl. aliases) inside brackets, tolerating
// surrounding whitespace. Donor makeTokenRegExp.
function makeTokenRegExp(token: Token): RegExp {
  const alternation = [token.token, ...(token.aliases ?? [])].map(regExEscape).join("|");
  return new RegExp(`\\[(\\s*(${alternation})\\s*)]`, "g");
}

interface TokenWithRegex extends Token {
  regex: RegExp;
}

// Pre-compute regex for each token (donor optimization).
const tokensWithRegex: TokenWithRegex[] = tokens.map((token) => ({
  ...token,
  regex: makeTokenRegExp(token),
}));

function byId(id: string): TokenWithRegex {
  const token = tokensWithRegex.find((t) => t.id === id);
  if (!token) throw new Error(`unknown token id: ${id}`);
  return token;
}

function select(...ids: string[]): TokenWithRegex[] {
  return ids.map(byId);
}

export interface TemplateField {
  id: TemplateFieldId;
  tokens: TokenWithRegex[];
}

// 7 fields with per-field token allow-lists (donor templateFields).
// Tokens NOT in a field's allow-list survive LITERALLY as [token] — the
// reduce loop only processes the listed tokens.
export const TEMPLATE_FIELDS: TemplateField[] = [
  {
    id: "start",
    tokens: select(
      "tab-count",
      "window-count",
      "date",
      "time",
      "date-time",
      "newline",
      "tabulator",
      "format-name",
    ),
  },
  {
    id: "windowStart",
    tokens: select(
      "window-number",
      "window-count",
      "window-tab-count",
      "newline",
      "tabulator",
    ),
  },
  {
    id: "tab",
    tokens: select(
      "tab-title",
      "tab-url",
      "tab-icon",
      "tab-link",
      "tab-url-schema",
      "tab-url-host",
      "tab-url-path",
      "tab-url-query",
      "tab-url-hash",
      "tab-number",
      "window-tab-number",
      "window-number",
      "window-count",
      "date",
      "time",
      "date-time",
      "newline",
      "tabulator",
    ),
  },
  {
    id: "tabDelimiter",
    tokens: select("newline", "tabulator"),
  },
  {
    id: "windowEnd",
    tokens: select(
      "window-number",
      "window-count",
      "window-tab-count",
      "newline",
      "tabulator",
    ),
  },
  {
    id: "windowDelimiter",
    tokens: select("newline", "tabulator"),
  },
  {
    id: "end",
    tokens: select(
      "tab-count",
      "window-count",
      "date",
      "time",
      "date-time",
      "newline",
      "tabulator",
      "format-name",
    ),
  },
];

export function getFieldTokens(fieldId: TemplateFieldId): TokenWithRegex[] {
  return TEMPLATE_FIELDS.find((f) => f.id === fieldId)?.tokens ?? [];
}

// Interpolates the field's template string: starting from template[fieldId],
// replaces each allow-listed token with its value. Tokens NOT in the field's
// allow-list are never matched, so they survive literally as [token].
// Donor `interpolate` (format.ts:688-699).
export function interpolate(
  fieldId: TemplateFieldId,
  template: Record<TemplateFieldId, string> | undefined,
  sources: TokenValueSources = {},
): string {
  if (!template) return "";

  return getFieldTokens(fieldId).reduce(
    (acc, token) => acc.replace(token.regex, token.value(sources)),
    template[fieldId] ?? "",
  );
}
