#!/usr/bin/env npx tsx
/**
 * Extraction test runner — A/B tests LLM backends on the same document.
 *
 * Usage:
 *   npx tsx scripts/run-extract-test.ts \
 *     --file ./test-docs/schwab-portfolio.pdf \
 *     --label rahulioson \
 *     --backends opus,sonnet,gemini
 *
 * Backend codes:
 *   opus     → Claude Opus 4.6 via CLI wrapper (co46)
 *   sonnet   → Claude Sonnet 4.6 via CLI wrapper (cs46)
 *   sonnet45 → Claude Sonnet 4.5 via CLI wrapper (cs45)
 *   gemini   → Gemini 3 Flash via REST API (gf30)
 *   gemini25 → Gemini 2.5 Flash via REST API (gf25)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { processFileForLLM } from "../src/lib/upload/file-processor";
import { extractViaCLI } from "../src/lib/llm/llm-cli";
import { extractViaGemini } from "../src/lib/llm/llm-gemini";
import { generateExtractionHTML, type HTMLReportMeta } from "./lib/extract-test-html";
import { generateIndex } from "./lib/extract-test-index";
import type { UploadFileType } from "../src/lib/upload/types";
import type { PortsieExtraction } from "../src/lib/extraction/schema";

// ── Load .env.local ──
function loadEnv() {
  const envPath = join(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

// ── Constants ──

const BACKEND_CONFIG: Record<string, { code: string; name: string; model?: string }> = {
  opus:     { code: "co46", name: "Claude Opus 4.6",     model: "claude-opus-4-6" },
  sonnet:   { code: "cs46", name: "Claude Sonnet 4.6",   model: "claude-sonnet-4-6" },
  sonnet45: { code: "cs45", name: "Claude Sonnet 4.5",   model: "claude-sonnet-4-5-20250929" },
  gemini:   { code: "gf30", name: "Gemini 3 Flash",      model: "gemini-3-flash-preview" },
  gemini25: { code: "gf25", name: "Gemini 2.5 Flash",    model: "gemini-2.5-flash" },
};

const EXT_TO_FILE_TYPE: Record<string, UploadFileType> = {
  ".pdf": "pdf", ".csv": "csv", ".xlsx": "xlsx", ".xls": "csv",
  ".png": "png", ".jpg": "jpg", ".jpeg": "jpg",
  ".ofx": "ofx", ".qfx": "qfx", ".txt": "txt", ".json": "json",
};

const EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf", ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".ofx": "application/x-ofx", ".qfx": "application/x-qfx",
  ".txt": "text/plain", ".json": "application/json",
};

const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_BASE = join(PROJECT_ROOT, "public/extracttests");

// ── CLI arg parsing ──

function parseArgs() {
  const args = process.argv.slice(2);
  let file = "", label = "", backends: string[] = ["opus"];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--file": file = args[++i]; break;
      case "--label": label = args[++i]; break;
      case "--backends": backends = args[++i].split(",").map((s) => s.trim()); break;
    }
  }

  if (!file || !label) {
    console.error("Usage: npx tsx scripts/run-extract-test.ts --file <path> --label <label> [--backends opus,sonnet,gemini]");
    process.exit(1);
  }

  // Validate backends
  for (const b of backends) {
    if (!BACKEND_CONFIG[b]) {
      console.error(`Unknown backend: ${b}. Valid: ${Object.keys(BACKEND_CONFIG).join(", ")}`);
      process.exit(1);
    }
  }

  return { file, label, backends };
}

// ── Sequence number ──

function nextSequence(labelDir: string, date: string, backendCode: string): string {
  if (!existsSync(labelDir)) return "001";
  const files = readdirSync(labelDir);
  let max = 0;
  const prefix = `${date}-${backendCode}-`;
  for (const f of files) {
    if (f.startsWith(prefix)) {
      const match = f.match(new RegExp(`^${prefix}(\\d{3})`));
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return String(max + 1).padStart(3, "0");
}

// ── Run extraction for one backend ──

async function runBackend(
  backendKey: string,
  processedFile: ReturnType<typeof processFileForLLM>,
  fileType: UploadFileType,
  filename: string
): Promise<{ result: PortsieExtraction; rawResponse: unknown; durationMs: number }> {
  const config = BACKEND_CONFIG[backendKey];
  const start = Date.now();

  if (backendKey === "gemini" || backendKey === "gemini25") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set in .env.local");
    const { extraction, rawResponse } = await extractViaGemini(apiKey, processedFile, fileType, filename, config.model);
    return { result: extraction, rawResponse, durationMs: Date.now() - start };
  }

  // Claude via CLI wrapper
  const endpoint = process.env.PORTSIE_CLI_ENDPOINT;
  if (!endpoint) throw new Error("PORTSIE_CLI_ENDPOINT not set in .env.local");
  const { extraction, rawResponse } = await extractViaCLI(
    processedFile, fileType, filename, endpoint, config.model
  );
  return { result: extraction, rawResponse, durationMs: Date.now() - start };
}

// ── Main ──

async function main() {
  const { file, label, backends } = parseArgs();

  // Read and process the file
  const ext = extname(file).toLowerCase();
  const fileType = EXT_TO_FILE_TYPE[ext];
  const mimeType = EXT_TO_MIME[ext];
  if (!fileType || !mimeType) {
    console.error(`Unsupported file extension: ${ext}`);
    process.exit(1);
  }

  const filename = basename(file);
  const fileBuffer = readFileSync(file);
  console.log(`Processing ${filename} (${fileType}, ${(fileBuffer.length / 1024).toFixed(0)} KB)`);

  const processedFile = processFileForLLM(fileBuffer, fileType, mimeType);

  // Ensure output directory
  const labelDir = join(OUTPUT_BASE, label);
  mkdirSync(labelDir, { recursive: true });

  // Date stamp (YYMMDD)
  const now = new Date();
  const date = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timestamp = now.toISOString().replace("T", " ").slice(0, 19);

  // Plan all output filenames upfront (for companion links)
  const planned: { backendKey: string; code: string; seq: string; htmlFile: string; jsonFile: string }[] = [];
  for (const bk of backends) {
    const config = BACKEND_CONFIG[bk];
    const seq = nextSequence(labelDir, date, config.code);
    const base = `${date}-${config.code}-${seq}`;
    planned.push({ backendKey: bk, code: config.code, seq, htmlFile: `${base}.html`, jsonFile: `${base}.json` });
  }

  // Run each backend sequentially (to avoid overloading the CLI wrapper)
  const results: { backendKey: string; result: PortsieExtraction; rawResponse: unknown; durationMs: number; htmlFile: string; jsonFile: string }[] = [];

  for (const plan of planned) {
    const config = BACKEND_CONFIG[plan.backendKey];
    console.log(`\nRunning ${config.name}...`);
    try {
      const { result, rawResponse, durationMs } = await runBackend(plan.backendKey, processedFile, fileType, filename);
      results.push({ backendKey: plan.backendKey, result, rawResponse, durationMs, htmlFile: plan.htmlFile, jsonFile: plan.jsonFile });
      console.log(`  Done in ${(durationMs / 1000).toFixed(1)}s — ${result.accounts?.length ?? 0} accounts, confidence: ${result.confidence}`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Write output files
  for (const r of results) {
    const config = BACKEND_CONFIG[r.backendKey];
    const jsonPath = join(labelDir, r.jsonFile);
    const htmlPath = join(labelDir, r.htmlFile);

    // Companion files (other backends' HTML reports from this run)
    const companions = results
      .filter((o) => o.backendKey !== r.backendKey)
      .map((o) => ({ name: BACKEND_CONFIG[o.backendKey].name, path: o.htmlFile }));

    const meta: HTMLReportMeta = {
      label,
      backend: config.name,
      backendCode: config.code,
      filename,
      timestamp,
      durationMs: r.durationMs,
      jsonFilename: r.jsonFile,
      companionFiles: companions,
    };

    writeFileSync(jsonPath, JSON.stringify(r.result, null, 2), "utf-8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTML renderer uses legacy types; to be updated
    writeFileSync(htmlPath, generateExtractionHTML(r.result as any, meta), "utf-8");

    console.log(`\n${config.name}:`);
    console.log(`  HTML: public/extracttests/${label}/${r.htmlFile}`);
    console.log(`  JSON: public/extracttests/${label}/${r.jsonFile}`);
  }

  // Regenerate index
  generateIndex();
  console.log(`\nIndex: public/extracttests/index.html`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
