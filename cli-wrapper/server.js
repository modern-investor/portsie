#!/usr/bin/env node
// ============================================
// Portsie CLI Wrapper — Claude Code HTTP Endpoint
// Runs on DO droplet, receives extraction requests from Vercel
// ============================================

const http = require("http");
const { spawn } = require("child_process");
const { writeFile, unlink, rm, mkdtemp } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");

const PORT = parseInt(process.env.PORT || "8910", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN; // shared secret with Vercel
const MAX_TIMEOUT_MS = parseInt(process.env.MAX_TIMEOUT_MS || "180000", 10); // 3 min
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
async function runClaude(prompt, file) {
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
    const { prompt, file, resolve, reject } = requestQueue.shift();
    activeCount++;
    log(`Starting extraction (active: ${activeCount}/${MAX_CONCURRENT}, queued: ${requestQueue.length}, file: ${file ? file.filename : "none"})`);

    runClaude(prompt, file)
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
function enqueueExtraction(prompt, file) {
  return new Promise((resolve, reject) => {
    if (requestQueue.length >= MAX_QUEUE_SIZE) {
      reject(new Error("Queue full. Try again later."));
      return;
    }
    const position = requestQueue.length + activeCount;
    requestQueue.push({ prompt, file, resolve, reject });
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
    const { prompt, file } = JSON.parse(body);

    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing prompt" }));
      return;
    }

    try {
      const result = await enqueueExtraction(prompt, file || null);
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
