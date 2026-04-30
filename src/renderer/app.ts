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

function nextClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureActiveChatId(): Promise<string> {
  let chatId = currentChatId;
  if (!chatId) {
    chatId = await createNewChat(false, activeChatContext ?? getActiveUiChatContext());
  }
  return chatId;
}

function ensureClaudeAssistantMessage(): string {
  const existingId = activeClaudeAssistantMessageId;
  if (existingId && renderedMessages.some((msg) => msg.id === existingId)) {
    return existingId;
  }

  const id = nextClientMessageId("claude-assistant");
  const message: Message = {
    id,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    model: CLAUDE_MODEL_LABEL
  };
  appendMessage(message);
  if (currentChatId) {
    void window.api.chat.appendMessage(currentChatId, message);
    void loadChatList();
  }
  activeStreamingMessageIds.add(id);
  activeClaudeAssistantMessageId = id;
  return id;
}

function scheduleClaudeMessageRender(msgId: string): void {
  claudeRenderMessageId = msgId;
  if (claudeRenderTimer) return;
  claudeRenderTimer = setTimeout(() => {
    claudeRenderTimer = null;
    const targetId = claudeRenderMessageId;
    if (!targetId) return;
    const draft = claudeDraftByMessage.get(targetId);
    if (typeof draft === "string") updateMessageContent(targetId, draft, false, false);
    claudeRenderMessageId = null;
  }, CLAUDE_RENDER_BATCH_MS);
}

function flushClaudeMessageRender(msgId: string, done: boolean): void {
  if (claudeRenderTimer) {
    clearTimeout(claudeRenderTimer);
    claudeRenderTimer = null;
  }
  claudeRenderMessageId = null;

  const draft = claudeDraftByMessage.get(msgId);
  if (typeof draft === "string") {
    updateMessageContent(msgId, draft, done, false);
    if (done) claudeDraftByMessage.delete(msgId);
    return;
  }

  if (done) {
    const raw = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    updateMessageContent(msgId, raw, true, false);
  }
}

function shouldVerifyClaudeSave(prompt: string, attachments: AttachmentPayload[]): ClaudeSaveGuard | null {
  const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
  const asksForSave = /(^|[\s,.:;])save($|[\s,.:;])/.test(normalizedPrompt)
    || normalizedPrompt.includes("edit and save")
    || normalizedPrompt.includes("edit aur save")
    || normalizedPrompt.includes("save kar")
    || normalizedPrompt.includes("same files")
    || normalizedPrompt.includes("directly edit");
  if (!asksForSave) return null;

  const expectedPaths = [
    ...getEditableSourcePaths(attachments),
    ...getWritableRootPaths(attachments)
  ];
  if (expectedPaths.length === 0) return null;

  return { requested: true, expectedPaths };
}

function verifyClaudeSaveClaim(content: string, guard: ClaudeSaveGuard | null): { verified: boolean; reason: string } {
  if (!guard?.requested) return { verified: true, reason: "" };

  const normalized = (content ?? "").trim().toLowerCase();
  if (!normalized) return { verified: false, reason: "No save confirmation was found." };
  if (normalized.includes("i could not save the files")) {
    return { verified: false, reason: "Claude explicitly said it could not save the files." };
  }

  const saveClaimed = normalized.includes("saved files")
    || normalized.includes("changes were made")
    || normalized.includes("i changed")
    || normalized.includes("i edited")
    || normalized.includes("i have edited")
    || normalized.includes("i've applied")
    || normalized.includes("applied the changes")
    || normalized.includes("directly edit and save")
    || normalized.includes("save kar diya")
    || normalized.includes("same files edit");

  if (!saveClaimed) {
    return { verified: false, reason: "Claude did not provide a trustworthy saved-files confirmation." };
  }

  const hasAnyExpectedPath = guard.expectedPaths.some((path) => normalized.includes(path.toLowerCase()));
  if (!hasAnyExpectedPath) {
    return { verified: false, reason: "No exact saved file path was listed in the response." };
  }

  return { verified: true, reason: "" };
}

function applyClaudeSaveGuard(msgId: string): void {
  const guard = pendingClaudeSaveGuard;
  pendingClaudeSaveGuard = null;
  if (!guard?.requested) return;

  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const verdict = verifyClaudeSaveClaim(current, guard);
  if (verdict.verified) return;

  const warning = [
    "[Save not verified]",
    verdict.reason,
    "Treat this response as unverified unless the exact saved file paths are listed.",
    ""
  ].join("\n");

  const next = `${warning}${current}`.trim();
  updateMessageContent(msgId, next, true, false);
  showToast("Claude save not verified.", 3200);
}

function applyChatSaveGuard(msgId: string): void {
  const guard = chatSaveGuardByMessageId.get(msgId) ?? null;
  chatSaveGuardByMessageId.delete(msgId);
  if (!guard?.requested) return;

  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const verdict = verifyClaudeSaveClaim(current, guard);
  if (verdict.verified) return;

  const next = [
    "[Save not verified]",
    verdict.reason,
    "Treat this response as unverified unless the exact saved file paths are listed.",
    "",
    current
  ].join("\n").trim();

  updateMessageContent(msgId, next, true, false);
  showToast("Model save not verified.", 3200);
}

function resetClaudeRenderState(): void {
  if (claudeRenderTimer) {
    clearTimeout(claudeRenderTimer);
    claudeRenderTimer = null;
  }
  claudeRenderMessageId = null;
  claudeDraftByMessage.clear();
  activeClaudeAssistantMessageId = null;
  pendingClaudeSaveGuard = null;
  pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
  pendingClaudeManagedBaselines = [];
  pendingClaudeManagedMode = "none";
  pendingChatSaveGuard = null;
  const previewModal = document.getElementById("managed-save-preview-modal");
  if (previewModal instanceof HTMLElement) previewModal.style.display = "none";
  pendingManagedSavePreview = null;
  chatSaveGuardByMessageId.clear();
}

function appendClaudeLine(text: string, kind: "stdout" | "stderr" | "system" | "user" = "stdout"): void {
  const normalized = (text ?? "").replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) return;

  if (kind === "user") {
    const message: Message = {
      id: nextClientMessageId("claude-user"),
      role: "user",
      content: lines.join("\n"),
      createdAt: new Date().toISOString()
    };
    appendMessage(message);
    if (currentChatId) {
      void window.api.chat.appendMessage(currentChatId, message);
      void loadChatList();
    }
    activeClaudeAssistantMessageId = null;
    refreshClaudeSafetyPanel();
    maybeAutoScroll();
    return;
  }

  if (kind === "system") {
    const message: Message = {
      id: nextClientMessageId("claude-system"),
      role: "system",
      content: lines.join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        systemNotice: true
      }
    };
    appendMessage(message);
    if (currentChatId) {
      void window.api.chat.appendMessage(currentChatId, message);
      void loadChatList();
    }
    refreshClaudeSafetyPanel();
    maybeAutoScroll();
    return;
  }

  const msgId = ensureClaudeAssistantMessage();
  const previous = claudeDraftByMessage.get(msgId) ?? renderedMessages.find((msg) => msg.id === msgId)?.content ?? "";
  const mapped = lines.map((line) => kind === "stderr" ? `Error: ${line}` : line);
  const nextContent = [previous, mapped.join("\n")].filter(Boolean).join("\n");
  claudeDraftByMessage.set(msgId, nextContent);
  scheduleClaudeMessageRender(msgId);
  refreshClaudeSafetyPanel();
  scheduleChunkAutoScroll();
}

function finalizeClaudeAssistantMessage(done: boolean): void {
  const msgId = activeClaudeAssistantMessageId;
  if (!msgId) {
    pendingClaudeSaveGuard = null;
    pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
    pendingClaudeManagedBaselines = [];
    pendingClaudeManagedMode = "none";
    return;
  }
  flushClaudeMessageRender(msgId, done);
  if (done) applyClaudeSaveGuard(msgId);
  activeStreamingMessageIds.delete(msgId);
  claudeDraftByMessage.delete(msgId);
  if (done && currentChatId) {
    const content = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    void window.api.chat.updateMessage(currentChatId, msgId, { content });
    void loadChatList();
  }
  activeClaudeAssistantMessageId = null;
  refreshClaudeSafetyPanel();
}

