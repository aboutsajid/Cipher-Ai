// â”€â”€ State â”€â”€
let currentChatId: string | null = null;
let activeChatContext: ChatContext | null = null;
let activeChatActionMenuId: string | null = null;
let chatProviderMenuOpen = false;
let isStreaming = false;
let suppressChatContextSync = false;
let settings: Settings | null = null;
type ThemeMode = "dark" | "light";
type UiMode = "write" | "code" | "think" | "claude" | "edit";
type ProviderMode = "openrouter" | "nvidia" | "ollama";
type CloudProviderMode = Exclude<ProviderMode, "ollama">;
type ImageProviderMode = CloudProviderMode | "comfyui";
type InteractionMode = "chat" | "agent" | "image";
const THEME_STORAGE_KEY = "cipher-ai-theme";
const UI_MODE_STORAGE_KEY = "cipher-ai-ui-mode";
const ONBOARDING_STORAGE_KEY = "cipher-ai-onboarding-v1";
const SIDEBAR_WIDTH_STORAGE_KEY = "cipher-ai-sidebar-width";
const SIDEBAR_DEFAULT_WIDTH = 304;
const SIDEBAR_MIN_WIDTH = 248;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_WIDTH_STEP = 32;
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "cipher-ai-right-panel-width";
const RIGHT_PANEL_DEFAULT_WIDTH = 356;
const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 760;
const RIGHT_PANEL_WIDTH_STEP = 48;
const ROUTER_TOGGLE_BUTTON_ID = ["router", "toggle", "btn"].join("-");
const AGENT_TOGGLE_BUTTON_ID = ["agent", "toggle", "btn"].join("-");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const COMFYUI_DEFAULT_BASE_URL = "http://127.0.0.1:8000";
let currentTheme: ThemeMode = "dark";
let currentMode: UiMode = "write";
let providerMode: ProviderMode = "openrouter";
let currentInteractionMode: InteractionMode = "chat";
let rawModeEnabled = false;
type UiExperienceMode = "default" | "simple";
let currentUiExperience: UiExperienceMode = "default";
let activeAttachments: AttachmentPayload[] = [];
let temporaryClaudeChatFilesystemRoots: string[] = [];
let compareModeEnabled = false;

type ClaudeChatFilesystemRootDraft = {
  path: string;
  label?: string;
  allowWrite: boolean;
  overwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite";
};
type ClaudeFilesystemEvent = {
  action: string;
  path: string;
  createdAt: string;
};
let mcpStatus: McpStatus = { servers: [], tools: [] };
let activeAgentTaskId: string | null = null;
let activeAgentTaskStatus: AgentTask["status"] | null = null;
let agentPollTimer: ReturnType<typeof setInterval> | null = null;
let agentEventRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAgentEventRefreshForceLogs = false;
let lastAgentTaskChangeAt = 0;
let cachedAgentTasks: AgentTask[] = [];
let cachedAgentSnapshots: WorkspaceSnapshot[] = [];
let cachedAgentRouteDiagnostics: AgentRouteDiagnostics | null = null;
const taskTargetExistsById = new Map<string, boolean>();
let agentHistoryFilter: "all" | AgentTask["status"] = "all";
let agentHistoryExpanded = false;
let agentHistoryCollapsedPanelWidth: number | null = null;
let pendingSnapshotRestoreId: string | null = null;
let activeAgentRestoreState: AgentSnapshotRestoreResult | null = null;
const autoOpenedAgentPreviewTasks = new Set<string>();
let pendingAutoOpenAgentPreviewTaskId: string | null = null;
const pendingDesktopLaunchPromptTasks = new Set<string>();
const handledDesktopLaunchPromptTasks = new Set<string>();
let activePreviewUrl: string | null = null;
let activePreviewTarget: string | null = null;
let currentSidebarWidth = SIDEBAR_DEFAULT_WIDTH;
let currentRightPanelWidth = RIGHT_PANEL_DEFAULT_WIDTH;
const agentChatMessageMap = new Map<string, { chatId: string; userMessageId: string; assistantMessageId: string }>();
const pendingTitleGeneration = new Set<string>();
const enabledMcpTools = new Set<string>();
let activeStreamChatId: string | null = null;
let pendingStreamResponses = 0;
let claudeSessionRunning = false;
let claudeSessionStarting = false;
let claudeSessionChatId: string | null = null;
let activeClaudeAssistantMessageId: string | null = null;
let speechRecognition: SpeechRecognitionLike | null = null;
let voiceRecording = false;
let voiceRecorderMode = false;
let voiceMediaRecorder: MediaRecorder | null = null;
let voiceMediaStream: MediaStream | null = null;
const activeStreamingMessageIds = new Set<string>();
let chatSearchQuery = "";
let cachedChatSummaries: ChatSummary[] = [];
let ipcListenersInitialized = false;
const ipcListenerUnsubscribers: Array<() => void> = [];
const VIRTUAL_OVERSCAN_ITEMS = 8;
const VIRTUAL_ESTIMATED_ITEM_HEIGHT = 140;
const VIRTUAL_FULL_RENDER_THRESHOLD = 1000;
const NEAR_BOTTOM_THRESHOLD_PX = 120;
let renderedMessages: Message[] = [];
let virtualItems: VirtualChatItem[] = [];
const virtualItemHeights = new Map<string, number>();
let virtualRenderScheduled = false;
let shouldAutoScroll = true;
let workspaceRootPath = "";
let chunkAutoScrollTimer: ReturnType<typeof setTimeout> | null = null;
let claudeRenderTimer: ReturnType<typeof setTimeout> | null = null;
let claudeRenderMessageId: string | null = null;
let claudeElapsedTimer: ReturnType<typeof setInterval> | null = null;
let claudeElapsedStartedAt = 0;
let claudeElapsedStatusText = "";
const claudeDraftByMessage = new Map<string, string>();
let pendingClaudeSaveGuard: ClaudeSaveGuard | null = null;
let pendingClaudeManagedPermissions: ClaudeManagedEditPermissions = { allowedPaths: [], allowedRoots: [] };
let pendingClaudeManagedBaselines: ClaudeManagedEditBaseline[] = [];
let pendingClaudeManagedMode: "none" | "edit" | "chat" = "none";
let claudeSessionResetting = false;
let suppressClaudeExitNotice = false;
let pendingChatSaveGuard: (ClaudeSaveGuard & { chatId: string | null }) | null = null;
let pendingManagedSavePreview: ManagedSavePreviewState | null = null;
let managedSaveApplying = false;
let pendingAgentTargetPromptResolve: ((choice: AgentTargetPromptChoice | null) => void) | null = null;
const chatSaveGuardByMessageId = new Map<string, ClaudeSaveGuard>();
const CLAUDE_RENDER_BATCH_MS = 80;
const AGENT_EVENT_REFRESH_DEBOUNCE_MS = 300;
const AGENT_POLL_FALLBACK_MS = 6000;
const AGENT_EVENT_STALE_FALLBACK_MS = AGENT_POLL_FALLBACK_MS;
const CLAUDE_MODEL_LABEL = "claude/minimax-m2.5:cloud";
const OPENROUTER_DEFAULT_MODEL = "qwen/qwen3.6-plus";
const OPENROUTER_THINK_MODEL = "deepseek/deepseek-v3.2";
const OPENROUTER_LONG_CONTEXT_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";
const OPENROUTER_DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
const OPENROUTER_IMAGE_MODELS = [
  OPENROUTER_DEFAULT_IMAGE_MODEL,
  "google/gemini-3.1-flash-image-preview",
  "black-forest-labs/flux.2-flex",
  "black-forest-labs/flux.2-pro"
];
const NVIDIA_DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.1-schnell";
const NVIDIA_IMAGE_MODELS = [
  NVIDIA_DEFAULT_IMAGE_MODEL,
  "black-forest-labs/flux.1-dev"
];
const COMFYUI_DEFAULT_IMAGE_MODEL = "sd_xl_base_1.0.safetensors";
const COMFYUI_IMAGE_MODELS = [
  COMFYUI_DEFAULT_IMAGE_MODEL
];
const RECOMMENDED_MODELS = [
  OPENROUTER_DEFAULT_MODEL,
  "qwen/qwen3.6-plus-preview",
  "qwen/qwen3-coder-flash",
  "qwen/qwen3-coder:free",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "google/gemma-4-31b-it",
  "deepseek/deepseek-v3.2"
];
const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
const NVIDIA_THINK_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5";
const NVIDIA_LONG_CONTEXT_MODEL = "meta/llama-3.3-70b-instruct";
const NVIDIA_RECOMMENDED_MODELS = [
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_THINK_MODEL,
  NVIDIA_LONG_CONTEXT_MODEL,
  "nvidia/nemotron-3-nano-30b-a3b",
  "deepseek-ai/deepseek-r1-distill-qwen-32b"
];

