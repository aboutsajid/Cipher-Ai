function normalizeAgentRunMode(value: string | null | undefined): AgentTaskRunMode {
  return value === "standard" ? "standard" : "build-product";
}

function getAgentRunModeLabel(mode: AgentTaskRunMode): string {
  return mode === "standard" ? "Standard" : "Build Product";
}

function getAgentRunModeSelect(): HTMLSelectElement | null {
  const node = document.getElementById("agent-run-mode-select");
  return node instanceof HTMLSelectElement ? node : null;
}

function syncAgentRunModeSelection(mode: AgentTaskRunMode, persist = true): void {
  const normalizedMode = normalizeAgentRunMode(mode);
  selectedAgentRunMode = normalizedMode;
  const runModeSelect = getAgentRunModeSelect();
  if (runModeSelect && runModeSelect.value !== normalizedMode) {
    runModeSelect.value = normalizedMode;
  }
  if (!persist) return;
  try {
    localStorage.setItem(AGENT_RUN_MODE_STORAGE_KEY, normalizedMode);
  } catch {
    // Ignore storage write failures in restricted environments.
  }
}

function hydrateAgentRunModeSelection(): void {
  let storedMode: AgentTaskRunMode = "build-product";
  try {
    storedMode = normalizeAgentRunMode(localStorage.getItem(AGENT_RUN_MODE_STORAGE_KEY));
  } catch {
    storedMode = "build-product";
  }
  syncAgentRunModeSelection(storedMode, false);
}

function getSelectedAgentRunMode(): AgentTaskRunMode {
  const runModeSelect = getAgentRunModeSelect();
  if (!runModeSelect) return normalizeAgentRunMode(selectedAgentRunMode);
  const selectedMode = normalizeAgentRunMode(runModeSelect.value);
  if (selectedMode !== selectedAgentRunMode) {
    selectedAgentRunMode = selectedMode;
  }
  return selectedMode;
}

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
  const runMode = getSelectedAgentRunMode();
  let promptForRun = normalized;
  let preflightResult: AgentPromptPreflightResult | null = null;

  try {
    preflightResult = await runAgentPromptPreflight(promptForRun, runMode);
    renderAgentPromptPreflight(preflightResult);
    if (!preflightResult.ok) {
      const consented = requestAgentPromptAutoEnhanceConsent(preflightResult);
      if (consented) {
        const enhanced = await autoEnhanceAgentPromptForPreflight(promptForRun, runMode, preflightResult);
        if (enhanced.enhanced) {
          promptForRun = enhanced.prompt;
          preflightResult = enhanced.preflight;
          applyAgentPromptToInputs(promptForRun);
          renderAgentPromptPreflight(preflightResult);
          showToast("Prompt auto-enhanced by agent preflight.", 2200);
          if (preflightResult.ok) {
            setAgentStatus("Prompt auto-enhanced. Starting task...");
          }
        }
      } else {
        setAgentStatus("Auto-enhancement skipped. Review prompt issues in popup.", "err");
      }
    }
    if (!preflightResult.ok) {
      openAgentPromptPreflightModal(preflightResult);
      const blockingMessage = getAgentPromptPreflightBlockingMessage(preflightResult);
      setAgentStatus("Start blocked. Review prompt issues in popup.", "err");
      showToast(blockingMessage, 3600);
      return false;
    }
    const warning = getAgentApprovalWarning(promptForRun);
    if (warning && !window.confirm(warning)) {
      setAgentStatus("Agent task cancelled before start.");
      return false;
    }
    const targetInput = getAgentTargetInput();
    if (targetInput) {
      targetInput.value = targetPath;
    }
    const task = await window.api.agent.startTask({
      prompt: promptForRun,
      attachments: attachmentsToSend,
      targetPath: targetPath || undefined,
      runMode
    });
    activeAgentRestoreState = null;
    activeAgentTaskId = task.id;
    pendingAutoOpenAgentPreviewTaskId = task.id;
    pendingDesktopLaunchPromptTasks.add(task.id);
    handledDesktopLaunchPromptTasks.delete(task.id);
    cachedAgentTasks = [task, ...cachedAgentTasks.filter((item) => item.id !== task.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(promptForRun, task);
    activeAttachments = [];
    renderComposerAttachments();
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus(`Agent task started (${getAgentRunModeLabel(runMode)}).`);
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
    const restartedRunMode = normalizeAgentRunMode(restarted.runMode);
    syncAgentRunModeSelection(restartedRunMode, true);
    activeAgentRestoreState = null;
    activeAgentTaskId = restarted.id;
    pendingAutoOpenAgentPreviewTaskId = restarted.id;
    pendingDesktopLaunchPromptTasks.add(restarted.id);
    handledDesktopLaunchPromptTasks.delete(restarted.id);
    cachedAgentTasks = [restarted, ...cachedAgentTasks.filter((item) => item.id !== restarted.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(restarted.prompt, restarted);
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus(`${getAgentRestartModeLabel(mode)} started (${getAgentRunModeLabel(restartedRunMode)}).`);
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
