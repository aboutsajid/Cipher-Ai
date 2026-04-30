function showHeaderToolsMenu(show: boolean): void {
  const dropdown = $("header-tools-menu");
  const btn = $("header-tools-menu-btn");
  dropdown.style.display = show ? "block" : "none";
  btn.setAttribute("aria-expanded", show ? "true" : "false");
  btn.classList.toggle("active", show);
}

function closeChatItemMenus(): void {
  activeChatActionMenuId = null;
  document.querySelectorAll<HTMLElement>(".chat-item-menu").forEach((menu) => {
    menu.style.display = "none";
    menu.setAttribute("data-open", "false");
  });
  document.querySelectorAll<HTMLButtonElement>(".chat-item-menu-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("active");
  });
}

function showChatItemMenu(chatId: string, button: HTMLButtonElement, menu: HTMLElement, show: boolean): void {
  closeChatItemMenus();
  if (!show) return;
  activeChatActionMenuId = chatId;
  menu.style.display = "block";
  button.setAttribute("aria-expanded", "true");
  button.classList.add("active");
}

function getHeaderToolsMenuItems(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".header-tools-menu-item"));
}

function focusHeaderToolsMenuItem(target: "first" | "last" | number): void {
  const items = getHeaderToolsMenuItems();
  if (items.length === 0) return;
  if (target === "first") {
    items[0]?.focus();
    return;
  }
  if (target === "last") {
    items[items.length - 1]?.focus();
    return;
  }
  items[Math.max(0, Math.min(items.length - 1, target))]?.focus();
}

function showChatProviderMenu(show: boolean): void {
  const menu = document.getElementById("chat-provider-menu");
  const button = document.getElementById("interaction-chat-btn");
  if (!(menu instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  chatProviderMenuOpen = show;
  menu.style.display = show ? "block" : "none";
  button.setAttribute("aria-expanded", show ? "true" : "false");
}

function refreshChatProviderMenuUi(): void {
  const providerItems: Array<[string, ProviderMode]> = [
    ["chat-provider-openrouter-btn", "openrouter"],
    ["chat-provider-nvidia-btn", "nvidia"],
    ["chat-provider-ollama-btn", "ollama"]
  ];
  const claudeActive = currentMode === "claude" || currentMode === "edit";

  for (const [id, mode] of providerItems) {
    document.getElementById(id)?.classList.toggle("active", !claudeActive && providerMode === mode);
  }
  document.getElementById("chat-provider-claude-btn")?.classList.toggle("active", claudeActive);
}
