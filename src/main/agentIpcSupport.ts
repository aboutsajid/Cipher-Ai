import type {
  AgentTaskRequest,
  AgentTaskRestartMode,
  AgentRouteDiagnostics,
  AgentSnapshotRestoreResult,
  AttachmentPayload,
  AgentTask,
} from "../shared/types";
import { normalizeAttachments } from "./attachmentSupport";

interface AgentTaskRunnerLike {
  getTask(taskId: string): AgentTask | null;
  getTaskLogs(taskId: string): string[];
  getRouteDiagnostics(taskId?: string): AgentRouteDiagnostics;
  startTask(prompt: string, attachments?: AttachmentPayload[]): Promise<AgentTask>;
  restartTask(taskId: string, mode: AgentTaskRestartMode): Promise<AgentTask>;
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

function normalizeAgentTaskRequest(request: string | AgentTaskRequest): { prompt: string; attachments: AttachmentPayload[] } {
  if (typeof request === "string") {
    return {
      prompt: (request ?? "").trim(),
      attachments: []
    };
  }
  return {
    prompt: (request?.prompt ?? "").trim(),
    attachments: normalizeAttachments(request?.attachments)
  };
}

export async function startAgentTask(
  agentTaskRunner: AgentTaskRunnerLike,
  request: string | AgentTaskRequest
): Promise<AgentTask> {
  const normalizedRequest = normalizeAgentTaskRequest(request);
  const normalizedPrompt = normalizedRequest.prompt;
  if (!normalizedPrompt) throw new Error("Agent prompt is required.");
  return agentTaskRunner.startTask(normalizedPrompt, normalizedRequest.attachments);
}

export async function restartAgentTask(
  agentTaskRunner: AgentTaskRunnerLike,
  taskId: string,
  mode: AgentTaskRestartMode
): Promise<AgentTask> {
  const normalizedTaskId = (taskId ?? "").trim();
  if (!normalizedTaskId) throw new Error("Task ID is required.");
  if (!["retry", "retry-clean", "continue-fix"].includes(mode)) {
    throw new Error("Restart mode is invalid.");
  }
  return agentTaskRunner.restartTask(normalizedTaskId, mode);
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
