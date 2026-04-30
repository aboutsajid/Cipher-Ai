function getEffectiveModels(source: Settings | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    const v = (value ?? "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };

  for (const m of source?.models ?? []) push(m);
  push(source?.defaultModel);
  for (const m of source?.ollamaModels ?? []) push(`ollama/${m}`);
  return out;
}

function getRoutingModelPool(source: Settings | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    const normalized = (value ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  push(source?.defaultModel);
  push(source?.routing?.default);
  push(source?.routing?.think);
  push(source?.routing?.longContext);
  for (const model of source?.models ?? []) push(model);
  for (const model of source?.ollamaModels ?? []) push(`ollama/${model}`);
  return out;
}

function readRouteStrategyValue(id: string, fallback: string): string {
  const element = document.getElementById(id);
  if (element instanceof HTMLSelectElement) {
    return element.value.trim() || fallback;
  }
  return fallback;
}

function buildRouteStrategyDraft(): Settings | null {
  const base = settings;
  if (!base) return null;

  const apiKeyInput = document.getElementById("api-key-input");
  const baseUrlInput = document.getElementById("base-url-input");
  const defaultModelInput = document.getElementById("default-model-input");
  const modelsTextarea = document.getElementById("models-textarea");
  const ollamaBaseUrlInput = document.getElementById("ollama-base-url-input");

  const apiKey = normalizeApiKey(apiKeyInput instanceof HTMLInputElement ? apiKeyInput.value : base.apiKey);
  const baseUrl = baseUrlInput instanceof HTMLInputElement ? baseUrlInput.value.trim() : base.baseUrl;
  const defaultModel = defaultModelInput instanceof HTMLInputElement
    ? defaultModelInput.value.trim() || base.defaultModel
    : base.defaultModel;
  const modelsInput = modelsTextarea instanceof HTMLTextAreaElement
    ? [...new Set(modelsTextarea.value.split(/[\n,]+/).map((model) => model.trim()).filter(Boolean))]
    : [];
  const ollamaBaseUrl = ollamaBaseUrlInput instanceof HTMLInputElement
    ? ollamaBaseUrlInput.value.trim() || "http://localhost:11434/v1"
    : base.ollamaBaseUrl;
  const routingDefaultFallback = (base.routing?.default ?? "").trim() || defaultModel;
  const routingThinkFallback = (base.routing?.think ?? "").trim() || routingDefaultFallback;
  const routingLongContextFallback = (base.routing?.longContext ?? "").trim() || routingThinkFallback;

  const routing = {
    default: readRouteStrategyValue("route-default-select", routingDefaultFallback),
    think: readRouteStrategyValue("route-think-select", routingThinkFallback),
    longContext: readRouteStrategyValue("route-long-context-select", routingLongContextFallback)
  };

  const openRouterModels = [...new Set([
    ...base.models,
    ...modelsInput.filter((model) => !model.startsWith("ollama/")),
    !defaultModel.startsWith("ollama/") ? defaultModel : "",
    !routing.default.startsWith("ollama/") ? routing.default : "",
    !routing.think.startsWith("ollama/") ? routing.think : "",
    !routing.longContext.startsWith("ollama/") ? routing.longContext : ""
  ].map((model) => model.trim()).filter(Boolean))];

  const ollamaModels = [...new Set([
    ...base.ollamaModels,
    ...modelsInput
      .filter((model) => model.startsWith("ollama/"))
      .map((model) => model.slice("ollama/".length).trim()),
    defaultModel.startsWith("ollama/") ? defaultModel.slice("ollama/".length).trim() : "",
    routing.default.startsWith("ollama/") ? routing.default.slice("ollama/".length).trim() : "",
    routing.think.startsWith("ollama/") ? routing.think.slice("ollama/".length).trim() : "",
    routing.longContext.startsWith("ollama/") ? routing.longContext.slice("ollama/".length).trim() : ""
  ].filter(Boolean))];

  return {
    ...base,
    apiKey,
    baseUrl,
    defaultModel,
    models: openRouterModels,
    ollamaEnabled: providerMode === "ollama",
    ollamaBaseUrl,
    ollamaModels,
    localVoiceEnabled: false,
    localVoiceModel: "base",
    routing
  };
}

function getModelCapabilityTags(model: string): string[] {
  const normalized = (model.startsWith("ollama/") ? model.slice("ollama/".length) : model).trim().toLowerCase();
  if (!normalized) return [];
  const tags: string[] = [];
  if (/coder|code|devstral|starcoder|codellama|granite-code|deepcoder|program|software/.test(normalized)) tags.push("coder");
  if (/r1|reason|think|o1|o3|deepseek|claude|gemini|gpt-oss|terminus/.test(normalized)) tags.push("reasoning");
  if (/gemini|claude|gpt-4\.1|gpt-4o|long|128k|200k|1m/.test(normalized)) tags.push("long-context");
  if (/(^|[-_/])vl([:-]|$)|vision|ocr|image|video|pixtral|llava|minicpm-v|gpt-4o|gpt-4\.1|gemini|claude/.test(normalized)) tags.push("vision");
  return [...new Set(tags)];
}

function scoreRouteModelForStage(model: string, stage: "generator" | "repair" | "planner"): number {
  const tags = getModelCapabilityTags(model);
  const coding = tags.includes("coder") ? 8 : /(qwen|deepseek|gpt-oss)/i.test(model) ? 2 : 0;
  const reasoning = tags.includes("reasoning") ? 6 : /llama-3\.[13]|qwen3/i.test(model) ? 2 : 0;
  const longContext = tags.includes("long-context") ? 8 : /llama-3\.[13]|qwen3|deepseek/i.test(model) ? 3 : 0;
  const hasVision = tags.includes("vision");
  const stageScore = stage === "planner"
    ? (longContext * 3) + (reasoning * 2) + coding
    : stage === "repair"
      ? (coding * 3) + (reasoning * 2) + longContext
      : (coding * 3) + reasoning + longContext;
  return stageScore + (hasVision && coding === 0 && stage !== "planner" ? -4 : 0);
}

function getRoutePreferenceBoost(source: Settings | null, stage: "generator" | "repair" | "planner", model: string): number {
  const normalized = (model ?? "").trim();
  if (!normalized) return 0;
  if (stage === "planner") {
    if (normalized === (source?.routing?.longContext ?? "").trim()) return 8;
    if (normalized === (source?.routing?.think ?? "").trim()) return 3;
    if (normalized === (source?.defaultModel ?? "").trim()) return 1;
    if (normalized === (source?.routing?.default ?? "").trim()) return 1;
    return 0;
  }
  if (stage === "repair") {
    if (normalized === (source?.routing?.think ?? "").trim()) return 4;
    if (normalized === (source?.defaultModel ?? "").trim()) return 2;
    if (normalized === (source?.routing?.default ?? "").trim()) return 2;
    if (normalized === (source?.routing?.longContext ?? "").trim()) return 1;
    return 0;
  }
  if (normalized === (source?.defaultModel ?? "").trim()) return 4;
  if (normalized === (source?.routing?.default ?? "").trim()) return 4;
  if (normalized === (source?.routing?.think ?? "").trim()) return 1;
  if (normalized === (source?.routing?.longContext ?? "").trim()) return 1;
  return 0;
}

function buildAgentRoutePreferenceOrder(source: Settings | null, stage: "generator" | "repair" | "planner"): string[] {
  return getRoutingModelPool(source)
    .map((model, index) => ({
      model,
      index,
      score: scoreRouteModelForStage(model, stage) + getRoutePreferenceBoost(source, stage, model)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.model);
}

function isRouteModelActive(source: Settings | null, model: string): boolean {
  const normalized = (model ?? "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("ollama/")) {
    return Boolean(source?.ollamaEnabled);
  }
  return Boolean((source?.apiKey ?? "").trim());
}

function formatRouteModelLabel(model: string): string {
  const label = compactModelName(model);
  return `${label} · ${model.startsWith("ollama/") ? "local" : "cloud"}`;
}

function renderModelCapabilityBadges(model: string): string {
  const tags = getModelCapabilityTags(model);
  if (tags.length === 0) return "";
  return tags.map((tag) => `<span class="agent-history-badge">${escHtml(tag)}</span>`).join("");
}

function renderRouteStrategyBadges(models: string[], options: { disabled?: boolean } = {}): string {
  if (models.length === 0) {
    return '<span class="route-strategy-badge route-strategy-badge-empty">Not available</span>';
  }

  return models.map((model) => {
    const tone = model.startsWith("ollama/") ? "route-strategy-badge-local" : "route-strategy-badge-cloud";
    const disabled = options.disabled ? " route-strategy-badge-disabled" : "";
    const tags = getModelCapabilityTags(model);
    const title = tags.length > 0 ? `${model} (${tags.join(", ")})` : model;
    return `<span class="route-strategy-badge ${tone}${disabled}" title="${escHtml(title)}">${escHtml(formatRouteModelLabel(model))}</span>`;
  }).join("");
}

function populateRouteStrategySelect(
  id: string,
  models: string[],
  currentValue: string,
  placeholderLabel: string
): void {
  const select = document.getElementById(id);
  if (!(select instanceof HTMLSelectElement)) return;

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = models.length > 0 ? placeholderLabel : "No configured models";
  select.appendChild(placeholder);

  const options = models.includes(currentValue) || !currentValue ? models : [currentValue, ...models];
  for (const model of options) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = formatRouteModelLabel(model);
    option.title = model;
    select.appendChild(option);
  }

  select.disabled = options.length === 0;
  select.value = options.includes(currentValue) ? currentValue : "";
}

function refreshRouteStrategyUi(): void {
  const preview = document.getElementById("route-strategy-preview");
  if (!(preview instanceof HTMLElement)) return;

  const draft = buildRouteStrategyDraft() ?? settings;
  const models = getRoutingModelPool(draft);
  const defaultCurrent = readRouteStrategyValue("route-default-select", (draft?.routing?.default ?? "").trim() || (draft?.defaultModel ?? "").trim());
  const thinkCurrent = readRouteStrategyValue("route-think-select", (draft?.routing?.think ?? "").trim() || defaultCurrent);
  const longContextCurrent = readRouteStrategyValue("route-long-context-select", (draft?.routing?.longContext ?? "").trim() || thinkCurrent);

  populateRouteStrategySelect("route-default-select", models, defaultCurrent, "Use implementation preference...");
  populateRouteStrategySelect("route-think-select", models, thinkCurrent, "Use repair preference...");
  populateRouteStrategySelect("route-long-context-select", models, longContextCurrent, "Use planning preference...");

  const resolved = buildRouteStrategyDraft() ?? draft;
  const hasCloudRoutes = Boolean((resolved?.apiKey ?? "").trim());
  const hasLocalRoutes = Boolean(resolved?.ollamaEnabled);
  const stages = [
    {
      stage: "generator" as const,
      title: "Implementation",
      detail: "Used for generation and normal implementation work."
    },
    {
      stage: "repair" as const,
      title: "Repair",
      detail: "Used when build, launch, or verification recovery needs a fix."
    },
    {
      stage: "planner" as const,
      title: "Planning",
      detail: "Used when the agent plans broader task execution before edits."
    }
  ];

  preview.innerHTML = `
    <div class="route-strategy-status">
      <span class="agent-history-badge ${hasCloudRoutes ? "ok" : "err"}">${escHtml(hasCloudRoutes ? "Cloud routes ready" : "Cloud routes disabled")}</span>
      <span class="agent-history-badge ${hasLocalRoutes ? "ok" : "err"}">${escHtml(hasLocalRoutes ? "Local routes ready" : "Local routes disabled")}</span>
    </div>
    ${stages.map((entry) => {
      const preferred = buildAgentRoutePreferenceOrder(resolved, entry.stage);
      const active = preferred.filter((model) => isRouteModelActive(resolved, model));
      return `
        <div class="route-strategy-stage">
          <div class="route-strategy-stage-head">
            <span class="route-strategy-stage-title">${escHtml(entry.title)}</span>
            <span class="route-strategy-stage-help">${escHtml(entry.detail)}</span>
          </div>
          <div class="route-strategy-line">
            <span class="route-strategy-line-label">Bias order</span>
            <div class="route-strategy-badges">${renderRouteStrategyBadges(preferred)}</div>
          </div>
          <div class="route-strategy-line">
            <span class="route-strategy-line-label">Active now</span>
            <div class="route-strategy-badges">${renderRouteStrategyBadges(active, { disabled: active.length === 0 })}</div>
          </div>
        </div>
      `;
    }).join("")}
    <div class="route-strategy-footnote">Actual route order can still shift when reliability scoring improves another model, when transient failures force fallback, or when a model is blacklisted for the current task. Transient failures blacklist more slowly than hard or semantic failures.</div>
  `;
}

function getProviderModeFromSettings(source: Settings | null): ProviderMode {
  return source?.ollamaEnabled ? "ollama" : getCloudProviderModeFromSettings(source);
}

function getVisibleModelsForProvider(source: Settings | null, mode: ProviderMode): string[] {
  return getEffectiveModels(source).filter((model) => mode === "ollama" ? model.startsWith("ollama/") : !model.startsWith("ollama/"));
}

function applyProviderUiState(mode: ProviderMode): void {
  const openrouterBtn = document.getElementById("provider-openrouter-btn");
  const nvidiaBtn = document.getElementById("provider-nvidia-btn");
  const ollamaBtn = document.getElementById("provider-ollama-btn");
  openrouterBtn?.classList.toggle("active", mode === "openrouter");
  nvidiaBtn?.classList.toggle("active", mode === "nvidia");
  ollamaBtn?.classList.toggle("active", mode === "ollama");

  const openrouterApiSection = document.getElementById("openrouter-api-section");
  const openrouterBaseSection = document.getElementById("openrouter-base-section");
  const ollamaSettingsSection = document.getElementById("ollama-settings");
  const ollamaModelsSection = document.getElementById("ollama-models-section");
  const testConnBtn = document.getElementById("test-conn-btn");
  const helpText = document.getElementById("provider-help-text");
  const apiKeyLabel = document.getElementById("provider-api-key-label");
  const apiKeyHelp = document.getElementById("provider-api-key-help");
  const baseUrlLabel = document.getElementById("provider-base-url-label");
  const apiKeyInput = document.getElementById("api-key-input");
  const fillModelsBtn = document.getElementById("fill-models-btn");

  const ollamaMode = mode === "ollama";
  const cloudProvider = isCloudProviderMode(mode) ? mode : getCloudProviderModeFromSettings(settings);
  const cloudProviderName = getProviderDisplayName(cloudProvider);
  if (openrouterApiSection instanceof HTMLElement) openrouterApiSection.style.display = ollamaMode ? "none" : "flex";
  if (openrouterBaseSection instanceof HTMLElement) openrouterBaseSection.style.display = ollamaMode ? "none" : "flex";
  if (ollamaSettingsSection instanceof HTMLElement) ollamaSettingsSection.style.display = ollamaMode ? "flex" : "none";
  if (ollamaModelsSection instanceof HTMLElement) ollamaModelsSection.style.display = ollamaMode ? "flex" : "none";
  if (testConnBtn instanceof HTMLButtonElement) {
    testConnBtn.style.display = ollamaMode ? "none" : "inline-block";
    testConnBtn.textContent = ollamaMode ? "Test Cloud API" : `Test ${cloudProviderName}`;
  }
  if (apiKeyLabel instanceof HTMLElement) apiKeyLabel.textContent = `${cloudProviderName} API Key (Optional for Ollama-only)`;
  if (apiKeyHelp instanceof HTMLElement) {
    apiKeyHelp.textContent = cloudProvider === "nvidia"
      ? "Required for NVIDIA-hosted chat models, summaries, and auto-title."
      : "Required for OpenRouter models, summaries, and auto-title.";
  }
  if (baseUrlLabel instanceof HTMLElement) baseUrlLabel.textContent = `${cloudProviderName} Base URL`;
  if (apiKeyInput instanceof HTMLInputElement) {
    apiKeyInput.placeholder = cloudProvider === "nvidia" ? "Paste your NVIDIA key" : "Paste your OpenRouter key";
  }
  if (fillModelsBtn instanceof HTMLButtonElement) {
    fillModelsBtn.textContent = mode === "ollama"
      ? "Use Local List"
      : cloudProvider === "nvidia"
        ? "Use NVIDIA Presets"
        : "Use Recommended";
  }
  if (helpText) {
    helpText.textContent = currentUiExperience === "simple"
      ? ollamaMode
        ? "Simple setup: local mode uses your default Ollama model and hides route tuning."
        : `Simple setup: cloud mode uses your default ${cloudProviderName} model and hides route tuning.`
      : ollamaMode
        ? "Local mode: only ollama/... models will be shown and used."
        : cloudProvider === "nvidia"
          ? "Cloud mode: use NVIDIA-compatible model IDs in the model list below."
          : "Cloud mode: only OpenRouter models will be shown and used.";
  }
}

function setProviderMode(mode: ProviderMode): void {
  providerMode = mode;
  syncBaseUrlInputForProvider(mode);
  applyProviderUiState(mode);
  updateSidebarProviderButtons(mode);
  populateModels();
  refreshRouteStrategyUi();
  syncImageStudioControls(false);
  refreshChatProviderMenuUi();
}

function updateSidebarProviderButtons(mode: ProviderMode): void {
  const ollamaBtn = document.getElementById("quick-ollama-btn");
  const openrouterBtn = document.getElementById("quick-openrouter-btn");
  const nvidiaBtn = document.getElementById("quick-nvidia-btn");
  ollamaBtn?.classList.toggle("active", mode === "ollama");
  openrouterBtn?.classList.toggle("active", mode === "openrouter");
  nvidiaBtn?.classList.toggle("active", mode === "nvidia");
}

function shouldPreferOllamaWithoutApiKey(source: Settings | null): boolean {
  void source;
  return providerMode === "ollama";
}

function getFirstOllamaModel(source: Settings | null): string {
  const first = (source?.ollamaModels ?? []).map((model) => model.trim()).find(Boolean);
  return first ? `ollama/${first}` : "";
}

function selectHasOption(select: HTMLSelectElement, value: string): boolean {
  return Array.from(select.options).some((option) => option.value === value);
}

function autoSwitchToOllamaIfNeeded(): boolean {
  if (!shouldPreferOllamaWithoutApiKey(settings)) return false;

  const fallbackModel = getFirstOllamaModel(settings);
  if (!fallbackModel) return false;

  let switched = false;
  const modelSelect = $("model-select") as HTMLSelectElement;
  const compareSelect = $("compare-model-select") as HTMLSelectElement;

  if (selectHasOption(modelSelect, fallbackModel) && !modelSelect.value.startsWith("ollama/")) {
    modelSelect.value = fallbackModel;
    switched = true;
  }

  if (selectHasOption(compareSelect, fallbackModel) && !compareSelect.value.startsWith("ollama/")) {
    compareSelect.value = fallbackModel;
    switched = true;
  }

  const defaultModelInput = $("default-model-input") as HTMLInputElement;
  if (!defaultModelInput.value.trim().startsWith("ollama/")) {
    defaultModelInput.value = fallbackModel;
    switched = true;
  }

  if (settings && !settings.defaultModel.trim().startsWith("ollama/")) {
    settings.defaultModel = fallbackModel;
  }

  const statusText = ($("settings-status").textContent ?? "").toLowerCase();
  if (statusText.includes("api key required")) {
    setStatus("");
  }

  return switched;
}
