interface AttachmentPayload { name: string; type: "text" | "image"; content: string; mimeType?: string; }
interface MessageMetadata { attachmentNames?: string[]; compareGroup?: string; compareSlot?: "A" | "B"; }
interface Message { id: string; role: string; content: string; createdAt: string; model?: string; error?: string; metadata?: MessageMetadata; }
interface Chat { id: string; title: string; messages: Message[]; createdAt: string; updatedAt: string; systemPrompt?: string; }
interface ChatSummary { id: string; title: string; messageCount: number; updatedAt: string; }
interface PromptTemplate { name: string; content: string; }
interface McpServerConfig { name: string; command: string; args: string[]; }
interface McpServerRuntime extends McpServerConfig { running: boolean; pid?: number; tools: string[]; logs: string[]; }
interface McpStatus { servers: McpServerRuntime[]; tools: string[]; }
interface ChatStats {
  totalChats: number;
  totalMessages: number;
  totalEstimatedTokens: number;
  mostUsedModel: string;
  mostUsedModelCount: number;
  averageMessagesPerChat: number;
}
interface Settings {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  routerPort: number;
  models: string[];
  customTemplates: PromptTemplate[];
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModels: string[];
  mcpServers: McpServerConfig[];
  routing: { default: string; think: string; longContext: string; };
}
interface RouterStatus { running: boolean; pid?: number; port: number; }

interface Window {
  api: {
    chat: {
      list: () => Promise<ChatSummary[]>;
      get: (id: string) => Promise<Chat | null>;
      create: () => Promise<Chat>;
      delete: (id: string) => Promise<boolean>;
      rename: (id: string, title: string) => Promise<boolean>;
      export: (id: string) => Promise<{ ok: boolean; message: string }>;
      setSystemPrompt: (id: string, systemPrompt: string) => Promise<boolean>;
      summarize: (messages: Array<{ role: string; content: string }>) => Promise<string>;
      generateTitle: (chatId: string, firstUserMessage: string) => Promise<string>;
      transcribeAudio: (audioBytes: Uint8Array, mimeType?: string) => Promise<string>;
      send: (
        chatId: string,
        content: string,
        model: string,
        options?: { attachments?: AttachmentPayload[]; compareModel?: string; enabledTools?: string[]; }
      ) => Promise<void>;
      stop: (chatId: string) => Promise<boolean>;
      onMessage: (cb: (chatId: string, msg: Message) => void) => void;
      onChunk: (cb: (chatId: string, msgId: string, chunk: string) => void) => void;
      onDone: (cb: (chatId: string, msgId: string) => void) => void;
      onError: (cb: (chatId: string, msgId: string, err: string) => void) => void;
    };
    attachments: {
      pick: () => Promise<AttachmentPayload[]>;
    };
    templates: {
      list: () => Promise<PromptTemplate[]>;
      save: (name: string, content: string) => Promise<PromptTemplate[]>;
      delete: (name: string) => Promise<PromptTemplate[]>;
    };
    ollama: {
      listModels: (baseUrl?: string) => Promise<string[]>;
    };
    mcp: {
      list: () => Promise<McpServerConfig[]>;
      add: (server: McpServerConfig) => Promise<McpServerConfig[]>;
      remove: (name: string) => Promise<McpServerConfig[]>;
      start: (name: string) => Promise<{ ok: boolean; message: string; servers: McpServerRuntime[]; tools: string[] }>;
      stop: (name: string) => Promise<{ ok: boolean; message: string; servers: McpServerRuntime[]; tools: string[] }>;
      status: () => Promise<McpStatus>;
    };
    settings: {
      get: () => Promise<Settings>;
      save: (partial: Partial<Settings>) => Promise<Settings>;
    };
    stats: {
      get: () => Promise<ChatStats>;
    };
    clipboard: {
      writeText: (text: string) => Promise<boolean>;
    };
    router: {
      status: () => Promise<RouterStatus>;
      logs: () => Promise<string[]>;
      start: () => Promise<{ ok: boolean; message: string }>;
      stop: () => Promise<{ ok: boolean; message: string }>;
      test: () => Promise<{ ok: boolean; message: string }>;
      onLog: (cb: (line: string) => void) => void;
    };
  };
}

// â”€â”€ State â”€â”€
let currentChatId: string | null = null;
let isStreaming = false;
let settings: Settings | null = null;
type ThemeMode = "dark" | "light";
type UiMode = "write" | "code" | "think";
const THEME_STORAGE_KEY = "cipher-ai-theme";
let currentTheme: ThemeMode = "dark";
let currentMode: UiMode = "write";
let rawModeEnabled = false;
let contextTokenTotal = 0;
let activeAttachments: AttachmentPayload[] = [];
let templates: PromptTemplate[] = [];
let compareModeEnabled = false;
let mcpStatus: McpStatus = { servers: [], tools: [] };
const pendingTitleGeneration = new Set<string>();
const enabledMcpTools = new Set<string>();
let activeStreamChatId: string | null = null;
let pendingStreamResponses = 0;
let speechRecognition: SpeechRecognitionLike | null = null;
let voiceRecording = false;
let voiceRecorderMode = false;
let voiceMediaRecorder: MediaRecorder | null = null;
let voiceMediaStream: MediaStream | null = null;
const activeStreamingMessageIds = new Set<string>();
let chatSearchQuery = "";
let cachedChatSummaries: ChatSummary[] = [];
const VIRTUAL_OVERSCAN_ITEMS = 8;
const VIRTUAL_ESTIMATED_ITEM_HEIGHT = 140;
let renderedMessages: Message[] = [];
let virtualItems: VirtualChatItem[] = [];
const virtualItemHeights = new Map<string, number>();
let virtualRenderScheduled = false;
const TOKEN_COUNTER_LIMIT = 8000;
const TOKEN_WARNING_RATIO = 0.8;
const TOKEN_CRITICAL_RATIO = 0.95;
const RECOMMENDED_MODELS = [
  "qwen/qwen3-coder-flash",
  "qwen/qwen3-coder-next",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "deepseek/deepseek-v3.2"
];

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => unknown) | null;
  onerror: ((this: SpeechRecognitionLike, ev: Event & { error?: string }) => unknown) | null;
  start(): void;
  stop(): void;
}

interface VirtualChatItem {
  key: string;
  type: "single" | "compare";
  message?: Message;
  compareGroup?: string;
  slotA?: Message;
  slotB?: Message;
}

// â”€â”€ Helpers â”€â”€
function $(id: string): HTMLElement { return document.getElementById(id)!; }
function qs<T extends Element>(sel: string): T { return document.querySelector<T>(sel)!; }

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: ThemeMode): void {
  currentTheme = theme;
  document.body.dataset["theme"] = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  const icon = $("theme-toggle-icon");
  const label = $("theme-toggle-label");
  const btn = $("theme-toggle-btn");

  if (theme === "dark") {
    icon.textContent = "\u2600";
    label.textContent = "Light";
    btn.title = "Switch to light mode";
  } else {
    icon.textContent = "\u263E";
    label.textContent = "Dark";
    btn.title = "Switch to dark mode";
  }
}

function toggleTheme(): void {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function applyMode(mode: UiMode): void {
  currentMode = mode;
  const labels: Record<UiMode, string> = {
    write: "Message Cipher Ai...",
    code: "Describe your coding task...",
    think: "Ask for strategy, ideas, or analysis..."
  };

  const input = $("composer-input") as HTMLTextAreaElement;
  input.placeholder = labels[mode];
  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["mode"] === mode);
  });
}

function showToast(msg: string, duration = 2500) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const normalized = (text ?? "").trim();
  if (!normalized) return false;

  try {
    await navigator.clipboard.writeText(normalized);
    return true;
  } catch {
    try {
      return await window.api.clipboard.writeText(normalized);
    } catch {
      return false;
    }
  }
}

function normalizeApiKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const extracted = trimmed.match(/sk-or-v1-[^\s"'`]+/i);
  if (extracted?.[0]) return extracted[0];

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  return withoutBearer.split(/\s+/)[0] ?? "";
}

function setStatus(msg: string, type: "ok" | "err" | "" = "") {
  const el = $("settings-status");
  el.textContent = msg;
  el.className = "status-msg " + type;
}

function requireOpenRouterApiKey(message?: string): boolean {
  const key = (settings?.apiKey ?? "").trim();
  if (key) return true;
  openPanel("settings");
  setStatus(
    message ?? "OpenRouter API key required for OpenRouter models. Add key, or choose an ollama/... model.",
    "err"
  );
  showToast("Add OpenRouter API key, or select an ollama model to continue without key.", 4200);
  const input = $("api-key-input") as HTMLInputElement;
  input.focus();
  return false;
}

function setRouterMsg(msg: string) {
  const el = $("router-action-msg");
  el.textContent = msg;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function messageRolePriority(role: string): number {
  if (role === "user") return 0;
  if (role === "assistant") return 1;
  return 2;
}

function compareMessagesForRender(a: Message, b: Message): number {
  const tsA = Date.parse(a.createdAt ?? "");
  const tsB = Date.parse(b.createdAt ?? "");

  const aHasTime = Number.isFinite(tsA);
  const bHasTime = Number.isFinite(tsB);
  if (aHasTime && bHasTime && tsA !== tsB) return tsA - tsB;

  if ((a.createdAt ?? "") !== (b.createdAt ?? "")) {
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  }

  const roleDelta = messageRolePriority(a.role) - messageRolePriority(b.role);
  if (roleDelta !== 0) return roleDelta;

  return (a.id ?? "").localeCompare(b.id ?? "");
}

function normalizeRenderedMessageOrder(): void {
  renderedMessages.sort(compareMessagesForRender);
}

function updateTokenCounterTone(el: HTMLElement, tokens: number): void {
  el.classList.remove("warning", "critical");
  const ratio = tokens / TOKEN_COUNTER_LIMIT;
  if (ratio >= TOKEN_CRITICAL_RATIO) {
    el.classList.add("critical");
    return;
  }
  if (ratio >= TOKEN_WARNING_RATIO) {
    el.classList.add("warning");
  }
}

function updateInputTokenCount(): void {
  const input = $("composer-input") as HTMLTextAreaElement;
  const tokens = estimateTokens(input.value);
  const el = $("input-token-count");
  el.textContent = `~${tokens} in`;
  updateTokenCounterTone(el, tokens);
}

function updateContextTokenCount(): void {
  let total = 0;
  for (const message of renderedMessages) {
    total += estimateTokens(message.content ?? "");
  }
  contextTokenTotal = total;
  const el = $("context-token-count");
  el.textContent = `~${contextTokenTotal} ctx`;
  updateTokenCounterTone(el, contextTokenTotal);
}

function setMessageToken(wrapper: HTMLElement, content: string): void {
  const tokenEl = wrapper.querySelector<HTMLElement>(".msg-token");
  if (!tokenEl) return;
  tokenEl.textContent = `~${estimateTokens(content)} tokens`;
}

function compactModelName(model: string): string {
  const normalized = model.startsWith("ollama/") ? model.slice("ollama/".length) : model;
  const short = normalized.split("/").pop() ?? normalized;
  return short.replace(/-instruct$/i, "");
}

// â”€â”€ Model Select â”€â”€
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
  if (source?.ollamaEnabled) {
    for (const m of source.ollamaModels ?? []) push(`ollama/${m}`);
  }
  return out;
}

function shouldPreferOllamaWithoutApiKey(source: Settings | null): boolean {
  return Boolean(source?.ollamaEnabled) && !Boolean((source?.apiKey ?? "").trim());
}

function getFirstOllamaModel(source: Settings | null): string {
  if (!source?.ollamaEnabled) return "";
  const first = (source.ollamaModels ?? []).map((model) => model.trim()).find(Boolean);
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
  if (statusText.includes("openrouter api key required")) {
    setStatus("");
  }

  return switched;
}

function populateModels() {
  const sel = $("model-select") as HTMLSelectElement;
  const compareSel = $("compare-model-select") as HTMLSelectElement;
  sel.innerHTML = "";
  compareSel.innerHTML = "";
  const models = getEffectiveModels(settings);

  if (models.length === 0) {
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "No model configured";
    sel.appendChild(emptyOpt);
    compareSel.appendChild(emptyOpt.cloneNode(true));
    sel.value = "";
    compareSel.value = "";
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
}

function getSelectedModel(): string {
  const selected = (($("model-select") as HTMLSelectElement).value ?? "").trim();
  if (selected) return selected;
  const fallback = (settings?.defaultModel ?? "").trim();
  if (fallback) return fallback;
  return getEffectiveModels(settings)[0] ?? "";
}

function getSelectedCompareModel(): string {
  return (($("compare-model-select") as HTMLSelectElement).value ?? "").trim();
}

function refreshCompareUi(): void {
  $("compare-model-pill").style.display = compareModeEnabled ? "inline-flex" : "none";
  $("compare-toggle-btn").classList.toggle("active", compareModeEnabled);
}

function renderComposerAttachments(): void {
  const holder = $("composer-attachments");
  holder.innerHTML = "";

  if (activeAttachments.length === 0) {
    holder.style.display = "none";
    return;
  }

  for (const attachment of activeAttachments) {
    const pill = document.createElement("div");
    pill.className = "attachment-pill";
    pill.title = attachment.name;
    const name = document.createElement("span");
    name.textContent = attachment.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "✕";
    remove.onclick = () => {
      activeAttachments = activeAttachments.filter((item) => !(item.name === attachment.name && item.content === attachment.content));
      renderComposerAttachments();
    };
    pill.appendChild(name);
    pill.appendChild(remove);
    holder.appendChild(pill);
  }

  holder.style.display = "flex";
}

function renderMessageAttachmentNames(body: HTMLElement, msg: Message): void {
  const names = msg.metadata?.attachmentNames ?? [];
  if (names.length === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "msg-attachments";
  for (const name of names) {
    const pill = document.createElement("span");
    pill.className = "msg-attachment-pill";
    pill.textContent = name;
    wrap.appendChild(pill);
  }
  body.appendChild(wrap);
}

function renderTemplatesList(): void {
  const listEl = $("templates-list");
  listEl.innerHTML = "";

  if (templates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "template-item";
    empty.textContent = "No templates saved";
    listEl.appendChild(empty);
    return;
  }

  for (const template of templates) {
    const item = document.createElement("div");
    item.className = "template-item";

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.textContent = template.name;
    useBtn.style.flex = "1";
    useBtn.style.textAlign = "left";
    useBtn.onclick = () => {
      const input = $("composer-input") as HTMLTextAreaElement;
      input.value = template.content;
      input.dispatchEvent(new Event("input"));
      $("templates-dropdown").style.display = "none";
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.onclick = async () => {
      templates = await window.api.templates.delete(template.name);
      renderTemplatesList();
    };

    item.appendChild(useBtn);
    item.appendChild(delBtn);
    listEl.appendChild(item);
  }
}

function showTemplatesDropdown(show: boolean): void {
  const dropdown = $("templates-dropdown");
  dropdown.style.display = show ? "block" : "none";
}

async function loadTemplates(): Promise<void> {
  templates = await window.api.templates.list();
  renderTemplatesList();
}

async function saveCurrentAsTemplate(): Promise<void> {
  const input = $("composer-input") as HTMLTextAreaElement;
  const content = input.value.trim();
  if (!content) {
    showToast("Write something first to save a template.", 1800);
    return;
  }

  const name = window.prompt("Template name")?.trim();
  if (!name) return;

  templates = await window.api.templates.save(name, content);
  renderTemplatesList();
  showToast("Template saved.");
}

function parseArgsInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((arg) => String(arg)).filter(Boolean);
  } catch {
    return [];
  }
}

function getEnabledToolNames(): string[] {
  return [...enabledMcpTools];
}

function renderMcpTools(): void {
  const host = $("mcp-tools-list");
  host.innerHTML = "";

  if (mcpStatus.tools.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mcp-tool-item";
    empty.textContent = "No tools available";
    host.appendChild(empty);
    return;
  }

  for (const tool of mcpStatus.tools) {
    const row = document.createElement("div");
    row.className = "mcp-tool-item";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabledMcpTools.has(tool);
    checkbox.onchange = () => {
      if (checkbox.checked) enabledMcpTools.add(tool);
      else enabledMcpTools.delete(tool);
    };
    const text = document.createElement("span");
    text.textContent = tool;
    label.appendChild(checkbox);
    label.appendChild(text);
    row.appendChild(label);
    host.appendChild(row);
  }
}

function renderMcpServers(): void {
  const host = $("mcp-list");
  host.innerHTML = "";
  const logEl = $("mcp-log");
  logEl.textContent = "";

  if (mcpStatus.servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mcp-item";
    empty.textContent = "No MCP servers configured";
    host.appendChild(empty);
    return;
  }

  for (const server of mcpStatus.servers) {
    const row = document.createElement("div");
    row.className = "mcp-item";

    const left = document.createElement("span");
    left.textContent = server.running ? `${server.name} (running)` : server.name;

    const actions = document.createElement("div");
    actions.className = "btn-row";

    const startStop = document.createElement("button");
    startStop.className = "btn-ghost-sm";
    startStop.type = "button";
    startStop.textContent = server.running ? "Stop" : "Start";
    startStop.onclick = async () => {
      const response = server.running
        ? await window.api.mcp.stop(server.name)
        : await window.api.mcp.start(server.name);
      showToast(response.message, response.ok ? 1800 : 3200);
      await refreshMcpStatus();
    };

    const remove = document.createElement("button");
    remove.className = "btn-ghost-sm";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.onclick = async () => {
      await window.api.mcp.remove(server.name);
      await refreshMcpStatus();
    };

    actions.appendChild(startStop);
    actions.appendChild(remove);
    row.appendChild(left);
    row.appendChild(actions);
    host.appendChild(row);

    if (server.logs.length > 0) {
      logEl.textContent += `[${server.name}]\n${server.logs.join("\n")}\n`;
    }
  }

  logEl.scrollTop = logEl.scrollHeight;
}

async function refreshMcpStatus(): Promise<void> {
  mcpStatus = await window.api.mcp.status();
  const allowed = new Set(mcpStatus.tools);
  for (const tool of [...enabledMcpTools]) {
    if (!allowed.has(tool)) enabledMcpTools.delete(tool);
  }
  renderMcpServers();
  renderMcpTools();
}

function renderOllamaModels(models: string[]): void {
  const list = $("ollama-models-list");
  if (models.length === 0) {
    list.textContent = "No local models found.";
    return;
  }
  list.textContent = models.join("\n");
}

function toggleOllamaSettingsVisibility(): void {
  const enabled = ($("ollama-enabled-toggle") as HTMLInputElement).checked;
  $("ollama-settings").style.display = enabled ? "flex" : "none";
  $("ollama-models-section").style.display = enabled ? "flex" : "none";
}

async function refreshOllamaModels(): Promise<void> {
  const baseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
  try {
    const models = await window.api.ollama.listModels(baseUrl);
    if (settings) settings.ollamaModels = models;
    renderOllamaModels(models);
    populateModels();
    const switched = autoSwitchToOllamaIfNeeded();
    showToast(switched ? "Switched to Ollama model (OpenRouter key missing)." : `Loaded ${models.length} Ollama model(s).`, 2200);
  } catch (err) {
    showToast(`Failed to load Ollama models: ${err instanceof Error ? err.message : "unknown error"}`, 3500);
  }
}

// â”€â”€ Chat List â”€â”€
function updateChatSearchClearButton(): void {
  const clearBtn = $("chat-search-clear-btn");
  clearBtn.classList.toggle("visible", chatSearchQuery.trim().length > 0);
}

function getFilteredChats(chats: ChatSummary[]): ChatSummary[] {
  const query = chatSearchQuery.trim().toLowerCase();
  if (!query) return chats;
  return chats.filter((chat) => (chat.title ?? "").toLowerCase().includes(query));
}

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

    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = chat.title;

    const del = document.createElement("button");
    del.className = "chat-item-del";
    del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5.5 6.5v5M8 6.5v5M10.5 6.5v5M4.5 4.5l.6 8.4c.04.62.56 1.1 1.18 1.1h3.32c.62 0 1.14-.48 1.18-1.1l.6-8.4"/></svg>';
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete chat");
    del.onclick = async (e) => {
      e.stopPropagation();
      await window.api.chat.delete(chat.id);
      if (currentChatId === chat.id) { currentChatId = null; clearMessages(); }
      await loadChatList();
    };

    item.appendChild(title);
    item.appendChild(del);
    item.onclick = () => loadChat(chat.id);
    list.appendChild(item);
  }
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

async function loadChatList() {
  cachedChatSummaries = await window.api.chat.list();
  renderChatList(cachedChatSummaries);
}

// â”€â”€ Load Chat â”€â”€
async function loadChat(id: string) {
  currentChatId = id;
  const chat = await window.api.chat.get(id);
  if (!chat) return;

  $("chat-title-display").textContent = chat.title;
  $("rename-btn").style.display = "inline-block";
  $("export-btn").style.display = "inline-block";
  $("system-prompt-toggle-btn").style.display = "inline-block";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = chat.systemPrompt ?? "";

  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  renderedMessages = chat.messages.filter((msg) => msg.role !== "system");
  normalizeRenderedMessageOrder();
  rebuildVirtualItems();
  scheduleVirtualRender(true);

  activeAttachments = [];
  renderComposerAttachments();
  showTemplatesDropdown(false);
  scrollToBottom();
  updateContextTokenCount();
  await loadChatList();
}

function createEmptyStateElement(): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = '<div class="empty-icon">&#10024;</div><p>&#10024; Start a new conversation. Ask anything.</p><span><span class="empty-subtle-icon">&#8984;</span> Code, write, think with Cipher AI.</span><small class="empty-motto">Free AI, No Fees. Powered by OpenRouter</small>';
  return empty;
}

