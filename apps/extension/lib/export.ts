// DEVIATION #7 (spec §9): buildUrlExport's domain-grouped Markdown/text is now
// LEGACY. The canonical file path is FileSink (lib/sinks/file-download-sink.ts),
// which writes Module G render() output (donor-parity Markdown). This grouped
// variant is retained as a future "group-by-domain" format opt — NOT deleted.
import { getDomain } from "./domain.ts";
import type { ExportEntry, ExportFormat, TabLite } from "./types.ts";

export function buildExportEntries(tabs: TabLite[]): ExportEntry[] {
  return tabs.map((tab) => ({
    title: tab.title,
    url: tab.url,
    domain: getDomain(tab.url),
  }));
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

  for (const domain of [...grouped.keys()].toSorted((a, b) => a.localeCompare(b))) {
    const list = grouped.get(domain);
    if (!list) continue;
    lines.push(`## ${domain}`);
    for (const entry of list) {
      lines.push(entry.url);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatMarkdown(entries: ExportEntry[]): string {
  if (entries.length === 0) {
    return "# Exported tabs\n\nNo tabs to export.\n";
  }

  const lines: string[] = ["# Exported tabs", "", `Total: ${entries.length} tab(s)`, ""];

  const grouped = groupEntriesByDomain(entries);

  for (const domain of [...grouped.keys()].toSorted((a, b) => a.localeCompare(b))) {
    const list = grouped.get(domain);
    if (!list) continue;
    lines.push(`## ${domain}`);
    lines.push("");
    for (const entry of list) {
      const safeTitle = entry.title.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      lines.push(`- [${safeTitle}](${entry.url})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

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
