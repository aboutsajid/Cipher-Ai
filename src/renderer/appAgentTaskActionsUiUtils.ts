async function startAgentTaskPrompt(prompt: string): Promise<boolean> {
  const normalized = (prompt ?? "").trim();
  if (!normalized) {
    setAgentStatus("Agent prompt required.", "err");
    return false;
  }
  const targetReady = await ensureAgentTargetSelectionBeforeStart(normalized);
  if (!targetReady) {
    return false;
  }
  const attachmentsToSend = [...activeAttachments];
  const targetPath = getRequestedAgentTargetPath();

  try {
    const warning = getAgentApprovalWarning(normalized);
    if (warning && !window.confirm(warning)) {
      setAgentStatus("Agent task cancelled before start.");
      return false;
    }
    const targetInput = getAgentTargetInput();
    if (targetInput) {
      targetInput.value = targetPath;
    }
    const task = await window.api.agent.startTask({
      prompt: normalized,
      attachments: attachmentsToSend,
      targetPath: targetPath || undefined
    });
    activeAgentRestoreState = null;
    activeAgentTaskId = task.id;
    pendingAutoOpenAgentPreviewTaskId = task.id;
    pendingDesktopLaunchPromptTasks.add(task.id);
    handledDesktopLaunchPromptTasks.delete(task.id);
    cachedAgentTasks = [task, ...cachedAgentTasks.filter((item) => item.id !== task.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(normalized, task);
    activeAttachments = [];
    renderComposerAttachments();
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus("Agent task started.");
    renderAgentTask(task, []);
    ensureAgentPolling();
    void refreshAgentTask(true);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start agent task.";
    setAgentStatus(message, "err");
    showToast(message, 3200);
    return false;
  }
}

async function restartAgentTaskPrompt(taskId: string, mode: AgentTaskRestartMode): Promise<boolean> {
  const sourceTask = cachedAgentTasks.find((task) => task.id === taskId) ?? null;
  if (!sourceTask) {
    setAgentStatus("Agent task not found.", "err");
    return false;
  }

  if (mode === "retry-clean") {
    const confirmed = window.confirm(
      "Retry Clean will restore the Before snapshot for this task and then start a new run. Current workspace files outside preserved folders will be replaced. Continue?"
    );
    if (!confirmed) {
      setAgentStatus("Clean retry cancelled.");
      return false;
    }
  }

  try {
    const restarted = await window.api.agent.restartTask(taskId, mode);
    activeAgentRestoreState = null;
    activeAgentTaskId = restarted.id;
    pendingAutoOpenAgentPreviewTaskId = restarted.id;
    pendingDesktopLaunchPromptTasks.add(restarted.id);
    handledDesktopLaunchPromptTasks.delete(restarted.id);
    cachedAgentTasks = [restarted, ...cachedAgentTasks.filter((item) => item.id !== restarted.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(restarted.prompt, restarted);
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus(`${getAgentRestartModeLabel(mode)} started.`);
    renderAgentTask(restarted, []);
    ensureAgentPolling();
    void refreshAgentTask(true);
    showToast(`${getAgentRestartModeLabel(mode)} started.`, 1800);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to ${getAgentRestartModeLabel(mode).toLowerCase()}.`;
    setAgentStatus(message, "err");
    showToast(message, 3200);
    return false;
  }
}
