import type {
  AgentArtifactType,
  AgentTask,
  AgentVerificationCheck,
  TerminalCommandResult
} from "../../shared/types";

export function describeArtifactType(artifactType: AgentArtifactType | undefined): string {
  switch (artifactType) {
    case "web-app":
      return "web app";
    case "api-service":
      return "API service";
    case "script-tool":
      return "script tool";
    case "library":
      return "library";
    case "desktop-app":
      return "desktop app";
    case "workspace-change":
      return "workspace change";
    default:
      return "task";
  }
}

export function buildCompletedTaskSummary(task: AgentTask): string {
  const artifact = describeArtifactType(task.artifactType);
  const target = (task.targetPath ?? "").trim();
  const normalizedTarget = target === "." ? "" : target;
  const targetPart = normalizedTarget ? ` for ${normalizedTarget}` : "";
  const verificationPart = task.verification?.summary ? ` Verification: ${task.verification.summary}.` : "";
  return `Completed ${artifact}${targetPart}.${verificationPart}`.trim();
}

export function buildRequirementFailureMessage(checks: AgentVerificationCheck[]): string {
  const failed = checks.filter((check) => check.status === "failed");
  if (failed.length === 0) return "Prompt requirements not met.";
  return `Prompt requirements not met: ${failed.map((check) => check.label).join(", ")}.`;
}

export function extractTerminalFailureDetail(result: TerminalCommandResult): string {
  const lines = (result.combinedOutput || `${result.stderr}\n${result.stdout}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const candidate = lines[lines.length - 1].replace(/\s+/g, " ");
  return candidate.length > 220 ? `${candidate.slice(0, 217)}...` : candidate;
}

export function buildCommandFailureMessage(
  label: string,
  result: TerminalCommandResult,
  qualifier = "failed"
): string {
  const reason = result.timedOut
    ? `timed out after ${Math.max(1, Math.round(result.durationMs / 1000))}s`
    : typeof result.code === "number"
      ? `exited with code ${result.code}`
      : result.signal
        ? `ended with signal ${result.signal}`
        : "did not complete successfully";
  const detail = extractTerminalFailureDetail(result);
  return `${label} ${qualifier}. ${reason}.${detail ? ` Last output: ${detail}` : ""}`.trim();
}