function parseClaudeManagedEditResponse(content: string): { summary: string; edits: ClaudeManagedEdit[] } | null {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return null;

  const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = (jsonMatch?.[1] ?? trimmed).trim();

  const extractFirstJsonObject = (input: string): string | null => {
    const start = input.indexOf("{");
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, i + 1).trim();
        }
      }
    }

    return null;
  };

  const jsonCandidate = extractFirstJsonObject(candidate) ?? candidate;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { summary?: unknown; edits?: unknown };
  if (!Array.isArray(record.edits)) return null;

  const edits = record.edits
    .filter((item): item is { path?: unknown; content?: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({
      path: typeof item.path === "string" ? item.path.trim() : "",
      content: typeof item.content === "string" ? item.content : ""
    }))
    .filter((item) => item.path);

  return {
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    edits
  };
}

function buildManagedSaveResultLines(
  heading: string,
  summary: string,
  result: ClaudeApplyEditsResult | null,
  verification?: ManagedWriteVerificationReport | null
): string[] {
  const verificationLines = verification ? buildManagedWriteVerificationLines(verification) : [];
  if (!result) {
    return [
      heading,
      summary,
      ...verificationLines,
      "Saved files:",
      "- none",
      "Backup files:",
      "- none",
      "Unchanged files:",
      "- none",
      "Unsaved files:",
      "- none",
      "Result: No file changes were returned."
    ];
  }

  return [
    heading,
    summary,
    ...verificationLines,
    "Saved files:",
    ...(result.savedFiles.length > 0 ? result.savedFiles.map((path) => `- ${path}`) : ["- none"]),
    "Backup files:",
    ...(result.backupFiles.length > 0
      ? result.backupFiles.map((item) => `- ${item.path} -> ${item.backupPath}`)
      : ["- none"]),
    "Unchanged files:",
    ...(result.unchangedFiles.length > 0 ? result.unchangedFiles.map((path) => `- ${path}`) : ["- none"]),
    "Unsaved files:",
    ...(result.failedFiles.length > 0 ? result.failedFiles.map((item) => `- ${item.path}: ${item.reason}`) : ["- none"]),
    `Result: ${result.message}`
  ];
}

function buildManagedWriteVerificationLines(report: ManagedWriteVerificationReport): string[] {
  const reviewer = report.reviewerModel ? ` (${report.reviewerModel})` : "";
  return [
    `Verification: ${report.status}${reviewer}`,
    report.summary || "No verification summary provided.",
    ...(report.findings.length > 0
      ? report.findings.map((finding) => `- ${finding.severity.toUpperCase()}${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`)
      : ["- No findings"])
  ];
}

async function verifyManagedEditsWithFallback(edits: ClaudeManagedEdit[]): Promise<ManagedWriteVerificationReport> {
  try {
    return await window.api.claude.verifyManagedEdits(edits);
  } catch (err) {
    return {
      ok: true,
      status: "skipped",
      summary: `Verification skipped: ${err instanceof Error ? err.message : "unknown error"}`,
      findings: []
    };
  }
}

async function repairManagedEditsWithFallback(
  edits: ClaudeManagedEdit[],
  verification: ManagedWriteVerificationReport
): Promise<ManagedWriteRepairResult> {
  try {
    return await window.api.claude.repairManagedEdits(edits, verification);
  } catch (err) {
    return {
      ok: false,
      summary: `Auto-repair failed: ${err instanceof Error ? err.message : "unknown error"}`,
      edits: [],
      error: err instanceof Error ? err.message : "unknown error"
    };
  }
}

function hideManagedSavePreview(): void {
  managedSaveApplying = false;
  pendingManagedSavePreview = null;
  const applyBtn = document.getElementById("managed-save-apply-btn");
  const cancelBtn = document.getElementById("managed-save-cancel-btn");
  const closeBtn = document.getElementById("managed-save-preview-close-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = false;
    applyBtn.textContent = "Save Changes";
  }
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
  if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = false;
  $("managed-save-preview-modal").style.display = "none";
}

function showManagedSavePreview(
  msgId: string,
  parsed: { summary: string; edits: ClaudeManagedEdit[] },
  permissions: ClaudeManagedEditPermissions,
  verification: ManagedWriteVerificationReport | null,
  baselines: ClaudeManagedEditBaseline[] = pendingClaudeManagedBaselines
): void {
  pendingManagedSavePreview = {
    msgId,
    parsed,
    permissions,
    baselines: baselines.map((item) => ({ ...item })),
    verification
  };
  $("managed-save-preview-modal").style.display = "flex";
  const summaryLines = [
    parsed.summary || "Review Claude's proposed file changes before saving.",
    `${parsed.edits.length} file(s) proposed. The app will only write exact attached files or new/existing files inside selected writable folders.`,
    ...(verification ? buildManagedWriteVerificationLines(verification) : [])
  ];
  $("managed-save-preview-summary").textContent = summaryLines.join(" ");
  $("managed-save-preview-files").textContent = parsed.edits.map((edit) => edit.path).join("\n");
  ($("managed-save-preview-content") as HTMLTextAreaElement).value = parsed.edits
    .map((edit) => `===== ${edit.path} =====\n${edit.content}`)
    .join("\n\n");
  const applyBtn = document.getElementById("managed-save-apply-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = verification?.status === "blocked";
    applyBtn.textContent = verification?.status === "blocked" ? "Blocked By Verifier" : "Save Changes";
  }
}