function clearRenderedMessages(): void {
  const container = $("messages");
  const children = Array.from(container.children);
  for (const child of children) {
    if ((child as HTMLElement).id === "chat-summary-overlay") continue;
    child.remove();
  }
}

function hideSummaryOverlay(): void {
  $("chat-summary-overlay").style.display = "none";
  $("chat-summary-content").textContent = "";
}

function showSummaryOverlay(summary: string): void {
  $("chat-summary-content").textContent = summary.trim();
  $("chat-summary-overlay").style.display = "flex";
}

function clearMessages() {
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  $("messages").appendChild(createEmptyStateElement());
  $("chat-title-display").textContent = "Select a chat";
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = "";
  activeAttachments = [];
  renderComposerAttachments();
  showTemplatesDropdown(false);
  updateContextTokenCount();
}
// Render Message
function renderMessageBody(contentEl: HTMLElement, content: string, done: boolean): void {
  if (rawModeEnabled) {
    contentEl.textContent = content;
    return;
  }

  if (done) {
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.innerHTML = renderMarkdown(content) + '<span class="cursor-blink"></span>';
  }
}

function rerenderAllMessageBodies(done = true): void {
  const wrappers = document.querySelectorAll<HTMLElement>(".msg-wrapper");
  wrappers.forEach((wrapper) => {
    const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
    if (!contentEl) return;
    const raw = contentEl.dataset["raw"] ?? "";
    renderMessageBody(contentEl, raw, done);
  });
}

function createMessageWrapper(msg: Message): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";
  wrapper.dataset["id"] = msg.id;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar " + msg.role;
  avatar.textContent = msg.role === "user" ? "U" : "AI";

  const body = document.createElement("div");
  body.className = "msg-body";

  const role = document.createElement("div");
  role.className = "msg-role";
  role.textContent = msg.role === "user" ? "You" : "Assistant";

  const content = document.createElement("div");
  content.className = "msg-content" + (msg.error ? " error" : "");
  content.dataset["raw"] = msg.content;
  renderMessageBody(content, msg.content, !activeStreamingMessageIds.has(msg.id));

  body.appendChild(role);
  body.appendChild(content);
  renderMessageAttachmentNames(body, msg);

  if (msg.model && msg.role === "assistant") {
    const modelEl = document.createElement("div");
    modelEl.className = "msg-model";
    modelEl.textContent = compactModelName(msg.model);
    body.appendChild(modelEl);
  }

  const tokenEl = document.createElement("div");
  tokenEl.className = "msg-token";
  tokenEl.textContent = `~${estimateTokens(msg.content)} tokens`;
  body.appendChild(tokenEl);

  const actions = document.createElement("div");
  actions.className = "msg-hover-actions";
  if (msg.role === "user") {
    const editBtn = document.createElement("button");
    editBtn.className = "msg-action-btn";
    editBtn.type = "button";
    editBtn.dataset["action"] = "edit";
    editBtn.dataset["msgId"] = msg.id;
    editBtn.textContent = "Edit";
    actions.appendChild(editBtn);
  } else if (msg.role === "assistant") {
    const copyBtn = document.createElement("button");
    copyBtn.className = "msg-action-btn";
    copyBtn.type = "button";
    copyBtn.dataset["action"] = "copy";
    copyBtn.dataset["msgId"] = msg.id;
    copyBtn.textContent = "Copy";
    actions.appendChild(copyBtn);

    const regenerateBtn = document.createElement("button");
    regenerateBtn.className = "msg-action-btn";
    regenerateBtn.type = "button";
    regenerateBtn.dataset["action"] = "regenerate";
    regenerateBtn.dataset["msgId"] = msg.id;
    regenerateBtn.textContent = "Regenerate";
    actions.appendChild(regenerateBtn);
  }
  if (actions.childElementCount > 0) body.appendChild(actions);

  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  return wrapper;
}

function buildVirtualItemsFromMessages(messages: Message[]): VirtualChatItem[] {
  const items: VirtualChatItem[] = [];
  const compareIndexByGroup = new Map<string, number>();

  for (const msg of messages) {
    const compareGroup = msg.metadata?.compareGroup;
    const compareSlot = msg.metadata?.compareSlot;
    const isCompareMessage = msg.role === "assistant" && compareGroup && compareSlot;

    if (!isCompareMessage) {
      items.push({
        key: `msg:${msg.id}`,
        type: "single",
        message: msg
      });
      continue;
    }

    const existingIndex = compareIndexByGroup.get(compareGroup);
    if (existingIndex === undefined) {
      const item: VirtualChatItem = {
        key: `compare:${compareGroup}`,
        type: "compare",
        compareGroup
      };
      if (compareSlot === "A") item.slotA = msg;
      else item.slotB = msg;
      compareIndexByGroup.set(compareGroup, items.length);
      items.push(item);
      continue;
    }

    const item = items[existingIndex];
    if (compareSlot === "A") item.slotA = msg;
    else item.slotB = msg;
  }

  return items;
}

