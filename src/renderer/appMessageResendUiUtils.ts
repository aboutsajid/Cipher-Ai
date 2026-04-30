async function queueMessageForResend(content: string): Promise<void> {
  if (activeAttachments.length > 0) {
    showToast("Clear pending attachments before resend.", 2200);
    return;
  }

  const text = content.trim();
  if (!text) return;
  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  input.focus();
  await sendMessage();
}

async function editUserMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const message = chat.messages.find((item) => item.id === msgId && item.role === "user");
  if (!message) return;

  const edited = await promptForTextInput({
    title: "Edit message",
    initialValue: message.content,
    confirmLabel: "Resend",
    multiline: true
  });
  if (edited === null) return;
  const text = edited.trim();
  if (!text) {
    showToast("Message cannot be empty.", 2000);
    return;
  }

  await queueMessageForResend(text);
}

async function regenerateAssistantMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const assistantIndex = chat.messages.findIndex((item) => item.id === msgId && item.role === "assistant");
  if (assistantIndex < 0) return;

  let lastUserContent = "";
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    const candidate = chat.messages[i];
    if (candidate.role === "user" && candidate.content.trim()) {
      lastUserContent = candidate.content;
      break;
    }
  }

  if (!lastUserContent) {
    showToast("No user message found to regenerate.", 2200);
    return;
  }

  await queueMessageForResend(lastUserContent);
}
