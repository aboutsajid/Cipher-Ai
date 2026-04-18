import { isAbsolute } from "node:path";
import { resolveUtilityRoute } from "./utilityPromptSupport";
import type { Settings, ClaudeManagedEdit, ManagedWriteVerificationFinding, ManagedWriteVerificationReport } from "../shared/types";
import type { UtilityPromptSender } from "./utilityPromptSupport";

const MAX_FILES_IN_PROMPT = 24;
const MAX_TOTAL_CONTENT_CHARS = 120_000;

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

function normalizeFindingSeverity(input: unknown): "error" | "warn" {
  return input === "error" ? "error" : "warn";
}

function normalizeFinding(item: unknown): ManagedWriteVerificationFinding | null {
  if (!item || typeof item !== "object") return null;
  const record = item as { severity?: unknown; message?: unknown; path?: unknown };
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) return null;

  return {
    severity: normalizeFindingSeverity(record.severity),
    message,
    path: typeof record.path === "string" ? record.path.trim() || undefined : undefined
  };
}

export function parseManagedWriteVerificationResponse(input: string): {
  status: "passed" | "warning" | "blocked";
  summary: string;
  findings: ManagedWriteVerificationFinding[];
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
  const record = parsed as { status?: unknown; summary?: unknown; findings?: unknown };
  const rawStatus = typeof record.status === "string" ? record.status.trim() : "";
  const status = rawStatus === "blocked" || rawStatus === "warning" ? rawStatus : "passed";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const findings = Array.isArray(record.findings) ? record.findings.map(normalizeFinding).filter(Boolean) as ManagedWriteVerificationFinding[] : [];

  return { status, summary, findings };
}

export function collectManagedWriteLocalFindings(edits: ClaudeManagedEdit[]): ManagedWriteVerificationFinding[] {
  const findings: ManagedWriteVerificationFinding[] = [];
  const seenPaths = new Set<string>();

  for (const edit of edits) {
    const path = (edit?.path ?? "").trim();
    if (!path) {
      findings.push({ severity: "error", message: "An edit is missing its target path." });
      continue;
    }
    if (!isAbsolute(path)) {
      findings.push({ severity: "error", path, message: "Path must be absolute." });
    }
    if (seenPaths.has(path)) {
      findings.push({ severity: "warn", path, message: "The proposal includes duplicate edits for the same path." });
    }
    seenPaths.add(path);

    if (path.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(typeof edit?.content === "string" ? edit.content : "");
      } catch (err) {
        findings.push({
          severity: "error",
          path,
          message: `Invalid JSON content: ${err instanceof Error ? err.message : "parse failed"}`
        });
      }
    }
  }

  return findings;
}

function mergeFindings(findings: ManagedWriteVerificationFinding[]): ManagedWriteVerificationFinding[] {
  const seen = new Set<string>();
  const merged: ManagedWriteVerificationFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.severity}|${finding.path ?? ""}|${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(finding);
  }

  return merged;
}

function deriveStatus(findings: ManagedWriteVerificationFinding[]): "passed" | "warning" | "blocked" {
  if (findings.some((finding) => finding.severity === "error")) return "blocked";
  if (findings.length > 0) return "warning";
  return "passed";
}

function combineStatuses(
  localStatus: "passed" | "warning" | "blocked",
  verifierStatus: "passed" | "warning" | "blocked"
): "passed" | "warning" | "blocked" {
  if (localStatus === "blocked" || verifierStatus === "blocked") return "blocked";
  if (localStatus === "warning" || verifierStatus === "warning") return "warning";
  return "passed";
}

function truncateBody(input: string, remaining: number): string {
  if (remaining <= 0) return "";
  if (input.length <= remaining) return input;
  return `${input.slice(0, Math.max(0, remaining - 24))}\n[Content truncated for verification]`;
}

export function buildManagedWriteVerificationPrompt(edits: ClaudeManagedEdit[]): string {
  let remaining = MAX_TOTAL_CONTENT_CHARS;
  const sections = edits.slice(0, MAX_FILES_IN_PROMPT).map((edit) => {
    const path = (edit.path ?? "").trim() || "(missing path)";
    const content = typeof edit.content === "string" ? edit.content : "";
    const body = truncateBody(content, remaining);
    remaining -= body.length;
    return `--- FILE: ${path} ---\n${body}`;
  });

  const omitted = edits.length > MAX_FILES_IN_PROMPT ? `\nAdditional omitted files: ${edits.length - MAX_FILES_IN_PROMPT}` : "";

  return [
    "Verify this Claude managed-write proposal before it is saved.",
    "Review for malformed JSON, broken manifests, obvious runtime blockers, contradictory summaries, invalid paths, and missing essentials implied by the file set.",
    "Do not rewrite code.",
    "Do not use markdown.",
    "Return only valid JSON and nothing else.",
    'Use this exact shape: {"status":"passed|warning|blocked","summary":"short summary","findings":[{"severity":"error|warn","path":"optional absolute path","message":"short issue"}]}',
    "Use status=blocked when the proposal should not be written as-is.",
    "Use status=warning when the proposal is saveable but has material risks.",
    "Use status=passed when there are no meaningful issues.",
    "",
    `Files proposed: ${edits.length}${omitted}`,
    "",
    ...sections
  ].join("\n");
}

export async function verifyManagedWriteProposal(
  settings: Settings,
  sendMessage: UtilityPromptSender,
  edits: ClaudeManagedEdit[]
): Promise<ManagedWriteVerificationReport> {
  const localFindings = collectManagedWriteLocalFindings(edits);
  let reviewerModel: string | undefined;
  let summary = "";

  try {
    const route = resolveUtilityRoute(settings, "verification");
    reviewerModel = route.model;
    const prompt = buildManagedWriteVerificationPrompt(edits);
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

    const parsed = parseManagedWriteVerificationResponse(raw);
    if (!parsed) {
      const findings = mergeFindings([
        ...localFindings,
        { severity: "warn", message: "Verifier returned invalid JSON, so only local checks were used." }
      ]);
      return {
        ok: !findings.some((finding) => finding.severity === "error"),
        status: deriveStatus(findings),
        summary: "Verification completed with fallback local checks only.",
        findings,
        reviewerModel,
        rawResponse: raw.trim() || undefined
      };
    }

    const findings = mergeFindings([...localFindings, ...parsed.findings]);
    const status = combineStatuses(deriveStatus(localFindings), parsed.status);
    summary = parsed.summary || (status === "passed" ? "Verifier found no meaningful issues." : "Verifier found issues.");

    return {
      ok: status !== "blocked",
      status,
      summary,
      findings,
      reviewerModel,
      rawResponse: raw.trim() || undefined
    };
  } catch (err) {
    if (localFindings.length > 0) {
      const findings = mergeFindings(localFindings);
      return {
        ok: !findings.some((finding) => finding.severity === "error"),
        status: deriveStatus(findings),
        summary: "Utility verifier was unavailable, so local checks were used.",
        findings,
        reviewerModel
      };
    }

    return {
      ok: true,
      status: "skipped",
      summary: `Verification skipped: ${err instanceof Error ? err.message : "utility verifier unavailable"}`,
      findings: [],
      reviewerModel
    };
  }
}
