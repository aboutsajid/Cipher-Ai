async function loadSettings() {
  const loaded = await window.api.settings.get();
  temporaryClaudeChatFilesystemRoots = normalizeClaudeChatFilesystemRoots(loaded.claudeChatFilesystem?.temporaryRoots ?? []);
  applyLoadedSettingsToUi(loaded);
  refreshClaudeSafetyPanel();
  const localVoiceSettings = document.getElementById("local-voice-settings");
  if (localVoiceSettings instanceof HTMLElement) {
    localVoiceSettings.dataset["availability"] = LOCAL_VOICE_SUPPORTED ? "available" : "unavailable";
    localVoiceSettings.classList.toggle("is-unavailable", !LOCAL_VOICE_SUPPORTED);
  }
  await refreshLocalAgentWorkspacePath();
}

async function saveSettings() {
  const apiKeyRaw = ($("api-key-input") as HTMLInputElement).value;
  const apiKey = normalizeApiKey(apiKeyRaw);
  const baseUrlInput = ($("base-url-input") as HTMLInputElement).value.trim();
  const defaultModelInput = ($("default-model-input") as HTMLInputElement).value.trim();
  const ollamaEnabled = providerMode === "ollama";
  const cloudProvider = isCloudProviderMode(providerMode) ? providerMode : getCloudProviderModeFromSettings(settings);
  const baseUrl = ollamaEnabled ? baseUrlInput : (baseUrlInput || getDefaultBaseUrlForProvider(cloudProvider));
  const ollamaBaseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
  const comfyuiBaseUrl = ((document.getElementById("comfyui-base-url-input") as HTMLInputElement | null)?.value ?? "").trim() || COMFYUI_DEFAULT_BASE_URL;
  const claudeChatFilesystemDraft = getClaudeChatFilesystemSettingsDraft();
  const claudeChatFilesystem = {
    ...claudeChatFilesystemDraft,
    temporaryRoots: [],
    rootConfigs: claudeChatFilesystemDraft.rootConfigs
  };
  const modelsInput = [...new Set(($("models-textarea") as HTMLTextAreaElement).value
    .split(/[\n,]+/)
    .map((m) => m.trim())
    .filter(Boolean))];
  const routing = {
    default: readRouteStrategyValue("route-default-select", defaultModelInput || settings?.routing?.default || settings?.defaultModel || ""),
    think: readRouteStrategyValue("route-think-select", settings?.routing?.think || defaultModelInput || settings?.defaultModel || ""),
    longContext: readRouteStrategyValue("route-long-context-select", settings?.routing?.longContext || defaultModelInput || settings?.defaultModel || "")
  };

  const selectedModel = getSelectedModel();
  const existingDefault = (settings?.defaultModel ?? "").trim();
  const fallbackModel = cloudProvider === "nvidia" ? NVIDIA_DEFAULT_MODEL : OPENROUTER_DEFAULT_MODEL;

  const cloudInput = modelsInput.filter((model) => !model.startsWith("ollama/"));
  const ollamaInput = modelsInput
    .filter((model) => model.startsWith("ollama/"))
    .map((model) => model.slice("ollama/".length))
    .map((model) => model.trim())
    .filter(Boolean);

  let models = [...new Set([
    ...cloudInput,
    ...(settings?.models ?? []),
    !selectedModel.startsWith("ollama/") ? selectedModel : "",
    !existingDefault.startsWith("ollama/") ? existingDefault : "",
    fallbackModel
  ].map((m) => m.trim()).filter(Boolean))];
  models = models.filter((model) => !model.startsWith("ollama/"));

  let ollamaModels = [...new Set([
    ...(settings?.ollamaModels ?? []),
    ...ollamaInput,
    selectedModel.startsWith("ollama/") ? selectedModel.slice("ollama/".length).trim() : "",
    defaultModelInput.startsWith("ollama/") ? defaultModelInput.slice("ollama/".length).trim() : ""
  ].filter(Boolean))];

  let defaultModel = defaultModelInput || selectedModel || existingDefault;
  if (ollamaEnabled) {
    if (!defaultModel.startsWith("ollama/")) {
      const firstOllama = ollamaModels[0] ?? "";
      defaultModel = firstOllama ? `ollama/${firstOllama}` : "";
    }
    if (!defaultModel) {
      setStatus("No Ollama model configured. Refresh Ollama models first.", "err");
      showToast("No Ollama model found. Refresh models and save again.", 3200);
      return;
    }
  } else {
    if (!defaultModel || defaultModel.startsWith("ollama/")) {
      defaultModel = models[0] ?? fallbackModel;
    }
    if (!models.includes(defaultModel)) models.unshift(defaultModel);
  }

  if (!ollamaEnabled && cloudProvider === "openrouter" && apiKeyRaw.trim() && !apiKey.startsWith("sk-or-v1-")) {
    setStatus("Invalid OpenRouter key format.", "err");
    showToast("API key format is invalid. Paste only an sk-or-v1-... key.", 4500);
    return;
  }

  const saved = await window.api.settings.save({
    apiKey,
    baseUrl,
    cloudProvider,
    imageProvider: getImageProviderFromSettings(settings),
    defaultModel,
    models,
    routing,
    ollamaEnabled,
    ollamaBaseUrl,
    ollamaModels,
    comfyuiBaseUrl,
    localVoiceEnabled: false,
    localVoiceModel: "base",
    claudeChatFilesystem
  });
  applyLoadedSettingsToUi(saved);
  setStatus("Settings saved!", "ok");
  setTimeout(() => setStatus(""), 2000);
  showToast("Settings saved");
}
