async function openFreshWorkspaceWindow(): Promise<void> {
  try {
    const result = await window.api.app.newWindow();
    if (!result.ok) {
      showToast(result.message || "Failed to open a new window.", 2800);
      return;
    }
    showToast(result.message || "Opened a new workspace window.", 1800);
  } catch (err) {
    showToast(`Failed to open a new window: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

async function syncChatStoreAcrossWindows(payload?: { chatId?: string; reason?: string }): Promise<void> {
  await loadChatList();
  const affectedChatId = (payload?.chatId ?? "").trim();
  if (!affectedChatId) return;

  if (payload?.reason === "delete" && currentChatId === affectedChatId) {
    currentChatId = null;
    const fallbackChatId = cachedChatSummaries[0]?.id;
    if (fallbackChatId) {
      await loadChat(fallbackChatId);
    } else {
      clearMessages();
    }
    return;
  }

  if (currentChatId === affectedChatId && (payload?.reason === "rename" || payload?.reason === "system-prompt" || payload?.reason === "context")) {
    await loadChat(affectedChatId);
  }
}

async function syncSettingsAcrossWindows(): Promise<void> {
  await loadSettings();
  await refreshMcpStatus();
}

async function syncRouterStateAcrossWindows(): Promise<void> {
  await refreshRouterStatus();
  await refreshMcpStatus();
}