async function confirmManagedSavePreview(): Promise<void> {
  const pending = pendingManagedSavePreview;
  if (!pending || managedSaveApplying) return;
  if (pending.verification?.status === "blocked") {
    showToast("Managed save is blocked by verifier findings.", 3200);
    return;
  }

  managedSaveApplying = true;
  const applyBtn = document.getElementById("managed-save-apply-btn");
  const cancelBtn = document.getElementById("managed-save-cancel-btn");
  const closeBtn = document.getElementById("managed-save-preview-close-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = true;
    applyBtn.textContent = "Saving...";
  }
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;
  if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = true;

  try {
    const result = await window.api.claude.applyEdits(
      pending.parsed.edits,
      pending.permissions,
      pending.baselines
    );
    hideManagedSavePreview();
    const lines = buildManagedSaveResultLines(
      result.ok ? "[Managed save applied]" : "[Managed save partially applied]",
      pending.parsed.summary || "Managed edit completed.",
      result,
      pending.verification
    );

    updateMessageContent(pending.msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    await loadChatList();
    showToast(result.ok ? "Managed save applied." : "Managed save completed with issues.", 2600);
  } catch (err) {
    managedSaveApplying = false;
    if (applyBtn instanceof HTMLButtonElement) {
      applyBtn.disabled = false;
      applyBtn.textContent = "Save Changes";
    }
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
    if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = false;
    showToast(`Managed save failed: ${err instanceof Error ? err.message : "unknown error"}`, 3600);
  }
}

function cancelManagedSavePreview(): void {
  const pending = pendingManagedSavePreview;
  hideManagedSavePreview();
  if (!pending) return;

  const lines = buildManagedSaveResultLines(
    "[Managed save cancelled]",
    pending.parsed.summary || "Claude proposed file changes, but save was cancelled.",
    null,
    pending.verification
  );
  lines[lines.length - 1] = "Result: Save cancelled before any files were written.";
  updateMessageContent(pending.msgId, lines.join("\n"), true, false);
  pendingClaudeSaveGuard = null;
}

async function applyManagedClaudeEdits(
  msgId: string,
  permissions: ClaudeManagedEditPermissions,
  mode: "edit" | "chat",
  baselines: ClaudeManagedEditBaseline[] = pendingClaudeManagedBaselines
): Promise<void> {
  if (permissions.allowedPaths.length === 0 && permissions.allowedRoots.length === 0) return;
  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const parsed = parseClaudeManagedEditResponse(current);
  if (!parsed) {
    const lines = mode === "edit"
      ? [
          "[Managed save not applied]",
          "Claude did not return valid JSON for Edit & Save.",
          "Result: No files were written. Ask for the same change again with a more exact instruction."
        ]
      : [
          "[Managed write not applied]",
          "Claude replied in normal chat format instead of managed-write JSON.",
          "Result: No files were written. Ask again with an exact project or file instruction."
        ];
    updateMessageContent(msgId, mode === "chat" ? `${current.trim()}\n\n${lines.join("\n")}`.trim() : lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast(mode === "edit" ? "Claude returned invalid Edit & Save JSON." : "Claude did not return valid managed-write JSON.", 3400);
    return;
  }

  if (parsed.edits.length === 0) {
    const lines = buildManagedSaveResultLines(
      "[Managed save not applied]",
      parsed.summary || "Claude returned no file edits.",
      null
    );
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    return;
  }

  const inspection = await window.api.claude.inspectEdits(parsed.edits, permissions, baselines);
  if (!inspection.ok) {
    const lines = buildManagedSaveResultLines(
      "[Managed save not applied]",
      inspection.failedFiles.length > 0
        ? `${parsed.summary || "Claude proposed file changes."} Local safety checks rejected the proposal before review.`
        : parsed.summary || "Claude proposed no actionable file changes.",
      inspection
    );
    lines[lines.length - 1] = `Result: ${inspection.message}`;
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast(
      inspection.failedFiles.length > 0
        ? "Managed save blocked before review."
        : "No actionable file changes to review.",
      3200
    );
    return;
  }

  let verification: ManagedWriteVerificationReport | null = await verifyManagedEditsWithFallback(parsed.edits);

  if (verification.status === "blocked") {
    showToast("Verifier blocked the proposal. Attempting auto-repair...", 3200);
    const repair = await repairManagedEditsWithFallback(parsed.edits, verification);
    if (repair.ok && repair.edits.length > 0) {
      const repairedVerification = await verifyManagedEditsWithFallback(repair.edits);
      if (repairedVerification.status !== "blocked") {
        const repairedSummary = [
          parsed.summary || "Claude proposed file changes.",
          `Auto-repair applied${repair.reviewerModel ? ` by ${repair.reviewerModel}` : ""}: ${repair.summary || "Verifier issues were corrected."}`
        ].join(" ");
        showToast("Auto-repair generated a corrected proposal.", 2800);
        showManagedSavePreview(
          msgId,
          { summary: repairedSummary, edits: repair.edits },
          permissions,
          repairedVerification
        );
        return;
      }

      verification = repairedVerification;
      const lines = buildManagedSaveResultLines(
        "[Managed save blocked]",
        `${repair.summary || "Auto-repair generated a new proposal."} The repaired proposal is still blocked by verifier findings.`,
        null,
        verification
      );
      lines[lines.length - 1] = "Result: No files were written because verifier findings still block the repaired proposal.";
      updateMessageContent(msgId, lines.join("\n"), true, false);
      pendingClaudeSaveGuard = null;
      showToast("Auto-repair ran, but verifier still blocked the result.", 3600);
      return;
    }

    const lines = buildManagedSaveResultLines(
      "[Managed save blocked]",
      `${parsed.summary || "Claude proposed file changes, but verification blocked them."} Auto-repair did not produce a valid fix${repair.reviewerModel ? ` from ${repair.reviewerModel}` : ""}. ${repair.summary || ""}`.trim(),
      null,
      verification
    );
    lines[lines.length - 1] = "Result: No files were written because verifier findings blocked the proposal and auto-repair failed.";
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast("Managed save blocked. Auto-repair failed.", 3400);
    return;
  }

  showManagedSavePreview(msgId, parsed, permissions, verification);
}

function setClaudeModeActiveVisual(active: boolean): void {
  const quickBtn = document.getElementById("quick-claude-btn");
  if (quickBtn instanceof HTMLButtonElement) quickBtn.classList.toggle("active", active);
}

async function ensureClaudeSessionStarted(): Promise<boolean> {
  if (claudeSessionResetting) {
    setClaudeStatus("Resetting Claude Code...", "busy");
    return false;
  }
  if (claudeSessionRunning) {
    setClaudeStatus("Ready", "ok");
    return true;
  }
  if (claudeSessionStarting) {
    setClaudeStatus("Starting Claude Code...", "busy");
    return false;
  }

  claudeSessionStarting = true;
  setClaudeStatus("Starting Claude Code...", "busy");
  try {
    const res = await window.api.claude.start();
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3500);
      appendClaudeLine(res.message, "stderr");
      return false;
    }
    setClaudeStatus("Ready", "ok");
    if (res.message.toLowerCase().includes("session started")) appendClaudeLine(res.message, "system");
    return true;
  } catch (err) {
    claudeSessionRunning = false;
    const msg = err instanceof Error ? err.message : "Failed to start Claude Code.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3500);
    appendClaudeLine(msg, "stderr");
    return false;
  } finally {
    claudeSessionStarting = false;
  }
}

async function sendClaudeEditSavePrompt(): Promise<void> {
  const input = $("composer-input") as HTMLTextAreaElement;
  const rawPrompt = input.value.trim();
  const attachmentsToSend = [...activeAttachments];
  const permissions = getClaudeManagedEditPermissions(attachmentsToSend);
  const baselines = buildClaudeManagedEditBaselines(attachmentsToSend);
  if (!rawPrompt && attachmentsToSend.length === 0) return;
  if (isVagueEditRequest(rawPrompt)) {
    showToast("Edit & Save ke liye exact change likho. Example: text change karo, button rename karo, ya spacing adjust karo.", 4800);
    input.focus();
    return;
  }

  if (permissions.allowedPaths.length === 0 && permissions.allowedRoots.length === 0) {
    const status = getDirectSaveStatus();
    showToast(status.detail, 3600);
    updateDirectSaveUi();
    return;
  }

  const filesystemReady = await ensureFilesystemToolReadyForEditSave();
  if (!filesystemReady) return;

  await ensureActiveChatId();

  pendingClaudeManagedPermissions = permissions;
  pendingClaudeManagedBaselines = baselines;
  pendingClaudeManagedMode = "edit";
  const prompt = buildClaudeEditSavePrompt(rawPrompt, attachmentsToSend);
  pendingClaudeSaveGuard = shouldVerifyClaudeSave(prompt, attachmentsToSend) ?? {
    requested: true,
    expectedPaths: [...permissions.allowedPaths, ...permissions.allowedRoots]
  };

  const ready = await ensureClaudeSessionStarted();
  if (!ready) return;

  activeAttachments = [];
  renderComposerAttachments();
  appendClaudeLine(`${rawPrompt || "Edit and save the attached files."}\n\n[Edit & Save mode]`, "user");
  input.value = "";
  input.style.height = "auto";

  try {
    const res = await window.api.claude.send(prompt, {
      attachments: attachmentsToSend,
      enabledTools: [],
      includeFullTextAttachments: true
    });
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      pendingClaudeSaveGuard = null;
      pendingClaudeManagedBaselines = [];
      activeAttachments = attachmentsToSend;
      renderComposerAttachments();
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3200);
      appendClaudeLine(res.message, "stderr");
      setStreamingUi(false);
      return;
    }
    ensureClaudeAssistantMessage();
    shouldAutoScroll = true;
    setClaudeStatus("Running...", "busy");
    setStreamingUi(true, "Claude is editing files...");
  } catch (err) {
    pendingClaudeSaveGuard = null;
    pendingClaudeManagedBaselines = [];
    activeAttachments = attachmentsToSend;
    renderComposerAttachments();
    const msg = err instanceof Error ? err.message : "Failed to send prompt.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3200);
    appendClaudeLine(msg, "stderr");
    setStreamingUi(false);
  }
}

