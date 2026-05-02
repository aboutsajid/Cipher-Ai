function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const hasPrimaryModifier = e.ctrlKey || e.metaKey;

    if (hasPrimaryModifier && e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      void openFreshWorkspaceWindow();
      return;
    }

    if (hasPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      void createNewChat();
      return;
    }

    if (hasPrimaryModifier && !e.shiftKey && e.key === ",") {
      e.preventDefault();
      openPanel("settings");
      return;
    }

    if (hasPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const modelSelect = $("model-select") as HTMLSelectElement;
      modelSelect.focus();
      modelSelect.click();
      return;
    }

    if (hasPrimaryModifier && e.shiftKey && e.key.toLowerCase() === "c") {
      const selected = window.getSelection()?.toString() ?? "";
      const text = selected.trim();
      if (!text) return;

      e.preventDefault();
      const input = $("composer-input") as HTMLTextAreaElement;
      const existing = input.value.trim();
      input.value = existing ? `${input.value.trimEnd()}\n${text}` : text;
      input.dispatchEvent(new Event("input"));
      input.focus();
      return;
    }

    if (hasPrimaryModifier && e.shiftKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      openPanel("router");
      return;
    }

    if (e.key === "Escape") {
      const panel = document.getElementById("right-panel");
      const previewWorkspace = document.getElementById("preview-workspace");
      const renameModal = document.getElementById("rename-modal");
      const imageGenerationModal = document.getElementById("image-generation-modal");
      const imageHistoryModal = document.getElementById("image-history-modal");
      const imagePreviewModal = document.getElementById("image-preview-modal");
      const agentTargetModal = document.getElementById("agent-target-modal");
      const agentPreflightModal = document.getElementById("agent-preflight-modal");
      const chatProviderMenu = document.getElementById("chat-provider-menu");
      const headerToolsMenu = document.getElementById("header-tools-menu");
      const codePreviewModal = document.getElementById("code-preview-modal");
      const statsModal = document.getElementById("stats-modal");
      if (activeChatActionMenuId) {
        closeChatItemMenus();
        return;
      }
      if (agentTargetModal instanceof HTMLElement && agentTargetModal.style.display !== "none") {
        closeAgentTargetPromptModal(null);
        return;
      }
      if (agentPreflightModal instanceof HTMLElement && agentPreflightModal.style.display !== "none") {
        closeAgentPromptPreflightModal(true);
        return;
      }
      if (previewWorkspace instanceof HTMLElement && previewWorkspace.style.display !== "none") {
        closePreviewWorkspace();
        return;
      }
      if (panel instanceof HTMLElement && panel.style.display !== "none") {
        closeRightPanel();
        return;
      }
      if (renameModal instanceof HTMLElement && renameModal.style.display !== "none") {
        closeRenameModal();
        return;
      }
      if (imageGenerationModal instanceof HTMLElement && imageGenerationModal.style.display !== "none") {
        closeImageGenerationModal();
        return;
      }
      if (imagePreviewModal instanceof HTMLElement && imagePreviewModal.style.display !== "none") {
        closeImagePreviewModal();
        return;
      }
      if (imageHistoryModal instanceof HTMLElement && imageHistoryModal.style.display !== "none") {
        closeImageHistoryModal();
        return;
      }
      if (codePreviewModal instanceof HTMLElement && codePreviewModal.style.display !== "none") {
        closeCodePreview();
        return;
      }
      if (statsModal instanceof HTMLElement && statsModal.style.display !== "none") {
        closeStatsModal();
        return;
      }
      if (chatProviderMenu instanceof HTMLElement && chatProviderMenu.style.display !== "none") {
        showChatProviderMenu(false);
        return;
      }
      if (headerToolsMenu instanceof HTMLElement && headerToolsMenu.style.display !== "none") {
        showHeaderToolsMenu(false);
      }
    }
  });
}
