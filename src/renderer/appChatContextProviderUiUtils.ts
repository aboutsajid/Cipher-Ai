function populateModels() {
  const sel = $("model-select") as HTMLSelectElement;
  const compareSel = $("compare-model-select") as HTMLSelectElement;
  sel.innerHTML = "";
  compareSel.innerHTML = "";
  const models = getVisibleModelsForProvider(settings, providerMode);

  if (models.length === 0) {
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = providerMode === "ollama" ? "No Ollama model configured" : `No ${getProviderDisplayName(providerMode)} model configured`;
    sel.appendChild(emptyOpt);
    compareSel.appendChild(emptyOpt.cloneNode(true));
    sel.value = "";
    compareSel.value = "";
    ($("models-textarea") as HTMLTextAreaElement).value = "";
    return;
  }

  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = compactModelName(m);
    sel.appendChild(opt);
    compareSel.appendChild(opt.cloneNode(true));
  }

  const preferOllama = shouldPreferOllamaWithoutApiKey(settings);
  const ollamaPreferred = preferOllama ? models.find((model) => model.startsWith("ollama/")) ?? "" : "";
  const preferred = ollamaPreferred || (settings?.defaultModel ?? "").trim();
  sel.value = preferred && models.includes(preferred) ? preferred : models[0];

  if (preferOllama) {
    const ollamaModels = models.filter((model) => model.startsWith("ollama/"));
    compareSel.value = ollamaModels.find((model) => model !== sel.value) ?? sel.value;
  } else {
    compareSel.value = models.find((model) => model !== sel.value) ?? models[0];
  }

  const defaultModelInput = $("default-model-input") as HTMLInputElement;
  const defaultCandidate = defaultModelInput.value.trim();
  defaultModelInput.value = models.includes(defaultCandidate) ? defaultCandidate : sel.value;
  ($("models-textarea") as HTMLTextAreaElement).value = models.join("\n");
  populateSettingsDefaultModelSelect();
  refreshRouteStrategyUi();
}

function getSelectedModel(): string {
  const selected = (($("model-select") as HTMLSelectElement).value ?? "").trim();
  if (selected) return selected;
  const fallback = (settings?.defaultModel ?? "").trim();
  const models = getVisibleModelsForProvider(settings, providerMode);
  if (fallback && models.includes(fallback)) return fallback;
  return models[0] ?? "";
}

function getSelectedCompareModel(): string {
  return (($("compare-model-select") as HTMLSelectElement).value ?? "").trim();
}

function normalizeChatContext(context: ChatContext | null | undefined): ChatContext | null {
  if (!context) return null;

  const provider = context.provider === "claude" || context.provider === "ollama" || context.provider === "nvidia" || context.provider === "openrouter"
    ? context.provider
    : null;
  if (!provider) return null;

  const selectedModel = (context.selectedModel ?? "").trim();
  const compareModel = (context.compareModel ?? "").trim();

  if (provider === "claude") {
    return {
      provider,
      selectedModel: selectedModel || CLAUDE_MODEL_LABEL,
      compareEnabled: false
    };
  }

  return {
    provider,
    ...(selectedModel ? { selectedModel } : {}),
    ...(compareModel && context.compareEnabled ? { compareEnabled: true, compareModel } : {})
  };
}

function getActiveUiChatContext(): ChatContext {
  if (currentMode === "claude" || currentMode === "edit") {
    return {
      provider: "claude",
      selectedModel: CLAUDE_MODEL_LABEL,
      compareEnabled: false
    };
  }

  const compareModel = compareModeEnabled ? getSelectedCompareModel() : "";
  return {
    provider: providerMode,
    selectedModel: getSelectedModel(),
    ...(compareModeEnabled && compareModel ? { compareEnabled: true, compareModel } : {})
  };
}

