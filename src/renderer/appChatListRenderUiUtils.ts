function renderChatList(chats: ChatSummary[]): void {
  const list = $("chat-list");
  list.innerHTML = "";

  if (chats.length === 0) {
    list.innerHTML = '<p class="chat-list-empty">Start a new conversation. Ask anything. Code, write, think.</p>';
    return;
  }

  const filteredChats = getFilteredChats(chats);
  if (filteredChats.length === 0) {
    list.innerHTML = '<p class="chat-list-empty">No chats found</p>';
    return;
  }

  for (const chat of filteredChats) {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.id === currentChatId ? " active" : "");
    item.dataset["id"] = chat.id;

    const top = document.createElement("div");
    top.className = "chat-item-top";

    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = chat.title;

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";

    const time = document.createElement("span");
    time.className = "chat-item-time";
    time.textContent = formatUiTime(chat.updatedAt);

    const menuShell = document.createElement("div");
    menuShell.className = "chat-item-menu-shell";

    const menuBtn = document.createElement("button");
    menuBtn.className = "chat-item-menu-btn";
    menuBtn.type = "button";
    menuBtn.title = "Chat actions";
    menuBtn.setAttribute("aria-label", "Chat actions");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.25" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.75" cy="8" r="1.1"/></svg>';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menu.getAttribute("data-open") === "true";
      showChatItemMenu(chat.id, menuBtn, menu, !isOpen);
      menu.setAttribute("data-open", !isOpen ? "true" : "false");
    };

    const menu = document.createElement("div");
    menu.className = "chat-item-menu";
    menu.setAttribute("role", "menu");
    menu.style.display = "none";
    menu.setAttribute("data-open", "false");

    const rename = document.createElement("button");
    rename.className = "chat-item-menu-item";
    rename.type = "button";
    rename.setAttribute("role", "menuitem");
    rename.textContent = "Rename";
    rename.onclick = (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      openRenameModalForChat(chat.id, chat.title);
    };

    const exportBtn = document.createElement("button");
    exportBtn.className = "chat-item-menu-item";
    exportBtn.type = "button";
    exportBtn.setAttribute("role", "menuitem");
    exportBtn.textContent = "Export";
    exportBtn.onclick = async (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      await exportChatById(chat.id);
    };

    const del = document.createElement("button");
    del.className = "chat-item-menu-item danger";
    del.type = "button";
    del.setAttribute("role", "menuitem");
    del.textContent = "Delete";
    del.onclick = async (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      await window.api.chat.delete(chat.id);
      if (currentChatId === chat.id) { currentChatId = null; clearMessages(); }
      await loadChatList();
    };

    top.appendChild(title);
    meta.appendChild(time);
    menu.appendChild(rename);
    menu.appendChild(exportBtn);
    menu.appendChild(del);
    menuShell.appendChild(menuBtn);
    menuShell.appendChild(menu);
    meta.appendChild(menuShell);
    top.appendChild(meta);
    item.appendChild(top);
    item.onclick = () => {
      closeChatItemMenus();
      void loadChat(chat.id);
    };
    list.appendChild(item);
  }
}

async function loadChatList() {
  cachedChatSummaries = await window.api.chat.list();
  renderChatList(cachedChatSummaries);
}