async function sendClaudePrompt(): Promise<void> {
  const input = $("composer-input") as HTMLTextAreaElement;
  const rawPrompt = input.value.trim();
  const attachmentsToSend = [...activeAttachments];
  if (!rawPrompt && attachmentsToSend.length === 0) return;
  const prompt = rawPrompt || "Please review the attached files.";
  const baseFilesystemAccess = settings?.claudeChatFilesystem
    ? {
        ...settings.claudeChatFilesystem,
        temporaryRoots: [...temporaryClaudeChatFilesystemRoots]
      }
    : undefined;
  const filesystemAccess = buildLockedClaudeFilesystemAccess(baseFilesystemAccess);
  const preferFilesystemProjectFlow = shouldPreferClaudeFilesystemProjectFlow(prompt, filesystemAccess);
  const managedWriteIntent = !preferFilesystemProjectFlow && isClaudeManagedWriteRequest(prompt, attachmentsToSend);
  const workspaceRoot = managedWriteIntent ? await ensureWorkspaceRootPath() : "";
  const baselines = buildClaudeManagedEditBaselines(attachmentsToSend);
  const managedWritePermissions: ClaudeManagedEditPermissions = managedWriteIntent && workspaceRoot
    ? {
        allowedPaths: getEditableSourcePaths(attachmentsToSend),
        allowedRoots: [workspaceRoot]
      }
    : { allowedPaths: [], allowedRoots: [] };
  const managedWriteRequested = managedWritePermissions.allowedRoots.length > 0 || managedWritePermissions.allowedPaths.length > 0;
  pendingClaudeManagedPermissions = managedWriteRequested ? managedWritePermissions : { allowedPaths: [], allowedRoots: [] };
  pendingClaudeManagedBaselines = managedWriteRequested ? baselines : [];
  pendingClaudeManagedMode = managedWriteRequested ? "chat" : "none";
  pendingClaudeSaveGuard = managedWriteRequested ? null : shouldVerifyClaudeSave(rawPrompt || prompt, attachmentsToSend);

  const hasImageAttachment = attachmentsToSend.some((attachment) => attachment.type === "image");
  if (hasImageAttachment) {
    pendingClaudeSaveGuard = null;
    pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
    pendingClaudeManagedBaselines = [];
    pendingClaudeManagedMode = "none";
    await sendChatPromptWithAttachments(rawPrompt, attachmentsToSend, {
      forceVisionModel: true,
      switchFromClaude: true
    });
    return;
  }

  const chatId = await ensureActiveChatId();
  const ready = await ensureClaudeChatSessionReady(chatId);
  if (!ready) return;

  activeAttachments = [];
  renderComposerAttachments();

  const attachmentSummary = attachmentsToSend.length > 0
    ? `\n\nAttached: ${attachmentsToSend.map((attachment) => attachment.name).join(", ")}`
    : "";
  appendClaudeLine(`${rawPrompt || prompt}${attachmentSummary}`, "user");
  input.value = "";
  input.style.height = "auto";

  try {
    const claudePrompt = managedWriteRequested
      ? buildClaudeManagedWritePrompt(prompt, attachmentsToSend, managedWritePermissions)
      : prompt;
    const res = await window.api.claude.send(claudePrompt, {
      chatId,
      attachments: attachmentsToSend,
      enabledTools: getEnabledToolNames(),
      filesystemAccess
    });
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      pendingClaudeSaveGuard = null;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
      activeAttachments = attachmentsToSend;
      renderComposerAttachments();
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3200);
      appendClaudeLine(res.message, "stderr");
      setStreamingUi(false);
      return;
    }
    ensureClaudeAssistantMessage();
    shouldAutoScroll = true;
    setClaudeStatus("Running...", "busy");
    setStreamingUi(true, "Claude is thinking...");
  } catch (err) {
    pendingClaudeSaveGuard = null;
    pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
    pendingClaudeManagedBaselines = [];
    pendingClaudeManagedMode = "none";
    activeAttachments = attachmentsToSend;
    renderComposerAttachments();
    const msg = err instanceof Error ? err.message : "Failed to send prompt.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3200);
    appendClaudeLine(msg, "stderr");
    setStreamingUi(false);
  }
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

async function ensureClaudeChatSessionReady(chatId: string): Promise<boolean> {
  const normalizedChatId = (chatId ?? "").trim();
  if (!normalizedChatId) return ensureClaudeSessionStarted();
  if (!claudeSessionRunning || !claudeSessionChatId || claudeSessionChatId === normalizedChatId) {
    const ready = await ensureClaudeSessionStarted();
    if (ready) claudeSessionChatId = normalizedChatId;
    return ready;
  }

  if (claudeSessionResetting) {
    setClaudeStatus("Resetting Claude Code...", "busy");
    return false;
  }

  claudeSessionResetting = true;
  suppressClaudeExitNotice = true;
  claudeSessionRunning = false;
  claudeSessionChatId = null;
  setClaudeStatus("Switching Claude chat context...", "busy");

  try {
    await window.api.claude.stop();
  } catch {
    // A failed stop is non-fatal here; a fresh start will surface a real error if needed.
  }

  try {
    const res = await window.api.claude.start();
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3500);
      appendClaudeLine(res.message, "stderr");
      return false;
    }
    claudeSessionChatId = normalizedChatId;
    setClaudeStatus("Ready", "ok");
    return true;
  } catch (err) {
    claudeSessionRunning = false;
    const msg = err instanceof Error ? err.message : "Failed to switch Claude chat context.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3500);
    appendClaudeLine(msg, "stderr");
    return false;
  } finally {
    claudeSessionResetting = false;
  }
}

async function stopClaudeSessionFromUi(toastMessage = "Claude stop requested."): Promise<boolean> {
  suppressClaudeExitNotice = true;
  setClaudeStatus("Stopping Claude Code...", "busy");
  try {
    const res = await window.api.claude.stop();
    claudeSessionRunning = Boolean(res.running);
    claudeSessionChatId = null;
    finalizeClaudeAssistantMessage(true);
    setStreamingUi(false);
    setClaudeStatus(res.ok ? "Stopped" : res.message, res.ok ? "" : "err");
    showToast(res.ok ? toastMessage : res.message, res.ok ? 1800 : 3000);
    return res.ok;
  } catch (err) {
    suppressClaudeExitNotice = false;
    const msg = err instanceof Error ? err.message : "Failed to stop Claude Code.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3200);
    return false;
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

function isVagueEditRequest(prompt: string): boolean {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length >= 22) return false;

  const vaguePatterns = [
    "edit it",
    "edit this",
    "change it",
    "change this",
    "make changes",
    "do changes",
    "fix it",
    "update it",
    "modify it",
    "do it"
  ];

  return vaguePatterns.includes(normalized);
}

function isClaudeManagedWriteRequest(prompt: string, attachments: AttachmentPayload[] = []): boolean {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const pathHint = /[a-z0-9._-]+[\\/][a-z0-9._-]+/i.test(prompt ?? "");
  const editableAttachmentPaths = getEditableSourcePaths(attachments);
  const writableAttachmentRoots = getWritableRootPaths(attachments);
  const hasWriteContext = editableAttachmentPaths.length > 0 || writableAttachmentRoots.length > 0;
  const createVerb = /\b(create|scaffold|generate|add|set up|setup)\b/.test(normalized);
  const writeVerb = /\b(build|make|write|implement|fix|rename|remove|delete)\b/.test(normalized);
  const updateVerb = /\b(edit|modify|update|rewrite|refactor|change|save|patch|apply)\b/.test(normalized);
  const fileTarget = /\b(workspace|repo|repository|package|file|files|folder|folders|directory|directories|component|components|module|modules|script|scripts|source|src|readme|package\.json)\b/.test(normalized);
  const productTarget = /\b(project|app|application|service|api|library|tool|website|site)\b/.test(normalized);
  const workspaceScopeHint = /\b(in|inside|within|under)\s+(?:this\s+)?(workspace|repo|repository|folder|directory|project)\b/.test(normalized);
  const requestLead = /^(please\s+)?(?:can|could|would|will)\s+you\b/.test(normalized)
    || /\b(?:please|pls)\b/.test(normalized)
    || /\b(?:need|want)\s+you\s+to\b/.test(normalized)
    || /\bhelp me\b/.test(normalized);
  const imperativeLead = /^(please\s+)?(?:create|scaffold|generate|add|set up|setup|build|make|write|implement|fix|rename|remove|delete|edit|modify|update|rewrite|refactor|change|save|patch|apply)\b/.test(normalized);
  const explicitWriteIntent = requestLead || imperativeLead;
  const statusReportPhrase = /\b(key outputs|saved files|backup files|unchanged files|unsaved files|files changed|result:|smoke test|the remaining work is done|ready to help|if you want, i can)\b/.test(normalized);
  const firstPersonReport = /\b(i|we)\s+(?:added|updated|patched|trained|verified|changed|edited|created|generated|installed|refreshed|completed|finished)\b/.test(normalized);

  if (!explicitWriteIntent && (statusReportPhrase || firstPersonReport)) return false;
  if (!explicitWriteIntent) return false;
  if (pathHint && (createVerb || writeVerb || updateVerb)) return true;
  if (updateVerb && (fileTarget || hasWriteContext || workspaceScopeHint)) return true;
  if ((createVerb || writeVerb) && fileTarget && (hasWriteContext || workspaceScopeHint)) return true;
  if ((createVerb || writeVerb) && productTarget && (hasWriteContext || workspaceScopeHint)) return true;
  return false;
}

function shouldPreferClaudeFilesystemProjectFlow(
  prompt: string,
  filesystem?: Settings["claudeChatFilesystem"]
): boolean {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized || !filesystem) return false;

  const configuredRoots = normalizeClaudeChatFilesystemRootDrafts(
    Array.isArray(filesystem.rootConfigs) && filesystem.rootConfigs.length > 0
      ? filesystem.rootConfigs
      : (filesystem.roots ?? []).map((path) => ({
          path,
          label: "",
          allowWrite: filesystem.allowWrite === true,
          overwritePolicy: filesystem.overwritePolicy ?? "allow-overwrite"
        })),
    filesystem.allowWrite === true,
    filesystem.overwritePolicy ?? "allow-overwrite"
  ).filter((root) => root.allowWrite && root.path);

  if (configuredRoots.length === 0) return false;

  const hasApprovedFolderAlias = /\b(allowed|approved|selected|chosen)\s+(folder|folders|directory|directories|path|paths|root|roots)\b/.test(normalized);
  const referencesApprovedRoot = configuredRoots.some((root) => normalized.includes(root.path.toLowerCase()));
  const hasWriteVerb = /\b(create|build|scaffold|generate|bootstrap|initialize|set up|setup|write|make|add|implement|save)\b/.test(normalized);
  const hasProjectTarget = /\b(project|app|agent|repo|repository|workspace|tool|service|api|library)\b/.test(normalized);
  const hasFolderTarget = /\b(file|files|folder|folders|directory|directories|path|paths|root|roots)\b/.test(normalized);

  return (hasApprovedFolderAlias || referencesApprovedRoot) && hasWriteVerb && (hasProjectTarget || hasFolderTarget);
}

