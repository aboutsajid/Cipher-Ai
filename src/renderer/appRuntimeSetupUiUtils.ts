function setupPreviewPanel(): void {
  $("preview-workspace-refresh-btn").addEventListener("click", () => {
    if (!activePreviewUrl) {
      showToast("No preview loaded.", 1800);
      return;
    }
    refreshPreviewFrame();
  });

  $("preview-workspace-browser-btn").addEventListener("click", async () => {
    if (!activePreviewUrl) {
      showToast("No preview loaded.", 1800);
      return;
    }
    const result = await window.api.app.openExternal(activePreviewUrl);
    showToast(result.message, result.ok ? 1800 : 2600);
  });

  $("preview-workspace-close-btn").addEventListener("click", closePreviewWorkspace);
  $("preview-workspace-detach-btn").addEventListener("click", () => {
    void openDetachedPreview();
  });
}

async function loadAppInfo(): Promise<void> {
  try {
    const info = await window.api.app.info();
    updateHeaderBuildLabel(info.name, info.version);
  } catch {
    updateHeaderBuildLabel("Cipher Workspace", "");
  }
}

async function refreshClaudeSessionStatus(): Promise<void> {
  try {
    const status = await window.api.claude.status();
    claudeSessionRunning = Boolean(status.running);
    if (!status.running) {
      setClaudeStatus("Idle", "");
      return;
    }
    const pidLabel = typeof status.pid === "number" ? `Running (pid ${status.pid})` : "Ready";
    setClaudeStatus(pidLabel, "ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to read Claude status.";
    setClaudeStatus(message, "err");
  }
}

function setupClaudePanel() {
  void refreshClaudeSessionStatus();
  document.getElementById("claude-resume-btn")?.addEventListener("click", fillClaudeResumePrompt);
  refreshClaudeSafetyPanel();
}

function setupModeSwitcher() {
  const modeButtons: Array<{ id: string; mode: UiMode }> = [
    { id: "mode-write-btn", mode: "write" },
    { id: "mode-code-btn", mode: "code" },
    { id: "mode-think-btn", mode: "think" },
    { id: "mode-edit-btn", mode: "edit" }
  ];
  for (const item of modeButtons) {
    $(item.id).addEventListener("click", () => applyMode(item.mode));
  }
  applyMode(currentMode);
}

function setupCompareControls() {
  $("compare-toggle-btn").addEventListener("click", () => {
    compareModeEnabled = !compareModeEnabled;
    refreshCompareUi();
    void syncChatContextAfterUiChange();
  });
  refreshCompareUi();
}

function setupOllamaControls() {
  const openrouterBtn = document.getElementById("provider-openrouter-btn");
  const nvidiaBtn = document.getElementById("provider-nvidia-btn");
  const ollamaBtn = document.getElementById("provider-ollama-btn");
  openrouterBtn?.addEventListener("click", () => {
    setProviderMode("openrouter");
    void syncChatContextAfterUiChange();
  });
  nvidiaBtn?.addEventListener("click", () => {
    setProviderMode("nvidia");
    void syncChatContextAfterUiChange();
  });
  ollamaBtn?.addEventListener("click", () => {
    setProviderMode("ollama");
    void syncChatContextAfterUiChange();
  });
  $("refresh-ollama-models-btn").addEventListener("click", () => {
    void refreshOllamaModels();
  });
  $("setup-local-agent-btn").addEventListener("click", () => {
    void setupFreeLocalCodingMode();
  });
  $("setup-filesystem-mcp-btn").addEventListener("click", () => {
    void prepareWorkspaceFilesystemMcp();
  });
}

function setupMcpControls() {
  $("mcp-add-btn").addEventListener("click", async () => {
    const name = ($("mcp-name-input") as HTMLInputElement).value.trim();
    const command = ($("mcp-command-input") as HTMLInputElement).value.trim();
    const args = parseArgsInput(($("mcp-args-input") as HTMLInputElement).value);
    const addBtn = $("mcp-add-btn") as HTMLButtonElement;

    if (!name || !command) {
      showToast("MCP name aur command required hain.", 2200);
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    try {
      await window.api.mcp.add({ name, command, args });
      ($("mcp-name-input") as HTMLInputElement).value = "";
      ($("mcp-command-input") as HTMLInputElement).value = "";
      ($("mcp-args-input") as HTMLInputElement).value = "";
      await refreshMcpStatus();
      showToast("MCP server saved.");
    } catch (err) {
      showToast(`Failed to save MCP server: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add MCP";
    }
  });
}

function setupMessageInteractions() {
  $("messages").addEventListener("click", async (event: Event) => {
    const target = event.target as HTMLElement;
    const imageSaveBtn = target.closest(".message-image-save-btn") as HTMLButtonElement | null;
    if (imageSaveBtn) {
      const figure = imageSaveBtn.closest(".message-image-card");
      const imageEl = figure?.querySelector<HTMLImageElement>(".message-image");
      const dataUrl = imageEl?.src ?? "";
      const suggestedName = imageSaveBtn.dataset["imageName"] ?? "cipher-generated-image";
      const assetId = imageSaveBtn.dataset["imageAssetId"];
      try {
        const result = await window.api.images.save(dataUrl, suggestedName, assetId);
        showToast(result.message, result.ok ? 2200 : 2800);
        const historyModal = document.getElementById("image-history-modal");
        if (result.ok && historyModal instanceof HTMLElement && historyModal.style.display !== "none") {
          void refreshImageHistory();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Image save failed.", 2800);
      }
      return;
    }

    const actionBtn = target.closest(".msg-action-btn") as HTMLButtonElement | null;
    if (actionBtn) {
      const action = (actionBtn.dataset["action"] ?? "").toLowerCase();
      const msgId = actionBtn.dataset["msgId"] ?? "";
      if (!msgId) return;

      if (action === "edit") {
        await editUserMessage(msgId);
        return;
      }
      if (action === "regenerate") {
        await regenerateAssistantMessage(msgId);
        return;
      }
      if (action === "copy") {
        const message = renderedMessages.find((item) => item.id === msgId);
        if (!message?.content?.trim()) return;
        const ok = await copyTextToClipboard(message.content);
        showToast(ok ? "Response copied." : "Copy failed", 1800);
        return;
      }
    }

    const runBtn = target.closest(".run-btn") as HTMLButtonElement | null;
    if (runBtn) {
      const block = runBtn.closest(".code-block") as HTMLElement | null;
      const codeEl = block?.querySelector("code");
      if (!block || !codeEl) return;

      const lang = (block.dataset["lang"] ?? "").toLowerCase();
      const code = codeEl.textContent ?? "";
      if (lang === "html") {
        openCodePreview(code);
        return;
      }
      if (lang === "javascript" || lang === "js") {
        runJavaScriptPreview(block, code);
      }
      return;
    }

    const btn = target.closest(".copy-btn") as HTMLButtonElement | null;
    if (!btn) {
      const agentBtn = target.closest(".agent-inline-btn") as HTMLButtonElement | null;
      if (!agentBtn) return;
      const action = agentBtn.dataset["agentAction"] ?? "";
      const wrapper = agentBtn.closest(".msg-wrapper") as HTMLElement | null;
      const msgId = wrapper?.dataset["id"] ?? "";
      const message = renderedMessages.find((item) => item.id === msgId);
      const parsed = parseAgentMessageContent(message?.content ?? "");

      if (action === "copy-target") {
        const ok = await copyTextToClipboard(agentBtn.dataset["agentTarget"] ?? parsed.target ?? "");
        showToast(ok ? "Target copied." : "Copy failed", 1800);
        return;
      }
      if (action === "open-target") {
        const targetPath = agentBtn.dataset["agentTarget"] ?? parsed.target ?? "";
        const result = await window.api.workspace.openPath(targetPath);
        showToast(result.message, result.ok ? 1800 : 2600);
        return;
      }
      if (action === "open-preview") {
        const previewUrl = agentBtn.dataset["agentPreview"] ?? parsed.previewUrl ?? "";
        const targetPath = agentBtn.dataset["agentTarget"] ?? parsed.target ?? "";
        await openManagedPreview(targetPath, previewUrl);
        return;
      }
      if (action === "copy-summary") {
        const ok = await copyTextToClipboard(parsed.summary ?? "");
        showToast(ok ? "Summary copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-run-command") {
        const ok = await copyTextToClipboard(parsed.output?.runCommand ?? "");
        showToast(ok ? "Run command copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-logs") {
        const ok = await copyTextToClipboard(parsed.logs.join("\n"));
        showToast(ok ? "Logs copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-files") {
        const ok = await copyTextToClipboard(parsed.files.join("\n"));
        showToast(ok ? "Files copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-file") {
        const ok = await copyTextToClipboard(agentBtn.dataset["agentFile"] ?? "");
        showToast(ok ? "File copied." : "Copy failed", 1800);
        return;
      }
      return;
    }
    const codeEl = btn.closest(".code-block")?.querySelector("code");
    if (!codeEl) return;

    try {
      const ok = await copyTextToClipboard(codeEl.textContent ?? "");
      if (!ok) throw new Error("copy failed");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    } catch {
      showToast("Copy failed", 1800);
    }
  });
}

function closeRightPanel() {
  const panel = $("right-panel");
  panel.style.display = "none";
  panel.dataset["openTab"] = "";
  $("panel-title").textContent = "Settings";
  document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
  setPanelBody("none");
  document.getElementById("settings-toggle-btn")?.classList.remove("active");
  document.getElementById(ROUTER_TOGGLE_BUTTON_ID)?.classList.remove("active");
  document.getElementById(AGENT_TOGGLE_BUTTON_ID)?.classList.remove("active");
}

function setupVirtualScrolling() {
  const messages = $("messages");
  messages.addEventListener("scroll", () => {
    syncAutoScrollState();
    if (virtualItems.length > VIRTUAL_FULL_RENDER_THRESHOLD) {
      scheduleVirtualRender(false);
    }
  }, { passive: true });
  window.addEventListener("resize", () => {
    updateScrollBottomButton();
    scheduleVirtualRender(false);
  });
}

function setupOnboardingControls(): void {
  $("onboarding-close-btn").addEventListener("click", hideOnboarding);
  $("onboarding-openrouter-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("openrouter");
    openPanel("settings");
    showToast("Paste your OpenRouter key in Settings to continue.", 2800);
  });
  $("onboarding-nvidia-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("nvidia");
    openPanel("settings");
    showToast("Paste your NVIDIA key in Settings to continue.", 2800);
  });
  $("onboarding-local-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("ollama");
    openPanel("settings");
    void setupFreeLocalCodingMode();
  });
  $("onboarding-modal").addEventListener("click", (event: Event) => {
    if (event.target === $("onboarding-modal")) hideOnboarding();
  });
}
