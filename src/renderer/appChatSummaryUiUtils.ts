async function summarizeCurrentChat(): Promise<void> {
  if (!currentChatId) {
    showToast("Select a chat first.", 1800);
    return;
  }
  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const messages = chat.messages
    .map((message) => ({ role: message.role, content: message.content }));

  if (messages.length === 0) {
    showToast("No messages to summarize.", 1800);
    return;
  }

  try {
    const summary = await window.api.chat.summarize(messages);
    showSummaryOverlay(summary);
  } catch (err) {
    showToast(`Summary failed: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

async function maybeGenerateTitle(chatId: string): Promise<void> {
  if (pendingTitleGeneration.has(chatId)) return;

  const chat = await window.api.chat.get(chatId);
  if (!chat || chat.title !== "New Chat") return;

  const firstUserMessage = chat.messages.find((message) => message.role === "user" && message.content.trim());
  const hasAssistantReply = chat.messages.some((message) => message.role === "assistant" && message.content.trim());
  if (!firstUserMessage || !hasAssistantReply) return;

  pendingTitleGeneration.add(chatId);
  try {
    const title = await window.api.chat.generateTitle(chatId, firstUserMessage.content);
    if (chatId === currentChatId) {
      updateChatHeaderTitle(title);
    }
    await loadChatList();
  } catch (err) {
    console.error("Title generation failed:", err);
  } finally {
    pendingTitleGeneration.delete(chatId);
  }
}
