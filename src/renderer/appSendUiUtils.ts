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
