/**
 * Scans public/extracttests/ for test result files and generates an index.html.
 */
import { readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(__dirname, "../../public/extracttests");

interface TestEntry {
  label: string;
  date: string;
  backendCode: string;
  sequence: string;
  htmlFile: string;
  jsonFile: string;
}

const BACKEND_NAMES: Record<string, string> = {
  co46: "Claude Opus 4.6",
  cs46: "Claude Sonnet 4.6",
  cs45: "Claude Sonnet 4.5",
  gf30: "Gemini 3 Flash",
  gf25: "Gemini 2.5 Flash",
};

export function generateIndex(): void {
  if (!existsSync(OUTPUT_DIR)) return;

  const entries: TestEntry[] = [];

  // Scan label subdirectories
  for (const label of readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (!label.isDirectory() || label.name.startsWith(".")) continue;
    const labelDir = join(OUTPUT_DIR, label.name);

    for (const file of readdirSync(labelDir)) {
      if (!file.endsWith(".html") || file === "index.html") continue;
      // Parse: YYMMDD-backend-NNN.html
      const match = file.match(/^(\d{6})-(\w+)-(\d{3})\.html$/);
      if (!match) continue;

      const jsonFile = file.replace(/\.html$/, ".json");
      entries.push({
        label: label.name,
        date: match[1],
        backendCode: match[2],
        sequence: match[3],
        htmlFile: file,
        jsonFile,
      });
    }
  }

  // Sort: by label, then date desc, then sequence desc
  entries.sort((a, b) => {
    if (a.label !== b.label) return a.label.localeCompare(b.label);
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.sequence.localeCompare(a.sequence);
  });

  const html = buildIndexHTML(entries);
  writeFileSync(join(OUTPUT_DIR, "index.html"), html, "utf-8");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d: string): string {
  // YYMMDD → YY/MM/DD
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 6)}`;
}

function buildIndexHTML(entries: TestEntry[]): string {
  // Group by label
  const groups = new Map<string, TestEntry[]>();
  for (const e of entries) {
    if (!groups.has(e.label)) groups.set(e.label, []);
    groups.get(e.label)!.push(e);
  }

  let tableRows = "";
  for (const [label, items] of groups) {
    tableRows += `<tr class="group-header"><td colspan="5">${esc(label)}</td></tr>\n`;
    for (const e of items) {
      const name = BACKEND_NAMES[e.backendCode] ?? e.backendCode;
      tableRows += `<tr>
  <td>${fmtDate(e.date)}</td>
  <td><span class="chip">${esc(e.backendCode)}</span> ${esc(name)}</td>
  <td>${esc(e.sequence)}</td>
  <td><a href="${esc(e.label)}/${esc(e.htmlFile)}">HTML</a></td>
  <td><a href="${esc(e.label)}/${esc(e.jsonFile)}">JSON</a></td>
</tr>\n`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portsie Extract Tests</title>
<style>
:root { --bg: #fff; --fg: #1a1a1a; --fg2: #555; --border: #e0e0e0; --surface: #f7f7f7; --accent: #2563eb; --pill-bg: #e8e8e8; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f0f0f; --fg: #e5e5e5; --fg2: #aaa; --border: #333; --surface: #1a1a1a; --accent: #60a5fa; --pill-bg: #2a2a2a; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); padding: 2rem 1rem; line-height: 1.5; }
.container { max-width: 700px; margin: 0 auto; }
h1 { font-size: 1.4rem; margin-bottom: 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th { text-align: left; font-weight: 600; padding: 0.4rem 0.5rem; border-bottom: 2px solid var(--border); }
td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
.group-header td { font-weight: 700; background: var(--surface); padding-top: 0.75rem; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.chip { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600; background: var(--pill-bg); font-family: monospace; }
.empty { color: var(--fg2); font-style: italic; margin-top: 1rem; }
</style>
</head>
<body>
<div class="container">
<h1>Portsie Extract Tests</h1>
${entries.length === 0
    ? '<p class="empty">No test results yet. Run <code>npx tsx scripts/run-extract-test.ts</code> to generate some.</p>'
    : `<table>
<thead><tr><th>Date</th><th>Backend</th><th>#</th><th></th><th></th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>`}
</div>
</body>
</html>`;
}