function rebuildVirtualItems(): void {
  virtualItems = buildVirtualItemsFromMessages(renderedMessages);
}

function getVirtualItemHeight(item: VirtualChatItem): number {
  return virtualItemHeights.get(item.key) ?? VIRTUAL_ESTIMATED_ITEM_HEIGHT;
}

function ensureVirtualMessageElements(): {
  topSpacer: HTMLDivElement;
  host: HTMLDivElement;
  bottomSpacer: HTMLDivElement;
} {
  const container = $("messages");

  let topSpacer = container.querySelector<HTMLDivElement>("#messages-virtual-top");
  let host = container.querySelector<HTMLDivElement>("#messages-virtual-host");
  let bottomSpacer = container.querySelector<HTMLDivElement>("#messages-virtual-bottom");

  if (!topSpacer) {
    topSpacer = document.createElement("div");
    topSpacer.id = "messages-virtual-top";
  }
  if (!host) {
    host = document.createElement("div");
    host.id = "messages-virtual-host";
  }
  if (!bottomSpacer) {
    bottomSpacer = document.createElement("div");
    bottomSpacer.id = "messages-virtual-bottom";
  }

  if (topSpacer.parentElement !== container) container.appendChild(topSpacer);
  if (host.parentElement !== container) container.appendChild(host);
  if (bottomSpacer.parentElement !== container) container.appendChild(bottomSpacer);

  return { topSpacer, host, bottomSpacer };
}

function renderVirtualItem(item: VirtualChatItem): HTMLElement {
  if (item.type === "single" && item.message) {
    const wrapper = createMessageWrapper(item.message);
    wrapper.dataset["virtualItemKey"] = item.key;
    return wrapper;
  }

  const row = document.createElement("div");
  row.className = "compare-row";
  row.dataset["group"] = item.compareGroup ?? "";
  row.dataset["virtualItemKey"] = item.key;

  if (item.slotA) {
    const colA = document.createElement("div");
    colA.className = "compare-col";
    colA.dataset["slot"] = "A";
    colA.appendChild(createMessageWrapper(item.slotA));
    row.appendChild(colA);
  }
  if (item.slotB) {
    const colB = document.createElement("div");
    colB.className = "compare-col";
    colB.dataset["slot"] = "B";
    colB.appendChild(createMessageWrapper(item.slotB));
    row.appendChild(colB);
  }

  return row;
}

function renderVirtualMessages(force = false): void {
  const container = $("messages");
  const { topSpacer, host, bottomSpacer } = ensureVirtualMessageElements();

  if (virtualItems.length === 0) {
    topSpacer.style.height = "0px";
    bottomSpacer.style.height = "0px";
    host.innerHTML = "";
    return;
  }

  const scrollTop = container.scrollTop;
  const viewportHeight = Math.max(1, container.clientHeight);
  const visibleHeightTarget = viewportHeight + VIRTUAL_OVERSCAN_ITEMS * VIRTUAL_ESTIMATED_ITEM_HEIGHT;

  let start = 0;
  let accumulatedBeforeStart = 0;
  while (start < virtualItems.length) {
    const h = getVirtualItemHeight(virtualItems[start]);
    if (accumulatedBeforeStart + h >= scrollTop) break;
    accumulatedBeforeStart += h;
    start += 1;
  }
  start = Math.max(0, start - VIRTUAL_OVERSCAN_ITEMS);

  let topHeight = 0;
  for (let i = 0; i < start; i += 1) topHeight += getVirtualItemHeight(virtualItems[i]);

  let end = start;
  let covered = 0;
  while (end < virtualItems.length && covered < visibleHeightTarget) {
    covered += getVirtualItemHeight(virtualItems[end]);
    end += 1;
  }
  end = Math.min(virtualItems.length, end + VIRTUAL_OVERSCAN_ITEMS);

  let bottomHeight = 0;
  for (let i = end; i < virtualItems.length; i += 1) bottomHeight += getVirtualItemHeight(virtualItems[i]);

  const prevStart = Number(host.dataset["start"] ?? "-1");
  const prevEnd = Number(host.dataset["end"] ?? "-1");
  if (!force && prevStart === start && prevEnd === end) {
    topSpacer.style.height = `${topHeight}px`;
    bottomSpacer.style.height = `${bottomHeight}px`;
    return;
  }

  topSpacer.style.height = `${topHeight}px`;
  bottomSpacer.style.height = `${bottomHeight}px`;
  host.dataset["start"] = String(start);
  host.dataset["end"] = String(end);
  host.innerHTML = "";

  for (let i = start; i < end; i += 1) {
    host.appendChild(renderVirtualItem(virtualItems[i]));
  }

  let changedMeasurements = false;
  const renderedEls = host.querySelectorAll<HTMLElement>("[data-virtual-item-key]");
  renderedEls.forEach((el) => {
    const key = el.dataset["virtualItemKey"] ?? "";
    if (!key) return;
    const measured = Math.max(1, Math.ceil(el.getBoundingClientRect().height));
    const known = virtualItemHeights.get(key) ?? VIRTUAL_ESTIMATED_ITEM_HEIGHT;
    if (Math.abs(known - measured) > 1) {
      virtualItemHeights.set(key, measured);
      changedMeasurements = true;
    }
  });

  if (changedMeasurements) {
    requestAnimationFrame(() => renderVirtualMessages(false));
  }
}

function scheduleVirtualRender(force = false): void {
  if (force) {
    renderVirtualMessages(true);
    return;
  }
  if (virtualRenderScheduled) return;
  virtualRenderScheduled = true;
  requestAnimationFrame(() => {
    virtualRenderScheduled = false;
    renderVirtualMessages(false);
  });
}

function appendMessage(msg: Message): HTMLElement {
  const container = $("messages");
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();

  const existingIndex = renderedMessages.findIndex((item) => item.id === msg.id);
  if (existingIndex >= 0) renderedMessages[existingIndex] = msg;
  else renderedMessages.push(msg);

  normalizeRenderedMessageOrder();
  rebuildVirtualItems();
  scheduleVirtualRender(true);
  updateContextTokenCount();

  return (document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msg.id}"]`) ?? document.createElement("div"));
}

function updateMessageContent(msgId: string, content: string, done = false) {
  const index = renderedMessages.findIndex((item) => item.id === msgId);
  if (index >= 0) {
    renderedMessages[index] = { ...renderedMessages[index], content };
  }

  const wrapper = document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msgId}"]`);
  if (!wrapper) {
    updateContextTokenCount();
    return;
  }
  const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
  if (!contentEl) return;
  contentEl.dataset["raw"] = content;
  renderMessageBody(contentEl, content, done);

  setMessageToken(wrapper, content);
  updateContextTokenCount();
}

async function queueMessageForResend(content: string): Promise<void> {
  if (activeAttachments.length > 0) {
    showToast("Clear pending attachments before resend.", 2200);
    return;
  }

  const text = content.trim();
  if (!text) return;
  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  input.focus();
  await sendMessage();
}

async function editUserMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const message = chat.messages.find((item) => item.id === msgId && item.role === "user");
  if (!message) return;

  const edited = window.prompt("Edit message", message.content);
  if (edited === null) return;
  const text = edited.trim();
  if (!text) {
    showToast("Message cannot be empty.", 2000);
    return;
  }

  await queueMessageForResend(text);
}

async function regenerateAssistantMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const assistantIndex = chat.messages.findIndex((item) => item.id === msgId && item.role === "assistant");
  if (assistantIndex < 0) return;

  let lastUserContent = "";
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    const candidate = chat.messages[i];
    if (candidate.role === "user" && candidate.content.trim()) {
      lastUserContent = candidate.content;
      break;
    }
  }

  if (!lastUserContent) {
    showToast("No user message found to regenerate.", 2200);
    return;
  }

  await queueMessageForResend(lastUserContent);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text: string): string {
  if (!text) return "";

  const codeBlocks: string[] = [];
  const placeholderPrefix = "__CODE_BLOCK_";

  const withPlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const normalizedLang = (lang ?? "").trim().toLowerCase();
    const langAttr = normalizedLang ? ` class="language-${escHtml(normalizedLang)}"` : "";
    const runnable = normalizedLang === "html" || normalizedLang === "javascript" || normalizedLang === "js";
    const runBtn = runnable ? '<button class="run-btn" type="button">Run</button>' : "";
    codeBlocks.push(`<div class="code-block" data-lang="${escHtml(normalizedLang)}"><div class="code-actions"><button class="copy-btn" type="button">Copy</button>${runBtn}</div><pre><code${langAttr}>${escHtml(code.trim())}</code></pre></div>`);
    return `${placeholderPrefix}${codeBlocks.length - 1}__`;
  });

  const escaped = escHtml(withPlaceholders)
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br>");

  return escaped.replace(/__CODE_BLOCK_(\d+)__/g, (_m, index) => codeBlocks[Number(index)] ?? "");
}

