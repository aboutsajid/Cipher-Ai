function getComposerPlaceholder(): string {
  if (currentInteractionMode === "agent") {
    return "Describe the coding task. Agent will inspect, edit, verify, and log progress...";
  }

  return ({
    write: "Message Cipher Workspace...",
    code: "Describe your coding task...",
    think: "Ask for strategy, ideas, or analysis...",
    claude: "Type prompt for Claude Code...",
    edit: "Describe the file changes you want Claude to save..."
  }[currentMode]);
}

function applyMode(mode: UiMode): void {
  currentMode = mode;
  const labels: Record<UiMode, string> = {
    write: "Message Cipher Workspace...",
    code: "Describe your coding task...",
    think: "Ask for strategy, ideas, or analysis...",
    claude: "Type prompt for Claude Code...",
    edit: "Describe the file changes you want Claude to save..."
  };

  const input = $("composer-input") as HTMLTextAreaElement;
  input.placeholder = labels[mode];
  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["mode"] === mode);
  });
  setClaudeModeActiveVisual(mode === "claude" || mode === "edit");
  updateDirectSaveUi();
  refreshClaudeSafetyPanel();
  refreshCompareUi();

  if (mode === "claude" || mode === "edit") {
    void ensureClaudeSessionStarted();
  } else {
    setClaudeStatus(claudeSessionRunning ? "Ready" : "Idle", claudeSessionRunning ? "ok" : "");
  }

  if (currentInteractionMode === "agent") {
    applyInteractionMode("agent");
  }
  refreshChatProviderMenuUi();
}

function getActiveModeTemplates(): ModeTemplate[] {
  return currentInteractionMode === "agent" ? AGENT_MODE_TEMPLATES : CHAT_MODE_TEMPLATES;
}

function refreshComposerContextUi(): void {
  const input = document.getElementById("composer-input");
  const directSaveDetail = document.getElementById("direct-save-detail");
  const shortcutHint = document.getElementById("composer-shortcut-hint");
  if (input instanceof HTMLTextAreaElement) input.placeholder = getComposerPlaceholder();
  if (directSaveDetail instanceof HTMLElement) {
    directSaveDetail.textContent = currentInteractionMode === "agent"
      ? "Agent mode starts a supervised coding task with rollback protection."
      : "Use Edit & Save mode for Claude-only file edits.";
  }
  if (shortcutHint instanceof HTMLElement) {
    shortcutHint.textContent = currentInteractionMode === "agent"
      ? "Enter to start agent task"
      : "Shift+Enter for new line Â· Enter to send";
  }
}

function refreshEmptyStateIfNeeded(): void {
  if (renderedMessages.length > 0) return;
  const container = $("messages");
  const empty = container.querySelector(".empty-state");
  if (!empty) return;
  empty.replaceWith(createEmptyStateElement());
}

function syncAgentLandingFocusPanel(): void {
  if (currentInteractionMode !== "agent") return;
  if (renderedMessages.length > 0) return;
  if (currentChatId) return;
  const panel = document.getElementById("right-panel");
  if (!(panel instanceof HTMLElement) || panel.style.display === "none") return;
  const openTab = panel.dataset["openTab"] ?? rightPanelTab;
  if (openTab !== "settings") return;
  closeRightPanel();
}

function isAgentTaskRunning(): boolean {
  return Boolean(activeAgentTaskId && activeAgentTaskStatus === "running");
}

