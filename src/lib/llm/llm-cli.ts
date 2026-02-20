import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, rm } from "fs/promises";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { buildExtractionPrompt } from "./prompts";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import type { PortsieExtraction } from "../extraction/schema";
import { validateExtraction } from "../extraction/validate";

const execFileAsync = promisify(execFile);

/**
 * CLI backend: uses `claude -p` (Claude Code CLI in print mode).
 * Dispatches to local subprocess or remote HTTP endpoint.
 * Returns a validated PortsieExtraction and the raw CLI response.
 */
export async function extractViaCLI(
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  cliEndpoint: string | null,
  model?: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
  if (cliEndpoint) {
    return extractViaCLIRemote(cliEndpoint, processedFile, fileType, filename, model);
  }
  return extractViaCLILocal(processedFile, fileType, filename, model);
}

/**
 * Local subprocess: runs `claude -p` on the same server.
 * For binary files (PDF, images), writes to a temp file and references the path.
 * For text files, inlines content directly in the prompt.
 */
async function extractViaCLILocal(
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  model?: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
  let tempDir: string | null = null;
  let tempFilePath: string | null = null;

  try {
    // For binary files, write to temp so claude's Read tool can access them
    if (processedFile.contentType !== "text" && processedFile.base64Data) {
      tempDir = await mkdtemp(join(tmpdir(), "portsie-llm-"));
      tempFilePath = join(tempDir, filename);
      const buffer = Buffer.from(processedFile.base64Data, "base64");
      await writeFile(tempFilePath, buffer);
    }

    const prompt = buildCLIPrompt(processedFile, fileType, filename, tempFilePath);

    const cliArgs = ["-p", prompt, "--output-format", "json"];
    if (model) cliArgs.push("--model", model);

    const { stdout } = await execFileAsync(
      "claude",
      cliArgs,
      {
        timeout: 300_000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
      }
    );

    // claude --output-format json returns a JSON object with a "result" field
    let cliResponse: Record<string, unknown>;
    try {
      cliResponse = JSON.parse(stdout);
    } catch {
      // If not valid JSON, treat the entire stdout as the result text
      cliResponse = { result: stdout };
    }

    const resultText =
      typeof cliResponse.result === "string"
        ? cliResponse.result
        : JSON.stringify(cliResponse.result);

    // Validate against PortsieExtraction schema (Stage 2)
    const validationResult = validateExtraction(resultText);
    if (!validationResult.valid || !validationResult.extraction) {
      const errorSummary = validationResult.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ");
      throw new Error(
        `Extraction validation failed: ${errorSummary || "unknown error"}`
      );
    }

    let extraction = validationResult.extraction;
    if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
      const validationNotes = [
        ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
        ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
      ];
      extraction = {
        ...extraction,
        notes: [...(extraction.notes || []), ...validationNotes],
      };
    }

    return { extraction, rawResponse: cliResponse };
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code` or switch to API mode in Settings."
      );
    }
    throw err;
  } finally {
    // Cleanup temp files
    if (tempFilePath) await unlink(tempFilePath).catch(() => {});
    if (tempDir) await rm(tempDir, { recursive: true }).catch(() => {});
  }
}

/**
 * Remote HTTP: POSTs to a Claude CLI wrapper running on a DO server.
 */
async function extractViaCLIRemote(
  endpoint: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  model?: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
  const prompt = buildCLIPrompt(processedFile, fileType, filename, null);

  const body: Record<string, unknown> = { prompt };
  if (model) body.model = model;

  // For binary files, send the base64 content to the remote server
  if (processedFile.contentType !== "text" && processedFile.base64Data) {
    body.file = {
      content: processedFile.base64Data,
      filename,
      mimeType: processedFile.mediaType,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = process.env.PORTSIE_CLI_AUTH_TOKEN;
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000), // 5 minute timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `CLI remote endpoint error (${response.status}): ${errorText}`
    );
  }

  const cliResponse = await response.json();
  const resultText =
    typeof cliResponse.result === "string"
      ? cliResponse.result
      : JSON.stringify(cliResponse.result);

  // Validate against PortsieExtraction schema (Stage 2)
  const validationResult = validateExtraction(resultText);
  if (!validationResult.valid || !validationResult.extraction) {
    const errorSummary = validationResult.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(
      `Extraction validation failed: ${errorSummary || "unknown error"}`
    );
  }

  let extraction = validationResult.extraction;
  if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
    const validationNotes = [
      ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
      ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
    ];
    extraction = {
      ...extraction,
      notes: [...(extraction.notes || []), ...validationNotes],
    };
  }

  return { extraction, rawResponse: cliResponse };
}

/**
 * Build the text prompt for the CLI.
 * - Text files: content inlined in the prompt
 * - Binary files: reference the temp file path (local) or note that content is attached (remote)
 */
function buildCLIPrompt(
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  tempFilePath: string | null
): string {
  let fileInstruction: string;

  if (processedFile.contentType === "text") {
    // Inline text content directly
    let textContent = processedFile.textContent ?? "";

    // Include pre-parsed CSV samples if available
    if (
      processedFile.preExtractedRows &&
      processedFile.preExtractedRows.length > 0
    ) {
      const rows = processedFile.preExtractedRows;
      const headCount = Math.min(20, rows.length);
      const tailCount = rows.length > headCount ? Math.min(10, rows.length - headCount) : 0;
      textContent += `\n\n--- Pre-parsed CSV structure (${rows.length} total rows) ---\n`;
      textContent += `First ${headCount} rows:\n${JSON.stringify(rows.slice(0, headCount), null, 2)}`;
      if (tailCount > 0) {
        textContent += `\n\nLast ${tailCount} rows:\n${JSON.stringify(rows.slice(-tailCount), null, 2)}`;
      }
      textContent += "\n--- End pre-parsed data. Map the columns above to the schema. ---\n";
    }

    fileInstruction = `Here is the content of "${filename}" (${fileType.toUpperCase()}):\n\n${textContent}`;
  } else if (tempFilePath) {
    fileInstruction = `Read the file at "${tempFilePath}" — it is a ${fileType.toUpperCase()} file named "${filename}". Extract all financial data from it.`;
  } else {
    fileInstruction = `Extract financial data from the ${fileType.toUpperCase()} file named "${filename}".`;
  }

  return `${buildExtractionPrompt()}\n\n${fileInstruction}\n\nRespond ONLY with the JSON object.`;
}
