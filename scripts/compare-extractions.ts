#!/usr/bin/env npx tsx
/**
 * Compare extraction results across backends.
 */
import { readFileSync } from "fs";
import { join } from "path";

const DIR = "public/extracttests/rahulioson";

// Best runs per backend
const runs: Record<string, string> = {
  "Claude Opus 4.6": "260218-co46-002.json",
  "Claude Sonnet 4.6": "260218-cs46-001.json",
  "Claude Sonnet 4.5": "260218-cs45-001.json",
  "Gemini 2.5 Flash": "260218-gf25-002.json",
  "Gemini 3 Flash": "260218-gf30-001.json",
};

interface Account {
  account_info?: { account_name?: string; account_nickname?: string };
  transactions?: unknown[];
  positions?: unknown[];
  balances?: unknown[];
}

interface ExtractionResult {
  accounts?: Account[];
  confidence?: string;
  notes?: string[];
}

const data: Record<string, ExtractionResult> = {};
for (const [name, file] of Object.entries(runs)) {
  data[name] = JSON.parse(readFileSync(join(DIR, file), "utf-8"));
}

// 1. High-level comparison
console.log("=== HIGH-LEVEL COMPARISON ===\n");
console.log("Backend                  | Accounts | Confidence | Notes");
console.log("-------------------------|----------|------------|------");
for (const [name, d] of Object.entries(data)) {
  const accts = d.accounts?.length ?? 0;
  const notes = d.notes?.join("; ").slice(0, 60) ?? "";
  console.log(`${name.padEnd(25)}| ${String(accts).padEnd(9)}| ${(d.confidence ?? "?").padEnd(11)}| ${notes}`);
}

// 2. Account names comparison
console.log("\n\n=== ACCOUNT NAMES ===\n");
const allAcctNames = new Map<string, Set<string>>();
for (const [name, d] of Object.entries(data)) {
  for (const acct of d.accounts ?? []) {
    const acctName = acct.account_info?.account_name || acct.account_info?.account_nickname || "unknown";
    if (!allAcctNames.has(acctName)) allAcctNames.set(acctName, new Set());
    allAcctNames.get(acctName)!.add(name);
  }
}

const claudeBackends = ["Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Sonnet 4.5"];
const geminiBackends = ["Gemini 2.5 Flash", "Gemini 3 Flash"];

let missingFromGemini3 = 0;
let missingFromGemini25 = 0;
let inAll = 0;
for (const [, backends] of allAcctNames) {
  const inAllClaude = claudeBackends.every((b) => backends.has(b));
  const inG25 = backends.has("Gemini 2.5 Flash");
  const inG30 = backends.has("Gemini 3 Flash");

  if (inAllClaude && inG25 && inG30) inAll++;
  if (inAllClaude && !inG30) missingFromGemini3++;
  if (inAllClaude && !inG25) missingFromGemini25++;
}

console.log(`Total unique account names: ${allAcctNames.size}`);
console.log(`Present in ALL 5 backends: ${inAll}`);
console.log(`In all Claude but missing from Gemini 3 Flash: ${missingFromGemini3}`);
console.log(`In all Claude but missing from Gemini 2.5 Flash: ${missingFromGemini25}`);

// 3. Data density
console.log("\n\n=== DATA DENSITY (per-backend totals) ===\n");
console.log("Backend                  | Transactions | Positions | Balances");
console.log("-------------------------|-------------|-----------|--------");
for (const [name, d] of Object.entries(data)) {
  let txns = 0,
    pos = 0,
    bals = 0;
  for (const acct of d.accounts ?? []) {
    txns += acct.transactions?.length ?? 0;
    pos += acct.positions?.length ?? 0;
    bals += acct.balances?.length ?? 0;
  }
  console.log(
    `${name.padEnd(25)}| ${String(txns).padEnd(12)}| ${String(pos).padEnd(10)}| ${bals}`
  );
}