function applyInteractionMode(mode: InteractionMode): void {
  if (mode !== "agent" && currentInteractionMode === "agent" && isAgentTaskRunning()) {
    const statusMessage = "Wait for agent to finish, or stop it first.";
    setAgentStatus(statusMessage);
    showToast(statusMessage, 2600);
    return;
  }

  currentInteractionMode = mode;
  document.body.dataset["interactionMode"] = mode;

  const chatBtn = document.getElementById("interaction-chat-btn");
  const agentBtn = document.getElementById("interaction-agent-btn");
  const imageBtn = document.getElementById("generate-image-btn");
  const messages = document.getElementById("messages");
  const imageStudio = document.getElementById("image-studio");
  const providerSwitcher = document.getElementById("provider-switcher");
  const composerModeSwitcher = document.getElementById("mode-switcher");
  const composerAttachments = document.getElementById("composer-attachments");
  const composerInner = document.querySelector(".composer-inner");
  const composerHint = document.querySelector(".composer-hint");
  const attachBtn = document.getElementById("attach-btn");
  const voiceBtn = document.getElementById("voice-btn");
  const directSaveBadge = document.getElementById("direct-save-badge");
  const directSaveDetail = document.getElementById("direct-save-detail");
  const shortcutHint = document.getElementById("composer-shortcut-hint");
  const input = document.getElementById("composer-input");
  const isAgentMode = mode === "agent";
  const isImageMode = mode === "image";

  chatBtn?.classList.toggle("active", mode === "chat");
  agentBtn?.classList.toggle("active", isAgentMode);
  imageBtn?.classList.toggle("active", isImageMode);

  if (messages instanceof HTMLElement) messages.style.display = isImageMode ? "none" : "flex";
  if (imageStudio instanceof HTMLElement) imageStudio.style.display = isImageMode ? "block" : "none";
  if (providerSwitcher instanceof HTMLElement) providerSwitcher.style.display = "none";
  if (composerModeSwitcher instanceof HTMLElement) composerModeSwitcher.style.display = mode === "chat" ? "inline-flex" : "none";
  if (composerAttachments instanceof HTMLElement && isImageMode) composerAttachments.style.display = "none";
  if (composerInner instanceof HTMLElement) composerInner.style.display = isImageMode ? "none" : "flex";
  if (composerHint instanceof HTMLElement) composerHint.style.display = isImageMode ? "none" : "flex";
  if (attachBtn instanceof HTMLButtonElement) attachBtn.style.display = isAgentMode || isImageMode ? "none" : "inline-flex";
  if (voiceBtn instanceof HTMLButtonElement) {
    voiceBtn.disabled = isAgentMode || isImageMode;
    if (isImageMode) voiceBtn.style.display = "none";
  }
  if (directSaveBadge instanceof HTMLElement && isAgentMode) directSaveBadge.textContent = "Agent mode";
  if (directSaveDetail instanceof HTMLElement) {
    directSaveDetail.textContent = isAgentMode
      ? "Agent mode starts a supervised coding task with rollback protection."
      : "Use Edit & Save mode for Claude-only file edits.";
  }
  if (shortcutHint instanceof HTMLElement) {
    shortcutHint.textContent = isAgentMode
      ? "Enter to start agent task"
      : "Shift+Enter for new line Â· Enter to send";
  }
  if (input instanceof HTMLTextAreaElement) {
    input.placeholder = isAgentMode
      ? "Describe the coding task. Agent will inspect, edit, verify, and log progress..."
      : ({
        write: "Message Cipher Workspace...",
        code: "Describe your coding task...",
        think: "Ask for strategy, ideas, or analysis...",
        claude: "Type prompt for Claude Code...",
        edit: "Describe the file changes you want Claude to save..."
      }[currentMode]);
  }

  if (isAgentMode) {
    syncComposerAgentPrompts("composer");
    setAgentStatus("Agent mode active. Send will start a supervised task.");
    const agentPromptInput = document.getElementById("agent-prompt-input");
    if (agentPromptInput instanceof HTMLTextAreaElement) {
      scheduleAgentPromptPreflight(agentPromptInput.value, getSelectedAgentRunMode());
    }
    if (input instanceof HTMLTextAreaElement) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  if (isImageMode) {
    syncImageStudioControls(true);
    setImageStudioStatus("Loading generated image history...");
    void refreshImageHistory();
  }

  renderComposerAttachments();
  refreshComposerContextUi();
  refreshEmptyStateIfNeeded();
  syncAgentLandingFocusPanel();
  updateDirectSaveUi();
  refreshChatProviderMenuUi();
}
