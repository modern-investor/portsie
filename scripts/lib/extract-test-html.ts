/**
 * Converts an LLMExtractionResult JSON into a self-contained HTML report
 * optimized for human reading. No external dependencies, no JavaScript.
 */
import type {
  LLMExtractionResult,
  ExtractedAccount,
  ExtractedTransaction,
  ExtractedPosition,
  ExtractedBalance,
  AccountLink,
} from "../../src/lib/upload/types";

export interface HTMLReportMeta {
  label: string;
  backend: string;
  backendCode: string;
  filename: string;
  timestamp: string;
  durationMs: number;
  jsonFilename: string;
  companionFiles: { name: string; path: string }[];
}

export function generateExtractionHTML(
  result: LLMExtractionResult,
  meta: HTMLReportMeta
): string {
  const accounts = result.accounts ?? [];
  const txnCount = accounts.reduce((n, a) => n + a.transactions.length, 0);
  const posCount = accounts.reduce((n, a) => n + a.positions.length, 0);
  const balCount = accounts.reduce((n, a) => n + a.balances.length, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.backend)} — ${esc(meta.label)} — Portsie Extract Test</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="container">

${renderHeader(meta)}
${renderCompanionLinks(meta)}
${renderSummary(result, accounts.length, txnCount, posCount, balCount)}
${renderNotes(result.notes)}
${accounts.map((a, i) => renderAccount(a, i, accounts.length)).join("\n")}
${renderUnallocatedPositions(result.unallocated_positions ?? [])}
${renderFooter(meta)}

</div>
</body>
</html>`;
}

// ── Section renderers ──

function renderHeader(meta: HTMLReportMeta): string {
  const duration = meta.durationMs < 1000
    ? `${meta.durationMs}ms`
    : `${(meta.durationMs / 1000).toFixed(1)}s`;

  return `
<header>
  <h1>${esc(meta.backend)}</h1>
  <div class="meta-row">
    <span class="chip">${esc(meta.backendCode)}</span>
    <span class="meta-sep">|</span>
    <span>${esc(meta.label)}</span>
    <span class="meta-sep">|</span>
    <span>${esc(meta.filename)}</span>
    <span class="meta-sep">|</span>
    <span>${duration}</span>
    <span class="meta-sep">|</span>
    <span>${esc(meta.timestamp)}</span>
  </div>
</header>`;
}

function renderCompanionLinks(meta: HTMLReportMeta): string {
  const links = [
    `<a href="${esc(meta.jsonFilename)}">JSON</a>`,
    ...meta.companionFiles.map(
      (f) => `<a href="${esc(f.path)}">${esc(f.name)}</a>`
    ),
  ];
  return `<div class="companion-links">${links.join(" · ")}</div>`;
}

function renderSummary(
  result: LLMExtractionResult,
  acctCount: number,
  txnCount: number,
  posCount: number,
  balCount: number
): string {
  const conf = result.confidence ?? "low";
  const dates = [result.statement_start_date, result.statement_end_date]
    .filter(Boolean)
    .join(" → ");

  return `
<div class="summary">
  <div class="summary-pills">
    <span class="pill">${acctCount} account${acctCount !== 1 ? "s" : ""}</span>
    <span class="pill">${txnCount} txn${txnCount !== 1 ? "s" : ""}</span>
    <span class="pill">${posCount} pos</span>
    <span class="pill">${balCount} bal</span>
    <span class="pill conf-${conf}">${conf} confidence</span>
  </div>
  ${dates ? `<div class="dates">Statement period: ${esc(dates)}</div>` : ""}
</div>`;
}

function renderNotes(notes: string[]): string {
  if (!notes.length) return "";
  return `
<div class="notes">
  <strong>Notes</strong>
  <ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
</div>`;
}

function renderAccount(acct: ExtractedAccount, idx: number, total: number): string {
  const info = acct.account_info;
  const nickname = info.account_nickname || info.institution_name || `Account ${idx + 1}`;
  const open = total <= 4 ? " open" : idx === 0 ? " open" : "";

  return `
<details class="account"${open}>
  <summary>
    <span class="acct-name">${esc(nickname)}</span>
    ${info.institution_name ? `<span class="acct-inst">${esc(info.institution_name)}</span>` : ""}
    ${info.account_type ? `<span class="chip">${esc(info.account_type)}</span>` : ""}
    ${info.account_number ? `<span class="acct-num">${esc(info.account_number)}</span>` : ""}
    ${info.account_group ? `<span class="chip chip-group">${esc(info.account_group)}</span>` : ""}
  </summary>
  <div class="acct-body">
    ${renderAccountLink(acct.account_link)}
    ${renderBalances(acct.balances)}
    ${renderPositions(acct.positions)}
    ${renderTransactions(acct.transactions)}
  </div>
