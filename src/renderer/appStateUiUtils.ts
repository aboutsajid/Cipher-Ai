// â”€â”€ State â”€â”€
let currentChatId: string | null = null;
let activeChatContext: ChatContext | null = null;
let activeChatActionMenuId: string | null = null;
let chatProviderMenuOpen = false;
let isStreaming = false;
let suppressChatContextSync = false;
let settings: Settings | null = null;
const THEME_STORAGE_KEY = "cipher-ai-theme";
const UI_MODE_STORAGE_KEY = "cipher-ai-ui-mode";
const ONBOARDING_STORAGE_KEY = "cipher-ai-onboarding-v1";
const SIDEBAR_WIDTH_STORAGE_KEY = "cipher-ai-sidebar-width";
const AGENT_RUN_MODE_STORAGE_KEY = "cipher-ai-agent-run-mode";
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
let currentUiExperience: UiExperienceMode = "default";
let activeAttachments: AttachmentPayload[] = [];
let temporaryClaudeChatFilesystemRoots: string[] = [];
let compareModeEnabled = false;
let mcpStatus: McpStatus = { servers: [], tools: [] };
let activeAgentTaskId: string | null = null;
let activeAgentTaskStatus: AgentTask["status"] | null = null;
let selectedAgentRunMode: AgentTaskRunMode = "build-product";
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
let imageStudioSearchQuery = "";
let imageStudioSortMode: ImageStudioSortMode = "newest";


// â”€â”€ IPC Events â”€â”€

// â”€â”€ Router Panel â”€â”€

