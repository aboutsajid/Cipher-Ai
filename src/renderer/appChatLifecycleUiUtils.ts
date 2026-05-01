function updateChatHeaderTitle(title: string | null): void {
  const value = title?.trim() ?? "";
  $("chat-title-display").textContent = value;
  document.querySelector(".chat-title-stack")?.classList.toggle("is-empty", value.length === 0);
}

function nextClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureActiveChatId(): Promise<string> {
  let chatId = currentChatId;
  if (!chatId) {
    chatId = await createNewChat(false, activeChatContext ?? getActiveUiChatContext());
  }
  return chatId;
}

async function createNewChat(showEmptyState = true, context = activeChatContext ?? getActiveUiChatContext()): Promise<string> {
  const chat = await window.api.chat.create(context);
  currentChatId = chat.id;
  activeChatContext = normalizeChatContext(chat.context) ?? normalizeChatContext(context) ?? getActiveUiChatContext();
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
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  if (showEmptyState) {
    $("messages").appendChild(createEmptyStateElement());
  }
  activeAttachments = [];
  renderComposerAttachments();
  refreshClaudeSafetyPanel();
  updateScrollBottomButton();
  await loadChatList();
  return chat.id;
}