function applyRawMode(enabled: boolean): void {
  rawModeEnabled = enabled;
  $("raw-toggle-btn").classList.toggle("active", enabled);
  rerenderAllMessageBodies(!isStreaming);
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderCodeOutput(block: HTMLElement, output: string, isError = false): void {
  let panel = block.querySelector<HTMLElement>(".code-output");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "code-output";
    block.appendChild(panel);
  }
  panel.classList.toggle("error", isError);
  panel.textContent = output;
}

function openCodePreview(html: string): void {
  const modal = $("code-preview-modal");
  const frame = $("code-preview-frame") as HTMLIFrameElement;
  frame.srcdoc = html;
  modal.style.display = "flex";
}

function closeCodePreview(): void {
  const modal = $("code-preview-modal");
  const frame = $("code-preview-frame") as HTMLIFrameElement;
  modal.style.display = "none";
  frame.srcdoc = "";
}

function runJavaScriptPreview(block: HTMLElement, code: string): void {
  const lines: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (...args: unknown[]) => {
      lines.push(args.map(formatConsoleValue).join(" "));
    };
    new Function(code)();
    if (lines.length === 0) lines.push("[no console output]");
    renderCodeOutput(block, lines.join("\n"), false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    renderCodeOutput(block, `Error: ${message}`, true);
  } finally {
    console.log = originalLog;
  }
}

async function summarizeCurrentChat(): Promise<void> {
  if (!currentChatId) {
    showToast("Select a chat first.", 1800);
    return;
  }
  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const messages = chat.messages
    .map((message) => ({ role: message.role, content: message.content }));

  if (messages.length === 0) {
    showToast("No messages to summarize.", 1800);
    return;
  }

  try {
    const summary = await window.api.chat.summarize(messages);
    showSummaryOverlay(summary);
  } catch (err) {
    showToast(`Summary failed: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

async function maybeGenerateTitle(chatId: string): Promise<void> {
  if (pendingTitleGeneration.has(chatId)) return;

  const chat = await window.api.chat.get(chatId);
  if (!chat || chat.title !== "New Chat") return;

  const firstUserMessage = chat.messages.find((message) => message.role === "user" && message.content.trim());
  const hasAssistantReply = chat.messages.some((message) => message.role === "assistant" && message.content.trim());
  if (!firstUserMessage || !hasAssistantReply) return;

  pendingTitleGeneration.add(chatId);
  try {
    const title = await window.api.chat.generateTitle(chatId, firstUserMessage.content);
    if (chatId === currentChatId) {
      $("chat-title-display").textContent = title;
    }
    await loadChatList();
  } catch (err) {
    console.error("Title generation failed:", err);
  } finally {
    pendingTitleGeneration.delete(chatId);
  }
}

function closeStatsModal(): void {
  $("stats-modal").style.display = "none";
  $("stats-btn").classList.remove("active");
}

async function openStatsModal(): Promise<void> {
  try {
    const stats = await window.api.stats.get();
    $("stats-total-chats").textContent = String(stats.totalChats);
    $("stats-total-messages").textContent = String(stats.totalMessages);
    $("stats-total-tokens").textContent = String(stats.totalEstimatedTokens);
    $("stats-most-used-model").textContent = stats.mostUsedModel;
    $("stats-most-used-count").textContent = `${stats.mostUsedModelCount} messages`;
    $("stats-avg-per-chat").textContent = String(stats.averageMessagesPerChat);
    $("stats-modal").style.display = "flex";
    $("stats-btn").classList.add("active");
  } catch (err) {
    $("stats-btn").classList.remove("active");
    showToast(`Stats failed: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

function scrollToBottom() {
  const el = $("messages");
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function setStreamingUi(active: boolean, statusText = "") {
  isStreaming = active;
  if (active) {
    $("send-btn").setAttribute("disabled", "true");
    $("stop-btn").style.display = "inline-block";
    $("stream-status").textContent = statusText || "Generating...";
    return;
  }
  $("send-btn").removeAttribute("disabled");
  $("stop-btn").style.display = "none";
  $("stream-status").textContent = "";
}

async function createNewChat(showEmptyState = true): Promise<string> {
  const chat = await window.api.chat.create();
  currentChatId = chat.id;
  $("chat-title-display").textContent = chat.title;
  $("rename-btn").style.display = "inline-block";
  $("export-btn").style.display = "inline-block";
  $("system-prompt-toggle-btn").style.display = "inline-block";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = chat.systemPrompt ?? "";
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  if (showEmptyState) {
    $("messages").appendChild(createEmptyStateElement());
  }
  activeAttachments = [];
  renderComposerAttachments();
  showTemplatesDropdown(false);
  updateContextTokenCount();
  await loadChatList();
  return chat.id;
}

// â”€â”€ Send Message â”€â”€
async function sendMessage() {
  if (isStreaming) return;
  const input = $("composer-input") as HTMLTextAreaElement;
  const rawContent = input.value.trim();
  if (!rawContent && activeAttachments.length === 0) return;
  const content = rawContent || "Please review the attachment.";

  let chatId = currentChatId;
  if (!chatId) {
    chatId = await createNewChat(false);
  }

  const model = getSelectedModel();
  if (!model) {
    showToast("Select a model first.");
    return;
  }

  const compareModel = compareModeEnabled ? getSelectedCompareModel() : "";
  if (compareModeEnabled && !compareModel) {
    showToast("Select a compare model first.");
    return;
  }

  const modelsNeedingOpenRouterKey = [model, ...(compareModeEnabled ? [compareModel] : [])]
    .map((m) => (m ?? "").trim())
    .filter(Boolean)
    .some((m) => !m.startsWith("ollama/"));
  if (modelsNeedingOpenRouterKey) {
    const message = "Selected model is OpenRouter. Add API key, or switch model to ollama/...";
    if (!requireOpenRouterApiKey(message)) return;
  }

  const attachmentsToSend = [...activeAttachments];
  activeAttachments = [];
  renderComposerAttachments();
  showTemplatesDropdown(false);

  input.value = "";
  input.style.height = "auto";
  updateInputTokenCount();

  activeStreamChatId = chatId;
  pendingStreamResponses = compareModeEnabled ? 2 : 1;
  setStreamingUi(true, compareModeEnabled ? "Comparing models..." : "Generating...");

  try {
    await window.api.chat.send(chatId, content, model, {
      attachments: attachmentsToSend,
      compareModel: compareModeEnabled ? compareModel : undefined,
      enabledTools: getEnabledToolNames()
    });
  } catch (err) {
    activeAttachments = attachmentsToSend;
    renderComposerAttachments();
    activeStreamChatId = null;
    pendingStreamResponses = 0;
    setStreamingUi(false);
    showToast(`Send failed: ${err instanceof Error ? err.message : "unknown error"}`, 4000);
  }
}

// â”€â”€ IPC Events â”€â”€
function setupIpcListeners() {
  window.api.chat.onMessage((chatId, msg) => {
    if (chatId !== currentChatId) return;
    if (msg.role === "assistant" && !msg.error) activeStreamingMessageIds.add(msg.id);
    appendMessage(msg);
    scrollToBottom();
  });

  window.api.chat.onChunk((chatId, msgId, _chunk) => {
    if (chatId !== currentChatId) return;
    const existing = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    const updated = existing + _chunk;
    updateMessageContent(msgId, updated, false);
    scrollToBottom();
  });

  window.api.chat.onDone((chatId, msgId) => {
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        setStreamingUi(false);
        void loadChatList();
      }
    }
    void maybeGenerateTitle(chatId);

    if (chatId !== currentChatId) return;
    const raw = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    updateMessageContent(msgId, raw, true);
  });

  window.api.chat.onError((chatId, msgId, err) => {
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        setStreamingUi(false);
        void loadChatList();
      }
    }

    if (chatId !== currentChatId) return;
    const index = renderedMessages.findIndex((message) => message.id === msgId);
    if (index >= 0) {
      renderedMessages[index] = { ...renderedMessages[index], content: err, error: err };
      normalizeRenderedMessageOrder();
      rebuildVirtualItems();
    }

    const wrapper = document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msgId}"]`);
    if (wrapper) {
      const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
      if (contentEl) {
        contentEl.className = "msg-content error";
        contentEl.dataset["raw"] = err;
        renderMessageBody(contentEl, err, true);
        setMessageToken(wrapper, err);
        updateContextTokenCount();
      }
    } else {
      scheduleVirtualRender(true);
      updateContextTokenCount();
    }
    showToast("Error: " + err, 4000);
  });

  window.api.router.onLog((line) => {
    const log = $("router-log");
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
  });
}