function buildClaudeManagedWritePrompt(
  prompt: string,
  attachments: AttachmentPayload[],
  permissions: ClaudeManagedEditPermissions
): string {
  const basePrompt = (prompt ?? "").trim() || "Create or update the requested project files in the workspace.";
  const editablePaths = permissions.allowedPaths;
  const writableRoots = permissions.allowedRoots;

  return [
    "You are in Claude managed write mode.",
    "The app will apply file writes for you after validating your JSON response.",
    "Write permission is already granted for every listed writable root.",
    "Do not ask for permission, approval, confirmation, or access.",
    "You may create new files and new subfolders anywhere inside each writable root.",
    "A nested path inside a writable root is allowed even if that subfolder does not exist yet.",
    "Do not claim that being limited to the writable root prevents creating a project folder inside it.",
    "Do not narrate your reasoning.",
    "Do not use markdown.",
    "Return only valid JSON and nothing else.",
    'Use this exact shape: {"summary":"short summary","edits":[{"path":"absolute path","content":"full new file content"}]}',
    "The content field must contain the complete final file contents, not a diff.",
    "Only include files from the editable paths list or inside the writable roots list.",
    "Do not propose paths outside the listed roots.",
    "If the request is unclear, still return valid JSON with a short clarification question in summary and an empty edits array.",
    "If the request is clear, your full response must start with { and end with }.",
    editablePaths.length > 0 ? `Editable paths:\n${editablePaths.map((path) => `- ${path}`).join("\n")}` : "Editable paths: none",
    writableRoots.length > 0 ? `Writable roots:\n${writableRoots.map((path) => `- ${path}`).join("\n")}` : "Writable roots: none",
    attachments.length > 0 ? "Base changes on the attached file contents when relevant." : "No files are attached.",
    "",
    "Valid response example:",
    '{"summary":"Created the requested starter project files.","edits":[{"path":"D:\\\\project\\\\cipher-agent\\\\README.md","content":"# Cipher Agent\\n"}]}',
    '{"summary":"Created the requested project under the writable root.","edits":[{"path":"D:\\\\Antigravity\\\\Cipher Ai\\\\generated-apps\\\\Cipher Agent\\\\README.md","content":"# Cipher Agent\\n"}]}',
    '{"summary":"Which runtime should this project target: Python, Node.js, or both?","edits":[]}',
    "",
    `Task: ${basePrompt}`
  ].join("\n");
}

function buildClaudeEditSavePrompt(prompt: string, attachments: AttachmentPayload[]): string {
  const basePrompt = (prompt ?? "").trim() || "Review the attached files and save only necessary changes.";
  const editablePaths = getEditableSourcePaths(attachments);

  return [
    "You are in Edit & Save mode.",
    "You cannot write files directly in this mode.",
    "The app will save files for you after validating your JSON response.",
    "Base every change only on the attached file contents in this request.",
    "Do not narrate your reasoning.",
    "Do not describe what you found.",
    "Do not say you will try again.",
    "Do not use markdown.",
    "Return only valid JSON and nothing else.",
    'Use this exact shape: {"summary":"short summary","edits":[{"path":"absolute path","content":"full new file content"}]}',
    "The content field must contain the complete final file contents, not a diff.",
    "Only include files from the editable paths list.",
    "If the requested text or target does not exist in the attached files, return JSON with a short summary and an empty edits array.",
    "If the request is unclear, still return valid JSON with a short clarification question in summary and an empty edits array.",
    "If the request is clear, your full response must start with { and end with }.",
    editablePaths.length > 0 ? `Editable paths:\n${editablePaths.map((path) => `- ${path}`).join("\n")}` : "Editable paths: none",
    "",
    "Valid response example:",
    '{"summary":"Updated the chat title text.","edits":[{"path":"D:\\\\project\\\\src\\\\renderer\\\\index.html","content":"<full file content here>"}]}',
    '{"summary":"The requested text was not found in the attached files.","edits":[]}',
    "",
    `Task: ${basePrompt}`
  ].join("\n");
}

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

