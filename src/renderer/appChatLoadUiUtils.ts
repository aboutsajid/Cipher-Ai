async function loadChat(id: string) {
  currentChatId = id;
  const chat = await window.api.chat.get(id);
  if (!chat) return;
  const storedContext = getStoredChatContext(chat);
  try {
    applyChatContextToUi(storedContext);
  } catch (err) {
    console.error("Failed to apply chat context:", err);
    const normalizedContext = normalizeChatContext(storedContext);
    if (normalizedContext) activeChatContext = normalizedContext;
  }

  updateChatHeaderTitle(chat.title);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = chat.systemPrompt ?? "";

  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  virtualItemHeights.clear();
  $("messages").scrollTop = 0;
  renderedMessages = [...chat.messages];
  normalizeRenderedMessageOrder();
  rebuildVirtualItems();
  updateMessageDensityState();
  scheduleVirtualRender(true);

  activeAttachments = [];
  renderComposerAttachments();
  refreshClaudeSafetyPanel();
  scrollToBottom(true);
  await loadChatList();
}