function areChatContextsEqual(left: ChatContext | null | undefined, right: ChatContext | null | undefined): boolean {
  const normalizedLeft = normalizeChatContext(left);
  const normalizedRight = normalizeChatContext(right);
  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.provider === normalizedRight.provider
    && (normalizedLeft.selectedModel ?? "") === (normalizedRight.selectedModel ?? "")
    && Boolean(normalizedLeft.compareEnabled) === Boolean(normalizedRight.compareEnabled)
    && (normalizedLeft.compareModel ?? "") === (normalizedRight.compareModel ?? "");
}

function applyChatContextToUi(context: ChatContext | null | undefined): void {
  const normalized = normalizeChatContext(context);
  if (!normalized) return;

  suppressChatContextSync = true;
  try {
    applyInteractionMode("chat");
    if (normalized.provider === "claude") {
      compareModeEnabled = false;
      refreshCompareUi();
      applyMode("claude");
      activeChatContext = normalized;
      return;
    }

    setProviderMode(normalized.provider);
    if (currentMode === "claude" || currentMode === "edit") {
      applyMode("write");
    }

    const modelSelect = $("model-select") as HTMLSelectElement;
    if (normalized.selectedModel && selectHasOption(modelSelect, normalized.selectedModel)) {
      modelSelect.value = normalized.selectedModel;
    }

    const compareSelect = $("compare-model-select") as HTMLSelectElement;
    if (normalized.compareEnabled && normalized.compareModel && selectHasOption(compareSelect, normalized.compareModel)) {
      compareSelect.value = normalized.compareModel;
      compareModeEnabled = true;
    } else {
      compareModeEnabled = false;
    }
    refreshCompareUi();
    activeChatContext = {
      provider: normalized.provider,
      selectedModel: getSelectedModel(),
      ...(compareModeEnabled ? { compareEnabled: true, compareModel: getSelectedCompareModel() } : {})
    };
  } finally {
    suppressChatContextSync = false;
  }
}

