function setStreamingUi(active: boolean, statusText = "") {
  isStreaming = active;
  if (active) {
    $("send-btn").setAttribute("disabled", "true");
    $("stop-btn").style.display = "inline-block";
    const nextStatusText = statusText || claudeElapsedStatusText || "Working...";
    if (!claudeElapsedStartedAt) {
      startClaudeElapsedTimer(nextStatusText);
    } else {
      claudeElapsedStatusText = nextStatusText;
      renderClaudeElapsedStatus();
    }
    refreshClaudeSafetyPanel();
    return;
  }
  stopClaudeElapsedTimer();
  $("send-btn").removeAttribute("disabled");
  $("stop-btn").style.display = "none";
  $("stream-status").textContent = "";
  refreshClaudeSafetyPanel();
}

async function sendMessage() {
  if (currentInteractionMode === "agent") {
    const resolvedPromptInput = resolveAgentPromptInput();
    const prompt = resolvedPromptInput?.input.value.trim() ?? "";
    if (!prompt) return;
    syncComposerAgentPrompts(resolvedPromptInput?.source ?? "composer");
    const started = await startAgentTaskPrompt(prompt);
    if (started) {
      clearAgentPrompts();
    }
    return;
  }
  if (currentMode === "claude") {
    await sendClaudePrompt();
    return;
  }
  if (currentMode === "edit") {
    await sendClaudeEditSavePrompt();
    return;
  }
  const input = $("composer-input") as HTMLTextAreaElement;
  const rawContent = input.value.trim();
  if (!rawContent && activeAttachments.length === 0) return;
  await sendChatPromptWithAttachments(rawContent, [...activeAttachments]);
}

async function sendChatPromptWithAttachments(
  rawContent: string,
  attachmentsToSend: AttachmentPayload[],
  options?: { forceVisionModel?: boolean; switchFromClaude?: boolean }
): Promise<void> {
  if (isStreaming) return;

  const content = rawContent || "Please review the attachment.";
  const wantsDirectSave = Boolean(shouldVerifyClaudeSave(rawContent || content, attachmentsToSend)?.requested);
  if (wantsDirectSave) {
    showToast("Direct save sirf Edit & Save mode me Claude ke sath allowed hai.", 3800);
    applyMode("edit");
    updateDirectSaveUi();
    return;
  }

  if (options?.switchFromClaude) {
    applyMode("write");
    await syncChatContextAfterUiChange();
  }

  let chatId = currentChatId;
  if (!chatId) {
    chatId = await createNewChat(false, activeChatContext ?? getActiveUiChatContext());
  }
  pendingChatSaveGuard = {
    ...(shouldVerifyClaudeSave(rawContent || content, attachmentsToSend) ?? { requested: false, expectedPaths: [] }),
    chatId
  };

  let model = getSelectedModel();
  if (options?.forceVisionModel && !isLikelyVisionCapableModel(model)) {
    const candidate = findVisionModelCandidate();
    if (!candidate) {
      pendingChatSaveGuard = null;
      showToast("Image review ke liye vision-capable model configure karo, phir dobara try karo.", 4200);
      activeAttachments = mergeAttachments(attachmentsToSend);
      renderComposerAttachments();
      return;
    }

    if (providerMode !== candidate.provider) {
      setProviderMode(candidate.provider);
    }

    model = candidate.model;
    const modelSelect = $("model-select") as HTMLSelectElement;
    if (selectHasOption(modelSelect, candidate.model)) {
      modelSelect.value = candidate.model;
    }
  }

  if (!model) {
    pendingChatSaveGuard = null;
    showToast("Select a model first.");
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    return;
  }

  const compareModel = compareModeEnabled ? getSelectedCompareModel() : "";
  if (compareModeEnabled && !compareModel) {
    pendingChatSaveGuard = null;
    showToast("Select a compare model first.");
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    return;
  }

  const modelsNeedingCloudKey = [model, ...(compareModeEnabled ? [compareModel] : [])]
    .map((m) => (m ?? "").trim())
    .filter(Boolean)
    .some((m) => !m.startsWith("ollama/"));
  if (modelsNeedingCloudKey) {
    const cloudProvider = getCloudProviderModeFromSettings(settings);
    const message = `Selected model needs a ${getProviderDisplayName(cloudProvider)} API key. Add key, or switch model to ollama/...`;
    if (!requireCloudApiKey(message)) {
      pendingChatSaveGuard = null;
      activeAttachments = mergeAttachments(attachmentsToSend);
      renderComposerAttachments();
      return;
    }
  }

  activeAttachments = [];
  renderComposerAttachments();

  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = "";
  input.style.height = "auto";

  if (options?.switchFromClaude) {
    applyMode("write");
    showToast("Image request ko multimodal chat model par route kiya gaya hai.", 2800);
  }

  shouldAutoScroll = true;
  activeStreamChatId = chatId;
  pendingStreamResponses = compareModeEnabled ? 2 : 1;
  setStreamingUi(true, compareModeEnabled ? "Comparing models..." : "Generating...");
  scrollToBottom(true);

  try {
    const chatContext = activeChatContext ?? getActiveUiChatContext();
    await window.api.chat.send(chatId, content, model, {
      attachments: attachmentsToSend,
      compareModel: compareModeEnabled ? compareModel : undefined,
      context: chatContext,
      enabledTools: getEnabledToolNames()
    });
  } catch (err) {
    pendingChatSaveGuard = null;
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    activeStreamChatId = null;
    pendingStreamResponses = 0;
    setStreamingUi(false);
    showToast(`Send failed: ${err instanceof Error ? err.message : "unknown error"}`, 4000);
  }
}
