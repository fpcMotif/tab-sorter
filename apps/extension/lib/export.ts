import { getDomain } from "./domain.ts";
import type { ClipboardFormat, ExportEntry, ExportFormat, TabLite } from "./types.ts";

// A raw line break is not representable in a real URL, yet a malformed tab URL
// (e.g. a multi-line `data:` URL) can carry one. Strip CR/LF once at the entry
// boundary so no downstream format emits a broken multi-line URL: line-oriented
// output stays one-URL-per-line and the markdown angle form stays well-formed.
function sanitizeUrl(url: string): string {
  return url.replace(/[\r\n]+/g, "");
}

export function buildExportEntries(tabs: TabLite[]): ExportEntry[] {
  return tabs.map((tab) => {
    const url = sanitizeUrl(tab.url);

    return {
      title: tab.title,
      url,
      domain: getDomain(url),
    };
  });
}

function groupEntriesByDomain(entries: ExportEntry[]): Map<string, ExportEntry[]> {
  const grouped = new Map<string, ExportEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.domain) ?? [];
    list.push(entry);
    grouped.set(entry.domain, list);
  }
  return grouped;
}

function formatPlainText(entries: ExportEntry[]): string {
  if (entries.length === 0) {
    return "No tabs to export.\n";
  }

  const lines: string[] = [`Exported ${entries.length} tab(s)`, ""];
  const grouped = groupEntriesByDomain(entries);

  for (const [domain, list] of [...grouped.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${domain}`);
    for (const entry of list) {
      lines.push(entry.url);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// A title is a single markdown list item, so newlines would split it and
// brackets would read as link syntax. Collapse the former, escape the latter.
function escapeLinkText(title: string): string {
  return title.replace(/[\r\n]+/g, " ").replace(/[[\]]/g, (bracket) => `\\${bracket}`);
}

// A bare `](url)` breaks when the URL holds `(`, `)`, or whitespace (e.g.
// `…/Tab_(interface)`); CommonMark's angle-bracket form tolerates them — but a
// raw `<`/`>` inside that form would close the destination early, so
// backslash-escape those two delimiters. (Line endings are already stripped
// upstream in sanitizeUrl, which the angle form also forbids.)
function escapeLinkUrl(url: string): string {
  return /[\s()]/.test(url) ? `<${url.replace(/[<>]/g, (bracket) => `\\${bracket}`)}>` : url;
}

function formatMarkdown(entries: ExportEntry[]): string {
  if (entries.length === 0) {
    return "# Exported tabs\n\nNo tabs to export.\n";
  }

  const lines: string[] = ["# Exported tabs", "", `Total: ${entries.length} tab(s)`, ""];

  const grouped = groupEntriesByDomain(entries);

  for (const [domain, list] of [...grouped.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${domain}`);
    lines.push("");
    for (const entry of list) {
      lines.push(`- [${escapeLinkText(entry.title)}](${escapeLinkUrl(entry.url)})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// Escapes the five characters that change meaning inside HTML text or a
// double-quoted attribute, so a title or URL can't inject markup or break out
// of the href. Ampersand goes first or it would double-escape the others.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface CopyFormatOption {
  format: ClipboardFormat;
  label: string;
}

// The copy formats the popup offers, in display order. Colocated with the
// formatter so a new format is added in one place and the UI and label can't drift.
export const COPY_FORMATS: CopyFormatOption[] = [
  { format: "markdown", label: "Markdown" },
  { format: "json", label: "JSON" },
  { format: "url", label: "URLs" },
  { format: "html", label: "HTML" },
];

// A flat, paste-ready rendering of the given tabs for the clipboard. Unlike
// buildUrlExport (grouped by domain, with a header, meant to become a file),
// this is a bare list so it drops cleanly into prose, a JSON tool, or an editor.
export function buildClipboardContent(tabs: TabLite[], format: ClipboardFormat): string {
  const entries = buildExportEntries(tabs);

  switch (format) {
    case "json":
      return JSON.stringify(
        entries.map(({ title, url }) => ({ title, url })),
        null,
        2,
      );
    case "url":
      return entries.map((entry) => entry.url).join("\n");
    case "html":
      return entries
        .map((entry) => `<a href="${escapeHtml(entry.url)}">${escapeHtml(entry.title)}</a>`)
        .join("\n");
    case "markdown":
    default: {
      const links = entries.map(
        (entry) => `[${escapeLinkText(entry.title)}](${escapeLinkUrl(entry.url)})`,
      );

      // One selected tab → a bare inline link to drop into a sentence; several →
      // a bullet list, the idiomatic markdown for a set of links.
      return links.length <= 1 ? (links[0] ?? "") : links.map((link) => `- ${link}`).join("\n");
    }
  }
}

export interface DownloadFormatOption {
  format: ExportFormat;
  label: string;
}

// The download formats the popup offers, in display order. Colocated with the
// formatter so a new format is added in one place and the UI and label can't drift.
export const DOWNLOAD_FORMATS: DownloadFormatOption[] = [
  { format: "markdown", label: "Markdown" },
  { format: "text", label: "Text" },
];

export function buildUrlExport(
  tabs: TabLite[],
  format: ExportFormat,
): { content: string; extension: string; mimeType: string } {
  const entries = buildExportEntries(tabs);

  switch (format) {
    case "text":
      return {
        content: formatPlainText(entries),
        extension: "txt",
        mimeType: "text/plain",
      };
    case "markdown":
    default:
      return {
        content: formatMarkdown(entries),
        extension: "md",
        mimeType: "text/markdown",
      };
  }
}
