import type { AgentTask, AgentTaskRestartMode } from "../../shared/types";

export function ensureNoRunningTask(
  activeTaskId: string | null,
  tasks: ReadonlyMap<string, AgentTask>
): void {
  if (!activeTaskId) return;
  const active = tasks.get(activeTaskId);
  if (active && active.status === "running") {
    throw new Error("Another agent task is already running.");
  }
}

export function describeRestartMode(mode: AgentTaskRestartMode): string {
  if (mode === "retry-clean") return "Retry Clean";
  if (mode === "continue-fix") return "Continue Fix";
  return "Retry";
}