// â”€â”€ Settings Panel â”€â”€
async function loadSettings() {
  const loaded = await window.api.settings.get();
  settings = loaded;
  ($("api-key-input") as HTMLInputElement).value = loaded.apiKey;
  ($("base-url-input") as HTMLInputElement).value = loaded.baseUrl;
  ($("default-model-input") as HTMLInputElement).value = loaded.defaultModel;
  ($("ollama-enabled-toggle") as HTMLInputElement).checked = loaded.ollamaEnabled;
  ($("ollama-base-url-input") as HTMLInputElement).value = loaded.ollamaBaseUrl || "http://localhost:11434/v1";
  ($("models-textarea") as HTMLTextAreaElement).value = loaded.models.join("\n");
  toggleOllamaSettingsVisibility();
  renderOllamaModels(loaded.ollamaModels ?? []);
  populateModels();
  autoSwitchToOllamaIfNeeded();
}

async function saveSettings() {
  const apiKeyRaw = ($("api-key-input") as HTMLInputElement).value;
  const apiKey = normalizeApiKey(apiKeyRaw);
  const baseUrl = ($("base-url-input") as HTMLInputElement).value.trim();
  const defaultModelInput = ($("default-model-input") as HTMLInputElement).value.trim();
  const ollamaEnabled = ($("ollama-enabled-toggle") as HTMLInputElement).checked;
  const ollamaBaseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
  const modelsInput = ($("models-textarea") as HTMLTextAreaElement).value
    .split(/[\n,]+/)
    .map((m) => m.trim())
    .filter((m) => Boolean(m) && !m.startsWith("ollama/"));

  const selectedModel = getSelectedModel();
  const existingDefault = (settings?.defaultModel ?? "").trim();
  const fallbackModel = "qwen/qwen3-coder-flash";

  let models = [...new Set([
    ...modelsInput,
    selectedModel,
    existingDefault,
    ...(settings?.models ?? []),
    fallbackModel
  ].map((m) => m.trim()).filter(Boolean))];

  const firstOllama = ollamaEnabled
    ? (settings?.ollamaModels ?? []).map((model) => model.trim()).find(Boolean)
    : "";
  const ollamaDefault = firstOllama ? `ollama/${firstOllama}` : "";

  let defaultModel = defaultModelInput || selectedModel || existingDefault || models[0] || fallbackModel;
  if (!apiKey && ollamaEnabled && ollamaDefault && !defaultModel.startsWith("ollama/")) {
    defaultModel = ollamaDefault;
  }
  if (!defaultModel.startsWith("ollama/") && !models.includes(defaultModel)) models.unshift(defaultModel);

  if (apiKeyRaw.trim() && !apiKey.startsWith("sk-or-v1-")) {
    setStatus("Invalid OpenRouter key format.", "err");
    showToast("API key ghalat format mein hai. Sirf sk-or-v1-... key paste karo.", 4500);
    return;
  }

  settings = await window.api.settings.save({
    apiKey,
    baseUrl,
    defaultModel,
    models,
    ollamaEnabled,
    ollamaBaseUrl,
    ollamaModels: settings?.ollamaModels ?? []
  });
  ($("api-key-input") as HTMLInputElement).value = settings.apiKey;
  ($("default-model-input") as HTMLInputElement).value = settings.defaultModel;
  ($("ollama-enabled-toggle") as HTMLInputElement).checked = settings.ollamaEnabled;
  ($("ollama-base-url-input") as HTMLInputElement).value = settings.ollamaBaseUrl;
  renderOllamaModels(settings.ollamaModels ?? []);
  toggleOllamaSettingsVisibility();
  ($("models-textarea") as HTMLTextAreaElement).value = settings.models.join("\n");
  populateModels();
  autoSwitchToOllamaIfNeeded();
  setStatus("Settings saved!", "ok");
  setTimeout(() => setStatus(""), 2000);
  showToast("Settings saved");
}

// â”€â”€ Router Panel â”€â”€
async function refreshRouterStatus() {
  const status = await window.api.router.status();
  const dot = $("router-dot");
  const text = $("router-status-text");
  const portEl = $("router-port-text");

  if (status.running) {
    dot.className = "router-dot on";
    text.textContent = "Router Running";
    portEl.textContent = `Port ${status.port} - PID ${status.pid ?? "?"}`;
  } else {
    dot.className = "router-dot off";
    text.textContent = "Router Stopped";
    portEl.textContent = `Port ${status.port}`;
  }
}

async function loadRouterLogs() {
  const logs = await window.api.router.logs();
  $("router-log").textContent = logs.join("\n");
}

// â”€â”€ Panel Toggle â”€â”€
let rightPanelTab = "settings";

function setPanelBody(tab: string): void {
  const settingsBody = document.querySelector<HTMLElement>('.panel-body[data-panel="settings"]');
  const routerBody = document.querySelector<HTMLElement>('.panel-body[data-panel="router"]');
  if (!settingsBody || !routerBody) return;

  const showSettings = tab === "settings";
  const showRouter = tab === "router";
  settingsBody.classList.toggle("active", showSettings);
  settingsBody.style.display = showSettings ? "flex" : "none";

  routerBody.classList.toggle("active", showRouter);
  routerBody.style.display = showRouter ? "flex" : "none";
}

function openPanel(tab: string) {
  rightPanelTab = tab;
  const panel = $("right-panel");
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.dataset["openTab"] = tab;

  document.querySelectorAll<HTMLElement>(".panel-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset["tab"] === tab);
  });
  setPanelBody(tab);

  const settingsBtn = $("settings-toggle-btn");
  const routerBtn = $("router-toggle-btn");
  settingsBtn.classList.toggle("active", tab === "settings");
  routerBtn.classList.toggle("active", tab === "router");

  if (tab === "router") {
    void refreshRouterStatus();
    void loadRouterLogs();
    void refreshMcpStatus();
  }
}

function togglePanel(tab: string) {
  const panel = $("right-panel");
  const isOpen = panel.style.display !== "none";
  const openTab = panel.dataset["openTab"] ?? rightPanelTab;
  if (isOpen && openTab === tab) {
    closeRightPanel();
  } else {
    openPanel(tab);
  }
}

// â”€â”€ Rename â”€â”€
function openRenameModal() {
  if (!currentChatId) return;
  const modal = $("rename-modal");
  modal.style.display = "flex";
  ($("rename-input") as HTMLInputElement).value = $("chat-title-display").textContent ?? "";
  ($("rename-input") as HTMLInputElement).focus();
}

async function confirmRename() {
  if (!currentChatId) return;
  const title = ($("rename-input") as HTMLInputElement).value.trim();
  if (!title) return;
  await window.api.chat.rename(currentChatId, title);
  $("chat-title-display").textContent = title;
  $("rename-modal").style.display = "none";
  await loadChatList();
}

// â”€â”€ Composer auto-resize â”€â”€
function imageExtensionFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("bmp")) return "bmp";
  return "png";
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Invalid clipboard image data."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read clipboard image."));
    reader.readAsDataURL(file);
  });
}

async function addClipboardImages(files: File[]): Promise<void> {
  if (files.length === 0) return;

  const attachments: AttachmentPayload[] = [];
  for (const file of files) {
    const mimeType = (file.type || "image/png").toLowerCase();
    if (!mimeType.startsWith("image/")) continue;

    try {
      const dataUrl = await fileToDataUrl(file);
      const ext = imageExtensionFromMime(mimeType);
      const fallbackName = `screenshot-${Date.now()}.${ext}`;
      attachments.push({
        name: (file.name || "").trim() || fallbackName,
        type: "image",
        mimeType,
        content: dataUrl
      });
    } catch {
      // Skip invalid clipboard item.
    }
  }

  if (attachments.length === 0) {
    showToast("Clipboard image read failed.", 2200);
    return;
  }

  activeAttachments = [...activeAttachments, ...attachments];
  renderComposerAttachments();

  const input = $("composer-input") as HTMLTextAreaElement;
  input.focus();
  showToast(`${attachments.length} screenshot attached.`, 1800);
}

function setupComposer() {
  const input = $("composer-input") as HTMLTextAreaElement;
  input.removeAttribute("readonly");
  input.removeAttribute("disabled");
  const composerInner = input.closest(".composer-inner") as HTMLElement | null;
  composerInner?.addEventListener("click", () => input.focus());

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
    updateInputTokenCount();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener("paste", (event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;
    event.preventDefault();
    void addClipboardImages(imageFiles);
  });
}

