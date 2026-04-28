import type {
  AgentTask,
  AgentTaskRestartMode,
  WorkspaceSnapshot
} from "../../shared/types";

export function buildRestoreSuccessMessage(snapshot: WorkspaceSnapshot): string {
  const targetSuffix = snapshot.targetPathHint ? ` for ${snapshot.targetPathHint}` : "";
  if (snapshot.kind === "after-task") {
    return `Restored After snapshot${targetSuffix}. The finished task output is back in the current workspace state.`;
  }
  if (snapshot.kind === "before-task") {
    return `Restored Before snapshot${targetSuffix}. The workspace is back to the state before this task ran.`;
  }
  return snapshot.label
    ? `Restored snapshot "${snapshot.label}"${targetSuffix}.`
    : `Snapshot restored${targetSuffix}.`;
}

export function buildRestartPrompt(task: AgentTask, mode: AgentTaskRestartMode): string {
  const originalPrompt = (task.prompt ?? "").trim();
  const targetPath = (task.targetPath ?? "").trim();
  const targetHint = targetPath
    ? `\n\nUse the same target path: ${targetPath}.`
    : "";

  if (mode === "retry") {
    return `${originalPrompt}${targetHint}`.trim();
  }

  if (mode === "retry-clean") {
    return `${originalPrompt}${targetHint}\n\nThis is a clean retry from the Before snapshot. Rebuild the task from a fresh pre-task workspace state.`.trim();
  }

  const failureSummary = (task.summary ?? "").trim();
  const verificationFailures = (task.verification?.checks ?? [])
    .filter((check) => check.status === "failed")
    .slice(0, 4)
    .map((check) => `${check.label}: ${check.details}`);

  return [
    targetPath
      ? `Continue fixing the existing task output in ${targetPath}.`
      : "Continue fixing the existing task output.",
    `Original request:\n${originalPrompt}`,
    failureSummary ? `Previous task result:\n${failureSummary}` : "",
    verificationFailures.length > 0
      ? `Verification failures to fix:\n- ${verificationFailures.join("\n- ")}`
      : "",
    "Reuse and repair the current files when possible. Keep scope focused on fixing the failed output and getting verification to pass."
  ].filter(Boolean).join("\n\n");
}
