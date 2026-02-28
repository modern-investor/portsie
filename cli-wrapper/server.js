#!/usr/bin/env node
// ============================================
// Portsie CLI Wrapper — Claude Code HTTP Endpoint
// Runs on DO droplet, receives extraction requests from Vercel
// ============================================

const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const { writeFile, unlink, rm, mkdtemp } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");

const DIAGNOSTICS_FILE = join(__dirname, "diagnostics.jsonl");

const PORT = parseInt(process.env.PORT || "8910", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN; // shared secret with Vercel
const MAX_TIMEOUT_MS = parseInt(process.env.MAX_TIMEOUT_MS || "300000", 10); // 5 min
const SUPABASE_URL = process.env.SUPABASE_URL; // for persisting failure analyses
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_QUEUE_SIZE = 20;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || "3", 10); // concurrent claude processes

let activeCount = 0; // number of currently running claude processes
let warmupProcess = null; // track warmup child process
const requestQueue = []; // queue for pending extraction requests

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Run `claude -p <prompt>` and return the JSON result.
 * For binary files, writes to a temp dir so claude can read them.
 */
async function runClaude(prompt, file, model) {
  let tempDir = null;
  let tempFilePath = null;

  try {
    // If a binary file is attached, write it to a temp location
    if (file && file.content) {
      tempDir = await mkdtemp(join(tmpdir(), "portsie-cli-"));
      tempFilePath = join(tempDir, file.filename || "upload");
      const buffer = Buffer.from(file.content, "base64");
      await writeFile(tempFilePath, buffer);
      log(`Wrote temp file: ${tempFilePath} (${buffer.length} bytes)`);

      prompt += `\n\nThe file has been saved to "${tempFilePath}". Read it from that path.`;
    }

    // Kill warmup process on first real extraction to free resources
    if (warmupProcess) {
      try { warmupProcess.kill(); } catch {}
      warmupProcess = null;
      log("Killed warmup process for real extraction");
    }

    const args = [
      "-p", prompt,
      "--output-format", "json",
      "--dangerously-skip-permissions",
    ];

    // Allow callers to request a specific model (e.g., claude-sonnet-4-5-20250929)
    if (model) {
      args.push("--model", model);
      log(`Using model: ${model}`);
    }

    return await new Promise((resolve, reject) => {
      const child = spawn("claude", args, {
        env: {
          ...process.env,
          CI: "true",
          HOME: process.env.HOME || "/home/bugfixer",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: MAX_TIMEOUT_MS,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        reject(new Error(`Spawn error: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          log(`claude exited with code ${code}. stderr: ${stderr.slice(0, 500)}`);
          reject(
            new Error(`claude exited with code ${code}: ${stderr.slice(0, 500)}`)
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch {
          resolve({ result: stdout });
        }
      });
    });
  } finally {
    if (tempFilePath) await unlink(tempFilePath).catch(() => {});
    if (tempDir) await rm(tempDir, { recursive: true }).catch(() => {});
  }
}

/**
 * Try to drain queued requests up to MAX_CONCURRENT.
 */
function drainQueue() {
  while (activeCount < MAX_CONCURRENT && requestQueue.length > 0) {
    const { prompt, file, model, resolve, reject } = requestQueue.shift();
    activeCount++;
    log(`Starting extraction (active: ${activeCount}/${MAX_CONCURRENT}, queued: ${requestQueue.length}, file: ${file ? file.filename : "none"}, model: ${model || "default"})`);

    runClaude(prompt, file, model)
      .then((result) => {
        log(`Extraction complete (active: ${activeCount - 1}/${MAX_CONCURRENT}, queued: ${requestQueue.length})`);
        resolve(result);
      })
      .catch((err) => {
        log(`Extraction failed: ${err.message}`);
        reject(err);
      })
      .finally(() => {
        activeCount--;
        // Try to start more queued work
        drainQueue();
      });
  }
}

/**
 * Enqueue an extraction request. Returns a promise that resolves when processing completes.
 */
function enqueueExtraction(prompt, file, model) {
  return new Promise((resolve, reject) => {
    if (requestQueue.length >= MAX_QUEUE_SIZE) {
      reject(new Error("Queue full. Try again later."));
      return;
    }
    const position = requestQueue.length + activeCount;
    requestQueue.push({ prompt, file, model, resolve, reject });
    log(`Queued extraction (position: ${position + 1}, active: ${activeCount}/${MAX_CONCURRENT}, queued: ${requestQueue.length})`);
    // Try to start immediately if we have capacity
    drainQueue();
  });
}

/**
 * Spawn a minimal warmup process to pre-load Claude runtime.
 */
function spawnWarmup() {
  if (activeCount > 0 || warmupProcess) {
    log("Warmup skipped (already processing or warming)");
    return false;
  }

  log("Spawning warmup process...");
  const child = spawn("claude", [
    "-p", "Reply with just: ok",
    "--output-format", "json",
    "--dangerously-skip-permissions",
  ], {
    env: {
      ...process.env,
      CI: "true",
      HOME: process.env.HOME || "/home/bugfixer",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000, // 30s max for warmup
  });

  warmupProcess = child;

  child.on("close", (code) => {
    log(`Warmup process exited (code: ${code})`);
    if (warmupProcess === child) warmupProcess = null;
  });

  child.on("error", (err) => {
    log(`Warmup error: ${err.message}`);
    if (warmupProcess === child) warmupProcess = null;
  });

  return true;
}

/**
 * Read the full request body as a string.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Persist a failure analysis to Supabase via REST API (native fetch).
 * Uses service role key for INSERT (RLS policy allows service role).
 */
async function persistAnalysis(analysisRow) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log("Supabase credentials not configured — skipping DB persistence");
    return null;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/failure_analyses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(analysisRow),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      log(`Supabase insert failed (${resp.status}): ${errText}`);
      return null;
    }

    const rows = await resp.json();
    const id = rows?.[0]?.id ?? null;
    log(`Analysis persisted to failure_analyses: ${id}`);
    return id;
  } catch (err) {
    log(`Supabase persistence error: ${err.message}`);
    return null;
  }
}

/**
 * Look up user_id and file metadata from an extraction_failures row.
 */
async function lookupFailureContext(extractionFailureId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !extractionFailureId) return null;

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/extraction_failures?id=eq.${extractionFailureId}&select=user_id,upload_id,filename,file_size_bytes,processing_settings,processing_log`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Analyze a failed processing log using Claude.
 * Runs asynchronously — does not block the diagnostics response.
 *
 * Enhanced: requests structured JSON output from Claude and persists
 * the analysis to the `failure_analyses` Supabase table.
 */
async function analyzeFailure(processingLog, uploadId, extractionFailureId, extra = {}) {
  const startMs = Date.now();

  // Look up context from the extraction_failures record (extract stage)
  const failureCtx = await lookupFailureContext(extractionFailureId);

  const waypointSummary = (processingLog.waypoints || [])
    .map((w) => `  ${w.step}: ${w.status} (${w.durationMs ?? "?"}ms)${w.error ? " ERROR: " + w.error : ""}`)
    .join("\n");

  const pipelineStage = extra.stage ?? "extract";
  const prompt = `You are a DevOps analyst for Portsie, a financial document extraction system. Analyze this processing failure and return ONLY a JSON object (no markdown, no code fences).

## Failure Context

Pipeline Stage: ${pipelineStage}
Upload: ${processingLog.fileInfo?.filename ?? "unknown"} (${processingLog.fileInfo?.fileType ?? "?"}, ${processingLog.fileInfo?.sizeBytes ?? "?"} bytes)
Backend: ${processingLog.backend ?? "?"} / ${processingLog.model ?? "?"}
Preset: ${processingLog.preset ?? "?"}
Total Duration: ${processingLog.totalDurationMs ?? "?"}ms
Outcome: ${processingLog.outcome ?? "?"}
Error Category: ${processingLog.errorCategory ?? "?"}
Error Message: ${processingLog.errorMessage ?? "none"}
Attempt Number: ${processingLog.attemptNumber ?? "?"}

## Processing Steps (Waypoints)
${waypointSummary || "  (none recorded)"}

## System Architecture
- Vercel serverless: 300s hard limit, 280s self-imposed deadline
- Pipeline stages: extract → confirm → verify (each a separate HTTP request with its own 300s budget)
- Extract stage: Gemini 3 Flash primary (streaming SSE), Claude Sonnet 4.6 CLI fallback
- Confirm stage: Account matching + DB writes (no LLM call)
- Verify stage: Second LLM backend for cross-checking (non-critical)
- Files >4MB base64: uploaded via Gemini File API (resumable upload + poll ACTIVE)
- Files >5MB base64: routed to CLI backend (persistent DO server, no timeout constraint)

## Required JSON Output

Return exactly this JSON structure:
{
  "root_cause": "1-2 sentence root cause explanation",
  "affected_step": "downloading|preprocessing|extracting|validating|matching|writing|verifying",
  "timing_breakdown": { "step_name_ms": number_or_null },
  "recommended_fix": "1-2 sentence actionable recommendation",
  "severity": "low|medium|high|critical"
}

Severity guide:
- critical: deterministic failure, same file will always fail
- high: likely to recur for similar files
- medium: transient but frequent
- low: one-off / unlikely to recur`;

  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt, "--model", "claude-sonnet-4-6", "--output-format", "json", "--dangerously-skip-permissions"], {
      env: { ...process.env, CI: "true", HOME: process.env.HOME || "/home/bugfixer" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 90000, // 90s for analysis
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.on("close", async (code) => {
      const durationMs = Date.now() - startMs;

      // Parse Claude's response — try to extract the JSON object
      let analysis = null;
      let rawText = stdout;
      try {
        const parsed = JSON.parse(stdout);
        rawText = typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result);
      } catch {}

      // Try to parse the structured JSON from the response text
      try {
        // Strip markdown code fences if present
        let jsonStr = rawText;
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1];
        jsonStr = jsonStr.trim();

        // Find the JSON object boundaries
        const startIdx = jsonStr.indexOf("{");
        const endIdx = jsonStr.lastIndexOf("}");
        if (startIdx !== -1 && endIdx > startIdx) {
          jsonStr = jsonStr.slice(startIdx, endIdx + 1);
        }

        analysis = JSON.parse(jsonStr);
      } catch {
        // Fallback: treat entire response as root_cause text
        analysis = {
          root_cause: rawText.slice(0, 500),
          affected_step: processingLog.waypoints?.find((w) => w.status === "failed")?.step ?? null,
          timing_breakdown: null,
          recommended_fix: null,
          severity: "medium",
        };
      }

      // Write to local JSONL (backup)
      const logLine = JSON.stringify({
        type: "analysis",
        uploadId,
        extractionFailureId,
        receivedAt: new Date().toISOString(),
        durationMs,
        analysis,
      });
      fs.appendFileSync(DIAGNOSTICS_FILE, logLine + "\n");
      log(`Diagnostics analysis saved for ${uploadId} (${durationMs}ms, severity: ${analysis.severity})`);

      // Persist to Supabase failure_analyses table
      // Use extra.userId as fallback when failureCtx is null (confirm/verify stages)
      const analysisRow = {
        user_id: failureCtx?.user_id ?? extra.userId ?? null,
        upload_id: failureCtx?.upload_id ?? uploadId ?? null,
        extraction_failure_id: extractionFailureId ?? null,
        root_cause: analysis.root_cause ?? "Unknown",
        affected_step: analysis.affected_step ?? null,
        timing_breakdown: analysis.timing_breakdown ?? null,
        recommended_fix: analysis.recommended_fix ?? null,
        severity: ["low", "medium", "high", "critical"].includes(analysis.severity)
          ? analysis.severity
          : "medium",
        analysis_model: "claude-sonnet-4-6",
        analysis_duration_ms: durationMs,
        raw_analysis: analysis,
        filename: processingLog.fileInfo?.filename ?? failureCtx?.filename ?? null,
        file_size_bytes: processingLog.fileInfo?.sizeBytes ?? failureCtx?.file_size_bytes ?? null,
        processing_settings: failureCtx?.processing_settings ?? null,
        processing_log: processingLog ?? null,
      };

      await persistAnalysis(analysisRow);
      resolve(analysis);
    });
    child.on("error", (err) => {
      log(`Analysis spawn error: ${err.message}`);
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "portsie-cli-wrapper",
      active: activeCount,
      maxConcurrent: MAX_CONCURRENT,
      queued: requestQueue.length,
      warming: !!warmupProcess,
    }));
    return;
  }

  // Warmup endpoint
  if (req.method === "POST" && req.url === "/warmup") {
    if (AUTH_TOKEN) {
      const authHeader = req.headers["authorization"];
      if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    const started = spawnWarmup();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: started ? "warming" : "skipped",
      reason: started ? "warmup spawned" : "already busy",
    }));
    return;
  }

  // ── POST /diagnostics — receive processing log snapshots from Vercel ──
  if (req.method === "POST" && req.url === "/diagnostics") {
    if (AUTH_TOKEN) {
      const authHeader = req.headers["authorization"];
      if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    try {
      const body = await readBody(req);
      const { processingLog, uploadId, extractionFailureId, userId, stage } = JSON.parse(body);

      // Persist to JSONL file
      const logLine = JSON.stringify({
        receivedAt: new Date().toISOString(),
        uploadId,
        extractionFailureId,
        stage,
        ...processingLog,
      });
      fs.appendFileSync(DIAGNOSTICS_FILE, logLine + "\n");
      log(`Diagnostics received for ${uploadId}: ${processingLog?.outcome ?? "?"} (${processingLog?.totalDurationMs ?? "?"}ms)${stage ? ` stage=${stage}` : ""}${extractionFailureId ? ` failureId=${extractionFailureId}` : ""}`);

      // If failed, trigger async Claude analysis (fire-and-forget)
      if (processingLog?.outcome === "failed" || processingLog?.outcome === "timeout") {
        analyzeFailure(processingLog, uploadId, extractionFailureId, { userId, stage }).catch((err) =>
          log(`Diagnostics analysis error: ${err.message}`)
        );
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "received" }));
    } catch (err) {
      log(`Diagnostics error: ${err.message}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── GET /diagnostics — view recent diagnostics logs ──
  if (req.method === "GET" && req.url.startsWith("/diagnostics")) {
    if (AUTH_TOKEN) {
      const authHeader = req.headers["authorization"];
      if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    try {
      if (!fs.existsSync(DIAGNOSTICS_FILE)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries: [], count: 0 }));
        return;
      }

      const lines = fs.readFileSync(DIAGNOSTICS_FILE, "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-50); // Last 50 entries

      const entries = lines.map((line) => {
        try { return JSON.parse(line); } catch { return { raw: line }; }
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ entries, count: entries.length }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Only accept POST /extract
  if (req.method !== "POST" || req.url !== "/extract") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Auth check
  if (AUTH_TOKEN) {
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  try {
    const body = await readBody(req);
    const { prompt, file, model } = JSON.parse(body);

    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing prompt" }));
      return;
    }

    try {
      const result = await enqueueExtraction(prompt, file || null, model || null);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      log(`Extraction error: ${err.message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  } catch (err) {
    log(`Request error: ${err.message}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  log(`Portsie CLI wrapper listening on port ${PORT}`);
  log(`Auth: ${AUTH_TOKEN ? "enabled" : "DISABLED (no AUTH_TOKEN set)"}`);
  log(`Concurrency: ${MAX_CONCURRENT}, max queue: ${MAX_QUEUE_SIZE}, timeout: ${MAX_TIMEOUT_MS}ms`);
});
