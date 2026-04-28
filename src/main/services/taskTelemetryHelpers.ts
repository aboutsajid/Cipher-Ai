import type { AgentTask, AgentTaskTelemetry } from "../../shared/types";

export function ensureTaskTelemetry(task: AgentTask): AgentTaskTelemetry {
  if (!task.telemetry) {
    task.telemetry = {
      fallbackUsed: false,
      modelAttempts: []
    };
  }
  if (!Array.isArray(task.telemetry.modelAttempts)) {
    task.telemetry.modelAttempts = [];
  }
  if (!Array.isArray(task.telemetry.failureMemoryHints)) {
    task.telemetry.failureMemoryHints = [];
  }
  return task.telemetry;
}
