import type {
  AgentRouteDiagnostics,
  AgentSnapshotRestoreResult,
  AgentTask,
} from "../shared/types";

interface AgentTaskRunnerLike {
  getTask(taskId: string): AgentTask | null;
  getTaskLogs(taskId: string): string[];
  getRouteDiagnostics(taskId?: string): AgentRouteDiagnostics;
  startTask(prompt: string): Promise<AgentTask>;
  stopTask(taskId: string): Promise<boolean>;
  restoreSnapshot(snapshotId: string): Promise<AgentSnapshotRestoreResult>;
}

export function getAgentTask(agentTaskRunner: AgentTaskRunnerLike, taskId: string): AgentTask | null {
  return agentTaskRunner.getTask((taskId ?? "").trim());
}

export function getAgentTaskLogs(agentTaskRunner: AgentTaskRunnerLike, taskId: string): string[] {
  return agentTaskRunner.getTaskLogs((taskId ?? "").trim());
}

export function getAgentRouteDiagnostics(agentTaskRunner: AgentTaskRunnerLike, taskId?: string): AgentRouteDiagnostics {
  const normalizedTaskId = (taskId ?? "").trim();
  return agentTaskRunner.getRouteDiagnostics(normalizedTaskId || undefined);
}

export async function startAgentTask(agentTaskRunner: AgentTaskRunnerLike, prompt: string): Promise<AgentTask> {
  const normalizedPrompt = (prompt ?? "").trim();
  if (!normalizedPrompt) throw new Error("Agent prompt is required.");
  return agentTaskRunner.startTask(normalizedPrompt);
}

export function stopAgentTask(agentTaskRunner: AgentTaskRunnerLike, taskId: string): Promise<boolean> {
  return agentTaskRunner.stopTask((taskId ?? "").trim());
}

export async function restoreAgentSnapshot(
  agentTaskRunner: AgentTaskRunnerLike,
  snapshotId: string
): Promise<AgentSnapshotRestoreResult> {
  return agentTaskRunner.restoreSnapshot((snapshotId ?? "").trim());
}