function encodePcm16Wav(chunks: Float32Array[], sampleRate: number): Uint8Array {
  let sampleCount = 0;
  for (const chunk of chunks) sampleCount += chunk.length;

  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      const int = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function setupVoiceInput() {
  const btn = $("voice-btn") as HTMLButtonElement;
  const speechWindow = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SpeechCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const canCaptureAudio = Boolean(navigator.mediaDevices?.getUserMedia);
  let speechStopRequested = false;
  let pcmRecording = false;
  let pcmChunks: Float32Array[] = [];
  let pcmContext: AudioContext | null = null;
  let pcmSource: MediaStreamAudioSourceNode | null = null;
  let pcmProcessor: ScriptProcessorNode | null = null;

  if (!SpeechCtor && !canCaptureAudio) {
    btn.style.display = "none";
    return;
  }

  const ensureMicPermission = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "microphone access denied";
      showToast(`Mic unavailable: ${message}`, 2800);
      return false;
    }
  };

  const appendTranscript = (text: string): void => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const input = $("composer-input") as HTMLTextAreaElement;
    const existing = input.value.trim();
    input.value = existing ? `${input.value.trimEnd()}\n${cleaned}` : cleaned;
    input.dispatchEvent(new Event("input"));
    input.focus();
  };

  const stopRecorderStream = (): void => {
    voiceMediaStream?.getTracks().forEach((track) => track.stop());
    voiceMediaStream = null;
  };

  const cleanupPcmRecorder = async (): Promise<void> => {
    try {
      pcmProcessor?.disconnect();
      pcmSource?.disconnect();
      if (pcmContext && pcmContext.state !== "closed") await pcmContext.close();
    } catch {
      // noop
    }
    pcmProcessor = null;
    pcmSource = null;
    pcmContext = null;
  };

  const stopPcmRecorderMode = async (): Promise<void> => {
    if (!pcmRecording) return;
    pcmRecording = false;
    voiceRecording = false;
    btn.classList.remove("recording");

    const sampleRate = Math.max(8000, Math.floor(pcmContext?.sampleRate ?? 16000));
    stopRecorderStream();
    await cleanupPcmRecorder();

    const wavBytes = encodePcm16Wav(pcmChunks, sampleRate);
    pcmChunks = [];
    if (wavBytes.byteLength <= 44) {
      showToast("No audio captured. Try again.", 2200);
      return;
    }

    try {
      showToast("Transcribing voice...", 1800);
      const text = await window.api.chat.transcribeAudio(wavBytes, "audio/wav");
      appendTranscript(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      showToast(`Transcription failed: ${message}`, 3600);
    }
  };

  const startPcmRecorderMode = async (): Promise<void> => {
    if (!canCaptureAudio) {
      showToast("Recorder mode is not available on this runtime.", 2800);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceMediaStream = stream;
    pcmChunks = [];
    pcmContext = new AudioContext();
    pcmSource = pcmContext.createMediaStreamSource(stream);
    pcmProcessor = pcmContext.createScriptProcessor(4096, 1, 1);
    pcmProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!pcmRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(input));
    };
    pcmSource.connect(pcmProcessor);
    pcmProcessor.connect(pcmContext.destination);
    pcmRecording = true;
    voiceRecording = true;
    btn.classList.add("recording");
    showToast("Recording... click mic again to stop.", 1800);
  };

  const startRecorderMode = async (): Promise<void> => {
    if (hasMediaRecorder && canCaptureAudio) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMediaStream = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg"
      ];
      const selectedMime = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      voiceMediaRecorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      voiceMediaRecorder.onstart = () => {
        voiceRecording = true;
        btn.classList.add("recording");
        showToast("Recording... click mic again to stop.", 1800);
      };

      voiceMediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      voiceMediaRecorder.onerror = () => {
        voiceRecording = false;
        btn.classList.remove("recording");
        stopRecorderStream();
        voiceMediaRecorder = null;
        showToast("Audio recorder failed.", 2800);
      };

      voiceMediaRecorder.onstop = async () => {
        voiceRecording = false;
        btn.classList.remove("recording");
        stopRecorderStream();

        const recorderMime = voiceMediaRecorder?.mimeType || selectedMime || "audio/webm";
        voiceMediaRecorder = null;
        const blob = new Blob(chunks, { type: recorderMime });
        if (blob.size === 0) {
          showToast("No audio captured. Try again.", 2200);
          return;
        }

        try {
          showToast("Transcribing voice...", 1800);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const text = await window.api.chat.transcribeAudio(bytes, blob.type || recorderMime);
          appendTranscript(text);
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          showToast(`Transcription failed: ${message}`, 3600);
        }
      };

      voiceMediaRecorder.start();
      return;
    }

    await startPcmRecorderMode();
  };

  if (SpeechCtor) {
    speechRecognition = new SpeechCtor();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator.language || "en-US";
    let finalTranscript = "";
    let interimTranscript = "";

    speechRecognition.onstart = () => {
      speechStopRequested = false;
      voiceRecording = true;
      btn.classList.add("recording");
    };

    speechRecognition.onend = () => {
      voiceRecording = false;
      btn.classList.remove("recording");
      const text = `${finalTranscript} ${interimTranscript}`.trim();
      finalTranscript = "";
      interimTranscript = "";
      appendTranscript(text);
    };

    speechRecognition.onerror = (event: Event & { error?: string }) => {
      voiceRecording = false;
      finalTranscript = "";
      interimTranscript = "";
      btn.classList.remove("recording");

      const errorCode = (event.error ?? "unknown").toLowerCase();
      if (speechStopRequested && errorCode === "aborted") return;

      if (errorCode === "network" && canCaptureAudio) {
        voiceRecorderMode = true;
        showToast("Speech service unavailable. Switched to recorder mode.", 3200);
        return;
      }
      if (errorCode === "no-speech") {
        showToast("No speech detected. Try again.", 2200);
        return;
      }
      if (errorCode === "audio-capture") {
        showToast("No microphone detected.", 2600);
        return;
      }
      if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
        showToast("Microphone permission denied by system/browser.", 3200);
        return;
      }
      if (errorCode === "network") {
        showToast("Speech service unavailable (network error).", 3200);
        return;
      }
      showToast(`Voice input failed: ${errorCode}`, 3200);
    };

    speechRecognition.onresult = (event: SpeechRecognitionEventLike) => {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalTranscript += `${transcript} `;
        else interimTranscript += `${transcript} `;
      }
    };
  }

  btn.addEventListener("click", async () => {
    try {
      if (voiceRecording) {
        if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
          voiceMediaRecorder.stop();
          return;
        }
        if (pcmRecording) {
          await stopPcmRecorderMode();
          return;
        }
        if (speechRecognition) {
          speechStopRequested = true;
          speechRecognition.stop();
          return;
        }
      }

      const ok = await ensureMicPermission();
      if (!ok) return;

      if (voiceRecorderMode || !speechRecognition) {
        await startRecorderMode();
        return;
      }

      speechRecognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      voiceRecording = false;
      btn.classList.remove("recording");
      showToast(`Voice input failed: ${message}`, 3200);
    }
  });
}

function setupComposerTools() {
  $("attach-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pick();
    if (picked.length === 0) return;

    activeAttachments = [...activeAttachments, ...picked];
    renderComposerAttachments();
  });

  $("templates-btn").addEventListener("click", async () => {
    const dropdown = $("templates-dropdown");
    const isOpen = dropdown.style.display !== "none";
    if (isOpen) {
      showTemplatesDropdown(false);
      return;
    }
    await loadTemplates();
    showTemplatesDropdown(true);
  });

  $("save-template-btn").addEventListener("click", () => {
    void saveCurrentAsTemplate();
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("#templates-dropdown") || target.closest("#templates-btn")) return;
    showTemplatesDropdown(false);
  });
}

function setupModeSwitcher() {
  const modeButtons: Array<{ id: string; mode: UiMode }> = [
    { id: "mode-write-btn", mode: "write" },
    { id: "mode-code-btn", mode: "code" },
    { id: "mode-think-btn", mode: "think" }
  ];
  for (const item of modeButtons) {
    $(item.id).addEventListener("click", () => applyMode(item.mode));
  }
  applyMode(currentMode);
}

function setupCompareControls() {
  $("compare-toggle-btn").addEventListener("click", () => {
    compareModeEnabled = !compareModeEnabled;
    refreshCompareUi();
  });
  refreshCompareUi();
}

function setupOllamaControls() {
  $("ollama-enabled-toggle").addEventListener("change", () => {
    toggleOllamaSettingsVisibility();
    populateModels();
  });
  $("refresh-ollama-models-btn").addEventListener("click", () => {
    void refreshOllamaModels();
  });
}

function setupMcpControls() {
  $("mcp-add-btn").addEventListener("click", async () => {
    const name = ($("mcp-name-input") as HTMLInputElement).value.trim();
    const command = ($("mcp-command-input") as HTMLInputElement).value.trim();
    const args = parseArgsInput(($("mcp-args-input") as HTMLInputElement).value);

    if (!name || !command) {
      showToast("MCP name aur command required hain.", 2200);
      return;
    }

    await window.api.mcp.add({ name, command, args });
    ($("mcp-name-input") as HTMLInputElement).value = "";
    ($("mcp-command-input") as HTMLInputElement).value = "";
    ($("mcp-args-input") as HTMLInputElement).value = "";
    await refreshMcpStatus();
    showToast("MCP server saved.");
  });
}

