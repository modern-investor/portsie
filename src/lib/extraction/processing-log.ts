/**
 * Processing waypoint log for upload extraction pipeline.
 *
 * Tracks each step of processing with timestamps, durations, and errors.
 * Persisted to `uploaded_statements.processing_log` for crash recovery,
 * client polling (via `processing_step`), and remote diagnostics.
 */

export interface Waypoint {
  step: string;
  label: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "running" | "completed" | "failed" | "skipped";
  detail?: string;
  error?: string;
}

export interface ProcessingLogData {
  uploadId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  outcome: "success" | "failed" | "timeout" | "in_progress";
  waypoints: Waypoint[];
  backend?: string;
  model?: string;
  preset?: string;
  errorCategory?: string;
  errorMessage?: string;
  fileInfo: { filename: string; fileType: string; sizeBytes: number };
}

/**
 * Step labels for user-facing display.
 * Keys are internal step names, values are user-friendly labels.
 */
export const STEP_LABELS: Record<string, string> = {
  downloading: "Downloading file...",
  preprocessing: "Preparing file...",
  extracting: "AI is reading your document...",
  validating: "Checking extracted data...",
  matching: "Matching accounts...",
  writing: "Saving to portfolio...",
  verifying: "Running verification...",
};

export class ProcessingLogger {
  private data: ProcessingLogData;
  private startMs: number;

  constructor(
    uploadId: string,
    attemptNumber: number,
    fileInfo: { filename: string; fileType: string; sizeBytes: number }
  ) {
    this.startMs = Date.now();
    this.data = {
      uploadId,
      attemptNumber,
      startedAt: new Date(this.startMs).toISOString(),
      outcome: "in_progress",
      waypoints: [],
      fileInfo,
    };
  }

  /** Set the backend/model/preset metadata (call once you know which backend is selected). */
  setBackendInfo(backend: string, model: string, preset?: string): void {
    this.data.backend = backend;
    this.data.model = model;
    if (preset) this.data.preset = preset;
  }

  /** Start a new processing step. */
  startStep(step: string, label: string, detail?: string): void {
    // If there's a running step that wasn't completed, mark it as completed
    const running = this.data.waypoints.find((w) => w.status === "running");
    if (running) {
      running.status = "completed";
      running.completedAt = new Date().toISOString();
      running.durationMs = Date.now() - new Date(running.startedAt).getTime();
    }

    this.data.waypoints.push({
      step,
      label,
      startedAt: new Date().toISOString(),
      status: "running",
      detail,
    });
  }

  /** Mark the current (or specified) step as completed. */
  completeStep(step?: string): void {
    const waypoint = step
      ? this.data.waypoints.find((w) => w.step === step && w.status === "running")
      : this.data.waypoints.findLast((w) => w.status === "running");

    if (waypoint) {
      waypoint.status = "completed";
      waypoint.completedAt = new Date().toISOString();
      waypoint.durationMs = Date.now() - new Date(waypoint.startedAt).getTime();
    }
  }

  /** Mark the current (or specified) step as failed. */
  failStep(step: string | undefined, error: string): void {
    const waypoint = step
      ? this.data.waypoints.find((w) => w.step === step && w.status === "running")
      : this.data.waypoints.findLast((w) => w.status === "running");

    if (waypoint) {
      waypoint.status = "failed";
      waypoint.completedAt = new Date().toISOString();
      waypoint.durationMs = Date.now() - new Date(waypoint.startedAt).getTime();
      waypoint.error = error;
    }
  }

  /** Get the step name of the currently running waypoint. */
  currentStep(): string | undefined {
    return this.data.waypoints.findLast((w) => w.status === "running")?.step;
  }

  /** Finalize the log with an outcome. */
  finalize(
    outcome: "success" | "failed" | "timeout",
    errorCategory?: string,
    errorMessage?: string
  ): void {
    this.data.outcome = outcome;
    this.data.completedAt = new Date().toISOString();
    this.data.totalDurationMs = Date.now() - this.startMs;
    if (errorCategory) this.data.errorCategory = errorCategory;
    if (errorMessage) this.data.errorMessage = errorMessage;
  }

  /** Serialize for DB storage / diagnostics. */
  toJSON(): ProcessingLogData {
    return { ...this.data };
  }

  /** Get just the current step string for the processing_step column. */
  currentStepString(): string | null {
    return this.currentStep() ?? null;
  }

  /** Elapsed time since processing started, in milliseconds. */
  elapsedMs(): number {
    return Date.now() - this.startMs;
  }
}

/**
 * Fire-and-forget: send processing log to DO diagnostics endpoint.
 * Safe to call from any pipeline stage (extract, confirm, verify).
 * Never blocks or throws — diagnostics must never affect the main flow.
 *
 * @param opts.extractionFailureId  Links to extraction_failures row (extract stage)
 * @param opts.userId      User ID for failure_analyses attribution (all stages)
 * @param opts.stage       Pipeline stage name for richer analysis context
 */
export function sendDiagnostics(
  log: ProcessingLogger,
  opts?: string | null | {
    extractionFailureId?: string | null;
    userId?: string;
    stage?: string;
  }
): void {
  const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT;
  if (!cliEndpoint) return;

  // Backwards compat: accept bare extractionFailureId string
  const resolved = typeof opts === "string" || opts === null || opts === undefined
    ? { extractionFailureId: opts ?? undefined }
    : opts;

  const diagUrl = cliEndpoint.replace(/\/extract\/?$/, "/diagnostics");
  const logData = log.toJSON();
  fetch(diagUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.PORTSIE_CLI_AUTH_TOKEN
        ? { Authorization: `Bearer ${process.env.PORTSIE_CLI_AUTH_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      processingLog: logData,
      uploadId: logData.uploadId,
      extractionFailureId: resolved.extractionFailureId ?? undefined,
      userId: resolved.userId ?? undefined,
      stage: resolved.stage ?? undefined,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {}); // Silent — diagnostics must never block processing
}
