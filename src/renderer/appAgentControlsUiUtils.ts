function setupAgentControls(): void {
  const agentInput = $("agent-prompt-input") as HTMLTextAreaElement;
  const agentTargetInput = $("agent-target-input") as HTMLInputElement;
  agentInput.addEventListener("input", () => {
    if (currentInteractionMode === "agent") {
      syncComposerAgentPrompts("agent");
    }
  });
  agentInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
  agentTargetInput.addEventListener("blur", () => {
    agentTargetInput.value = getRequestedAgentTargetPath();
  });

  $("agent-paste-btn").addEventListener("click", async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (!pasted.trim()) {
        showToast("Clipboard is empty.", 1800);
        return;
      }
      agentInput.value = pasted;
      agentInput.dispatchEvent(new Event("input"));
      agentInput.focus();
      showToast("Prompt pasted.", 1800);
    } catch {
      showToast("Clipboard paste is not available here.", 2400);
    }
  });

  $("agent-target-pick-btn").addEventListener("click", () => {
    void pickAgentTargetFolder();
  });

  $("agent-target-clear-btn").addEventListener("click", () => {
    agentTargetInput.value = "";
    agentTargetInput.focus();
  });

  $("agent-start-btn").addEventListener("click", async () => {
    const prompt = agentInput.value.trim();
    if (!prompt) {
      setAgentStatus("Agent prompt required.", "err");
      agentInput.focus();
      return;
    }

    syncComposerAgentPrompts("agent");
    const started = await startAgentTaskPrompt(prompt);
    if (started) {
      clearAgentPrompts();
    }
  });

  $("agent-stop-btn").addEventListener("click", async () => {
    if (!activeAgentTaskId) {
      setAgentStatus("No active agent task.");
      return;
    }

    const stopped = await window.api.agent.stopTask(activeAgentTaskId);
    setAgentStatus(stopped ? "Stop requested." : "No running agent process to stop.", stopped ? "" : "err");
    void refreshAgentTask(true);
  });

  $("agent-restore-btn").addEventListener("click", async () => {
    try {
      const latest = cachedAgentSnapshots[0] ?? (await window.api.agent.listSnapshots())[0];
      if (!latest) {
        setAgentStatus("No rollback snapshot found.", "err");
        return;
      }
      openSnapshotRestoreModal(latest);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore rollback snapshot.";
      setAgentStatus(message, "err");
      showToast(message, 3600);
    }
  });
  $("agent-refresh-snapshots-btn").addEventListener("click", () => {
    void refreshAgentTask(true);
  });

  $("agent-copy-steps-btn").addEventListener("click", async () => {
    const text = $("agent-steps").textContent ?? "";
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "Agent steps copied." : "Copy failed", 1800);
  });

  $("agent-copy-log-btn").addEventListener("click", async () => {
    const text = $("agent-log").textContent ?? "";
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "Agent log copied." : "Copy failed", 1800);
  });
  $("agent-refresh-route-health-btn").addEventListener("click", () => {
    void refreshAgentRouteDiagnostics(activeAgentTaskId ?? undefined);
  });
  $("model-health-refresh-btn").addEventListener("click", () => {
    void refreshAgentRouteDiagnostics(activeAgentTaskId ?? undefined);
  });

  document.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const chatItem = target?.closest<HTMLElement>("[data-main-chat-history-id]");
    if (chatItem) {
      const chatId = chatItem.dataset["mainChatHistoryId"] ?? "";
      if (chatId) {
        event.preventDefault();
        event.stopPropagation();
        void loadChat(chatId);
      }
      return;
    }
    const snapshotBtn = target?.closest<HTMLElement>("[data-main-agent-snapshot-id]");
    if (snapshotBtn) {
      const snapshotId = snapshotBtn.dataset["mainAgentSnapshotId"] ?? "";
      const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
      if (snapshot) {
        event.preventDefault();
        event.stopPropagation();
        openSnapshotRestoreModal(snapshot);
      }
      return;
    }
    const restartBtn = target?.closest<HTMLElement>("[data-main-agent-restart-task-id]");
    if (restartBtn) {
      const taskId = restartBtn.dataset["mainAgentRestartTaskId"] ?? "";
      const mode = (restartBtn.dataset["agentRestartMode"] ?? "retry") as AgentTaskRestartMode;
      if (taskId) {
        event.preventDefault();
        event.stopPropagation();
        void restartAgentTaskPrompt(taskId, mode);
      }
      return;
    }
    const previewBtn = target?.closest<HTMLElement>("[data-main-agent-history-preview]");
    if (previewBtn) {
      if (previewBtn instanceof HTMLButtonElement && previewBtn.disabled) return;
      const taskId = previewBtn.dataset["mainAgentHistoryPreview"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void openManagedPreview(task.targetPath, "", false).catch(() => {
          showToast("Preview open failed", 2200);
        });
      }
      return;
    }
    const copyRunBtn = target?.closest<HTMLElement>("[data-main-agent-history-copy-run]");
    if (copyRunBtn) {
      const taskId = copyRunBtn.dataset["mainAgentHistoryCopyRun"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.output?.runCommand) {
        event.preventDefault();
        event.stopPropagation();
        void copyTextToClipboard(task.output.runCommand).then((ok) => {
          showToast(ok ? "Run command copied." : "Copy failed", 1800);
        });
      }
      return;
    }
    const openFolderBtn = target?.closest<HTMLElement>("[data-main-agent-history-open-folder]");
    if (openFolderBtn) {
      if (openFolderBtn instanceof HTMLButtonElement && openFolderBtn.disabled) return;
      const taskId = openFolderBtn.dataset["mainAgentHistoryOpenFolder"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void window.api.workspace.openPath(task.targetPath).then((result) => {
          showToast(result.message, result.ok ? 1800 : 2400);
        }).catch(() => {
          showToast("Open folder failed", 2200);
        });
      }
      return;
    }
    const item = target?.closest<HTMLElement>("[data-main-agent-history-id]");
    if (!item) return;
    const taskId = item.dataset["mainAgentHistoryId"] ?? "";
    if (!taskId) return;
    activeAgentTaskId = taskId;
    syncActiveAgentTaskSelectionUi();
    const selected = cachedAgentTasks.find((task) => task.id === taskId);
    if (selected?.status === "running") ensureAgentPolling();
    void refreshAgentTask(true);
  });

  $("agent-history").addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const snapshotBtn = target?.closest<HTMLElement>("[data-agent-history-snapshot-id]");
    if (snapshotBtn) {
      const snapshotId = snapshotBtn.dataset["agentHistorySnapshotId"] ?? "";
      const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
      if (snapshot) {
        event.preventDefault();
        event.stopPropagation();
        openSnapshotRestoreModal(snapshot);
      }
      return;
    }
    const restartBtn = target?.closest<HTMLElement>("[data-agent-history-restart-task-id]");
    if (restartBtn) {
      const taskId = restartBtn.dataset["agentHistoryRestartTaskId"] ?? "";
      const mode = (restartBtn.dataset["agentRestartMode"] ?? "retry") as AgentTaskRestartMode;
      if (taskId) {
        event.preventDefault();
        event.stopPropagation();
        void restartAgentTaskPrompt(taskId, mode);
      }
      return;
    }
    const previewBtn = target?.closest<HTMLElement>("[data-agent-history-preview]");
    if (previewBtn) {
      if (previewBtn instanceof HTMLButtonElement && previewBtn.disabled) return;
      const taskId = previewBtn.dataset["agentHistoryPreview"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void openManagedPreview(task.targetPath, "", false).catch(() => {
          showToast("Preview open failed", 2200);
        });
      }
      return;
    }
    const copyRunBtn = target?.closest<HTMLElement>("[data-agent-history-copy-run]");
    if (copyRunBtn) {
      const taskId = copyRunBtn.dataset["agentHistoryCopyRun"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.output?.runCommand) {
        event.preventDefault();
        event.stopPropagation();
        void copyTextToClipboard(task.output.runCommand).then((ok) => {
          showToast(ok ? "Run command copied." : "Copy failed", 1800);
        });
      }
      return;
    }
    const openFolderBtn = target?.closest<HTMLElement>("[data-agent-history-open-folder]");
    if (openFolderBtn) {
      if (openFolderBtn instanceof HTMLButtonElement && openFolderBtn.disabled) return;
      const taskId = openFolderBtn.dataset["agentHistoryOpenFolder"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void window.api.workspace.openPath(task.targetPath).then((result) => {
          showToast(result.message, result.ok ? 1800 : 2400);
        }).catch(() => {
          showToast("Open folder failed", 2200);
        });
      }
      return;
    }
    const item = target?.closest<HTMLElement>("[data-agent-history-id]");
    if (!item) return;
    const taskId = item.dataset["agentHistoryId"] ?? "";
    if (!taskId) return;
    activeAgentTaskId = taskId;
    syncActiveAgentTaskSelectionUi();
    const selected = cachedAgentTasks.find((task) => task.id === taskId);
    if (selected?.status === "running") ensureAgentPolling();
    void refreshAgentTask(true);
  });
  $("agent-history-filters").querySelectorAll<HTMLElement>("[data-agent-history-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = (button.dataset["agentHistoryFilter"] ?? "all") as "all" | AgentTask["status"];
      agentHistoryFilter = nextFilter;
      agentHistoryExpanded = false;
      syncAgentHistoryPanelWidth();
      renderAgentHistory(cachedAgentTasks);
    });
  });
  $("agent-history-toggle-btn").addEventListener("click", () => {
    agentHistoryExpanded = !agentHistoryExpanded;
    syncAgentHistoryPanelWidth();
    renderAgentHistory(cachedAgentTasks);
  });
  $("agent-snapshots").addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const taskBtn = target?.closest<HTMLElement>("[data-agent-snapshot-task-id]");
    if (taskBtn) {
      const taskId = taskBtn.dataset["agentSnapshotTaskId"] ?? "";
      const relatedTask = cachedAgentTasks.find((item) => item.id === taskId);
      if (!taskId || !relatedTask) {
        showToast("Related task not available.", 2200);
        return;
      }
      activeAgentTaskId = taskId;
      syncActiveAgentTaskSelectionUi();
      if (relatedTask.status === "running") ensureAgentPolling();
      void refreshAgentTask(true);
      return;
    }
    const restoreBtn = target?.closest<HTMLElement>("[data-agent-snapshot-id]");
    if (!restoreBtn) return;
    const snapshotId = restoreBtn.dataset["agentSnapshotId"] ?? "";
    const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
    if (!snapshotId || !snapshot) return;
    openSnapshotRestoreModal(snapshot);
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Panel Toggle Ã¢â€â‚¬Ã¢â€â‚¬
