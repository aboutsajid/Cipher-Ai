import type { AgentVerificationStatus } from "../../shared/types";

export interface ParsedProbeResult {
  status: AgentVerificationStatus;
  details: string;
}

function parseProbeResult(output: string, marker: "served-page" | "api-probe"): ParsedProbeResult | null {
  const match = new RegExp(`\\[${marker}\\]\\s+(passed|failed|skipped)\\s+\\|\\s+([^\\n\\r]+)`, "i").exec(output ?? "");
  if (!match) return null;
  const status = match[1]?.toLowerCase();
  if (status !== "passed" && status !== "failed" && status !== "skipped") {
    return null;
  }
  return {
    status,
    details: match[2]?.trim() ?? ""
  };
}

export function stripAnsiControlSequences(value: string): string {
  return (value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

export function parseBrowserSmokeResult(output: string): ParsedProbeResult | null {
  const normalizedOutput = stripAnsiControlSequences(output ?? "").trim();
  if (!normalizedOutput) return null;
  const lines = normalizedOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line?.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as { status?: string; details?: string };
      const status = parsed.status?.toLowerCase();
      if (status !== "passed" && status !== "failed" && status !== "skipped") {
        continue;
      }
      return {
        status,
        details: typeof parsed.details === "string" && parsed.details.trim()
          ? parsed.details.trim()
          : "Browser smoke returned no details."
      };
    } catch {
      // ignore malformed lines and keep scanning upward
    }
  }
  return null;
}

export function isBrowserSmokeInfrastructureFailure(details: string): boolean {
  const normalized = (details ?? "").toLowerCase();
  return normalized.includes("whenready")
    || normalized.includes("cannot read properties of undefined")
    || normalized.includes("browser smoke command failed")
    || normalized.includes("unknown error");
}

export function extractServedPageProbeResult(output: string): ParsedProbeResult | null {
  return parseProbeResult(output, "served-page");
}

export function extractApiProbeResult(output: string): ParsedProbeResult | null {
  return parseProbeResult(output, "api-probe");
}

export function looksLikeCliUsageFailure(output: string): boolean {
  const normalized = (output ?? "").toLowerCase();
  if (!normalized) return false;
  return /usage:|missing required|requires? an argument|expects? .*file|provide .*file|no input file|markdown-file/.test(normalized);
}

export function parseJsonFromOutput(output: string): unknown {
  const trimmed = (output ?? "").trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject !== -1 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }
  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray !== -1 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // keep trying looser slices
    }
  }
  return null;
}

export function buildFetchHeaders(init?: RequestInit): HeadersInit {
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return headers;
}

export function isApiCollectionPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return true;
  }
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return Object.values(payload as Record<string, unknown>).some((value) => Array.isArray(value));
}
