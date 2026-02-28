import { NextResponse } from "next/server";
import type { DiagramData } from "@/lib/archvisual/types";

// PORTSIE_CLI_ENDPOINT may include /extract already — strip it for base URL
const rawEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? "http://159.89.157.120:8910/extract";
const CLI_ENDPOINT = rawEndpoint.replace(/\/extract\/?$/, "");
const CLI_AUTH = process.env.PORTSIE_CLI_AUTH_TOKEN ?? "";

const SYSTEM_PROMPT = `You are an architecture diagram editor. You receive a JSON data model describing an SVG architecture diagram and a user request to modify it.

The JSON schema:
{
  "nodes": [{ "id": string, "label": string, "sub"?: string, "x": number, "y": number, "w": number, "h": number, "color": string, "icon": string }],
  "edges": [{ "from": string (node id), "to": string (node id), "color": string, "label": string, "dash"?: string, "bidir"?: boolean, "strokeWidth"?: number, "path"?: string (SVG path d), "labelX"?: number, "labelY"?: number, "labelRotate"?: number }],
  "regions": [{ "label": string, "x": number, "y": number, "w": number, "h": number, "color": string }]
}

The SVG viewBox is 600x460. Node positions are (x, y) for top-left corner. Available colors: blue, violet, emerald, amber, gray, red, cyan, pink, orange, teal. Available icons: Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield, Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box.

Edge "path" is an SVG path d attribute for precise routing. If you add a new edge, compute a reasonable path or omit it to let the system auto-compute from node positions. "labelX" and "labelY" position the edge label.

Rules:
- Return ONLY the modified JSON object, no commentary
- Preserve existing node IDs when modifying (don't rename IDs unnecessarily)
- Keep the diagram readable: avoid overlapping nodes, maintain spacing
- For new nodes, pick positions that flow logically in the existing layout
- For new edges, provide path/labelX/labelY if the auto-computed path would look bad
- The output must be valid JSON parseable as DiagramData`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { diagramData, message } = body as { diagramData: DiagramData; message: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const prompt = `${SYSTEM_PROMPT}

Current diagram JSON:
${JSON.stringify(diagramData, null, 2)}

User request: ${message}

Return the modified diagram JSON only.`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CLI_AUTH) headers["Authorization"] = `Bearer ${CLI_AUTH}`;

    const resp = await fetch(`${CLI_ENDPOINT}/extract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, model: "claude-sonnet-4-6" }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `CLI wrapper error: ${text}` }, { status: 502 });
    }

    const raw = await resp.json();

    // The CLI wrapper returns either parsed JSON directly or { result: "..." }
    let modified: DiagramData;
    if (raw.nodes && raw.edges) {
      modified = raw as DiagramData;
    } else if (raw.result) {
      // Try to parse the result string as JSON
      const text = typeof raw.result === "string" ? raw.result : JSON.stringify(raw.result);
      // Extract JSON from possible markdown code fence
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
      modified = JSON.parse(jsonMatch[1]!.trim());
    } else {
      return NextResponse.json({ error: "Unexpected response format from CLI wrapper" }, { status: 502 });
    }

    // Basic validation
    if (!Array.isArray(modified.nodes) || !Array.isArray(modified.edges)) {
      return NextResponse.json({ error: "Invalid diagram data in response" }, { status: 502 });
    }

    return NextResponse.json({ diagramData: modified });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