</details>`;
}

function renderAccountLink(link?: AccountLink): string {
  if (!link) return "";
  const actionClass = link.action === "match_existing" ? "link-match" : "link-new";
  const confClass = `conf-${link.match_confidence}`;
  return `
<div class="account-link">
  <span class="chip ${actionClass}">${link.action === "match_existing" ? "MATCH" : "NEW"}</span>
  <span class="chip ${confClass}">${link.match_confidence}</span>
  ${link.existing_account_id ? `<code>${esc(link.existing_account_id)}</code>` : ""}
  <span class="link-reason">${esc(link.match_reason)}</span>
</div>`;
}

function renderBalances(balances: ExtractedBalance[]): string {
  if (!balances.length) return "";
  return `
<div class="section">
  <h3>Balances</h3>
  <div class="balance-cards">
    ${balances.map((b) => `
    <div class="balance-card">
      <div class="bal-date">${esc(b.snapshot_date)}</div>
      <div class="bal-grid">
        ${balField("Account Value", b.liquidation_value)}
        ${balField("Cash", b.cash_balance)}
        ${balField("Equity", b.equity)}
        ${balField("Buying Power", b.buying_power)}
        ${balField("Long Mkt Value", b.long_market_value)}
        ${balField("Available", b.available_funds)}
        ${balField("Total Cash", b.total_cash)}
      </div>
    </div>`).join("")}
  </div>
</div>`;
}

function balField(label: string, value: number | null | undefined): string {
  if (value == null) return "";
  return `<div class="bal-field"><span class="bal-label">${label}</span><span class="bal-value ${value < 0 ? "neg" : ""}">${fmtCurrency(value)}</span></div>`;
}

function renderPositions(positions: ExtractedPosition[]): string {
  if (!positions.length) return "";
  return `
