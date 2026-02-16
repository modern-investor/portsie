export interface VersionCommit {
  sha: string;
  short_sha: string;
  author: string;
  message: string;
}

export interface VersionInfo {
  version: string;
  release: number;
  sha: string;
  fullSha: string;
  actor: string;
  source: string;
  model: string;
  machine: string;
  pushedAt: string;
  commits: VersionCommit[];
}

const MODEL_NAMES: Record<string, string> = {
  ci: "CI",
  claude: "Claude",
  "o4.6": "Claude Opus 4.6",
  cursor: "Cursor",
  gemini: "Gemini",
  gpt: "GPT",
  manual: "Manual",
  initial: "Initial",
};

export function getModelName(code: string): string {
  return MODEL_NAMES[code] || code;
}

export function formatRelease(seq: number): string {
  return `r${String(seq).padStart(5, "0")}`;
}

export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
