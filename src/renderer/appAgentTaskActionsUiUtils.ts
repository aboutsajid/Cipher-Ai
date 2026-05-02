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

function parseAgentBudgetInt(value: string, max: number): number | undefined {
  const normalized = (value ?? "").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(max, parsed);
}

function getSelectedAgentRunBudget(): AgentTaskRunBudget | undefined {
  const runtimeInput = document.getElementById("agent-budget-runtime-minutes");
  const commandsInput = document.getElementById("agent-budget-commands");
  const filesInput = document.getElementById("agent-budget-files");
  const retriesInput = document.getElementById("agent-budget-retries");
  const runtimeMinutes = runtimeInput instanceof HTMLInputElement ? parseAgentBudgetInt(runtimeInput.value, 480) : undefined;
  const maxCommands = commandsInput instanceof HTMLInputElement ? parseAgentBudgetInt(commandsInput.value, 300) : undefined;
  const maxFileEdits = filesInput instanceof HTMLInputElement ? parseAgentBudgetInt(filesInput.value, 500) : undefined;
  const maxRepairAttempts = retriesInput instanceof HTMLInputElement ? parseAgentBudgetInt(retriesInput.value, 100) : undefined;
  const budget: AgentTaskRunBudget = {};
  if (runtimeMinutes) budget.maxRuntimeMs = runtimeMinutes * 60_000;
  if (maxCommands) budget.maxCommands = maxCommands;
  if (maxFileEdits) budget.maxFileEdits = maxFileEdits;
  if (maxRepairAttempts) budget.maxRepairAttempts = maxRepairAttempts;
  return Object.keys(budget).length > 0 ? budget : undefined;
}

async function ensurePromptPreflightReady(prompt: string, runMode: AgentTaskRunMode): Promise<string | null> {
  let promptForRun = (prompt ?? "").trim();
  if (!promptForRun) return null;
  let preflightResult = await runAgentPromptPreflight(promptForRun, runMode);
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
          setAgentStatus("Prompt auto-enhanced. Ready to run.");
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
    return null;
  }
  return promptForRun;
}

async function previewAgentPlanForPrompt(prompt: string, runMode: AgentTaskRunMode): Promise<AgentPlanPreviewModalResolution | null> {
  const normalizedPrompt = (prompt ?? "").trim();
  if (!normalizedPrompt) return null;
  const targetPath = getRequestedAgentTargetPath();
  const budget = getSelectedAgentRunBudget();
  return openAgentPlanPreviewModal(normalizedPrompt, runMode, targetPath || undefined, budget);
}

async function previewAgentPlanForCurrentPrompt(): Promise<boolean> {
  const source = resolveAgentPromptInput();
  if (!source) {
    setAgentStatus("Agent prompt required for plan preview.", "err");
    return false;
  }
  const runMode = getSelectedAgentRunMode();
  const preflightReadyPrompt = await ensurePromptPreflightReady(source.input.value, runMode);
  if (!preflightReadyPrompt) return false;
  const previewResult = await previewAgentPlanForPrompt(preflightReadyPrompt, runMode);
  if (!previewResult) return false;
  if (previewResult.approved && previewResult.prompt.trim()) {
    applyAgentPromptToInputs(previewResult.prompt.trim());
    setAgentStatus("Plan approved. Press Start Agent to run.");
    showToast("Plan approved and prompt updated.", 1800);
    return true;
  }
  setAgentStatus("Plan preview closed.");
  return false;
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
  const budget = getSelectedAgentRunBudget();
  let promptForRun = normalized;

  try {
    const preflightReadyPrompt = await ensurePromptPreflightReady(promptForRun, runMode);
    if (!preflightReadyPrompt) return false;
    promptForRun = preflightReadyPrompt;

    const planPreview = await previewAgentPlanForPrompt(promptForRun, runMode);
    if (!planPreview || !planPreview.approved) {
      setAgentStatus("Agent run cancelled at plan preview.");
      return false;
    }
    promptForRun = (planPreview.prompt ?? "").trim();
    if (!promptForRun) {
      setAgentStatus("Agent prompt required.", "err");
      return false;
    }
    const afterPlanPreflight = await ensurePromptPreflightReady(promptForRun, runMode);
    if (!afterPlanPreflight) return false;
    promptForRun = afterPlanPreflight;

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
      runMode,
      budget
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
