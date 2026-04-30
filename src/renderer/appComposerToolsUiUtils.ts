function setupComposerTools() {
  $("attach-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pick();
    if (picked.length === 0) return;

    activeAttachments = mergeAttachments(picked);
    renderComposerAttachments();
    showToast(`${picked.length} attachment${picked.length === 1 ? "" : "s"} added.`, 1800);
  });

  $("interaction-chat-btn").addEventListener("click", () => {
    showChatProviderMenu(!chatProviderMenuOpen);
  });

  document.getElementById("chat-provider-openrouter-btn")?.addEventListener("click", () => {
    void selectChatProvider("openrouter");
  });
  document.getElementById("chat-provider-nvidia-btn")?.addEventListener("click", () => {
    void selectChatProvider("nvidia");
  });
  document.getElementById("chat-provider-ollama-btn")?.addEventListener("click", () => {
    void selectChatProvider("ollama");
  });
  document.getElementById("chat-provider-claude-btn")?.addEventListener("click", () => {
    void selectChatProvider("claude");
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const advancedShell = document.getElementById("composer-advanced-shell");
    if (!target.closest("#chat-provider-menu") && !target.closest("#interaction-chat-btn")) {
      showChatProviderMenu(false);
    }
    if (advancedShell instanceof HTMLDetailsElement && !target.closest("#composer-advanced-shell")) {
      advancedShell.open = false;
    }
  });

  $("header-tools-menu-btn").addEventListener("click", () => {
    const dropdown = $("header-tools-menu");
    const isOpen = dropdown.style.display !== "none";
    showHeaderToolsMenu(!isOpen);
  });

  $("header-tools-menu-btn").addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showHeaderToolsMenu(true);
      focusHeaderToolsMenuItem("first");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      showHeaderToolsMenu(true);
      focusHeaderToolsMenuItem("last");
    }
  });

  Array.from(document.querySelectorAll<HTMLElement>(".header-tools-menu-item")).forEach((menuItem) => {
    menuItem.addEventListener("click", () => showHeaderToolsMenu(false));
  });

  $("header-tools-menu").addEventListener("keydown", (event: KeyboardEvent) => {
    const items = getHeaderToolsMenuItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      showHeaderToolsMenu(false);
      $("header-tools-menu-btn").focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusHeaderToolsMenuItem(currentIndex < 0 ? 0 : (currentIndex + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusHeaderToolsMenuItem(currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusHeaderToolsMenuItem("first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusHeaderToolsMenuItem("last");
      return;
    }
    if (event.key === "Tab") {
      showHeaderToolsMenu(false);
    }
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("#header-tools-menu") || target.closest("#header-tools-menu-btn")) return;
    showHeaderToolsMenu(false);
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".chat-item-menu") || target.closest(".chat-item-menu-btn")) return;
    closeChatItemMenus();
  });
}
