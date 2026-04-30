function normalizeApiKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  const firstToken = withoutBearer.split(/\s+/)[0] ?? "";
  const extracted = trimmed.match(/sk-or-v1-[^\s"'`]+/i);
  if (extracted?.[0]) return extracted[0];

  return firstToken;
}

function inferCloudProviderFromBaseUrl(baseUrl: string): CloudProviderMode {
  const normalized = (baseUrl ?? "").trim().toLowerCase();
  return normalized.includes("nvidia.com") ? "nvidia" : "openrouter";
}

function getCloudProviderModeFromSettings(source: Settings | null): CloudProviderMode {
  const preferred = (source?.cloudProvider ?? "").trim().toLowerCase();
  if (preferred === "nvidia") return "nvidia";
  if (preferred === "openrouter") return "openrouter";
  return inferCloudProviderFromBaseUrl(source?.baseUrl ?? OPENROUTER_BASE_URL);
}

function isCloudProviderMode(mode: ProviderMode): mode is CloudProviderMode {
  return mode !== "ollama";
}

function getImageProviderFromSettings(source: Settings | null): ImageProviderMode {
  const preferred = (source?.imageProvider ?? "").trim().toLowerCase();
  if (preferred === "comfyui") return "comfyui";
  if (preferred === "nvidia") return "nvidia";
  if (preferred === "openrouter") return "openrouter";
  return getCloudProviderModeFromSettings(source);
}

function getProviderDisplayName(mode: ProviderMode): string {
  if (mode === "ollama") return "Ollama";
  return mode === "nvidia" ? "NVIDIA" : "OpenRouter";
}

function getImageProviderDisplayName(mode: ImageProviderMode): string {
  return mode === "comfyui" ? "ComfyUI Local" : getProviderDisplayName(mode);
}

function getDefaultBaseUrlForProvider(mode: CloudProviderMode): string {
  return mode === "nvidia" ? NVIDIA_BASE_URL : OPENROUTER_BASE_URL;
}

function getRecommendedCloudModelsForProvider(mode: CloudProviderMode): string[] {
  return [...(mode === "nvidia" ? NVIDIA_RECOMMENDED_MODELS : RECOMMENDED_MODELS)];
}

function getDefaultRoutingForProvider(mode: CloudProviderMode): Settings["routing"] {
  if (mode === "nvidia") {
    return {
      default: NVIDIA_DEFAULT_MODEL,
      think: NVIDIA_THINK_MODEL,
      longContext: NVIDIA_LONG_CONTEXT_MODEL
    };
  }

  return {
    default: OPENROUTER_DEFAULT_MODEL,
    think: OPENROUTER_THINK_MODEL,
    longContext: OPENROUTER_LONG_CONTEXT_MODEL
  };
}

function getCloudProviderLabelFromBaseUrl(baseUrl: string): string {
  return getProviderDisplayName(inferCloudProviderFromBaseUrl(baseUrl));
}

function getCloudProviderLabelForModel(model: string, route?: Pick<AgentModelRouteDiagnostics, "baseUrl"> | null): string {
  if (model.startsWith("ollama/")) return "Local provider";
  return `${getCloudProviderLabelFromBaseUrl(route?.baseUrl ?? settings?.baseUrl ?? OPENROUTER_BASE_URL)} cloud`;
}

function syncBaseUrlInputForProvider(mode: ProviderMode): void {
  if (!isCloudProviderMode(mode)) return;
  const input = document.getElementById("base-url-input");
  if (!(input instanceof HTMLInputElement)) return;

  const current = input.value.trim();
  const knownDefaults = new Set([OPENROUTER_BASE_URL, NVIDIA_BASE_URL]);
  if (!current || knownDefaults.has(current)) {
    input.value = getDefaultBaseUrlForProvider(mode);
  }
}

function requireCloudApiKey(message?: string): boolean {
  const key = (settings?.apiKey ?? "").trim();
  if (key) return true;
  const activeProvider = providerMode === "ollama" ? getCloudProviderModeFromSettings(settings) : providerMode;
  const providerName = getProviderDisplayName(activeProvider);
  openPanel("settings");
  setStatus(
    message ?? `${providerName} API key required for cloud models. Add key, or choose an ollama/... model.`,
    "err"
  );
  showToast(`Add ${providerName} API key, or select an ollama model to continue without key.`, 4200);
  const input = $("api-key-input") as HTMLInputElement;
  input.focus();
  return false;
}

function setRouterMsg(msg: string) {
  const el = $("router-action-msg");
  el.textContent = msg;
}

function updateVoiceUi(): void {
  const btn = document.getElementById("voice-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  if (!LOCAL_VOICE_SUPPORTED) {
    btn.style.display = "none";
    btn.disabled = true;
    btn.title = "Local voice input is unavailable in this build";
    return;
  }
  const enabled = Boolean(settings?.localVoiceEnabled);
  btn.style.display = enabled ? "inline-flex" : "none";
  btn.title = enabled
    ? `Local voice input (${settings?.localVoiceModel ?? "base"})`
    : "Enable local voice in Settings";
}