const LOCAL_CODER_PRIMARY = "qwen2.5-coder:14b";
const LOCAL_CODER_FALLBACK = "qwen2.5-coder:7b";
const LOCAL_VOICE_SUPPORTED = false;
const IMAGE_GENERATION_ASPECT_RATIOS: ImageGenerationAspectRatio[] = ["1:1", "16:9", "21:9", "2:1", "9:16", "1:2", "4:3", "3:2", "2:3", "4:5", "5:4", "3:4"];
const IMAGE_HISTORY_PAGE_SIZE = 40;
const CHAT_MODE_TEMPLATES: ModeTemplate[] = [
  { name: "Explain Code", content: "Explain this code clearly, including what it does, key logic, and any risks or edge cases." },
  { name: "Write Reply", content: "Help me write a clear, concise reply in a professional but natural tone." },
  { name: "Debug Idea", content: "Think through this bug with me. List the likely causes, how to verify each one, and the best fix path." }
];
const AGENT_MODE_TEMPLATES: ModeTemplate[] = [
  { name: "Build Feature", content: "Build this feature in the current project, verify build/lint, and summarize what changed." },
  { name: "Fix Bug", content: "Investigate this bug, make the smallest safe fix, run verification, and explain the root cause." },
  { name: "Continue Build", content: "Continue working on the current task output. Improve it, keep scope focused, and make sure it runs cleanly." }
];
let imageGenerationSubmitting = false;
let imageHistoryLoading = false;
let imageHistoryLoadingMore = false;
let imageHistoryItems: GeneratedImageHistoryItem[] = [];
let imageHistoryHasMore = false;
let imageHistoryOffset = 0;
type ImageStudioSortMode = "newest" | "oldest" | "prompt-az" | "prompt-za";
let imageStudioSearchQuery = "";
let imageStudioSortMode: ImageStudioSortMode = "newest";

interface DirectSaveStatus {
  state: "ready" | "warn" | "off" | "blocked";
  badge: string;
  detail: string;
}

type AgentTargetPromptChoice = "suggested" | "choose" | "skip";

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
function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return element;
}

function qs<T extends Element>(sel: string): T {
  const element = document.querySelector<T>(sel);
  if (!element) {
    throw new Error(`Missing required DOM selector: ${sel}`);
  }
  return element;
}

function applyMode(mode: UiMode): void {
  currentMode = mode;
  const labels: Record<UiMode, string> = {
    write: "Message Cipher Workspace...",
    code: "Describe your coding task...",
    think: "Ask for strategy, ideas, or analysis...",
    claude: "Type prompt for Claude Code...",
    edit: "Describe the file changes you want Claude to save..."
  };

  const input = $("composer-input") as HTMLTextAreaElement;
  input.placeholder = labels[mode];
  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["mode"] === mode);
  });
  setClaudeModeActiveVisual(mode === "claude" || mode === "edit");
  updateDirectSaveUi();
  refreshClaudeSafetyPanel();
  refreshCompareUi();

  if (mode === "claude" || mode === "edit") {
    void ensureClaudeSessionStarted();
  } else {
    setClaudeStatus(claudeSessionRunning ? "Ready" : "Idle", claudeSessionRunning ? "ok" : "");
  }

  if (currentInteractionMode === "agent") {
    applyInteractionMode("agent");
  }
  refreshChatProviderMenuUi();
}

function syncComposerAgentPrompts(source: "composer" | "agent"): void {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (!(composerInput instanceof HTMLTextAreaElement) || !(agentInput instanceof HTMLTextAreaElement)) return;

  if (source === "composer") {
    agentInput.value = composerInput.value;
    return;
  }

  composerInput.value = agentInput.value;
  composerInput.dispatchEvent(new Event("input"));
}

function resolveAgentPromptInput(): { input: HTMLTextAreaElement; source: "composer" | "agent" } | null {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (!(composerInput instanceof HTMLTextAreaElement) || !(agentInput instanceof HTMLTextAreaElement)) return null;

  const composerPrompt = composerInput.value.trim();
  const agentPrompt = agentInput.value.trim();
  const activeElement = document.activeElement;

  if (activeElement === agentInput && agentPrompt) return { input: agentInput, source: "agent" };
  if (activeElement === composerInput && composerPrompt) return { input: composerInput, source: "composer" };
  if (agentPrompt) return { input: agentInput, source: "agent" };
  if (composerPrompt) return { input: composerInput, source: "composer" };
  return null;
}

function clearAgentPrompts(): void {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (composerInput instanceof HTMLTextAreaElement) {
    composerInput.value = "";
    composerInput.dispatchEvent(new Event("input"));
  }
  if (agentInput instanceof HTMLTextAreaElement) {
    agentInput.value = "";
    agentInput.dispatchEvent(new Event("input"));
  }
}

function getComposerPlaceholder(): string {
  if (currentInteractionMode === "agent") {
    return "Describe the coding task. Agent will inspect, edit, verify, and log progress...";
  }

  return ({
    write: "Message Cipher Workspace...",
    code: "Describe your coding task...",
    think: "Ask for strategy, ideas, or analysis...",
    claude: "Type prompt for Claude Code...",
    edit: "Describe the file changes you want Claude to save..."
  }[currentMode]);
}

function getActiveModeTemplates(): ModeTemplate[] {
  return currentInteractionMode === "agent" ? AGENT_MODE_TEMPLATES : CHAT_MODE_TEMPLATES;
}

function refreshComposerContextUi(): void {
  const input = document.getElementById("composer-input");
  const directSaveDetail = document.getElementById("direct-save-detail");
  const shortcutHint = document.getElementById("composer-shortcut-hint");
  if (input instanceof HTMLTextAreaElement) input.placeholder = getComposerPlaceholder();
  if (directSaveDetail instanceof HTMLElement) {
    directSaveDetail.textContent = currentInteractionMode === "agent"
      ? "Agent mode starts a supervised coding task with rollback protection."
      : "Use Edit & Save mode for Claude-only file edits.";
  }
  if (shortcutHint instanceof HTMLElement) {
    shortcutHint.textContent = currentInteractionMode === "agent"
      ? "Enter to start agent task"
      : "Shift+Enter for new line · Enter to send";
  }
}

function refreshEmptyStateIfNeeded(): void {
  if (renderedMessages.length > 0) return;
  const container = $("messages");
  const empty = container.querySelector(".empty-state");
  if (!empty) return;
  empty.replaceWith(createEmptyStateElement());
}