function setupMessageInteractions() {
  $("messages").addEventListener("click", async (event: Event) => {
    const target = event.target as HTMLElement;
    const actionBtn = target.closest(".msg-action-btn") as HTMLButtonElement | null;
    if (actionBtn) {
      const action = (actionBtn.dataset["action"] ?? "").toLowerCase();
      const msgId = actionBtn.dataset["msgId"] ?? "";
      if (!msgId) return;

      if (action === "edit") {
        await editUserMessage(msgId);
        return;
      }
      if (action === "regenerate") {
        await regenerateAssistantMessage(msgId);
        return;
      }
      if (action === "copy") {
        const message = renderedMessages.find((item) => item.id === msgId);
        if (!message?.content?.trim()) return;
        const ok = await copyTextToClipboard(message.content);
        showToast(ok ? "Response copied." : "Copy failed", 1800);
        return;
      }
    }

    const runBtn = target.closest(".run-btn") as HTMLButtonElement | null;
    if (runBtn) {
      const block = runBtn.closest(".code-block") as HTMLElement | null;
      const codeEl = block?.querySelector("code");
      if (!block || !codeEl) return;

      const lang = (block.dataset["lang"] ?? "").toLowerCase();
      const code = codeEl.textContent ?? "";
      if (lang === "html") {
        openCodePreview(code);
        return;
      }
      if (lang === "javascript" || lang === "js") {
        runJavaScriptPreview(block, code);
      }
      return;
    }

    const btn = target.closest(".copy-btn") as HTMLButtonElement | null;
    if (!btn) return;
    const codeEl = btn.closest(".code-block")?.querySelector("code");
    if (!codeEl) return;

    try {
      const ok = await copyTextToClipboard(codeEl.textContent ?? "");
      if (!ok) throw new Error("copy failed");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    } catch {
      showToast("Copy failed", 1800);
    }
  });
}

function closeRightPanel() {
  const panel = $("right-panel");
  panel.style.display = "none";
  panel.dataset["openTab"] = "";
  document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
  setPanelBody("none");
  $("settings-toggle-btn").classList.remove("active");
  $("router-toggle-btn").classList.remove("active");
}

function setupVirtualScrolling() {
  const messages = $("messages");
  messages.addEventListener("scroll", () => {
    scheduleVirtualRender(false);
  }, { passive: true });
  window.addEventListener("resize", () => {
    scheduleVirtualRender(false);
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      void createNewChat();
      return;
    }

    if (e.ctrlKey && !e.shiftKey && e.key === ",") {
      e.preventDefault();
      openPanel("settings");
      return;
    }

    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const modelSelect = $("model-select") as HTMLSelectElement;
      modelSelect.focus();
      modelSelect.click();
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
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

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      openPanel("router");
      return;
    }

    if (e.key === "Escape") {
      const panel = $("right-panel");
      const renameModal = $("rename-modal");
      const templatesDropdown = $("templates-dropdown");
      const codePreviewModal = $("code-preview-modal");
      const statsModal = $("stats-modal");
      if (panel.style.display !== "none") {
        closeRightPanel();
        return;
      }
      if (renameModal.style.display !== "none") {
        renameModal.style.display = "none";
        return;
      }
      if (codePreviewModal.style.display !== "none") {
        closeCodePreview();
        return;
      }
      if (statsModal.style.display !== "none") {
        closeStatsModal();
        return;
      }
      if (templatesDropdown.style.display !== "none") {
        showTemplatesDropdown(false);
      }
    }
  });
}

// â”€â”€ Init â”€â”€
async function init() {
  $("theme-toggle-btn").onclick = toggleTheme;
  applyTheme(getInitialTheme());

  $("settings-toggle-btn").onclick = () => {
    const panel = $("right-panel");
    const openTab = panel.dataset["openTab"] ?? "";
    if (panel.style.display !== "none" && openTab === "settings") {
      closeRightPanel();
      return;
    }
    openPanel("settings");
  };
  $("router-toggle-btn").onclick = () => {
    const panel = $("right-panel");
    const openTab = panel.dataset["openTab"] ?? "";
    if (panel.style.display !== "none" && openTab === "router") {
      closeRightPanel();
      return;
    }
    openPanel("router");
  };
  document.querySelectorAll(".panel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const t = (tab as HTMLElement).dataset["tab"]!;
      openPanel(t);
    });
  });

  try {
    setupVirtualScrolling();
    setupIpcListeners();
    setupChatListSearch();
    setupComposer();
    setupComposerTools();
    setupModeSwitcher();
    setupCompareControls();
    setupOllamaControls();
    setupMcpControls();
    setupMessageInteractions();
    setupKeyboardShortcuts();
  } catch (err) {
    console.error("UI setup failed:", err);
  }

  updateInputTokenCount();
  updateContextTokenCount();
  renderComposerAttachments();
  showTemplatesDropdown(false);
  applyRawMode(rawModeEnabled);
  hideSummaryOverlay();
  window.setInterval(() => {
    const panel = $("right-panel");
    if (panel.style.display !== "none" && (panel.dataset["openTab"] ?? "") === "router") {
      void refreshMcpStatus();
    }
  }, 2000);

  // New chat
  $("new-chat-btn").onclick = async () => {
    await createNewChat();
  };

  // Send
  $("send-btn").onclick = () => sendMessage();

  // Stop
  $("stop-btn").onclick = async () => {
    if (currentChatId) await window.api.chat.stop(currentChatId);
  };

  // Rename
  $("rename-btn").onclick = openRenameModal;
  $("summary-dismiss-btn").onclick = hideSummaryOverlay;
  $("summarize-btn").onclick = () => {
    void summarizeCurrentChat();
  };
  $("raw-toggle-btn").onclick = () => {
    applyRawMode(!rawModeEnabled);
  };
  $("stats-btn").onclick = () => {
    void openStatsModal();
  };
  $("stats-close-btn").onclick = closeStatsModal;
  $("code-preview-close-btn").onclick = closeCodePreview;
  $("code-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeCodePreview();
  });
  $("stats-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeStatsModal();
  });
  $("export-btn").onclick = async () => {
    if (!currentChatId) return;
    const res = await window.api.chat.export(currentChatId);
    showToast(res.message, res.ok ? 2200 : 3200);
  };
  $("system-prompt-toggle-btn").onclick = () => {
    if (!currentChatId) return;
    const panel = $("system-prompt-panel");
    const opening = panel.style.display === "none";
    panel.style.display = opening ? "flex" : "none";
    $("system-prompt-toggle-btn").classList.toggle("active", opening);
  };
  $("save-system-prompt-btn").onclick = async () => {
    if (!currentChatId) return;
    const prompt = ($("system-prompt-input") as HTMLTextAreaElement).value.trim();
    const ok = await window.api.chat.setSystemPrompt(currentChatId, prompt);
    showToast(ok ? "System prompt saved." : "Failed to save system prompt.", ok ? 1800 : 2800);
  };
  $("rename-confirm-btn").onclick = confirmRename;
  $("rename-cancel-btn").onclick = () => { $("rename-modal").style.display = "none"; };
  $("rename-input").addEventListener("keydown", (e: Event) => {
    if ((e as KeyboardEvent).key === "Enter") confirmRename();
    if ((e as KeyboardEvent).key === "Escape") $("rename-modal").style.display = "none";
  });

  // Settings
  $("save-settings-btn").onclick = saveSettings;
  $("fill-models-btn").onclick = () => {
    const area = $("models-textarea") as HTMLTextAreaElement;
    area.value = RECOMMENDED_MODELS.join("\n");
    const defaultInput = $("default-model-input") as HTMLInputElement;
    if (!defaultInput.value.trim()) defaultInput.value = RECOMMENDED_MODELS[0];
    showToast("Recommended models add ho gaye. Save Settings dabao.");
  };
  $("test-conn-btn").onclick = async () => {
    setStatus("Testing...", "");
    const res = await window.api.router.test();
    setStatus(res.message, res.ok ? "ok" : "err");
  };
  $("toggle-key-btn").onclick = () => {
    const input = $("api-key-input") as HTMLInputElement;
    const btn = $("toggle-key-btn");
    if (input.type === "password") { input.type = "text"; btn.textContent = "Hide"; }
    else { input.type = "password"; btn.textContent = "Show"; }
  };

  // Router
  $("start-router-btn").onclick = async () => {
    setRouterMsg("Starting...");
    const res = await window.api.router.start();
    setRouterMsg(res.message);
    await refreshRouterStatus();
  };
  $("stop-router-btn").onclick = async () => {
    const res = await window.api.router.stop();
    setRouterMsg(res.message);
    await refreshRouterStatus();
  };
  $("refresh-diagnostics-btn")?.addEventListener("click", refreshRouterStatus);

  try {
    await loadSettings();
    await loadTemplates();
    await refreshMcpStatus();
    await loadChatList();
    const routerStatus = await window.api.router.status();
    if (!routerStatus.running) {
      showToast("Starting router...", 1800);
      const log = $("router-log");
      log.textContent += "[Auto] Starting router...\n";
      const started = await window.api.router.start();
      log.textContent += `[Auto] ${started.message}\n`;
      log.scrollTop = log.scrollHeight;
      await refreshRouterStatus();
    }
  } catch (err) {
    console.error("Initial load failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load settings: ${message}`, "err");
    showToast(`Initial data load failed: ${message}`, 4500);
  }
}

document.addEventListener("DOMContentLoaded", init);





