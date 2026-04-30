function summarizeAgentPrompt(prompt: string): string {
  const normalized = (prompt ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Untitled task";
  return normalized.length > 84 ? `${normalized.slice(0, 84)}...` : normalized;
}

async function refreshAgentTaskTargetStates(tasks: AgentTask[]): Promise<void> {
  const next = new Map<string, boolean>();
  await Promise.all(tasks.map(async (task) => {
    if (!task.targetPath) return;
    try {
      next.set(task.id, await window.api.workspace.pathExists(task.targetPath));
    } catch {
      next.set(task.id, false);
    }
  }));

  taskTargetExistsById.clear();
  for (const [taskId, exists] of next.entries()) {
    taskTargetExistsById.set(taskId, exists);
  }
}

function ensureAgentPolling(): void {
  if (agentPollTimer) return;
  agentPollTimer = setInterval(() => {
    void refreshAgentTask(true);
  }, AGENT_POLL_FALLBACK_MS);
}

function scheduleAgentTaskRefreshFromEvent(forceLogs = false): void {
  pendingAgentEventRefreshForceLogs = pendingAgentEventRefreshForceLogs || forceLogs;
  if (agentEventRefreshTimer) return;
  agentEventRefreshTimer = setTimeout(() => {
    const nextForceLogs = pendingAgentEventRefreshForceLogs;
    pendingAgentEventRefreshForceLogs = false;
    agentEventRefreshTimer = null;
    void refreshAgentTask(nextForceLogs);
  }, AGENT_EVENT_REFRESH_DEBOUNCE_MS);
}