<div class="section">
  <h3>Positions (${positions.length})</h3>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Description</th>
          <th class="r">Qty</th>
          <th class="r">Avg Cost</th>
          <th class="r">Mkt Price</th>
          <th class="r">Mkt Value</th>
          <th class="r">P&amp;L</th>
          <th class="r">P&amp;L %</th>
        </tr>
      </thead>
      <tbody>
        ${positions.map((p) => `
        <tr>
          <td class="mono">${esc(p.symbol)}</td>
          <td>${esc(p.description ?? "")}</td>
          <td class="r mono">${fmtNum(p.quantity)}</td>
          <td class="r mono">${fmtCurrencyOrDash(p.average_cost_basis)}</td>
          <td class="r mono">${fmtCurrencyOrDash(p.market_price_per_share)}</td>
          <td class="r mono">${fmtCurrencyOrDash(p.market_value)}</td>
          <td class="r mono ${plClass(p.unrealized_profit_loss)}">${fmtCurrencyOrDash(p.unrealized_profit_loss)}</td>
          <td class="r mono ${plClass(p.unrealized_profit_loss_pct)}">${fmtPctOrDash(p.unrealized_profit_loss_pct)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>`;
}

function renderTransactions(txns: ExtractedTransaction[]): string {
  if (!txns.length) return "";
  return `
<div class="section">
  <h3>Transactions (${txns.length})</h3>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Action</th>
          <th>Symbol</th>
          <th>Description</th>
          <th class="r">Qty</th>
          <th class="r">Price</th>
          <th class="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${txns.map((t) => `
        <tr>
          <td class="mono">${esc(t.transaction_date)}</td>
          <td><span class="chip chip-action">${esc(t.action)}</span></td>
          <td class="mono">${esc(t.symbol ?? "")}</td>
          <td>${esc(t.description)}</td>
          <td class="r mono">${t.quantity != null ? fmtNum(t.quantity) : ""}</td>
          <td class="r mono">${fmtCurrencyOrDash(t.price_per_share)}</td>
          <td class="r mono ${t.total_amount < 0 ? "neg" : "pos"}">${fmtCurrency(t.total_amount)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>`;
}

function renderUnallocatedPositions(positions: ExtractedPosition[]): string {
  if (!positions.length) return "";
  return `
<div class="section">
  <h3>Unallocated Positions (${positions.length})</h3>
  <p class="muted">Positions from aggregate sections not attributed to a specific account.</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Description</th>
          <th class="r">Qty</th>
          <th class="r">Mkt Value</th>
        </tr>
      </thead>
      <tbody>
        ${positions.map((p) => `
        <tr>
          <td class="mono">${esc(p.symbol)}</td>
          <td>${esc(p.description ?? "")}</td>
          <td class="r mono">${fmtNum(p.quantity)}</td>
          <td class="r mono">${fmtCurrencyOrDash(p.market_value)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>`;
}

function renderFooter(meta: HTMLReportMeta): string {
  return `
<footer>
  Generated by Portsie Extract Test · ${esc(meta.timestamp)}
</footer>`;
}

// ── Formatting helpers ──

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtCurrencyOrDash(n: number | null | undefined): string {
  return n != null ? fmtCurrency(n) : "—";
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtPctOrDash(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function plClass(n: number | null | undefined): string {
  if (n == null) return "";
  return n < 0 ? "neg" : n > 0 ? "pos" : "";
}

// ── CSS ──

const CSS = `
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --fg2: #555;
  --border: #e0e0e0;
  --surface: #f7f7f7;
  --accent: #2563eb;
  --green: #16a34a;
  --red: #dc2626;
  --amber: #d97706;
  --pill-bg: #e8e8e8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f;
    --fg: #e5e5e5;
    --fg2: #aaa;
    --border: #333;
    --surface: #1a1a1a;
    --accent: #60a5fa;
    --green: #4ade80;
    --red: #f87171;
    --amber: #fbbf24;
    --pill-bg: #2a2a2a;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.5;
  padding: 2rem 1rem;
}
.container { max-width: 900px; margin: 0 auto; }
header { margin-bottom: 1.5rem; }
h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.25rem; }
.meta-row { color: var(--fg2); font-size: 0.85rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.meta-sep { color: var(--border); }
.companion-links { margin-bottom: 1.5rem; font-size: 0.85rem; }
.companion-links a { color: var(--accent); text-decoration: none; }
.companion-links a:hover { text-decoration: underline; }

.summary { margin-bottom: 1.5rem; }
.summary-pills { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
.dates { font-size: 0.85rem; color: var(--fg2); }

.pill {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--pill-bg);
  color: var(--fg);
}
.conf-high { background: #dcfce7; color: #166534; }
.conf-medium { background: #fef3c7; color: #92400e; }
.conf-low { background: #fee2e2; color: #991b1b; }
@media (prefers-color-scheme: dark) {
  .conf-high { background: #14532d; color: #86efac; }
  .conf-medium { background: #78350f; color: #fde68a; }
  .conf-low { background: #7f1d1d; color: #fca5a5; }
}

.chip {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--pill-bg);
  color: var(--fg2);
}
.chip-action { font-family: monospace; text-transform: uppercase; font-size: 0.7rem; }
.chip-group { border: 1px solid var(--border); background: transparent; }
.link-match { background: #dcfce7; color: #166534; }
.link-new { background: #dbeafe; color: #1e40af; }
@media (prefers-color-scheme: dark) {
  .link-match { background: #14532d; color: #86efac; }
  .link-new { background: #1e3a5f; color: #93c5fd; }
}

.notes {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
}
.notes ul { margin-top: 0.25rem; padding-left: 1.2rem; }
@media (prefers-color-scheme: dark) {
  .notes { background: #422006; border-color: #92400e; }
}

.account {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 1rem;
}
.account summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
  background: var(--surface);
  border-radius: 6px;
}
.account[open] summary { border-bottom: 1px solid var(--border); border-radius: 6px 6px 0 0; }
.acct-name { font-weight: 700; }
.acct-inst { color: var(--fg2); }
.acct-num { font-family: monospace; color: var(--fg2); font-size: 0.8rem; }
.acct-body { padding: 0.75rem 1rem; }

.account-link {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}
.account-link code {
  font-size: 0.75rem;
  background: var(--surface);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}
.link-reason { color: var(--fg2); }

.section { margin-bottom: 1rem; }
.section h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; }
.muted { font-size: 0.8rem; color: var(--fg2); margin-bottom: 0.5rem; }

.balance-cards { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.balance-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  flex: 1 1 300px;
  background: var(--surface);
}
.bal-date { font-size: 0.8rem; color: var(--fg2); margin-bottom: 0.5rem; font-family: monospace; }
.bal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; }
.bal-field { display: flex; justify-content: space-between; }
.bal-label { font-size: 0.8rem; color: var(--fg2); }
.bal-value { font-family: monospace; font-size: 0.85rem; font-weight: 600; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
th { text-align: left; font-weight: 600; padding: 0.4rem 0.5rem; border-bottom: 2px solid var(--border); white-space: nowrap; }
td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
tr:nth-child(even) td { background: var(--surface); }
.r { text-align: right; }
.mono { font-family: monospace; }
.pos { color: var(--green); }
.neg { color: var(--red); }

footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--fg2);
}
`;
