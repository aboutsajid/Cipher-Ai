function clearRenderedMessages(): void {
  const container = $("messages");
  const children = Array.from(container.children);
  for (const child of children) {
    if ((child as HTMLElement).id === "chat-summary-overlay") continue;
    child.remove();
  }
}

function hideSummaryOverlay(): void {
  const overlay = document.getElementById("chat-summary-overlay");
  const content = document.getElementById("chat-summary-content");
  if (overlay instanceof HTMLElement) overlay.style.display = "none";
  if (content instanceof HTMLElement) content.textContent = "";
}

function showSummaryOverlay(summary: string): void {
  const overlay = document.getElementById("chat-summary-overlay");
  const content = document.getElementById("chat-summary-content");
  if (!(overlay instanceof HTMLElement) || !(content instanceof HTMLElement)) return;
  content.textContent = summary.trim();
  overlay.style.display = "flex";
}

function clearMessages() {
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  $("messages").appendChild(createEmptyStateElement());
  updateMessageDensityState();
  updateChatHeaderTitle(null);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = "";
  activeAttachments = [];
  activeChatContext = getActiveUiChatContext();
  renderComposerAttachments();
  updateScrollBottomButton();
}

function openDraftChat(
  showEmptyState = true,
  options?: { preserveAttachments?: boolean; context?: ChatContext | null }
): void {
  currentChatId = null;
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  const messages = $("messages");
  clearRenderedMessages();
  messages.scrollTop = 0;
  if (showEmptyState) {
    messages.appendChild(createEmptyStateElement());
  }
  updateMessageDensityState();
  updateChatHeaderTitle(null);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = "";
  if (!options?.preserveAttachments) activeAttachments = [];
  activeChatContext = normalizeChatContext(options?.context) ?? getActiveUiChatContext();
  renderComposerAttachments();
  updateScrollBottomButton();
  renderChatList(cachedChatSummaries);
}