function normalizeClaudeChatFilesystemRoots(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value.join("\n") : value;
  return [...new Set(
    String(raw ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
}

function normalizeClaudeChatFilesystemRootDrafts(
  value: ClaudeChatFilesystemRootDraft[] | Array<{
    path?: string;
    label?: string;
    allowWrite?: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  }>,
  fallbackAllowWrite = false,
  fallbackOverwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite" = "allow-overwrite"
): ClaudeChatFilesystemRootDraft[] {
  const byPath = new Map<string, ClaudeChatFilesystemRootDraft>();
  for (const item of value ?? []) {
    const path = String(item?.path ?? "").trim();
    if (!path) continue;
    byPath.set(path, {
      path,
      label: String(item?.label ?? "").trim() || undefined,
      allowWrite: item?.allowWrite === true || (item?.allowWrite !== false && fallbackAllowWrite),
      overwritePolicy: item?.overwritePolicy === "create-only" || item?.overwritePolicy === "ask-before-overwrite"
        ? item.overwritePolicy
        : fallbackOverwritePolicy
    });
  }
  return [...byPath.values()];
}

function getClaudeChatFilesystemRootDraftsFromUi(): ClaudeChatFilesystemRootDraft[] {
  const list = document.getElementById("claude-chat-fs-root-list");
  const globalWriteToggle = document.getElementById("claude-chat-fs-write-toggle");
  const globalWriteEnabled = globalWriteToggle instanceof HTMLInputElement && globalWriteToggle.checked;
  const globalOverwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const fallbackOverwritePolicy = globalOverwritePolicy instanceof HTMLSelectElement
    && (globalOverwritePolicy.value === "create-only" || globalOverwritePolicy.value === "ask-before-overwrite")
    ? globalOverwritePolicy.value
    : "allow-overwrite";
  if (!(list instanceof HTMLElement)) return [];

  const drafts: ClaudeChatFilesystemRootDraft[] = [];
  for (const row of Array.from(list.querySelectorAll<HTMLElement>("[data-claude-fs-root-row='true']"))) {
    const pathInput = row.querySelector<HTMLInputElement>("[data-role='path']");
    const labelInput = row.querySelector<HTMLInputElement>("[data-role='label']");
    const writeInput = row.querySelector<HTMLInputElement>("[data-role='allow-write']");
    const overwriteInput = row.querySelector<HTMLSelectElement>("[data-role='overwrite-policy']");
    const path = (pathInput?.value ?? "").trim();
    if (!path) continue;
    drafts.push({
      path,
      label: (labelInput?.value ?? "").trim() || undefined,
      allowWrite: globalWriteEnabled && writeInput?.checked === true,
      overwritePolicy: overwriteInput?.value === "create-only" || overwriteInput?.value === "ask-before-overwrite"
        ? overwriteInput.value
        : fallbackOverwritePolicy
    });
  }
  return normalizeClaudeChatFilesystemRootDrafts(drafts, globalWriteEnabled, fallbackOverwritePolicy);
}

function renderClaudeChatFilesystemRootList(
  drafts: ClaudeChatFilesystemRootDraft[],
  globalWriteEnabled: boolean
): void {
  const list = document.getElementById("claude-chat-fs-root-list");
  if (!(list instanceof HTMLElement)) return;

  list.innerHTML = "";
  if (drafts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "field-help";
    empty.textContent = "No approved Claude folders yet.";
    list.appendChild(empty);
    return;
  }

  drafts.forEach((draft, index) => {
    const row = document.createElement("div");
    row.dataset["claudeFsRootRow"] = "true";
    row.className = "claude-fs-root-row";

    const pathInput = document.createElement("input");
    pathInput.className = "field-input";
    pathInput.type = "text";
    pathInput.value = draft.path;
    pathInput.placeholder = "Folder path";
    pathInput.dataset["role"] = "path";

    const labelInput = document.createElement("input");
    labelInput.className = "field-input";
    labelInput.type = "text";
    labelInput.value = draft.label ?? "";
    labelInput.placeholder = "Optional label";
    labelInput.dataset["role"] = "label";

    const writeWrap = document.createElement("label");
    writeWrap.className = "toggle-field";
    const writeInput = document.createElement("input");
    writeInput.type = "checkbox";
    writeInput.checked = draft.allowWrite;
    writeInput.disabled = !globalWriteEnabled;
    writeInput.dataset["role"] = "allow-write";
    const writeText = document.createElement("span");
    writeText.textContent = "Write";
    writeWrap.append(writeInput, writeText);

    const overwriteInput = document.createElement("select");
    overwriteInput.className = "field-input";
    overwriteInput.dataset["role"] = "overwrite-policy";
    overwriteInput.innerHTML = [
      `<option value="allow-overwrite"${draft.overwritePolicy === "allow-overwrite" ? " selected" : ""}>Allow overwrite</option>`,
      `<option value="create-only"${draft.overwritePolicy === "create-only" ? " selected" : ""}>Create only</option>`,
      `<option value="ask-before-overwrite"${draft.overwritePolicy === "ask-before-overwrite" ? " selected" : ""}>Ask before overwrite</option>`
    ].join("");

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-ghost-sm";
    removeBtn.textContent = "Remove";
    removeBtn.dataset["role"] = "remove";
    removeBtn.dataset["index"] = String(index);

    row.append(pathInput, labelInput, writeWrap, overwriteInput, removeBtn);
    list.appendChild(row);
  });
}

function getClaudeChatFilesystemSettingsDraft(): {
  roots: string[];
  allowWrite: boolean;
  overwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  rootConfigs: ClaudeChatFilesystemRootDraft[];
  temporaryRoots: string[];
  budgets: { maxFilesPerTurn?: number; maxBytesPerTurn?: number; maxToolCallsPerTurn?: number };
  auditEnabled: boolean;
  requireWritePlan: boolean;
} {
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  const overwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const tempRootsInput = document.getElementById("claude-chat-fs-temp-roots");
  const maxFilesInput = document.getElementById("claude-chat-fs-max-files");
  const maxBytesInput = document.getElementById("claude-chat-fs-max-bytes");
  const maxToolsInput = document.getElementById("claude-chat-fs-max-tools");
  const auditToggle = document.getElementById("claude-chat-fs-audit-toggle");
  const planToggle = document.getElementById("claude-chat-fs-plan-toggle");
  const parseOptionalInt = (element: HTMLElement | null): number | undefined => {
    if (!(element instanceof HTMLInputElement)) return undefined;
    const value = element.value.trim();
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const rootConfigs = getClaudeChatFilesystemRootDraftsFromUi();
  return {
    roots: rootConfigs.map((item) => item.path),
    allowWrite: writeToggle instanceof HTMLInputElement && writeToggle.checked,
    overwritePolicy: overwritePolicy instanceof HTMLSelectElement
      && (overwritePolicy.value === "create-only" || overwritePolicy.value === "ask-before-overwrite")
      ? overwritePolicy.value
      : "allow-overwrite",
    rootConfigs,
    temporaryRoots: normalizeClaudeChatFilesystemRoots(tempRootsInput instanceof HTMLTextAreaElement ? tempRootsInput.value : temporaryClaudeChatFilesystemRoots),
    budgets: {
      maxFilesPerTurn: parseOptionalInt(maxFilesInput),
      maxBytesPerTurn: parseOptionalInt(maxBytesInput),
      maxToolCallsPerTurn: parseOptionalInt(maxToolsInput)
    },
    auditEnabled: !(auditToggle instanceof HTMLInputElement) || auditToggle.checked,
    requireWritePlan: planToggle instanceof HTMLInputElement && planToggle.checked
  };
}

function renderClaudeChatFilesystemSettingsUi(filesystem: {
  roots: string[];
  allowWrite: boolean;
  overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  rootConfigs?: Array<{
    path?: string;
    label?: string;
    allowWrite?: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  }>;
  temporaryRoots?: string[];
  budgets?: { maxFilesPerTurn?: number; maxBytesPerTurn?: number; maxToolCallsPerTurn?: number };
  auditEnabled?: boolean;
  requireWritePlan?: boolean;
} | null | undefined): void {
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  const overwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const tempRootsInput = document.getElementById("claude-chat-fs-temp-roots");
  const maxFilesInput = document.getElementById("claude-chat-fs-max-files");
  const maxBytesInput = document.getElementById("claude-chat-fs-max-bytes");
  const maxToolsInput = document.getElementById("claude-chat-fs-max-tools");
  const auditToggle = document.getElementById("claude-chat-fs-audit-toggle");
  const planToggle = document.getElementById("claude-chat-fs-plan-toggle");
  const status = document.getElementById("claude-chat-fs-status");
  const normalized = {
    roots: normalizeClaudeChatFilesystemRoots(filesystem?.roots ?? []),
    allowWrite: filesystem?.allowWrite === true,
    overwritePolicy: filesystem?.overwritePolicy ?? "allow-overwrite",
    rootConfigs: normalizeClaudeChatFilesystemRootDrafts(
      Array.isArray(filesystem?.rootConfigs) && filesystem!.rootConfigs!.length > 0
        ? filesystem!.rootConfigs!
        : normalizeClaudeChatFilesystemRoots(filesystem?.roots ?? []).map((path) => ({
            path,
            allowWrite: filesystem?.allowWrite === true,
            overwritePolicy: filesystem?.overwritePolicy ?? "allow-overwrite"
          })),
      filesystem?.allowWrite === true,
      filesystem?.overwritePolicy ?? "allow-overwrite"
    ),
    temporaryRoots: normalizeClaudeChatFilesystemRoots(filesystem?.temporaryRoots ?? temporaryClaudeChatFilesystemRoots),
    budgets: {
      maxFilesPerTurn: filesystem?.budgets?.maxFilesPerTurn,
      maxBytesPerTurn: filesystem?.budgets?.maxBytesPerTurn,
      maxToolCallsPerTurn: filesystem?.budgets?.maxToolCallsPerTurn
    },
    auditEnabled: filesystem?.auditEnabled !== false,
    requireWritePlan: filesystem?.requireWritePlan === true
  };

  if (writeToggle instanceof HTMLInputElement) {
    writeToggle.checked = normalized.allowWrite;
  }
  if (overwritePolicy instanceof HTMLSelectElement) {
    overwritePolicy.value = normalized.overwritePolicy;
  }
  if (tempRootsInput instanceof HTMLTextAreaElement) {
    tempRootsInput.value = normalized.temporaryRoots.join("\n");
  }
  if (maxFilesInput instanceof HTMLInputElement) {
    maxFilesInput.value = normalized.budgets.maxFilesPerTurn ? String(normalized.budgets.maxFilesPerTurn) : "";
  }
  if (maxBytesInput instanceof HTMLInputElement) {
    maxBytesInput.value = normalized.budgets.maxBytesPerTurn ? String(normalized.budgets.maxBytesPerTurn) : "";
  }
  if (maxToolsInput instanceof HTMLInputElement) {
    maxToolsInput.value = normalized.budgets.maxToolCallsPerTurn ? String(normalized.budgets.maxToolCallsPerTurn) : "";
  }
  if (auditToggle instanceof HTMLInputElement) {
    auditToggle.checked = normalized.auditEnabled;
  }
  if (planToggle instanceof HTMLInputElement) {
    planToggle.checked = normalized.requireWritePlan;
  }
  renderClaudeChatFilesystemRootList(normalized.rootConfigs, normalized.allowWrite);
  if (status instanceof HTMLElement) {
    const writeEnabledCount = normalized.rootConfigs.filter((item) => item.allowWrite).length;
    status.textContent = normalized.rootConfigs.length === 0
      ? "Claude chat filesystem access is off."
      : normalized.allowWrite
        ? `Claude chat can read ${normalized.rootConfigs.length} approved folder${normalized.rootConfigs.length === 1 ? "" : "s"} and write in ${writeEnabledCount} folder${writeEnabledCount === 1 ? "" : "s"}.`
        : `Claude chat can read, list, and search inside ${normalized.rootConfigs.length} approved folder${normalized.rootConfigs.length === 1 ? "" : "s"}.`;
  }
}

async function loadChat(id: string) {
  currentChatId = id;
  const chat = await window.api.chat.get(id);
  if (!chat) return;
  const storedContext = getStoredChatContext(chat);
  try {
    applyChatContextToUi(storedContext);
  } catch (err) {
    console.error("Failed to apply chat context:", err);
    const normalizedContext = normalizeChatContext(storedContext);
    if (normalizedContext) activeChatContext = normalizedContext;
  }

  updateChatHeaderTitle(chat.title);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = chat.systemPrompt ?? "";

  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  virtualItemHeights.clear();
  $("messages").scrollTop = 0;
  renderedMessages = [...chat.messages];
  normalizeRenderedMessageOrder();
  rebuildVirtualItems();
  updateMessageDensityState();
  scheduleVirtualRender(true);

  activeAttachments = [];
  renderComposerAttachments();
  refreshClaudeSafetyPanel();
  scrollToBottom(true);
  await loadChatList();
}

// Render Message
function renderMessageBody(contentEl: HTMLElement, content: string, done: boolean): void {
  const renderMode = contentEl.dataset["renderMode"] ?? "markdown";

  if (rawModeEnabled) {
    contentEl.textContent = content;
    return;
  }

  contentEl.classList.toggle("is-plain", renderMode === "plain");
  if (renderMode === "plain") {
    contentEl.textContent = content;
    if (!done) {
      const cursor = document.createElement("span");
      cursor.className = "cursor-blink";
      contentEl.appendChild(cursor);
    }
    return;
  }

  if (done) {
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.innerHTML = renderMarkdown(content) + '<span class="cursor-blink"></span>';
  }
}

function shouldRenderMessageAsPlainText(msg: Message | undefined): boolean {
  return msg?.role === "system";
}

function updateMessageDensityState(): void {
  const container = document.getElementById("messages");
  if (!(container instanceof HTMLElement)) return;
  const hasEmptyState = Boolean(container.querySelector(":scope > .empty-state"));
  const sparseConversation = !hasEmptyState && renderedMessages.length > 0 && renderedMessages.length <= 2;
  container.classList.toggle("messages-sparse", sparseConversation);
}

function applyGeneratedImageAssetIds(contentEl: HTMLElement, msg: Message | undefined): void {
  const assetIds = msg?.metadata?.generatedImageAssetIds ?? [];
  const saveButtons = Array.from(contentEl.querySelectorAll<HTMLButtonElement>(".message-image-save-btn"));
  saveButtons.forEach((button, index) => {
    const assetId = assetIds[index] ?? "";
    if (assetId) button.dataset["imageAssetId"] = assetId;
    else delete button.dataset["imageAssetId"];
  });
}

function rerenderAllMessageBodies(done = true): void {
  const wrappers = document.querySelectorAll<HTMLElement>(".msg-wrapper");
  wrappers.forEach((wrapper) => {
    const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
    if (!contentEl) return;
    const raw = contentEl.dataset["raw"] ?? "";
    const messageId = wrapper.dataset["id"] ?? "";
    const message = renderedMessages.find((item) => item.id === messageId);
    contentEl.dataset["renderMode"] = shouldRenderMessageAsPlainText(message) ? "plain" : "markdown";
    renderMessageBody(contentEl, raw, done);
    applyGeneratedImageAssetIds(contentEl, message);
  });
}

function createMessageWrapper(msg: Message): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `msg-wrapper${msg.role === "system" ? " msg-wrapper-system" : ""}${msg.model === "Agent" ? " msg-wrapper-agent" : ""}`;
  wrapper.dataset["id"] = msg.id;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar " + msg.role;
  avatar.textContent = msg.role === "user" ? "U" : msg.role === "system" ? "i" : "AI";

  const body = document.createElement("div");
  body.className = "msg-body";

  const meta = document.createElement("div");
  meta.className = "msg-meta";

  const role = document.createElement("div");
  role.className = "msg-role";
  role.textContent = msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Assistant";

  const metaSide = document.createElement("div");
  metaSide.className = "msg-meta-side";

  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = formatUiTime(msg.createdAt);

  const content = document.createElement("div");
  content.className = "msg-content" + (msg.error ? " error" : "");
  content.dataset["raw"] = msg.content;
  content.dataset["renderMode"] = shouldRenderMessageAsPlainText(msg) ? "plain" : "markdown";
  if (msg.model === "Agent") {
    renderAgentMessageBody(content, msg.content);
  } else {
    renderMessageBody(content, msg.content, !activeStreamingMessageIds.has(msg.id));
    applyGeneratedImageAssetIds(content, msg);
  }

  meta.appendChild(role);
  metaSide.appendChild(time);
  body.appendChild(meta);
  body.appendChild(content);
  renderMessageAttachmentNames(body, msg);

  if (msg.model && msg.role === "assistant") {
    const modelEl = document.createElement("div");
    modelEl.className = "msg-model";
    modelEl.textContent = compactModelName(msg.model);
    body.appendChild(modelEl);
  }

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
  if (actions.childElementCount > 0) {
    metaSide.appendChild(actions);
  }
  meta.appendChild(metaSide);

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

function hostIntersectsViewport(container: HTMLElement, host: HTMLElement): boolean {
  if (host.childElementCount === 0) return false;
  const containerRect = container.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return hostRect.bottom >= containerRect.top && hostRect.top <= containerRect.bottom;
}

function renderAllVirtualItems(
  host: HTMLDivElement,
  topSpacer: HTMLDivElement,
  bottomSpacer: HTMLDivElement
): void {
  topSpacer.style.height = "0px";
  bottomSpacer.style.height = "0px";
  host.dataset["start"] = "0";
  host.dataset["end"] = String(virtualItems.length);
  host.innerHTML = "";
  for (const item of virtualItems) {
    host.appendChild(renderVirtualItem(item));
  }
}

function renderAgentMessageBody(contentEl: HTMLElement, content: string): void {
  const parsed = parseAgentMessageContent(content);
  const statusTone = parsed.status === "completed" ? "ok" : parsed.status === "failed" ? "err" : "busy";
  const failedSteps = parsed.steps.filter((step) => step.startsWith("FAILED"));
  const previewable = isPreviewableAgentResult(parsed);
  const openTargetLabel = getArtifactOpenLabel(parsed.artifactType);
  const actionsHtml = `
    <div class="agent-card-actions">
      ${parsed.summary ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-summary">Copy summary</button>` : ""}
      ${parsed.target ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-target" data-agent-target="${escHtml(parsed.target)}">Copy target</button>` : ""}
      ${parsed.output?.runCommand ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-run-command">${escHtml(getAgentRunCommandButtonLabel(parsed.output.primaryAction))}</button>` : ""}
      ${parsed.target ? `<button class="agent-inline-btn" type="button" data-agent-action="open-target" data-agent-target="${escHtml(parsed.target)}">${escHtml(openTargetLabel)}</button>` : ""}
      ${previewable ? `<button class="agent-inline-btn" type="button" data-agent-action="open-preview" data-agent-target="${escHtml(parsed.target ?? "")}" data-agent-preview="${escHtml(parsed.previewUrl ?? "")}">Preview</button>` : ""}
      ${parsed.logs.length > 0 ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-logs">Copy logs</button>` : ""}
    </div>
  `.trim();
  const activityHtml = parsed.activity
    ? `<div class="agent-card-activity"><span class="agent-card-activity-label">Live activity</span><strong>${escHtml(parsed.activity)}</strong></div>`
    : "";
  const latestUpdateHtml = parsed.latestUpdate
    ? `<div class="agent-card-update"><span class="agent-card-update-label">Latest update</span><strong>${escHtml(parsed.latestUpdate)}</strong></div>`
    : "";
  const artifactHtml = parsed.artifactType
    ? `<div class="agent-card-update"><span class="agent-card-update-label">Artifact</span><strong>${escHtml(formatAgentArtifactType(parsed.artifactType))}</strong></div>`
    : "";
  const failureHtml = failedSteps.length > 0
    ? `<div class="agent-card-failure"><span class="agent-card-failure-label">Needs attention</span><strong>${escHtml(failedSteps[failedSteps.length - 1] ?? "")}</strong></div>`
    : "";
  const resultOverviewHtml = buildParsedResultOverview(parsed);
  const filesHtml = parsed.files.length > 0
    ? `<section class="agent-mini-panel">
        <div class="agent-mini-panel-head">
          <div class="agent-mini-panel-title">Updated files</div>
          <button class="agent-inline-btn agent-inline-btn-compact" type="button" data-agent-action="copy-files">Copy files</button>
        </div>
        <div class="agent-file-grid">${parsed.files.map((file) => `<button class="agent-file-chip" type="button" data-agent-action="copy-file" data-agent-file="${escHtml(file)}">${escHtml(file)}</button>`).join("")}</div>
      </section>`
    : "";
  const verifyHtml = (parsed.verifySummary || parsed.verifyChecks.length > 0)
    ? `<section class="agent-mini-panel agent-mini-panel-verify">
        <div class="agent-mini-panel-head">
          <div class="agent-mini-panel-title">Verification</div>
          ${previewable ? `<button class="agent-inline-btn agent-inline-btn-preview" type="button" data-agent-action="open-preview" data-agent-target="${escHtml(parsed.target ?? "")}" data-agent-preview="${escHtml(parsed.previewUrl ?? "")}">Preview</button>` : ""}
        </div>
        ${parsed.verifySummary ? `<strong>${escHtml(parsed.verifySummary)}</strong>` : ""}
        ${parsed.verifyChecks.length > 0 ? `<div class="agent-verify-list">${parsed.verifyChecks.map((check) => `<div class="agent-verify-row"><span class="agent-verify-pill agent-verify-pill-${check.status}">${escHtml(check.label)}</span><span>${escHtml(check.details)}</span></div>`).join("")}</div>` : ""}
      </section>`
    : "";
  const stepsHtml = parsed.steps.length > 0
    ? `<details class="agent-card-steps-wrap"${parsed.status === "failed" ? " open" : ""}>
        <summary>Steps <span>${parsed.steps.length}</span></summary>
        <ol class="agent-card-steps">${parsed.steps.map((step) => {
      const tone = step.startsWith("COMPLETED") ? "ok" : step.startsWith("FAILED") ? "err" : "busy";
      return `<li><span class="agent-step-badge agent-step-badge-${tone}"></span><span>${escHtml(step)}</span></li>`;
    }).join("")}</ol>
      </details>`
    : `<p class="agent-card-empty">No step updates yet.</p>`;
  const logsHtml = parsed.logs.length > 0
    ? `<details class="agent-card-logs"><summary>Recent logs</summary><pre>${escHtml(parsed.logs.join("\n"))}</pre></details>`
    : "";

  contentEl.innerHTML = `
    <section class="agent-card">
      <div class="agent-card-header">
        <span class="agent-badge agent-badge-${statusTone}">${escHtml(parsed.status ?? "running")}</span>
        ${parsed.target ? `<span class="agent-badge">${escHtml(parsed.target)}</span>` : ""}
        ${parsed.rollback ? `<span class="agent-badge agent-badge-muted">${escHtml(parsed.rollback)}</span>` : ""}
      </div>
      ${actionsHtml}
        ${activityHtml}
        ${latestUpdateHtml}
        ${artifactHtml}
        ${failureHtml}
      ${resultOverviewHtml}
      ${(filesHtml || verifyHtml) ? `<div class="agent-card-panels">${filesHtml}${verifyHtml}</div>` : ""}
      <div class="agent-card-section">${stepsHtml}</div>
      ${logsHtml}
    </section>
  `.trim();
}

function measureVirtualHostItems(host: HTMLDivElement): boolean {
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
  return changedMeasurements;
}

function renderVirtualMessages(force = false): void {
  const container = $("messages");
  const { topSpacer, host, bottomSpacer } = ensureVirtualMessageElements();

  if (virtualItems.length === 0) {
    topSpacer.style.height = "0px";
    bottomSpacer.style.height = "0px";
    host.innerHTML = "";
    updateScrollBottomButton();
    return;
  }

  if (virtualItems.length <= VIRTUAL_FULL_RENDER_THRESHOLD) {
    const prevStart = Number(host.dataset["start"] ?? "-1");
    const prevEnd = Number(host.dataset["end"] ?? "-1");
    const renderedAllItems =
      prevStart === 0 &&
      prevEnd === virtualItems.length &&
      host.childElementCount === virtualItems.length;
    if (force || !renderedAllItems) {
      renderAllVirtualItems(host, topSpacer, bottomSpacer);
    }
    if (measureVirtualHostItems(host)) {
      requestAnimationFrame(() => renderVirtualMessages(false));
    }
    updateScrollBottomButton();
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

  if (!hostIntersectsViewport(container, host)) {
    renderAllVirtualItems(host, topSpacer, bottomSpacer);
  }

  if (measureVirtualHostItems(host)) {
    requestAnimationFrame(() => renderVirtualMessages(false));
  }
  updateScrollBottomButton();
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
  updateMessageDensityState();
  scheduleVirtualRender(true);
  if (shouldAutoScroll || msg.role === "user") {
    requestAnimationFrame(() => scrollToBottom(msg.role === "user"));
  }

  return (document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msg.id}"]`) ?? document.createElement("div"));
}

function updateMessageContent(msgId: string, content: string, done = false, allowContainerFallback = true) {
  const index = renderedMessages.findIndex((item) => item.id === msgId);
  if (index >= 0) {
    renderedMessages[index] = { ...renderedMessages[index], content };
  }

  const wrapper = document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msgId}"]`);
  if (!wrapper) {
    if (allowContainerFallback) {
      normalizeRenderedMessageOrder();
      rebuildVirtualItems();
      scheduleVirtualRender(true);
    }
    return;
  }
  const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
  if (!contentEl) return;
  contentEl.dataset["raw"] = content;
  const message = renderedMessages.find((item) => item.id === msgId);
  if (message?.model === "Agent") {
    renderAgentMessageBody(contentEl, content);
  } else {
    contentEl.dataset["renderMode"] = shouldRenderMessageAsPlainText(message) ? "plain" : "markdown";
    renderMessageBody(contentEl, content, done);
    applyGeneratedImageAssetIds(contentEl, message);
  }

}

function applyRawMode(enabled: boolean): void {
  rawModeEnabled = enabled;
  $("raw-toggle-btn").classList.toggle("active", enabled);
  rerenderAllMessageBodies(!isStreaming);
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