// 4. Opus vs Sonnet 4.6 account-level comparison
console.log("\n\n=== OPUS 4.6 vs SONNET 4.6 — Account-level detail ===\n");
const opusAccts = data["Claude Opus 4.6"].accounts || [];
const sonnet46Accts = data["Claude Sonnet 4.6"].accounts || [];

const getAcctName = (a: Account) => a.account_info?.account_name || a.account_info?.account_nickname || "?";
const opusNames = opusAccts.map(getAcctName);
const sonnet46Names = sonnet46Accts.map(getAcctName);

const inOpusNotSonnet = opusNames.filter((n: string) => !sonnet46Names.includes(n));
const inSonnetNotOpus = sonnet46Names.filter((n: string) => !opusNames.includes(n));

if (inOpusNotSonnet.length === 0 && inSonnetNotOpus.length === 0) {
  console.log("Account names match perfectly between Opus 4.6 and Sonnet 4.6!");
} else {
  if (inOpusNotSonnet.length) console.log("In Opus but not Sonnet 4.6:", inOpusNotSonnet);
  if (inSonnetNotOpus.length) console.log("In Sonnet 4.6 but not Opus:", inSonnetNotOpus);
}

// Position counts per account
let positionDiffs = 0;
for (const opusAcct of opusAccts) {
  const oName = getAcctName(opusAcct);
  const sAcct = sonnet46Accts.find((a: Account) => getAcctName(a) === oName);
  if (!sAcct) continue;

  const oPosCount = opusAcct.positions?.length ?? 0;
  const sPosCount = sAcct.positions?.length ?? 0;
  if (oPosCount !== sPosCount) {
    console.log(`  ${oName}: Opus ${oPosCount} positions vs Sonnet 4.6 ${sPosCount} positions`);
    positionDiffs++;
  }
}
if (positionDiffs === 0) console.log("Position counts match for all shared accounts!");

// 5. Gemini 2.5 Flash vs Claude — what accounts differ
console.log("\n\n=== GEMINI 2.5 FLASH vs CLAUDE OPUS — Differences ===\n");
const g25Accts = data["Gemini 2.5 Flash"].accounts || [];
const g25Names = g25Accts.map(getAcctName);

const inOpusNotG25 = opusNames.filter((n: string) => !g25Names.includes(n));
const inG25NotOpus = g25Names.filter((n: string) => !opusNames.includes(n));

if (inOpusNotG25.length) {
  console.log(`Accounts in Opus but NOT in Gemini 2.5 Flash (${inOpusNotG25.length}):`);
  for (const n of inOpusNotG25.slice(0, 10)) console.log(`  - ${n}`);
  if (inOpusNotG25.length > 10) console.log(`  ... and ${inOpusNotG25.length - 10} more`);
}
if (inG25NotOpus.length) {
  console.log(`Accounts in Gemini 2.5 Flash but NOT in Opus (${inG25NotOpus.length}):`);
  for (const n of inG25NotOpus) console.log(`  - ${n}`);
}
if (inOpusNotG25.length === 0 && inG25NotOpus.length === 0) {
  console.log("Account names match perfectly between Opus and Gemini 2.5 Flash!");
}

// Position-level diffs
let g25PosDiffs = 0;
for (const opusAcct of opusAccts) {
  const oName = getAcctName(opusAcct);
  const gAcct = g25Accts.find((a: Account) => getAcctName(a) === oName);
  if (!gAcct) continue;
  const oPosCount = opusAcct.positions?.length ?? 0;
  const gPosCount = gAcct.positions?.length ?? 0;
  if (oPosCount !== gPosCount) {
    console.log(`  ${oName}: Opus ${oPosCount} positions vs Gemini 2.5 ${gPosCount} positions`);
    g25PosDiffs++;
  }
}
if (g25PosDiffs === 0 && inOpusNotG25.length === 0) {
  console.log("Position counts also match for all shared accounts!");
}