function getStoredChatContext(chat: Chat | null | undefined): ChatContext {
  const normalized = normalizeChatContext(chat?.context);
  if (normalized) return normalized;

  const latestAssistant = [...(chat?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant" && (message.model ?? "").trim());
  if ((latestAssistant?.model ?? "").trim() === CLAUDE_MODEL_LABEL) {
    return {
      provider: "claude",
      selectedModel: CLAUDE_MODEL_LABEL,
      compareEnabled: false
    };
  }
  if ((latestAssistant?.model ?? "").trim().startsWith("ollama/")) {
    return {
      provider: "ollama",
      selectedModel: latestAssistant?.model?.trim(),
      compareEnabled: false
    };
  }

  return activeChatContext ?? getActiveUiChatContext();
}

async function syncChatContextAfterUiChange(): Promise<void> {
  if (suppressChatContextSync) return;

  const nextContext = getActiveUiChatContext();
  if (areChatContextsEqual(activeChatContext, nextContext)) return;

  if (isStreaming) {
    showToast("Wait for the current response to finish before switching chat provider or model.", 3200);
    applyChatContextToUi(activeChatContext);
    return;
  }

  activeChatContext = nextContext;
  const hasPersistedChat = Boolean(currentChatId);
  const hasConversation = renderedMessages.length > 0;

  if (hasPersistedChat && hasConversation) {
    openDraftChat(true, { preserveAttachments: true, context: nextContext });
    return;
  }

  if (currentChatId) {
    await window.api.chat.setContext(currentChatId, nextContext);
  }
}

function populateSettingsDefaultModelSelect(): void {
  const select = document.getElementById("default-model-select");
  if (!(select instanceof HTMLSelectElement)) return;

  const input = $("default-model-input") as HTMLInputElement;
  const visibleModels = getVisibleModelsForProvider(settings, providerMode);
  const currentValue = input.value.trim();

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = visibleModels.length > 0
    ? "Choose an existing model..."
    : (providerMode === "ollama" ? "No Ollama model configured" : `No ${getProviderDisplayName(providerMode)} model configured`);
  select.appendChild(placeholder);

  for (const model of visibleModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = compactModelName(model);
    select.appendChild(option);
  }

  select.disabled = visibleModels.length === 0;
  select.value = visibleModels.includes(currentValue) ? currentValue : "";
}

function applyLoadedSettingsToUi(loaded: Settings): void {
  settings = loaded;
  ($("api-key-input") as HTMLInputElement).value = loaded.apiKey;
  ($("base-url-input") as HTMLInputElement).value = loaded.baseUrl;
  ($("default-model-input") as HTMLInputElement).value = loaded.defaultModel;
  ($("ollama-base-url-input") as HTMLInputElement).value = loaded.ollamaBaseUrl || "http://localhost:11434/v1";
  const comfyuiBaseUrlInput = document.getElementById("comfyui-base-url-input");
  if (comfyuiBaseUrlInput instanceof HTMLInputElement) {
    comfyuiBaseUrlInput.value = loaded.comfyuiBaseUrl || COMFYUI_DEFAULT_BASE_URL;
  }
  renderOllamaModels(loaded.ollamaModels ?? []);
  setProviderMode(getProviderModeFromSettings(loaded));
  autoSwitchToOllamaIfNeeded();
  renderClaudeChatFilesystemSettingsUi(loaded.claudeChatFilesystem);
  refreshRouteStrategyUi();
  renderSettingsModelHealth(cachedAgentRouteDiagnostics, activeAgentTaskId ? (cachedAgentTasks.find((item) => item.id === activeAgentTaskId) ?? null) : null);
  updateVoiceUi();
}

async function prepareCloudProviderSelection(provider: CloudProviderMode): Promise<void> {
  const base = settings ?? await window.api.settings.get();
  const apiKeyInput = document.getElementById("api-key-input");
  const rawApiKey = apiKeyInput instanceof HTMLInputElement ? apiKeyInput.value : base.apiKey;
  const apiKey = normalizeApiKey(rawApiKey);
  const preferredBaseUrl = getDefaultBaseUrlForProvider(provider);
  const currentBaseUrl = (($("base-url-input") as HTMLInputElement).value ?? "").trim();
  const currentBaseUrlSupportsProvider = provider === "nvidia"
    ? currentBaseUrl.toLowerCase().includes("nvidia.com")
    : currentBaseUrl.toLowerCase().includes("openrouter.ai");
  const baseUrl = currentBaseUrl && currentBaseUrlSupportsProvider
    ? currentBaseUrl
    : preferredBaseUrl;
  const defaultModel = provider === "nvidia" ? NVIDIA_DEFAULT_MODEL : OPENROUTER_DEFAULT_MODEL;
  const models = getRecommendedCloudModelsForProvider(provider);
  const nextSettings = await window.api.settings.save({
    apiKey,
    baseUrl,
    cloudProvider: provider,
    imageProvider: getImageProviderFromSettings(base),
    defaultModel,
    models,
    routing: getDefaultRoutingForProvider(provider),
    ollamaEnabled: false,
    ollamaBaseUrl: base.ollamaBaseUrl,
    ollamaModels: base.ollamaModels,
    comfyuiBaseUrl: base.comfyuiBaseUrl ?? COMFYUI_DEFAULT_BASE_URL,
    localVoiceEnabled: false,
    localVoiceModel: base.localVoiceModel || "base"
  });
  applyLoadedSettingsToUi(nextSettings);
}

async function prepareOllamaProviderSelection(): Promise<void> {
  const base = settings ?? await window.api.settings.get();
  setProviderMode("ollama");

  const check = await window.api.ollama.check();
  if (!check.ok) {
    setStatus(
      (check.message ?? "Ollama is not installed.")
      + ` Install Ollama, run \`ollama pull ${LOCAL_CODER_PRIMARY}\`, then retry.`,
      "err"
    );
    showToast("Ollama not found. Install it and pull a local model first.", 4200);
    return;
  }

  const ollamaBaseUrlInput = document.getElementById("ollama-base-url-input");
  const baseUrl = ollamaBaseUrlInput instanceof HTMLInputElement
    ? ollamaBaseUrlInput.value.trim() || base.ollamaBaseUrl || "http://localhost:11434/v1"
    : base.ollamaBaseUrl || "http://localhost:11434/v1";
  let refreshError: string | null = null;
  let models: string[] = [];
  try {
    models = await window.api.ollama.listModels(baseUrl);
  } catch (err) {
    refreshError = err instanceof Error ? err.message : "unknown error";
    models = (base.ollamaModels ?? []).map((model) => model.trim()).filter(Boolean);
  }
  const preferredModel = pickPreferredLocalCoderModel(models);
  const defaultModel = preferredModel ? `ollama/${preferredModel}` : "";

  const nextSettings = await window.api.settings.save({
    apiKey: normalizeApiKey((document.getElementById("api-key-input") as HTMLInputElement | null)?.value ?? base.apiKey),
    baseUrl: base.baseUrl,
    cloudProvider: getCloudProviderModeFromSettings(base),
    imageProvider: getImageProviderFromSettings(base),
    ...(defaultModel ? { defaultModel } : {}),
    ollamaEnabled: true,
    ollamaBaseUrl: baseUrl,
    ollamaModels: models,
    comfyuiBaseUrl: base.comfyuiBaseUrl ?? COMFYUI_DEFAULT_BASE_URL,
    localVoiceEnabled: false,
    localVoiceModel: base.localVoiceModel || "base"
  });
  applyLoadedSettingsToUi(nextSettings);

  if (refreshError) {
    const detail = models.length > 0
      ? `Using ${models.length} saved Ollama model(s). Refresh failed: ${refreshError}`
      : `Ollama models could not be refreshed: ${refreshError}`;
    setStatus(detail, models.length > 0 ? "" : "err");
    showToast(models.length > 0 ? "Ollama refresh failed. Using saved local models." : "Ollama models refresh failed.", 3600);
    return;
  }

  if (models.length === 0) {
    setStatus(`Ollama is installed, but no local models were found. Run \`ollama pull ${LOCAL_CODER_PRIMARY}\` and retry.`, "err");
    showToast("No local Ollama models found. Pull a model first.", 3600);
    return;
  }

  setStatus(`Ollama ready with ${preferredModel}.`, "ok");
  showToast(`Ollama ready. Local models loaded automatically: ${preferredModel}`, 2600);
}

async function refreshOllamaModels(): Promise<void> {
  const baseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
  try {
    const models = await window.api.ollama.listModels(baseUrl);
    if (settings) settings.ollamaModels = models;
    renderOllamaModels(models);
    populateModels();
    const switched = autoSwitchToOllamaIfNeeded();
    showToast(switched ? "Switched to first available Ollama model." : `Loaded ${models.length} Ollama model(s).`, 2200);
  } catch (err) {
    showToast(`Failed to load Ollama models: ${err instanceof Error ? err.message : "unknown error"}`, 3500);
  }
}

function getInitialChatIdFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get("chatId") ?? "";
  const value = raw.trim();
  return value || null;
}

function shouldOpenDraftChatFromLocation(): boolean {
  return (new URLSearchParams(window.location.search).get("draftChat") ?? "").trim() === "1";
}

async function selectChatProvider(option: "openrouter" | "nvidia" | "ollama" | "claude"): Promise<void> {
  applyInteractionMode("chat");
  if (option === "claude") {
    applyMode("claude");
    showChatProviderMenu(false);
    refreshChatProviderMenuUi();
    await syncChatContextAfterUiChange();
    return;
  }

  if (option === "openrouter" || option === "nvidia") {
    await prepareCloudProviderSelection(option);
    const providerName = getProviderDisplayName(option);
    setStatus(`${providerName} presets ready.`, "ok");
    showToast(`${providerName} ready. Base URL and models were set automatically.`, 2600);
  } else if (option === "ollama") {
    await prepareOllamaProviderSelection();
  } else {
    setProviderMode(option);
  }
  if (currentMode === "claude" || currentMode === "edit") {
    applyMode("write");
  }
  showChatProviderMenu(false);
  refreshChatProviderMenuUi();
  await syncChatContextAfterUiChange();
}
