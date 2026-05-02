import type { AgentTask, AgentTaskTelemetry } from "../../shared/types";

export function ensureTaskTelemetry(task: AgentTask): AgentTaskTelemetry {
  if (!task.telemetry) {
    task.telemetry = {
      runMode: task.runMode ?? "build-product",
      fallbackUsed: false,
      modelAttempts: []
    };
  }
  if (!task.telemetry.runMode) {
    task.telemetry.runMode = task.runMode ?? "build-product";
  }
  if (!Array.isArray(task.telemetry.modelAttempts)) {
    task.telemetry.modelAttempts = [];
  }
  if (!Array.isArray(task.telemetry.failureMemoryHints)) {
    task.telemetry.failureMemoryHints = [];
  }
  if (!Array.isArray(task.telemetry.dodGateOutcomes)) {
    task.telemetry.dodGateOutcomes = [];
  }
  return task.telemetry;
}
