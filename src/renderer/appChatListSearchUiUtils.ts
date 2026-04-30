function updateChatSearchClearButton(): void {
  const clearBtn = $("chat-search-clear-btn");
  clearBtn.classList.toggle("visible", chatSearchQuery.trim().length > 0);
}

function getFilteredChats(chats: ChatSummary[]): ChatSummary[] {
  const query = chatSearchQuery.trim().toLowerCase();
  if (!query) return chats;
  return chats.filter((chat) => (chat.title ?? "").toLowerCase().includes(query));
}

function setupChatListSearch(): void {
  const input = $("chat-search-input") as HTMLInputElement;
  const clearBtn = $("chat-search-clear-btn");

  input.addEventListener("input", () => {
    chatSearchQuery = input.value;
    updateChatSearchClearButton();
    renderChatList(cachedChatSummaries);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    chatSearchQuery = "";
    updateChatSearchClearButton();
    renderChatList(cachedChatSummaries);
    input.focus();
  });

  updateChatSearchClearButton();
}
