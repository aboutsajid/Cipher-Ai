async function init() {
  $("theme-toggle-btn").onclick = toggleTheme;
  applySidebarWidth(getInitialSidebarWidth(), false);
  applyRightPanelWidth(getInitialRightPanelWidth(), false);
  applyTheme(getInitialTheme());
  applyUiExperience(getInitialUiExperience());
  void loadAppInfo();
  $("panel-close-btn").onclick = closeRightPanel;

  $("settings-toggle-btn").onclick = () => {
    const panel = $("right-panel");
    const openTab = panel.dataset["openTab"] ?? "";
    if (panel.style.display !== "none" && openTab === "settings") {
      closeRightPanel();
      return;
    }
    openPanel("settings");
  };
  const routerToggleBtn = document.getElementById(ROUTER_TOGGLE_BUTTON_ID);
  if (routerToggleBtn instanceof HTMLButtonElement) {
    routerToggleBtn.onclick = () => {
      const panel = $("right-panel");
      const openTab = panel.dataset["openTab"] ?? "";
      if (panel.style.display !== "none" && openTab === "router") {
        closeRightPanel();
        return;
      }
      openPanel("router");
    };
  }
  const agentToggleBtn = document.getElementById(AGENT_TOGGLE_BUTTON_ID);
  if (agentToggleBtn instanceof HTMLButtonElement) {
    agentToggleBtn.onclick = () => {
      const panel = $("right-panel");
      const openTab = panel.dataset["openTab"] ?? "";
      if (panel.style.display !== "none" && openTab === "agent") {
        closeRightPanel();
        return;
      }
      openPanel("agent");
    };
  }
  $("new-window-btn").onclick = () => {
    void openFreshWorkspaceWindow();
  };
  document.querySelectorAll(".panel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const t = (tab as HTMLElement).dataset["tab"]!;
      openPanel(t);
    });
  });

  try {
    setupVirtualScrolling();
    setupIpcListeners();
    window.addEventListener("beforeunload", teardownIpcListeners, { once: true });
    setupChatListSearch();
    setupComposer();
    setupVoiceInput();
    setupComposerTools();
    setupPreviewPanel();
    setupClaudePanel();
    setupModeSwitcher();
    setupSidebarResizeControls();
    setupRightPanelResizeControls();
    setupCompareControls();
    setupOllamaControls();
    setupMcpControls();
    setupAgentControls();
    setupOnboardingControls();
    setupGuidedUiControls();
    setupMessageInteractions();
    setupKeyboardShortcuts();
  } catch (err) {
    console.error("UI setup failed:", err);
  }

  renderComposerAttachments();
  applyRawMode(rawModeEnabled);
  hideSummaryOverlay();
  updateScrollBottomButton();

  mountTopbarControls();

  // New chat
  $("new-chat-btn").onclick = async () => {
    await createNewChat();
  };
  $("import-chat-btn").onclick = async () => {
    const res = await window.api.chat.import();
    showToast(res.message, res.ok ? 2200 : 3200);
    if (res.ok && res.chat?.id) {
      await loadChatList();
      await loadChat(res.chat.id);
    }
  };

  // Send
  $("send-btn").onclick = () => sendMessage();

  // Stop
  $("stop-btn").onclick = async () => {
    if (currentInteractionMode === "agent" && activeAgentTaskId) {
      const stopped = await window.api.agent.stopTask(activeAgentTaskId);
      if (stopped) {
        setAgentStatus("Stop requested.");
        showToast("Agent stop requested.", 1800);
        void refreshAgentTask(true);
      } else {
        showToast("No running agent task to stop.", 2000);
      }
      return;
    }
    if (currentMode === "claude" || currentMode === "edit" || activeClaudeAssistantMessageId) {
      await stopClaudeSessionFromUi();
      return;
    }
    const targetChatId = activeStreamChatId ?? currentChatId;
    if (targetChatId) await window.api.chat.stop(targetChatId);
  };

  const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
  if (scrollBottomBtn instanceof HTMLButtonElement) {
    scrollBottomBtn.onclick = () => {
      scrollToBottom(true);
    };
  }

  // Rename
  $("rename-btn").onclick = openRenameModal;
  $("summary-dismiss-btn").onclick = hideSummaryOverlay;
  $("summarize-btn").onclick = () => {
    void summarizeCurrentChat();
  };
  $("image-history-btn").onclick = () => {
    void openImageHistoryModal();
  };
  $("raw-toggle-btn").onclick = () => {
    applyRawMode(!rawModeEnabled);
  };
  $("stats-btn").onclick = () => {
    void openStatsModal();
  };
  $("ui-mode-toggle-btn").onclick = toggleUiExperience;
  const interactionAgentBtn = document.getElementById("interaction-agent-btn");
  if (interactionAgentBtn instanceof HTMLButtonElement) {
    interactionAgentBtn.onclick = () => applyInteractionMode("agent");
  }
  const interactionImageBtn = document.getElementById("generate-image-btn");
  if (interactionImageBtn instanceof HTMLButtonElement) {
    interactionImageBtn.onclick = () => applyInteractionMode("image");
  }
  const quickOllamaBtn = document.getElementById("quick-ollama-btn");
  if (quickOllamaBtn instanceof HTMLButtonElement) {
    quickOllamaBtn.onclick = () => {
      setProviderMode("ollama");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickOpenRouterBtn = document.getElementById("quick-openrouter-btn");
  if (quickOpenRouterBtn instanceof HTMLButtonElement) {
    quickOpenRouterBtn.onclick = () => {
      setProviderMode("openrouter");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickNvidiaBtn = document.getElementById("quick-nvidia-btn");
  if (quickNvidiaBtn instanceof HTMLButtonElement) {
    quickNvidiaBtn.onclick = () => {
      setProviderMode("nvidia");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickClaudeBtn = document.getElementById("quick-claude-btn");
  if (quickClaudeBtn instanceof HTMLButtonElement) {
    quickClaudeBtn.onclick = async () => {
      if (currentMode === "claude" || currentMode === "edit") {
        await stopClaudeSessionFromUi("Claude Code stopped.");
        applyMode("write");
        void syncChatContextAfterUiChange();
        return;
      }
      applyMode("claude");
      void syncChatContextAfterUiChange();
    };
  }
  const statsCloseBtn = document.getElementById("stats-close-btn");
  if (statsCloseBtn instanceof HTMLButtonElement) {
    statsCloseBtn.onclick = closeStatsModal;
  }
  $("managed-save-apply-btn").onclick = () => {
    void confirmManagedSavePreview();
  };
  $("managed-save-cancel-btn").onclick = cancelManagedSavePreview;
  $("managed-save-preview-close-btn").onclick = cancelManagedSavePreview;
  $("managed-save-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) cancelManagedSavePreview();
  });
  $("image-generation-submit-btn").onclick = () => {
    void submitImageGeneration();
  };
  $("image-generation-cancel-btn").onclick = () => {
    closeImageGenerationModal();
  };
  $("image-generation-close-btn").onclick = () => {
    closeImageGenerationModal();
  };
  $("image-generation-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImageGenerationModal();
  });
  $("image-generation-prompt-input").addEventListener("keydown", (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeImageGenerationModal();
      return;
    }
    if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
      keyboardEvent.preventDefault();
      void submitImageGeneration();
    }
  });
  const imageGenerationModelInput = document.getElementById("image-generation-model-input");
  const imageStudioPromptInput = document.getElementById("image-studio-prompt-input");
  const imageStudioGenerateBtn = document.getElementById("image-studio-generate-btn");
  const imageStudioRefreshBtn = document.getElementById("image-studio-refresh-btn");
  const imageStudioClearBtn = document.getElementById("image-studio-clear-btn");
  const imageStudioSearchInput = document.getElementById("image-studio-search-input");
  const imageStudioSortSelect = document.getElementById("image-studio-sort-select");
  const initialImageProvider = getActiveImageGenerationProvider();
  populateImageGenerationAspectRatioOptions();
  refreshImageGenerationModelOptions(initialImageProvider);
  updateImageGenerationModalHelp(initialImageProvider);
  if (imageGenerationModelInput instanceof HTMLInputElement) {
    imageGenerationModelInput.value = getDefaultImageGenerationModel(initialImageProvider);
  }
  syncImageStudioControls(false);
  document.getElementById("image-provider-openrouter-btn")?.addEventListener("click", () => {
    void setImageProvider("openrouter");
  });
  document.getElementById("image-provider-nvidia-btn")?.addEventListener("click", () => {
    void setImageProvider("nvidia");
  });
  document.getElementById("image-provider-comfyui-btn")?.addEventListener("click", () => {
    void setImageProvider("comfyui");
  });
  if (imageStudioGenerateBtn instanceof HTMLButtonElement) {
    imageStudioGenerateBtn.onclick = () => {
      void submitImageStudioGeneration();
    };
  }
  if (imageStudioRefreshBtn instanceof HTMLButtonElement) {
    imageStudioRefreshBtn.onclick = () => {
      void refreshImageHistory();
    };
  }
  if (imageStudioClearBtn instanceof HTMLButtonElement) {
    imageStudioClearBtn.onclick = () => {
      if (imageStudioPromptInput instanceof HTMLTextAreaElement) {
        imageStudioPromptInput.value = "";
        imageStudioPromptInput.focus();
      }
      setImageStudioStatus("Prompt cleared.");
    };
  }
  if (imageStudioPromptInput instanceof HTMLTextAreaElement) {
    imageStudioPromptInput.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
        keyboardEvent.preventDefault();
        void submitImageStudioGeneration();
      }
    });
  }
  if (imageStudioSearchInput instanceof HTMLInputElement) {
    imageStudioSearchInput.value = imageStudioSearchQuery;
    imageStudioSearchInput.addEventListener("input", () => {
      imageStudioSearchQuery = imageStudioSearchInput.value;
      renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
    });
  }
  if (imageStudioSortSelect instanceof HTMLSelectElement) {
    imageStudioSortMode = parseImageStudioSortMode(imageStudioSortSelect.value);
    imageStudioSortSelect.value = imageStudioSortMode;
    imageStudioSortSelect.addEventListener("change", () => {
      imageStudioSortMode = parseImageStudioSortMode(imageStudioSortSelect.value);
      imageStudioSortSelect.value = imageStudioSortMode;
      renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
    });
  }
  $("image-history-refresh-btn").onclick = () => {
    void refreshImageHistory();
  };
  $("image-history-close-btn").onclick = closeImageHistoryModal;
  $("image-history-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImageHistoryModal();
  });
  $("image-preview-close-btn").onclick = closeImagePreviewModal;
  $("image-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImagePreviewModal();
  });
  $("snapshot-restore-confirm-btn").onclick = async () => {
    const snapshotId = pendingSnapshotRestoreId;
    if (!snapshotId) return;
    closeSnapshotRestoreModal();
    try {
      const result = await window.api.agent.restoreSnapshot(snapshotId);
      activeAgentRestoreState = result.ok ? result : null;
      if (result.ok && result.taskId) {
        activeAgentTaskId = result.taskId;
        syncActiveAgentTaskSelectionUi();
        if (result.snapshotKind === "after-task") {
          pendingAutoOpenAgentPreviewTaskId = result.taskId;
          autoOpenedAgentPreviewTasks.delete(result.taskId);
        }
        await refreshAgentTask(true);
      } else {
        await refreshAgentSnapshots();
      }
      reportSnapshotRestoreResult(result.message, result.ok);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore snapshot.";
      activeAgentRestoreState = null;
      reportSnapshotRestoreResult(message, false);
    }
  };
  $("snapshot-restore-cancel-btn").onclick = closeSnapshotRestoreModal;
  $("snapshot-restore-close-btn").onclick = closeSnapshotRestoreModal;
  $("snapshot-restore-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeSnapshotRestoreModal();
  });
  $("agent-target-modal-suggest-btn").onclick = () => {
    closeAgentTargetPromptModal("suggested");
  };
  $("agent-target-modal-choose-btn").onclick = () => {
    closeAgentTargetPromptModal("choose");
  };
  $("agent-target-modal-skip-btn").onclick = () => {
    closeAgentTargetPromptModal("skip");
  };
  $("agent-target-modal-cancel-btn").onclick = () => {
    closeAgentTargetPromptModal(null);
  };
  $("agent-target-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeAgentTargetPromptModal(null);
  });
  $("agent-preflight-modal-edit-btn").onclick = () => {
    closeAgentPromptPreflightModal(true);
  };
  $("agent-preflight-modal-dismiss-btn").onclick = () => {
    closeAgentPromptPreflightModal(false);
  };
  $("agent-preflight-modal-close-btn").onclick = () => {
    closeAgentPromptPreflightModal(false);
  };
  $("agent-preflight-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeAgentPromptPreflightModal(false);
  });
  $("agent-plan-preview-refresh-btn").onclick = () => {
    void refreshAgentPlanPreviewModal();
  };
  $("agent-plan-preview-approve-btn").onclick = () => {
    const promptInput = $("agent-plan-preview-prompt") as HTMLTextAreaElement;
    closeAgentPlanPreviewModal({
      approved: true,
      prompt: (promptInput.value ?? "").trim()
    });
  };
  $("agent-plan-preview-cancel-btn").onclick = () => {
    closeAgentPlanPreviewModal({ approved: false, prompt: "" });
  };
  $("agent-plan-preview-close-btn").onclick = () => {
    closeAgentPlanPreviewModal({ approved: false, prompt: "" });
  };
  $("agent-plan-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) {
      closeAgentPlanPreviewModal({ approved: false, prompt: "" });
    }
  });
  $("code-preview-close-btn").onclick = closeCodePreview;
  $("code-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeCodePreview();
  });
  const statsModal = document.getElementById("stats-modal");
  if (statsModal) {
    statsModal.addEventListener("click", (event: Event) => {
      if (event.target === event.currentTarget) closeStatsModal();
    });
  }
  $("export-btn").onclick = async () => {
    if (!currentChatId) return;
    await exportChatById(currentChatId);
  };
  $("system-prompt-toggle-btn").onclick = () => {
    if (!currentChatId) return;
    const panel = $("system-prompt-panel");
    const opening = panel.style.display === "none";
    panel.style.display = opening ? "flex" : "none";
    $("system-prompt-toggle-btn").classList.toggle("active", opening);
  };
  $("save-system-prompt-btn").onclick = async () => {
    if (!currentChatId) return;
    const prompt = ($("system-prompt-input") as HTMLTextAreaElement).value.trim();
    const ok = await window.api.chat.setSystemPrompt(currentChatId, prompt);
    showToast(ok ? "System prompt saved." : "Failed to save system prompt.", ok ? 1800 : 2800);
  };
  $("rename-confirm-btn").onclick = confirmRename;
  $("rename-cancel-btn").onclick = closeRenameModal;
  $("rename-input").addEventListener("keydown", (e: Event) => {
    if ((e as KeyboardEvent).key === "Enter") confirmRename();
    if ((e as KeyboardEvent).key === "Escape") closeRenameModal();
  });

  // Settings
  $("save-settings-btn").onclick = saveSettings;
  const claudeChatFsRootList = document.getElementById("claude-chat-fs-root-list");
  claudeChatFsRootList?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  claudeChatFsRootList?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  claudeChatFsRootList?.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["role"] !== "remove") return;
    const index = Number.parseInt(target.dataset["index"] ?? "", 10);
    if (!Number.isFinite(index)) return;
    const nextRoots = getClaudeChatFilesystemRootDraftsFromUi().filter((_, itemIndex) => itemIndex !== index);
    renderClaudeChatFilesystemSettingsUi({
      ...getClaudeChatFilesystemSettingsDraft(),
      roots: nextRoots.map((item) => item.path),
      rootConfigs: nextRoots
    });
  });
  const claudeChatFsWriteToggle = document.getElementById("claude-chat-fs-write-toggle");
  claudeChatFsWriteToggle?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-overwrite-policy")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-temp-roots")?.addEventListener("input", () => {
    const draft = getClaudeChatFilesystemSettingsDraft();
    temporaryClaudeChatFilesystemRoots = [...draft.temporaryRoots];
    renderClaudeChatFilesystemSettingsUi(draft);
  });
  document.getElementById("claude-chat-fs-max-files")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-max-bytes")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-max-tools")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-plan-toggle")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-audit-toggle")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  $("claude-chat-fs-add-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pickWritableRoots();
    const draft = getClaudeChatFilesystemSettingsDraft();
    const nextRoots = normalizeClaudeChatFilesystemRootDrafts([
      ...draft.rootConfigs,
      ...picked.map((item) => ({
        path: item.writableRoot ?? "",
        allowWrite: draft.allowWrite,
        overwritePolicy: draft.overwritePolicy
      }))
    ], draft.allowWrite, draft.overwritePolicy);
    renderClaudeChatFilesystemSettingsUi({
      ...draft,
      roots: nextRoots.map((item) => item.path),
      rootConfigs: nextRoots
    });
    showToast(nextRoots.length > 0 ? "Claude chat folders updated. Click Save Settings." : "No folders selected.", 2400);
  });
  $("claude-chat-fs-add-row-btn").addEventListener("click", () => {
    const draft = getClaudeChatFilesystemSettingsDraft();
    const nextRoots = [
      ...draft.rootConfigs,
      {
        path: "",
        label: "",
        allowWrite: draft.allowWrite,
        overwritePolicy: draft.overwritePolicy
      }
    ];
    renderClaudeChatFilesystemSettingsUi({
      ...draft,
      roots: nextRoots.map((item) => item.path).filter(Boolean),
      rootConfigs: nextRoots
    });
  });
  $("claude-chat-fs-add-temp-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pickWritableRoots();
    temporaryClaudeChatFilesystemRoots = normalizeClaudeChatFilesystemRoots([
      ...temporaryClaudeChatFilesystemRoots,
      ...picked.map((item) => item.writableRoot ?? "").filter(Boolean)
    ]);
    renderClaudeChatFilesystemSettingsUi({
      ...getClaudeChatFilesystemSettingsDraft(),
      temporaryRoots: temporaryClaudeChatFilesystemRoots
    });
    showToast(temporaryClaudeChatFilesystemRoots.length > 0 ? "Temporary Claude folders updated for this session." : "No temporary folders selected.", 2400);
  });
  $("claude-chat-fs-clear-btn").addEventListener("click", () => {
    temporaryClaudeChatFilesystemRoots = [];
    renderClaudeChatFilesystemSettingsUi({
      roots: [],
      allowWrite: false,
      overwritePolicy: "allow-overwrite",
      rootConfigs: [],
      temporaryRoots: [],
      budgets: {},
      auditEnabled: true,
      requireWritePlan: false
    });
    showToast("Claude chat folders cleared. Click Save Settings.", 2200);
  });
  $("model-select").addEventListener("change", () => {
    void syncChatContextAfterUiChange();
  });
  $("compare-model-select").addEventListener("change", () => {
    void syncChatContextAfterUiChange();
  });
  const defaultModelSelect = document.getElementById("default-model-select");
  defaultModelSelect?.addEventListener("change", () => {
    const select = defaultModelSelect as HTMLSelectElement;
    const value = (select.value ?? "").trim();
    if (!value) return;
    ($("default-model-input") as HTMLInputElement).value = value;
  });
  $("default-model-input").addEventListener("input", () => {
    populateSettingsDefaultModelSelect();
    refreshRouteStrategyUi();
  });
  $("api-key-input").addEventListener("input", refreshRouteStrategyUi);
  $("models-textarea").addEventListener("input", refreshRouteStrategyUi);
  $("route-default-select").addEventListener("change", refreshRouteStrategyUi);
  $("route-think-select").addEventListener("change", refreshRouteStrategyUi);
  $("route-long-context-select").addEventListener("change", refreshRouteStrategyUi);
  $("fill-models-btn").onclick = () => {
    const area = $("models-textarea") as HTMLTextAreaElement;
    const defaultInput = $("default-model-input") as HTMLInputElement;
    if (providerMode === "ollama") {
      const ollamaModels = (settings?.ollamaModels ?? []).map((model) => `ollama/${model}`);
      area.value = ollamaModels.join("\n");
      if (!defaultInput.value.trim().startsWith("ollama/")) {
        defaultInput.value = ollamaModels[0] ?? "";
      }
      populateSettingsDefaultModelSelect();
      refreshRouteStrategyUi();
      showToast(ollamaModels.length > 0 ? "Ollama models list updated. Click Save Settings." : "No Ollama models found. Refresh first.", 2500);
      return;
    }
    if (providerMode === "nvidia") {
      area.value = NVIDIA_RECOMMENDED_MODELS.join("\n");
      if (!defaultInput.value.trim() || defaultInput.value.trim().startsWith("ollama/")) {
        defaultInput.value = NVIDIA_RECOMMENDED_MODELS[0];
      }
      populateSettingsDefaultModelSelect();
      refreshRouteStrategyUi();
      showToast("NVIDIA recommended models added. Click Save Settings.", 2600);
      return;
    }

    area.value = RECOMMENDED_MODELS.join("\n");
    if (!defaultInput.value.trim() || defaultInput.value.trim().startsWith("ollama/")) {
      defaultInput.value = RECOMMENDED_MODELS[0];
    }
    populateSettingsDefaultModelSelect();
    refreshRouteStrategyUi();
    showToast("OpenRouter recommended models added. Click Save Settings.");
  };
  $("test-conn-btn").onclick = async () => {
    if (providerMode === "ollama") {
      setStatus("Switch to a cloud provider to test connection.", "");
      showToast("Provider is Ollama. Cloud connection test is disabled.", 2200);
      return;
    }
    const providerName = getProviderDisplayName(providerMode);
    setStatus(`Testing ${providerName}...`, "");
    const res = await window.api.router.test();
    setStatus(res.message, res.ok ? "ok" : "err");
    showToast(res.ok ? `${providerName} connection passed.` : `${providerName} connection failed.`, res.ok ? 2200 : 3200);
  };
  $("toggle-key-btn").onclick = () => {
    const input = $("api-key-input") as HTMLInputElement;
    const btn = $("toggle-key-btn");
    if (input.type === "password") { input.type = "text"; btn.textContent = "Hide"; }
    else { input.type = "password"; btn.textContent = "Show"; }
  };

  // Router
  $("start-router-btn").onclick = async () => {
    setRouterMsg("Starting...");
    const res = await window.api.router.start();
    setRouterMsg(res.message);
    await refreshRouterStatus({ includeLogs: true });
  };
  $("stop-router-btn").onclick = async () => {
    const res = await window.api.router.stop();
    setRouterMsg(res.message);
    await refreshRouterStatus({ includeLogs: true });
  };
  document.getElementById("refresh-diagnostics-btn")?.addEventListener("click", () => {
    void refreshRouterStatus({ includeLogs: true });
  });

  try {
    await loadSettings();
    applyInteractionMode("chat");
    await refreshMcpStatus();
    const agentTasks = await window.api.agent.listTasks();
    activeAgentRestoreState = await window.api.agent.getRestoreState();
    await refreshAgentTaskTargetStates(agentTasks);
    await refreshAgentSnapshots();
    if (agentTasks.length > 0) {
      const restoreTaskId = activeAgentRestoreState?.taskId ?? "";
      const restoredTask = agentTasks.find((task) => task.id === restoreTaskId) ?? null;
      const selectedTask = restoredTask ?? agentTasks[0];
      activeAgentTaskId = selectedTask.id;
    }
    renderAgentHistory(agentTasks);
    if (agentTasks.length > 0) {
      const selectedTask = agentTasks.find((task) => task.id === activeAgentTaskId) ?? agentTasks[0];
      if (selectedTask.status === "running") ensureAgentPolling();
      await refreshAgentTask(true);
    } else {
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
    }
    await loadChatList();
    const initialChatId = getInitialChatIdFromLocation();
    if (initialChatId && cachedChatSummaries.some((chat) => chat.id === initialChatId)) {
      await loadChat(initialChatId);
    } else if (shouldOpenDraftChatFromLocation()) {
      openDraftChat();
    }
    const routerStatus = await window.api.router.status();
    if (!routerStatus.running) {
      showToast("Starting router...", 1800);
      const log = $("router-log");
      log.textContent += "[Auto] Starting router...\n";
      const started = await window.api.router.start();
      log.textContent += `[Auto] ${started.message}\n`;
      log.scrollTop = log.scrollHeight;
      await refreshRouterStatus({ includeLogs: true });
    }
    if (shouldShowOnboarding()) {
      showOnboarding();
    }
  } catch (err) {
    console.error("Initial load failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load settings: ${message}`, "err");
    showToast(`Initial data load failed: ${message}`, 4500);
  }
}

