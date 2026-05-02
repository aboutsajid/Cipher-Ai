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
  if (!lastAgentTaskChangeAt) {
    lastAgentTaskChangeAt = Date.now();
  }
  agentPollTimer = setInterval(() => {
    const staleMs = Date.now() - lastAgentTaskChangeAt;
    if (staleMs < AGENT_EVENT_STALE_FALLBACK_MS) return;
    void refreshAgentTask(true);
  }, AGENT_POLL_FALLBACK_MS);
}

function scheduleAgentTaskRefreshFromEvent(forceLogs = false): void {
  lastAgentTaskChangeAt = Date.now();
  pendingAgentEventRefreshForceLogs = pendingAgentEventRefreshForceLogs || forceLogs;
  if (agentEventRefreshTimer) return;
  agentEventRefreshTimer = setTimeout(() => {
    const nextForceLogs = pendingAgentEventRefreshForceLogs;
    pendingAgentEventRefreshForceLogs = false;
    agentEventRefreshTimer = null;
    void refreshAgentTask(nextForceLogs);
  }, AGENT_EVENT_REFRESH_DEBOUNCE_MS);
}

function completedTaskIsRecent(task: AgentTask, withinMs = 20_000): boolean {
  const completedAt = Date.parse(task.updatedAt);
  if (Number.isNaN(completedAt)) return false;
  return Date.now() - completedAt <= withinMs;
}

function shouldQueueDesktopLaunchPrompt(
  task: AgentTask,
  previousStatus: AgentTask["status"] | null,
  restoreState: AgentSnapshotRestoreResult | null
): boolean {
  if (handledDesktopLaunchPromptTasks.has(task.id)) return false;
  if (!canPromptToLaunchDesktopApp(task)) return false;
  if (restoreState?.snapshotKind === "before-task") return false;
  if (pendingDesktopLaunchPromptTasks.has(task.id)) return true;
  if (previousStatus === "running") return true;
  return completedTaskIsRecent(task);
}

async function refreshAgentTask(forceLogs = false): Promise<void> {
  const tasks = await window.api.agent.listTasks();
  await refreshAgentTaskTargetStates(tasks);
  await refreshAgentSnapshots();
  let needsHistoryRerender = false;
  renderAgentHistory(tasks);
  if (!activeAgentTaskId) {
    const fallbackTask = tasks[0] ?? null;
    if (!fallbackTask) {
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
      return;
    }
    activeAgentTaskId = fallbackTask.id;
    needsHistoryRerender = true;
  }

  let task = await window.api.agent.getTask(activeAgentTaskId);
  if (!task) {
    const fallbackTask = tasks.find((item) => item.id !== activeAgentTaskId) ?? null;
    if (fallbackTask) {
      activeAgentTaskId = fallbackTask.id;
      needsHistoryRerender = true;
      task = await window.api.agent.getTask(fallbackTask.id);
    }
    if (!task) {
      activeAgentTaskId = null;
      activeAgentTaskStatus = null;
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
      setAgentStatus("Agent task not found.", "err");
      return;
    }
  }

  if (needsHistoryRerender) {
    renderAgentHistory(tasks);
  }

  const previousTaskStatus = activeAgentTaskId === task.id ? activeAgentTaskStatus : null;
  activeAgentTaskStatus = task.status;
  const shouldFetchLogs =
    forceLogs ||
    task.status === "running" ||
    task.status === "failed" ||
    task.status === "completed";
  const restoreState = getRestoreStateForTask(task);
  if (shouldQueueDesktopLaunchPrompt(task, previousTaskStatus, restoreState)) {
    pendingDesktopLaunchPromptTasks.add(task.id);
  }
  const logs = shouldFetchLogs ? await window.api.agent.getLogs(task.id) : [];
  renderAgentTask(task, logs);
  await refreshAgentRouteDiagnostics(task.id);
  void updateAgentTaskInChat(task, logs);

  if (
    task.status === "completed" &&
    isTaskPreviewable(task) &&
    pendingAutoOpenAgentPreviewTaskId === task.id &&
    !autoOpenedAgentPreviewTasks.has(task.id) &&
    restoreState?.snapshotKind !== "before-task"
  ) {
    const parsed = parseAgentMessageContent(buildAgentChatContent(task, logs));
    if (isPreviewableAgentResult(parsed)) {
      pendingAutoOpenAgentPreviewTaskId = null;
      autoOpenedAgentPreviewTasks.add(task.id);
      void openManagedPreview(task.targetPath!, parsed.previewUrl ?? "", true).catch(() => {
        showToast("Preview open failed", 2200);
      });
    }
  }

  if (task.status !== "running" && pendingAutoOpenAgentPreviewTaskId === task.id) {
    pendingAutoOpenAgentPreviewTaskId = null;
  }

  if (
    pendingDesktopLaunchPromptTasks.has(task.id)
    && !handledDesktopLaunchPromptTasks.has(task.id)
    && canPromptToLaunchDesktopApp(task)
    && restoreState?.snapshotKind !== "before-task"
  ) {
    void promptToLaunchDesktopApp(task);
  } else if (task.status !== "running" && !canPromptToLaunchDesktopApp(task)) {
    pendingDesktopLaunchPromptTasks.delete(task.id);
  }

  const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
  const activity = buildAgentActivityLabel(task);
  setAgentStatus(
    task.status === "running"
      ? activity
      : task.summary || activity || `Agent task ${task.status}.`,
    tone
  );
  if (task.status === "running") {
    setStreamingUi(true, activity);
  } else {
    setStreamingUi(false);
  }

  if (task.status !== "running" && agentPollTimer) {
    clearInterval(agentPollTimer);
    agentPollTimer = null;
  }
}