function syncAgentLandingFocusPanel(): void {
  if (currentInteractionMode !== "agent") return;
  if (renderedMessages.length > 0) return;
  if (currentChatId) return;
  const panel = document.getElementById("right-panel");
  if (!(panel instanceof HTMLElement) || panel.style.display === "none") return;
  const openTab = panel.dataset["openTab"] ?? rightPanelTab;
  if (openTab !== "settings") return;
  closeRightPanel();
}

function isAgentTaskRunning(): boolean {
  return Boolean(activeAgentTaskId && activeAgentTaskStatus === "running");
}

function applyInteractionMode(mode: InteractionMode): void {
  if (mode !== "agent" && currentInteractionMode === "agent" && isAgentTaskRunning()) {
    const statusMessage = "Wait for agent to finish, or stop it first.";
    setAgentStatus(statusMessage);
    showToast(statusMessage, 2600);
    return;
  }

  currentInteractionMode = mode;
  document.body.dataset["interactionMode"] = mode;

  const chatBtn = document.getElementById("interaction-chat-btn");
  const agentBtn = document.getElementById("interaction-agent-btn");
  const imageBtn = document.getElementById("generate-image-btn");
  const messages = document.getElementById("messages");
  const imageStudio = document.getElementById("image-studio");
  const providerSwitcher = document.getElementById("provider-switcher");
  const composerModeSwitcher = document.getElementById("mode-switcher");
  const composerAttachments = document.getElementById("composer-attachments");
  const composerInner = document.querySelector(".composer-inner");
  const composerHint = document.querySelector(".composer-hint");
  const attachBtn = document.getElementById("attach-btn");
  const voiceBtn = document.getElementById("voice-btn");
  const directSaveBadge = document.getElementById("direct-save-badge");
  const directSaveDetail = document.getElementById("direct-save-detail");
  const shortcutHint = document.getElementById("composer-shortcut-hint");
  const input = document.getElementById("composer-input");
  const isAgentMode = mode === "agent";
  const isImageMode = mode === "image";

  chatBtn?.classList.toggle("active", mode === "chat");
  agentBtn?.classList.toggle("active", isAgentMode);
  imageBtn?.classList.toggle("active", isImageMode);

  if (messages instanceof HTMLElement) messages.style.display = isImageMode ? "none" : "flex";
  if (imageStudio instanceof HTMLElement) imageStudio.style.display = isImageMode ? "block" : "none";
  if (providerSwitcher instanceof HTMLElement) providerSwitcher.style.display = "none";
  if (composerModeSwitcher instanceof HTMLElement) composerModeSwitcher.style.display = mode === "chat" ? "inline-flex" : "none";
  if (composerAttachments instanceof HTMLElement && isImageMode) composerAttachments.style.display = "none";
  if (composerInner instanceof HTMLElement) composerInner.style.display = isImageMode ? "none" : "flex";
  if (composerHint instanceof HTMLElement) composerHint.style.display = isImageMode ? "none" : "flex";
  if (attachBtn instanceof HTMLButtonElement) attachBtn.style.display = isAgentMode || isImageMode ? "none" : "inline-flex";
  if (voiceBtn instanceof HTMLButtonElement) {
    voiceBtn.disabled = isAgentMode || isImageMode;
    if (isImageMode) voiceBtn.style.display = "none";
  }
  if (directSaveBadge instanceof HTMLElement && isAgentMode) directSaveBadge.textContent = "Agent mode";
  if (directSaveDetail instanceof HTMLElement) {
    directSaveDetail.textContent = isAgentMode
      ? "Agent mode starts a supervised coding task with rollback protection."
      : "Use Edit & Save mode for Claude-only file edits.";
  }
  if (shortcutHint instanceof HTMLElement) {
    shortcutHint.textContent = isAgentMode
      ? "Enter to start agent task"
      : "Shift+Enter for new line · Enter to send";
  }
  if (input instanceof HTMLTextAreaElement) {
    input.placeholder = isAgentMode
      ? "Describe the coding task. Agent will inspect, edit, verify, and log progress..."
      : ({
        write: "Message Cipher Workspace...",
        code: "Describe your coding task...",
        think: "Ask for strategy, ideas, or analysis...",
        claude: "Type prompt for Claude Code...",
        edit: "Describe the file changes you want Claude to save..."
      }[currentMode]);
  }

  if (isAgentMode) {
    syncComposerAgentPrompts("composer");
    setAgentStatus("Agent mode active. Send will start a supervised task.");
    if (input instanceof HTMLTextAreaElement) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  if (isImageMode) {
    syncImageStudioControls(true);
    setImageStudioStatus("Loading generated image history...");
    void refreshImageHistory();
  }

  renderComposerAttachments();
  refreshComposerContextUi();
  refreshEmptyStateIfNeeded();
  syncAgentLandingFocusPanel();
  updateDirectSaveUi();
  refreshChatProviderMenuUi();
}

function reportSnapshotRestoreResult(message: string, ok: boolean): void {
  setAgentStatus(message, ok ? "ok" : "err");
  if (!ok || rightPanelTab !== "agent") {
    showToast(message, ok ? 2600 : 3800);
  }
}

async function sendChatPromptWithAttachments(
  rawContent: string,
  attachmentsToSend: AttachmentPayload[],
  options?: { forceVisionModel?: boolean; switchFromClaude?: boolean }
): Promise<void> {
  if (isStreaming) return;

  const content = rawContent || "Please review the attachment.";
  const wantsDirectSave = Boolean(shouldVerifyClaudeSave(rawContent || content, attachmentsToSend)?.requested);
  if (wantsDirectSave) {
    showToast("Direct save sirf Edit & Save mode me Claude ke sath allowed hai.", 3800);
    applyMode("edit");
    updateDirectSaveUi();
    return;
  }

  if (options?.switchFromClaude) {
    applyMode("write");
    await syncChatContextAfterUiChange();
  }

  let chatId = currentChatId;
  if (!chatId) {
    chatId = await createNewChat(false, activeChatContext ?? getActiveUiChatContext());
  }
  pendingChatSaveGuard = {
    ...(shouldVerifyClaudeSave(rawContent || content, attachmentsToSend) ?? { requested: false, expectedPaths: [] }),
    chatId
  };

  let model = getSelectedModel();
  if (options?.forceVisionModel && !isLikelyVisionCapableModel(model)) {
    const candidate = findVisionModelCandidate();
    if (!candidate) {
      pendingChatSaveGuard = null;
      showToast("Image review ke liye vision-capable model configure karo, phir dobara try karo.", 4200);
      activeAttachments = mergeAttachments(attachmentsToSend);
      renderComposerAttachments();
      return;
    }

    if (providerMode !== candidate.provider) {
      setProviderMode(candidate.provider);
    }

    model = candidate.model;
    const modelSelect = $("model-select") as HTMLSelectElement;
    if (selectHasOption(modelSelect, candidate.model)) {
      modelSelect.value = candidate.model;
    }
  }

  if (!model) {
    pendingChatSaveGuard = null;
    showToast("Select a model first.");
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    return;
  }

  const compareModel = compareModeEnabled ? getSelectedCompareModel() : "";
  if (compareModeEnabled && !compareModel) {
    pendingChatSaveGuard = null;
    showToast("Select a compare model first.");
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    return;
  }

  const modelsNeedingCloudKey = [model, ...(compareModeEnabled ? [compareModel] : [])]
    .map((m) => (m ?? "").trim())
    .filter(Boolean)
    .some((m) => !m.startsWith("ollama/"));
  if (modelsNeedingCloudKey) {
    const cloudProvider = getCloudProviderModeFromSettings(settings);
    const message = `Selected model needs a ${getProviderDisplayName(cloudProvider)} API key. Add key, or switch model to ollama/...`;
    if (!requireCloudApiKey(message)) {
      pendingChatSaveGuard = null;
      activeAttachments = mergeAttachments(attachmentsToSend);
      renderComposerAttachments();
      return;
    }
  }

  activeAttachments = [];
  renderComposerAttachments();

  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = "";
  input.style.height = "auto";

  if (options?.switchFromClaude) {
    applyMode("write");
    showToast("Image request ko multimodal chat model par route kiya gaya hai.", 2800);
  }

  shouldAutoScroll = true;
  activeStreamChatId = chatId;
  pendingStreamResponses = compareModeEnabled ? 2 : 1;
  setStreamingUi(true, compareModeEnabled ? "Comparing models..." : "Generating...");
  scrollToBottom(true);

  try {
    const chatContext = activeChatContext ?? getActiveUiChatContext();
    await window.api.chat.send(chatId, content, model, {
      attachments: attachmentsToSend,
      compareModel: compareModeEnabled ? compareModel : undefined,
      context: chatContext,
      enabledTools: getEnabledToolNames()
    });
  } catch (err) {
    pendingChatSaveGuard = null;
    activeAttachments = mergeAttachments(attachmentsToSend);
    renderComposerAttachments();
    activeStreamChatId = null;
    pendingStreamResponses = 0;
    setStreamingUi(false);
    showToast(`Send failed: ${err instanceof Error ? err.message : "unknown error"}`, 4000);
  }
}

async function submitImageGeneration(): Promise<void> {
  if (imageGenerationSubmitting) return;

  const promptInput = $("image-generation-prompt-input") as HTMLTextAreaElement;
  const modelInput = $("image-generation-model-input") as HTMLInputElement;
  const aspectSelect = $("image-generation-aspect-select") as HTMLSelectElement;
  const submitBtn = $("image-generation-submit-btn") as HTMLButtonElement;
  const cancelBtn = $("image-generation-cancel-btn") as HTMLButtonElement;
  const prompt = promptInput.value.trim();
  const imageProvider = getActiveImageGenerationProvider() ?? "openrouter";
  const requestedModel = modelInput.value.trim();
  const model = isProviderCompatibleImageModel(imageProvider, requestedModel)
    ? requestedModel
    : getDefaultImageGenerationModel(imageProvider);
  const aspectRatio = (aspectSelect.value || "1:1") as ImageGenerationAspectRatio;

  if (!prompt) {
    showToast("Image prompt required.", 2200);
    promptInput.focus();
    return;
  }

  imageGenerationSubmitting = true;
  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  submitBtn.textContent = "Generating...";

  const chatId = await ensureActiveChatId();
  const userMessage: Message = {
    id: nextClientMessageId("img-user"),
    role: "user",
    content: buildImageGenerationUserPrompt(prompt, aspectRatio),
    createdAt: new Date().toISOString()
  };

  appendMessage(userMessage);
  await window.api.chat.appendMessage(chatId, userMessage);
  void loadChatList();
  setStreamingUi(true, "Generating image...");

  try {
    const result = await window.api.images.generate({ prompt, provider: imageProvider, model, aspectRatio });
    const assistantMessage: Message = {
      id: nextClientMessageId("img-assistant"),
      role: "assistant",
      content: buildImageGenerationAssistantMessage(result),
      createdAt: new Date().toISOString(),
      model: result.model,
      metadata: result.images.some((image) => Boolean(image.id))
        ? { generatedImageAssetIds: result.images.map((image) => image.id ?? "").filter(Boolean) }
        : undefined
    };
    appendMessage(assistantMessage);
    await window.api.chat.appendMessage(chatId, assistantMessage);
    void loadChatList();
    void maybeGenerateTitle(chatId);
    if (document.getElementById("image-history-modal") instanceof HTMLElement
      && ($("image-history-modal") as HTMLElement).style.display !== "none") {
      void refreshImageHistory();
    }
    closeImageGenerationModal(true);
    showToast(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`, 2200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed.";
    const assistantError: Message = {
      id: nextClientMessageId("img-error"),
      role: "assistant",
      content: message,
      createdAt: new Date().toISOString(),
      model: "Image Generation",
      error: message
    };
    appendMessage(assistantError);
    await window.api.chat.appendMessage(chatId, assistantError);
    void loadChatList();
    showToast(message, 3600);
  } finally {
    imageGenerationSubmitting = false;
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
    submitBtn.textContent = "Generate";
    setStreamingUi(false);
  }
}

// â”€â”€ IPC Events â”€â”€

function registerIpcListener(unsubscribe: (() => void) | void): void {
  if (typeof unsubscribe === "function") {
    ipcListenerUnsubscribers.push(unsubscribe);
  }
}

function teardownIpcListeners(): void {
  while (ipcListenerUnsubscribers.length > 0) {
    const unsubscribe = ipcListenerUnsubscribers.pop();
    try {
      unsubscribe?.();
    } catch {
      // Best-effort cleanup during teardown.
    }
  }
  ipcListenersInitialized = false;
}

function setupIpcListeners() {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;
  registerIpcListener(window.api.chat.onStoreChanged((payload) => {
    void syncChatStoreAcrossWindows(payload);
  }));

  registerIpcListener(window.api.chat.onMessage((chatId, msg) => {
    if (msg.role === "assistant" && pendingChatSaveGuard?.requested && pendingChatSaveGuard.chatId === chatId) {
      chatSaveGuardByMessageId.set(msg.id, {
        requested: true,
        expectedPaths: [...pendingChatSaveGuard.expectedPaths]
      });
    }
    if (chatId !== currentChatId) return;
    if (msg.role === "assistant" && !msg.error) activeStreamingMessageIds.add(msg.id);
    appendMessage(msg);
    maybeAutoScroll();
  }));

  registerIpcListener(window.api.chat.onChunk((chatId, msgId, _chunk) => {
    if (chatId !== currentChatId) return;
    const existing = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    const updated = existing + _chunk;
    updateMessageContent(msgId, updated, false, false);
    scheduleChunkAutoScroll();
  }));

  registerIpcListener(window.api.chat.onDone((chatId, msgId) => {
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        pendingChatSaveGuard = null;
        setStreamingUi(false);
        void loadChatList();
      }
    }
    void maybeGenerateTitle(chatId);

    if (chatId !== currentChatId) return;
    const raw = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    updateMessageContent(msgId, raw, true);
    applyChatSaveGuard(msgId);
    flushChunkAutoScroll();
  }));

  registerIpcListener(window.api.chat.onError((chatId, msgId, err) => {
    chatSaveGuardByMessageId.delete(msgId);
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        pendingChatSaveGuard = null;
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
      }
    } else {
      scheduleVirtualRender(true);
    }
    flushChunkAutoScroll();
    showToast("Error: " + err, 4000);
  }));

  registerIpcListener(window.api.agent.onChanged((payload) => {
    lastAgentTaskChangeAt = Date.now();
    const changedTaskId = (payload?.taskId ?? "").trim();
    const activeTaskId = (activeAgentTaskId ?? "").trim();
    const isLogEvent = payload?.reason === "log";
    const shouldForceLogs = isLogEvent && (!changedTaskId || changedTaskId === activeTaskId);
    if (isLogEvent && activeTaskId && changedTaskId && changedTaskId !== activeTaskId) {
      scheduleAgentTaskRefreshFromEvent(false);
      return;
    }
    scheduleAgentTaskRefreshFromEvent(shouldForceLogs);
  }));

  registerIpcListener(window.api.settings.onChanged(() => {
    void syncSettingsAcrossWindows();
  }));

  registerIpcListener(window.api.router.onStateChanged(() => {
    void syncRouterStateAcrossWindows();
  }));

  registerIpcListener(window.api.mcp.onChanged(() => {
    const panel = $("right-panel");
    if (panel.style.display !== "none" && (panel.dataset["openTab"] ?? "") === "router") {
      void refreshMcpStatus();
    }
  }));

  registerIpcListener(window.api.claude.onOutput((payload) => {
    if (
      suppressClaudeExitNotice
      && payload.stream === "system"
      && /Claude Code exited/i.test(payload.text)
    ) {
      return;
    }
    claudeSessionRunning = true;
    const stream = payload.stream === "stderr" ? "stderr" : payload.stream === "system" ? "system" : "stdout";
    appendClaudeLine(payload.text, stream);
    setClaudeStatus("Running...", "busy");
  }));

  registerIpcListener(window.api.claude.onError((message) => {
      claudeSessionRunning = false;
      claudeSessionChatId = null;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
    appendClaudeLine(message, "stderr");
    finalizeClaudeAssistantMessage(true);
    maybeShowClaudeRateLimitResumeGuidance(message);
    setClaudeStatus(message, "err");
    setStreamingUi(false);
    showToast(message, 3500);
  }));

  registerIpcListener(window.api.claude.onExit((payload) => {
    const normalCompletion = payload.code === 0 && payload.signal === null;
    const suppressExitNotice = suppressClaudeExitNotice;
    suppressClaudeExitNotice = false;
    const msgId = activeClaudeAssistantMessageId;
      const permissions = {
        allowedPaths: [...pendingClaudeManagedPermissions.allowedPaths],
        allowedRoots: [...pendingClaudeManagedPermissions.allowedRoots]
      };
      const baselines = pendingClaudeManagedBaselines.map((item) => ({ ...item }));
      const managedMode = pendingClaudeManagedMode;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
    finalizeClaudeAssistantMessage(true);
      setStreamingUi(false);
      if (msgId && managedMode !== "none") {
        void applyManagedClaudeEdits(msgId, permissions, managedMode, baselines);
      }
    if (managedMode !== "none") {
      void resetClaudeSessionAfterManagedWrite();
    }
    if (normalCompletion) {
      if (!claudeSessionResetting) {
        setClaudeStatus("Ready for next prompt", "ok");
        claudeSessionRunning = true;
        if (currentChatId) claudeSessionChatId = currentChatId;
      }
      return;
    }
    claudeSessionRunning = false;
    claudeSessionChatId = null;
    if (suppressExitNotice) return;
    const detail = `Claude Code session closed${typeof payload.code === "number" ? ` (code ${payload.code})` : ""}.`;
    appendClaudeLine(detail, "system");
    setClaudeStatus("Stopped", "");
  }));

  registerIpcListener(window.api.router.onLog((line) => {
    const log = $("router-log");
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
  }));
}

// â”€â”€ Router Panel â”€â”€
async function refreshAgentTask(forceLogs = false): Promise<void> {
  const tasks = await window.api.agent.listTasks();
  await refreshAgentTaskTargetStates(tasks);
  await refreshAgentSnapshots();
  let needsHistoryRerender = false;
  renderAgentHistory(tasks);
  if (!activeAgentTaskId) {
    const fallbackTask = tasks[0] ?? null;
    if (!fallbackTask) {
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
      return;
    }
    activeAgentTaskId = fallbackTask.id;
    needsHistoryRerender = true;
  }

  let task = await window.api.agent.getTask(activeAgentTaskId);
  if (!task) {
    const fallbackTask = tasks.find((item) => item.id !== activeAgentTaskId) ?? null;
    if (fallbackTask) {
      activeAgentTaskId = fallbackTask.id;
      needsHistoryRerender = true;
      task = await window.api.agent.getTask(fallbackTask.id);
    }
    if (!task) {
      activeAgentTaskId = null;
      activeAgentTaskStatus = null;
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
      setAgentStatus("Agent task not found.", "err");
      return;
    }
  }

  if (needsHistoryRerender) {
    renderAgentHistory(tasks);
  }

  const previousTaskStatus = activeAgentTaskId === task.id ? activeAgentTaskStatus : null;
  activeAgentTaskStatus = task.status;
  const shouldFetchLogs =
    forceLogs ||
    task.status === "running" ||
    task.status === "failed" ||
    task.status === "completed";
  const restoreState = getRestoreStateForTask(task);
  if (shouldQueueDesktopLaunchPrompt(task, previousTaskStatus, restoreState)) {
    pendingDesktopLaunchPromptTasks.add(task.id);
  }
  const logs = shouldFetchLogs ? await window.api.agent.getLogs(task.id) : [];
  renderAgentTask(task, logs);
  await refreshAgentRouteDiagnostics(task.id);
  void updateAgentTaskInChat(task, logs);

  if (
    task.status === "completed" &&
    isTaskPreviewable(task) &&
    pendingAutoOpenAgentPreviewTaskId === task.id &&
    !autoOpenedAgentPreviewTasks.has(task.id) &&
    restoreState?.snapshotKind !== "before-task"
  ) {
    const parsed = parseAgentMessageContent(buildAgentChatContent(task, logs));
    if (isPreviewableAgentResult(parsed)) {
      pendingAutoOpenAgentPreviewTaskId = null;
      autoOpenedAgentPreviewTasks.add(task.id);
      void openManagedPreview(task.targetPath!, parsed.previewUrl ?? "", true).catch(() => {
        showToast("Preview open failed", 2200);
      });
    }
  }

  if (task.status !== "running" && pendingAutoOpenAgentPreviewTaskId === task.id) {
    pendingAutoOpenAgentPreviewTaskId = null;
  }

  if (
    pendingDesktopLaunchPromptTasks.has(task.id)
    && !handledDesktopLaunchPromptTasks.has(task.id)
    && canPromptToLaunchDesktopApp(task)
    && restoreState?.snapshotKind !== "before-task"
  ) {
    void promptToLaunchDesktopApp(task);
  } else if (task.status !== "running" && !canPromptToLaunchDesktopApp(task)) {
    pendingDesktopLaunchPromptTasks.delete(task.id);
  }

  const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
  const activity = buildAgentActivityLabel(task);
  setAgentStatus(
    task.status === "running"
      ? activity
      : task.summary || activity || `Agent task ${task.status}.`,
    tone
  );
  if (task.status === "running") {
    setStreamingUi(true, activity);
  } else {
    setStreamingUi(false);
  }

  if (task.status !== "running" && agentPollTimer) {
    clearInterval(agentPollTimer);
    agentPollTimer = null;
  }
}

function completedTaskIsRecent(task: AgentTask, withinMs = 20_000): boolean {
  const completedAt = Date.parse(task.updatedAt);
  if (Number.isNaN(completedAt)) return false;
  return Date.now() - completedAt <= withinMs;
}

function shouldQueueDesktopLaunchPrompt(
  task: AgentTask,
  previousStatus: AgentTask["status"] | null,
  restoreState: AgentSnapshotRestoreResult | null
): boolean {
  if (handledDesktopLaunchPromptTasks.has(task.id)) return false;
  if (!canPromptToLaunchDesktopApp(task)) return false;
  if (restoreState?.snapshotKind === "before-task") return false;
  if (pendingDesktopLaunchPromptTasks.has(task.id)) return true;
  if (previousStatus === "running") return true;
  return completedTaskIsRecent(task);
}

async function init() {
  $("theme-toggle-btn").onclick = toggleTheme;
  applySidebarWidth(getInitialSidebarWidth(), false);
  applyRightPanelWidth(getInitialRightPanelWidth(), false);
  applyTheme(getInitialTheme());
  applyUiExperience(getInitialUiExperience());
  void loadAppInfo();
  $("panel-close-btn").onclick = closeRightPanel;

  $("settings-toggle-btn").onclick = () => {
    const panel = $("right-panel");
    const openTab = panel.dataset["openTab"] ?? "";
    if (panel.style.display !== "none" && openTab === "settings") {
      closeRightPanel();
      return;
    }
    openPanel("settings");
  };
  const routerToggleBtn = document.getElementById(ROUTER_TOGGLE_BUTTON_ID);
  if (routerToggleBtn instanceof HTMLButtonElement) {
    routerToggleBtn.onclick = () => {
      const panel = $("right-panel");
      const openTab = panel.dataset["openTab"] ?? "";
      if (panel.style.display !== "none" && openTab === "router") {
        closeRightPanel();
        return;
      }
      openPanel("router");
    };
  }
  const agentToggleBtn = document.getElementById(AGENT_TOGGLE_BUTTON_ID);
  if (agentToggleBtn instanceof HTMLButtonElement) {
    agentToggleBtn.onclick = () => {
      const panel = $("right-panel");
      const openTab = panel.dataset["openTab"] ?? "";
      if (panel.style.display !== "none" && openTab === "agent") {
        closeRightPanel();
        return;
      }
      openPanel("agent");
    };
  }
  $("new-window-btn").onclick = () => {
    void openFreshWorkspaceWindow();
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
    window.addEventListener("beforeunload", teardownIpcListeners, { once: true });
    setupChatListSearch();
    setupComposer();
    setupVoiceInput();
    setupComposerTools();
    setupPreviewPanel();
    setupClaudePanel();
    setupModeSwitcher();
    setupSidebarResizeControls();
    setupRightPanelResizeControls();
    setupCompareControls();
    setupOllamaControls();
    setupMcpControls();
    setupAgentControls();
    setupOnboardingControls();
    setupGuidedUiControls();
    setupMessageInteractions();
    setupKeyboardShortcuts();
  } catch (err) {
    console.error("UI setup failed:", err);
  }

  renderComposerAttachments();
  applyRawMode(rawModeEnabled);
  hideSummaryOverlay();
  updateScrollBottomButton();

  mountTopbarControls();

  // New chat
  $("new-chat-btn").onclick = async () => {
    await createNewChat();
  };
  $("import-chat-btn").onclick = async () => {
    const res = await window.api.chat.import();
    showToast(res.message, res.ok ? 2200 : 3200);
    if (res.ok && res.chat?.id) {
      await loadChatList();
      await loadChat(res.chat.id);
    }
  };

  // Send
  $("send-btn").onclick = () => sendMessage();

  // Stop
  $("stop-btn").onclick = async () => {
    if (currentInteractionMode === "agent" && activeAgentTaskId) {
      const stopped = await window.api.agent.stopTask(activeAgentTaskId);
      if (stopped) {
        setAgentStatus("Stop requested.");
        showToast("Agent stop requested.", 1800);
        void refreshAgentTask(true);
      } else {
        showToast("No running agent task to stop.", 2000);
      }
      return;
    }
    if (currentMode === "claude" || currentMode === "edit" || activeClaudeAssistantMessageId) {
      await stopClaudeSessionFromUi();
      return;
    }
    const targetChatId = activeStreamChatId ?? currentChatId;
    if (targetChatId) await window.api.chat.stop(targetChatId);
  };

  const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
  if (scrollBottomBtn instanceof HTMLButtonElement) {
    scrollBottomBtn.onclick = () => {
      scrollToBottom(true);
    };
  }

  // Rename
  $("rename-btn").onclick = openRenameModal;
  $("summary-dismiss-btn").onclick = hideSummaryOverlay;
  $("summarize-btn").onclick = () => {
    void summarizeCurrentChat();
  };
  $("image-history-btn").onclick = () => {
    void openImageHistoryModal();
  };
  $("raw-toggle-btn").onclick = () => {
    applyRawMode(!rawModeEnabled);
  };
  $("stats-btn").onclick = () => {
    void openStatsModal();
  };
  $("ui-mode-toggle-btn").onclick = toggleUiExperience;
  const interactionAgentBtn = document.getElementById("interaction-agent-btn");
  if (interactionAgentBtn instanceof HTMLButtonElement) {
    interactionAgentBtn.onclick = () => applyInteractionMode("agent");
  }
  const interactionImageBtn = document.getElementById("generate-image-btn");
  if (interactionImageBtn instanceof HTMLButtonElement) {
    interactionImageBtn.onclick = () => applyInteractionMode("image");
  }
  const quickOllamaBtn = document.getElementById("quick-ollama-btn");
  if (quickOllamaBtn instanceof HTMLButtonElement) {
    quickOllamaBtn.onclick = () => {
      setProviderMode("ollama");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickOpenRouterBtn = document.getElementById("quick-openrouter-btn");
  if (quickOpenRouterBtn instanceof HTMLButtonElement) {
    quickOpenRouterBtn.onclick = () => {
      setProviderMode("openrouter");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickNvidiaBtn = document.getElementById("quick-nvidia-btn");
  if (quickNvidiaBtn instanceof HTMLButtonElement) {
    quickNvidiaBtn.onclick = () => {
      setProviderMode("nvidia");
      void syncChatContextAfterUiChange();
      openPanel("settings");
    };
  }
  const quickClaudeBtn = document.getElementById("quick-claude-btn");
  if (quickClaudeBtn instanceof HTMLButtonElement) {
    quickClaudeBtn.onclick = async () => {
      if (currentMode === "claude" || currentMode === "edit") {
        await stopClaudeSessionFromUi("Claude Code stopped.");
        applyMode("write");
        void syncChatContextAfterUiChange();
        return;
      }
      applyMode("claude");
      void syncChatContextAfterUiChange();
    };
  }
  const statsCloseBtn = document.getElementById("stats-close-btn");
  if (statsCloseBtn instanceof HTMLButtonElement) {
    statsCloseBtn.onclick = closeStatsModal;
  }
  $("managed-save-apply-btn").onclick = () => {
    void confirmManagedSavePreview();
  };
  $("managed-save-cancel-btn").onclick = cancelManagedSavePreview;
  $("managed-save-preview-close-btn").onclick = cancelManagedSavePreview;
  $("managed-save-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) cancelManagedSavePreview();
  });
  $("image-generation-submit-btn").onclick = () => {
    void submitImageGeneration();
  };
  $("image-generation-cancel-btn").onclick = () => {
    closeImageGenerationModal();
  };
  $("image-generation-close-btn").onclick = () => {
    closeImageGenerationModal();
  };
  $("image-generation-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImageGenerationModal();
  });
  $("image-generation-prompt-input").addEventListener("keydown", (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeImageGenerationModal();
      return;
    }
    if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
      keyboardEvent.preventDefault();
      void submitImageGeneration();
    }
  });
  const imageGenerationModelInput = document.getElementById("image-generation-model-input");
  const imageStudioPromptInput = document.getElementById("image-studio-prompt-input");
  const imageStudioGenerateBtn = document.getElementById("image-studio-generate-btn");
  const imageStudioRefreshBtn = document.getElementById("image-studio-refresh-btn");
  const imageStudioClearBtn = document.getElementById("image-studio-clear-btn");
  const imageStudioSearchInput = document.getElementById("image-studio-search-input");
  const imageStudioSortSelect = document.getElementById("image-studio-sort-select");
  const initialImageProvider = getActiveImageGenerationProvider();
  populateImageGenerationAspectRatioOptions();
  refreshImageGenerationModelOptions(initialImageProvider);
  updateImageGenerationModalHelp(initialImageProvider);
  if (imageGenerationModelInput instanceof HTMLInputElement) {
    imageGenerationModelInput.value = getDefaultImageGenerationModel(initialImageProvider);
  }
  syncImageStudioControls(false);
  document.getElementById("image-provider-openrouter-btn")?.addEventListener("click", () => {
    void setImageProvider("openrouter");
  });
  document.getElementById("image-provider-nvidia-btn")?.addEventListener("click", () => {
    void setImageProvider("nvidia");
  });
  document.getElementById("image-provider-comfyui-btn")?.addEventListener("click", () => {
    void setImageProvider("comfyui");
  });
  if (imageStudioGenerateBtn instanceof HTMLButtonElement) {
    imageStudioGenerateBtn.onclick = () => {
      void submitImageStudioGeneration();
    };
  }
  if (imageStudioRefreshBtn instanceof HTMLButtonElement) {
    imageStudioRefreshBtn.onclick = () => {
      void refreshImageHistory();
    };
  }
  if (imageStudioClearBtn instanceof HTMLButtonElement) {
    imageStudioClearBtn.onclick = () => {
      if (imageStudioPromptInput instanceof HTMLTextAreaElement) {
        imageStudioPromptInput.value = "";
        imageStudioPromptInput.focus();
      }
      setImageStudioStatus("Prompt cleared.");
    };
  }
  if (imageStudioPromptInput instanceof HTMLTextAreaElement) {
    imageStudioPromptInput.addEventListener("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
        keyboardEvent.preventDefault();
        void submitImageStudioGeneration();
      }
    });
  }
  if (imageStudioSearchInput instanceof HTMLInputElement) {
    imageStudioSearchInput.value = imageStudioSearchQuery;
    imageStudioSearchInput.addEventListener("input", () => {
      imageStudioSearchQuery = imageStudioSearchInput.value;
      renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
    });
  }
  if (imageStudioSortSelect instanceof HTMLSelectElement) {
    imageStudioSortMode = parseImageStudioSortMode(imageStudioSortSelect.value);
    imageStudioSortSelect.value = imageStudioSortMode;
    imageStudioSortSelect.addEventListener("change", () => {
      imageStudioSortMode = parseImageStudioSortMode(imageStudioSortSelect.value);
      imageStudioSortSelect.value = imageStudioSortMode;
      renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
    });
  }
  $("image-history-refresh-btn").onclick = () => {
    void refreshImageHistory();
  };
  $("image-history-close-btn").onclick = closeImageHistoryModal;
  $("image-history-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImageHistoryModal();
  });
  $("image-preview-close-btn").onclick = closeImagePreviewModal;
  $("image-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeImagePreviewModal();
  });
  $("snapshot-restore-confirm-btn").onclick = async () => {
    const snapshotId = pendingSnapshotRestoreId;
    if (!snapshotId) return;
    closeSnapshotRestoreModal();
    try {
      const result = await window.api.agent.restoreSnapshot(snapshotId);
      activeAgentRestoreState = result.ok ? result : null;
      if (result.ok && result.taskId) {
        activeAgentTaskId = result.taskId;
        syncActiveAgentTaskSelectionUi();
        if (result.snapshotKind === "after-task") {
          pendingAutoOpenAgentPreviewTaskId = result.taskId;
          autoOpenedAgentPreviewTasks.delete(result.taskId);
        }
        await refreshAgentTask(true);
      } else {
        await refreshAgentSnapshots();
      }
      reportSnapshotRestoreResult(result.message, result.ok);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore snapshot.";
      activeAgentRestoreState = null;
      reportSnapshotRestoreResult(message, false);
    }
  };
  $("snapshot-restore-cancel-btn").onclick = closeSnapshotRestoreModal;
  $("snapshot-restore-close-btn").onclick = closeSnapshotRestoreModal;
  $("snapshot-restore-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeSnapshotRestoreModal();
  });
  $("agent-target-modal-suggest-btn").onclick = () => {
    closeAgentTargetPromptModal("suggested");
  };
  $("agent-target-modal-choose-btn").onclick = () => {
    closeAgentTargetPromptModal("choose");
  };
  $("agent-target-modal-skip-btn").onclick = () => {
    closeAgentTargetPromptModal("skip");
  };
  $("agent-target-modal-cancel-btn").onclick = () => {
    closeAgentTargetPromptModal(null);
  };
  $("agent-target-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeAgentTargetPromptModal(null);
  });
  $("code-preview-close-btn").onclick = closeCodePreview;
  $("code-preview-modal").addEventListener("click", (event: Event) => {
    if (event.target === event.currentTarget) closeCodePreview();
  });
  const statsModal = document.getElementById("stats-modal");
  if (statsModal) {
    statsModal.addEventListener("click", (event: Event) => {
      if (event.target === event.currentTarget) closeStatsModal();
    });
  }
  $("export-btn").onclick = async () => {
    if (!currentChatId) return;
    await exportChatById(currentChatId);
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
  $("rename-cancel-btn").onclick = closeRenameModal;
  $("rename-input").addEventListener("keydown", (e: Event) => {
    if ((e as KeyboardEvent).key === "Enter") confirmRename();
    if ((e as KeyboardEvent).key === "Escape") closeRenameModal();
  });

  // Settings
  $("save-settings-btn").onclick = saveSettings;
  const claudeChatFsRootList = document.getElementById("claude-chat-fs-root-list");
  claudeChatFsRootList?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  claudeChatFsRootList?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  claudeChatFsRootList?.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["role"] !== "remove") return;
    const index = Number.parseInt(target.dataset["index"] ?? "", 10);
    if (!Number.isFinite(index)) return;
    const nextRoots = getClaudeChatFilesystemRootDraftsFromUi().filter((_, itemIndex) => itemIndex !== index);
    renderClaudeChatFilesystemSettingsUi({
      ...getClaudeChatFilesystemSettingsDraft(),
      roots: nextRoots.map((item) => item.path),
      rootConfigs: nextRoots
    });
  });
  const claudeChatFsWriteToggle = document.getElementById("claude-chat-fs-write-toggle");
  claudeChatFsWriteToggle?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-overwrite-policy")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-temp-roots")?.addEventListener("input", () => {
    const draft = getClaudeChatFilesystemSettingsDraft();
    temporaryClaudeChatFilesystemRoots = [...draft.temporaryRoots];
    renderClaudeChatFilesystemSettingsUi(draft);
  });
  document.getElementById("claude-chat-fs-max-files")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-max-bytes")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-max-tools")?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-plan-toggle")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  document.getElementById("claude-chat-fs-audit-toggle")?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  $("claude-chat-fs-add-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pickWritableRoots();
    const draft = getClaudeChatFilesystemSettingsDraft();
    const nextRoots = normalizeClaudeChatFilesystemRootDrafts([
      ...draft.rootConfigs,
      ...picked.map((item) => ({
        path: item.writableRoot ?? "",
        allowWrite: draft.allowWrite,
        overwritePolicy: draft.overwritePolicy
      }))
    ], draft.allowWrite, draft.overwritePolicy);
    renderClaudeChatFilesystemSettingsUi({
      ...draft,
      roots: nextRoots.map((item) => item.path),
      rootConfigs: nextRoots
    });
    showToast(nextRoots.length > 0 ? "Claude chat folders updated. Save Settings dabao." : "No folders selected.", 2400);
  });
  $("claude-chat-fs-add-row-btn").addEventListener("click", () => {
    const draft = getClaudeChatFilesystemSettingsDraft();
    const nextRoots = [
      ...draft.rootConfigs,
      {
        path: "",
        label: "",
        allowWrite: draft.allowWrite,
        overwritePolicy: draft.overwritePolicy
      }
    ];
    renderClaudeChatFilesystemSettingsUi({
      ...draft,
      roots: nextRoots.map((item) => item.path).filter(Boolean),
      rootConfigs: nextRoots
    });
  });
  $("claude-chat-fs-add-temp-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pickWritableRoots();
    temporaryClaudeChatFilesystemRoots = normalizeClaudeChatFilesystemRoots([
      ...temporaryClaudeChatFilesystemRoots,
      ...picked.map((item) => item.writableRoot ?? "").filter(Boolean)
    ]);
    renderClaudeChatFilesystemSettingsUi({
      ...getClaudeChatFilesystemSettingsDraft(),
      temporaryRoots: temporaryClaudeChatFilesystemRoots
    });
    showToast(temporaryClaudeChatFilesystemRoots.length > 0 ? "Temporary Claude folders updated for this session." : "No temporary folders selected.", 2400);
  });
  $("claude-chat-fs-clear-btn").addEventListener("click", () => {
    temporaryClaudeChatFilesystemRoots = [];
    renderClaudeChatFilesystemSettingsUi({
      roots: [],
      allowWrite: false,
      overwritePolicy: "allow-overwrite",
      rootConfigs: [],
      temporaryRoots: [],
      budgets: {},
      auditEnabled: true,
      requireWritePlan: false
    });
    showToast("Claude chat folders cleared. Save Settings dabao.", 2200);
  });
  $("model-select").addEventListener("change", () => {
    void syncChatContextAfterUiChange();
  });
  $("compare-model-select").addEventListener("change", () => {
    void syncChatContextAfterUiChange();
  });
  const defaultModelSelect = document.getElementById("default-model-select");
  defaultModelSelect?.addEventListener("change", () => {
    const select = defaultModelSelect as HTMLSelectElement;
    const value = (select.value ?? "").trim();
    if (!value) return;
    ($("default-model-input") as HTMLInputElement).value = value;
  });
  $("default-model-input").addEventListener("input", () => {
    populateSettingsDefaultModelSelect();
    refreshRouteStrategyUi();
  });
  $("api-key-input").addEventListener("input", refreshRouteStrategyUi);
  $("models-textarea").addEventListener("input", refreshRouteStrategyUi);
  $("route-default-select").addEventListener("change", refreshRouteStrategyUi);
  $("route-think-select").addEventListener("change", refreshRouteStrategyUi);
  $("route-long-context-select").addEventListener("change", refreshRouteStrategyUi);
  $("fill-models-btn").onclick = () => {
    const area = $("models-textarea") as HTMLTextAreaElement;
    const defaultInput = $("default-model-input") as HTMLInputElement;
    if (providerMode === "ollama") {
      const ollamaModels = (settings?.ollamaModels ?? []).map((model) => `ollama/${model}`);
      area.value = ollamaModels.join("\n");
      if (!defaultInput.value.trim().startsWith("ollama/")) {
        defaultInput.value = ollamaModels[0] ?? "";
      }
      populateSettingsDefaultModelSelect();
      refreshRouteStrategyUi();
      showToast(ollamaModels.length > 0 ? "Ollama models list updated. Save Settings dabao." : "No Ollama models found. Refresh first.", 2500);
      return;
    }
    if (providerMode === "nvidia") {
      area.value = NVIDIA_RECOMMENDED_MODELS.join("\n");
      if (!defaultInput.value.trim() || defaultInput.value.trim().startsWith("ollama/")) {
        defaultInput.value = NVIDIA_RECOMMENDED_MODELS[0];
      }
      populateSettingsDefaultModelSelect();
      refreshRouteStrategyUi();
      showToast("NVIDIA recommended models add ho gaye. Save Settings dabao.", 2600);
      return;
    }

    area.value = RECOMMENDED_MODELS.join("\n");
    if (!defaultInput.value.trim() || defaultInput.value.trim().startsWith("ollama/")) {
      defaultInput.value = RECOMMENDED_MODELS[0];
    }
    populateSettingsDefaultModelSelect();
    refreshRouteStrategyUi();
    showToast("OpenRouter recommended models add ho gaye. Save Settings dabao.");
  };
  $("test-conn-btn").onclick = async () => {
    if (providerMode === "ollama") {
      setStatus("Switch to a cloud provider to test connection.", "");
      showToast("Provider is Ollama. Cloud connection test is disabled.", 2200);
      return;
    }
    const providerName = getProviderDisplayName(providerMode);
    setStatus(`Testing ${providerName}...`, "");
    const res = await window.api.router.test();
    setStatus(res.message, res.ok ? "ok" : "err");
    showToast(res.ok ? `${providerName} connection passed.` : `${providerName} connection failed.`, res.ok ? 2200 : 3200);
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
    await refreshRouterStatus({ includeLogs: true });
  };
  $("stop-router-btn").onclick = async () => {
    const res = await window.api.router.stop();
    setRouterMsg(res.message);
    await refreshRouterStatus({ includeLogs: true });
  };
  document.getElementById("refresh-diagnostics-btn")?.addEventListener("click", () => {
    void refreshRouterStatus({ includeLogs: true });
  });

  try {
    await loadSettings();
    applyInteractionMode("chat");
    await refreshMcpStatus();
    const agentTasks = await window.api.agent.listTasks();
    activeAgentRestoreState = await window.api.agent.getRestoreState();
    await refreshAgentTaskTargetStates(agentTasks);
    await refreshAgentSnapshots();
    if (agentTasks.length > 0) {
      const restoreTaskId = activeAgentRestoreState?.taskId ?? "";
      const restoredTask = agentTasks.find((task) => task.id === restoreTaskId) ?? null;
      const selectedTask = restoredTask ?? agentTasks[0];
      activeAgentTaskId = selectedTask.id;
    }
    renderAgentHistory(agentTasks);
    if (agentTasks.length > 0) {
      const selectedTask = agentTasks.find((task) => task.id === activeAgentTaskId) ?? agentTasks[0];
      if (selectedTask.status === "running") ensureAgentPolling();
      await refreshAgentTask(true);
    } else {
      renderAgentTask(null, []);
      await refreshAgentRouteDiagnostics();
    }
    await loadChatList();
    const initialChatId = getInitialChatIdFromLocation();
    if (initialChatId && cachedChatSummaries.some((chat) => chat.id === initialChatId)) {
      await loadChat(initialChatId);
    } else if (shouldOpenDraftChatFromLocation()) {
      openDraftChat();
    }
    const routerStatus = await window.api.router.status();
    if (!routerStatus.running) {
      showToast("Starting router...", 1800);
      const log = $("router-log");
      log.textContent += "[Auto] Starting router...\n";
      const started = await window.api.router.start();
      log.textContent += `[Auto] ${started.message}\n`;
      log.scrollTop = log.scrollHeight;
      await refreshRouterStatus({ includeLogs: true });
    }
    if (shouldShowOnboarding()) {
      showOnboarding();
    }
  } catch (err) {
    console.error("Initial load failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load settings: ${message}`, "err");
    showToast(`Initial data load failed: ${message}`, 4500);
  }
}

document.addEventListener("DOMContentLoaded", init);


