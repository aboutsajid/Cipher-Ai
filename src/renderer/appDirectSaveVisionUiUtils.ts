function getDirectSaveStatus(): DirectSaveStatus {
  const hasEditableFiles = getClaudeManagedEditPermissions(activeAttachments).allowedPaths.length > 0;

  if (currentMode !== "edit") {
    return {
      state: "off",
      badge: "Direct save off",
      detail: "Use Edit & Save mode to send file edits through Claude."
    };
  }

  if (!hasEditableFiles) {
    return {
      state: "warn",
      badge: "Attach files",
      detail: "Attach the exact text files you want changed. Folder bundles and pathless content cannot be saved."
    };
  }

  return {
    state: "ready",
    badge: "Claude save ready",
    detail: "Edit & Save will review Claude JSON edits, then the app writes only allowed attached paths with backups."
  };
}

function updateDirectSaveUi(): void {
  const badge = document.getElementById("direct-save-badge");
  const detail = document.getElementById("direct-save-detail");
  if (!(badge instanceof HTMLElement) || !(detail instanceof HTMLElement)) return;

  const status = getDirectSaveStatus();
  badge.textContent = status.badge;
  badge.classList.remove("state-ready", "state-warn", "state-off", "state-blocked");
  badge.classList.add(`state-${status.state}`);
  detail.textContent = status.detail;
}

function isLikelyVisionCapableModel(model: string): boolean {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized) return false;

  return normalized.includes("gemini")
    || normalized.includes("gpt-4o")
    || normalized.includes("gpt-4.1")
    || normalized.includes("claude-3")
    || normalized.includes("claude-4")
    || normalized.includes("llava")
    || normalized.includes("qwen-vl")
    || normalized.includes("minicpm-v")
    || normalized.includes("internvl")
    || normalized.includes("pixtral")
    || normalized.includes("gemma-3");
}

function findVisionModelCandidate(): { provider: ProviderMode; model: string } | null {
  const currentProviderModels = getVisibleModelsForProvider(settings, providerMode);
  const currentProviderMatch = currentProviderModels.find(isLikelyVisionCapableModel);
  if (currentProviderMatch) return { provider: providerMode, model: currentProviderMatch };

  const cloudProvider = getCloudProviderModeFromSettings(settings);
  if (cloudProvider !== providerMode) {
    const cloudMatch = getVisibleModelsForProvider(settings, cloudProvider).find(isLikelyVisionCapableModel);
    if (cloudMatch) return { provider: cloudProvider, model: cloudMatch };
  }

  const ollamaMatch = getVisibleModelsForProvider(settings, "ollama").find(isLikelyVisionCapableModel);
  if (ollamaMatch) return { provider: "ollama", model: ollamaMatch };

  return null;
}
