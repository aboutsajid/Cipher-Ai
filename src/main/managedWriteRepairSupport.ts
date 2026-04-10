import { resolveUtilityRoute } from "./utilityPromptSupport";
import type {
  ClaudeManagedEdit,
  ManagedWriteRepairResult,
  ManagedWriteVerificationReport,
  Settings
} from "../shared/types";
import type { UtilityPromptSender } from "./utilityPromptSupport";

const MAX_FILES_IN_PROMPT = 20;
const MAX_TOTAL_CONTENT_CHARS = 100_000;

function extractFirstJsonObject(input: string): string | null {
  const candidate = (input ?? "").trim();
  if (!candidate) return null;

  const firstBrace = candidate.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = firstBrace; index < candidate.length; index += 1) {
    const ch = candidate[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return candidate.slice(firstBrace, index + 1).trim();
    }
  }

  return null;
}

function truncateBody(input: string, remaining: number): string {
  if (remaining <= 0) return "";
  if (input.length <= remaining) return input;
  return `${input.slice(0, Math.max(0, remaining - 24))}\n[Content truncated for repair]`;
}

export function parseManagedWriteRepairResponse(input: string): {
  summary: string;
  edits: ClaudeManagedEdit[];
} | null {
  const jsonCandidate = extractFirstJsonObject(input);
  if (!jsonCandidate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { summary?: unknown; edits?: unknown };
  if (!Array.isArray(record.edits)) return null;

  const edits = record.edits
    .filter((item): item is { path?: unknown; content?: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({
      path: typeof item.path === "string" ? item.path.trim() : "",
      content: typeof item.content === "string" ? item.content : ""
    }))
    .filter((item) => item.path);

  return {
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    edits
  };
}

export function buildManagedWriteRepairPrompt(
  edits: ClaudeManagedEdit[],
  verification: ManagedWriteVerificationReport
): string {
  let remaining = MAX_TOTAL_CONTENT_CHARS;
  const paths = edits.map((edit) => edit.path.trim()).filter(Boolean);
  const fileSections = edits.slice(0, MAX_FILES_IN_PROMPT).map((edit) => {
    const path = (edit.path ?? "").trim() || "(missing path)";
    const content = typeof edit.content === "string" ? edit.content : "";
    const body = truncateBody(content, remaining);
    remaining -= body.length;
    return `--- FILE: ${path} ---\n${body}`;
  });
  const omitted = edits.length > MAX_FILES_IN_PROMPT ? `\nAdditional omitted files: ${edits.length - MAX_FILES_IN_PROMPT}` : "";

  return [
    "Repair this blocked Claude managed-write proposal.",
    "The verifier found blocking issues in the proposed files.",
    "Rewrite the proposed files so the blocking issues are fixed.",
    "Do not add explanation.",
    "Do not use markdown.",
    "Return only valid JSON and nothing else.",
    'Use this exact shape: {"summary":"short summary","edits":[{"path":"absolute path","content":"full new file content"}]}',
    "The content field must contain the complete final file contents, not a diff.",
    "Only edit the same file paths listed below. Do not add new paths and do not omit paths unless a file should remain unchanged.",
    "Prefer the smallest set of content fixes that resolve the blocking issues.",
    "",
    "Blocked verifier findings:",
    verification.summary || "Verifier blocked the proposal.",
    ...(verification.findings.length > 0
      ? verification.findings.map((finding) => `- ${finding.severity.toUpperCase()}${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`)
      : ["- No detailed findings provided."]),
    "",
    `Allowed paths:\n${paths.map((path) => `- ${path}`).join("\n")}`,
    "",
    `Files proposed: ${edits.length}${omitted}`,
    "",
    ...fileSections
  ].join("\n");
}

export async function repairManagedWriteProposal(
  settings: Settings,
  sendMessage: UtilityPromptSender,
  edits: ClaudeManagedEdit[],
  verification: ManagedWriteVerificationReport
): Promise<ManagedWriteRepairResult> {
  let reviewerModel: string | undefined;

  try {
    const route = resolveUtilityRoute(settings);
    reviewerModel = route.model;
    const prompt = buildManagedWriteRepairPrompt(edits, verification);
    let raw = "";

    await sendMessage(
      [{ role: "user", content: prompt }],
      route.model,
      (chunk) => {
        raw += chunk;
      },
      undefined,
      route
    );

    const parsed = parseManagedWriteRepairResponse(raw);
    if (!parsed) {
      return {
        ok: false,
        summary: "Auto-repair returned invalid JSON.",
        edits: [],
        reviewerModel,
        rawResponse: raw.trim() || undefined,
        error: "invalid-json"
      };
    }

    if (parsed.edits.length === 0) {
      return {
        ok: false,
        summary: parsed.summary || "Auto-repair returned no file edits.",
        edits: [],
        reviewerModel,
        rawResponse: raw.trim() || undefined,
        error: "empty-edits"
      };
    }

    return {
      ok: true,
      summary: parsed.summary || "Auto-repair generated a corrected file proposal.",
      edits: parsed.edits,
      reviewerModel,
      rawResponse: raw.trim() || undefined
    };
  } catch (err) {
    return {
      ok: false,
      summary: `Auto-repair failed: ${err instanceof Error ? err.message : "unknown error"}`,
      edits: [],
      reviewerModel,
      error: err instanceof Error ? err.message : "unknown error"
    };
  }
}
