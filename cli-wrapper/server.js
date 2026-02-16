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
let isProcessing = false;

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

      // Replace the placeholder in the prompt with the actual temp path
      // The remote prompt says "Extract financial data from the FILE_TYPE file named FILENAME"
      // We need to tell claude where the file actually is
      prompt += `\n\nThe file has been saved to "${tempFilePath}". Read it from that path.`;
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
        stdio: ["pipe", "pipe", "pipe"],
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

        // Parse the JSON output from claude --output-format json
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch {
          // If not valid JSON, wrap the raw output
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
    res.end(JSON.stringify({ status: "ok", service: "portsie-cli-wrapper" }));
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

    if (isProcessing) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Already processing a request. Try again shortly." }));
      return;
    }

    isProcessing = true;
    log(`Processing extraction (prompt: ${prompt.length} chars, file: ${file ? file.filename : "none"})`);

    try {
      const result = await runClaude(prompt, file || null);
      log(`Extraction complete`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } finally {
      isProcessing = false;
    }
  } catch (err) {
    log(`Error: ${err.message}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  log(`Portsie CLI wrapper listening on port ${PORT}`);
  log(`Auth: ${AUTH_TOKEN ? "enabled" : "DISABLED (no AUTH_TOKEN set)"}`);
});
