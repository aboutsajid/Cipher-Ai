let pendingRenameChatId: string | null = null;

function openRenameModalForChat(chatId: string, title: string): void {
  pendingRenameChatId = chatId;
  const modal = $("rename-modal");
  modal.style.display = "flex";
  ($("rename-input") as HTMLInputElement).value = title;
  ($("rename-input") as HTMLInputElement).focus();
}

function openRenameModal() {
  if (!currentChatId) return;
  openRenameModalForChat(currentChatId, $("chat-title-display").textContent ?? "");
}

function closeRenameModal(): void {
  pendingRenameChatId = null;
  $("rename-modal").style.display = "none";
}

async function exportChatById(chatId: string): Promise<void> {
  const res = await window.api.chat.export(chatId);
  showToast(res.message, res.ok ? 2200 : 3200);
}

async function confirmRename() {
  const chatId = pendingRenameChatId ?? currentChatId;
  if (!chatId) return;
  const title = ($("rename-input") as HTMLInputElement).value.trim();
  if (!title) return;
  await window.api.chat.rename(chatId, title);
  if (currentChatId === chatId) {
      updateChatHeaderTitle(title);
  }
  closeRenameModal();
  await loadChatList();
}
