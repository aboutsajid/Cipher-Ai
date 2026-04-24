interface AttachmentPayload {
  name: string;
  type: "text" | "image";
  content: string;
  mimeType?: string;
  sourcePath?: string;
  writableRoot?: string;
}
type ImageGenerationAspectRatio = "1:1" | "1:2" | "2:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
interface GeneratedImageAsset {
  id?: string;
  dataUrl: string;
  mimeType: string;
}
interface GeneratedImageHistoryItem {
  id: string;
  generationId: string;
  prompt: string;
  model: string;
  aspectRatio: ImageGenerationAspectRatio;
  text: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
  updatedAt: string;
  saveCount: number;
  lastSavedAt?: string;
  lastSavedPath?: string;
}
interface ImageGenerationRequest {
  prompt: string;
  provider?: ImageProviderMode;
  model?: string;
  aspectRatio?: ImageGenerationAspectRatio;
}
interface ImageGenerationResult {
  provider: ImageProviderMode;
  model: string;
  prompt: string;
  aspectRatio: ImageGenerationAspectRatio;
  text: string;
  images: GeneratedImageAsset[];
}
interface ImageSaveResult {
  ok: boolean;
  message: string;
  path?: string;
}
interface ImageHistoryMutationResult {
  ok: boolean;
  message: string;
}
interface MessageMetadata {
  attachmentNames?: string[];
  compareGroup?: string;
  compareSlot?: "A" | "B";
  generatedImageAssetIds?: string[];
  systemNotice?: boolean;
}
interface Message { id: string; role: string; content: string; createdAt: string; model?: string; error?: string; metadata?: MessageMetadata; }
type ChatProvider = "openrouter" | "nvidia" | "ollama" | "claude";
interface ChatContext {
  provider: ChatProvider;
  selectedModel?: string;
  compareModel?: string;
  compareEnabled?: boolean;
}
interface Chat { id: string; title: string; messages: Message[]; createdAt: string; updatedAt: string; systemPrompt?: string; context?: ChatContext; }
interface ChatSummary { id: string; title: string; messageCount: number; updatedAt: string; }
interface PromptTemplate { name: string; content: string; }
interface McpServerConfig { name: string; command: string; args: string[]; }
interface McpServerRuntime extends McpServerConfig { running: boolean; pid?: number; tools: string[]; logs: string[]; }
interface McpStatus { servers: McpServerRuntime[]; tools: string[]; }
interface ClaudeOutputPayload { text: string; stream: "stdout" | "stderr" | "system"; }
interface ClaudeSessionStatus { running: boolean; pid?: number; model: string; }
interface ClaudeSessionResult extends ClaudeSessionStatus { ok: boolean; message: string; }
interface ClaudeManagedEdit { path: string; content: string; }
interface ClaudeManagedEditBaseline { path: string; content: string; }
interface ClaudeManagedEditPermissions { allowedPaths: string[]; allowedRoots: string[]; }
interface ManagedWriteVerificationFinding { severity: "error" | "warn"; message: string; path?: string; }
interface ManagedWriteVerificationReport {
  ok: boolean;
  status: "passed" | "warning" | "blocked" | "skipped";
  summary: string;
  findings: ManagedWriteVerificationFinding[];
  reviewerModel?: string;
  rawResponse?: string;
}
interface ManagedWriteRepairResult {
  ok: boolean;
  summary: string;
  edits: ClaudeManagedEdit[];
  reviewerModel?: string;
  rawResponse?: string;
  error?: string;
}
interface ClaudeApplyEditsResult {
  ok: boolean;
  savedFiles: string[];
  backupFiles: Array<{ path: string; backupPath: string }>;
  unchangedFiles: string[];
  failedFiles: Array<{ path: string; reason: string }>;
  message: string;
}
interface AgentTaskStep {
  id: string;
  title: string;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  finishedAt?: string;
  summary?: string;
}
type AgentTaskRestartMode = "retry" | "retry-clean" | "continue-fix";
interface AgentVerificationCheck {
  id: string;
  label: string;
  status: "passed" | "failed" | "skipped";
  details: string;
}
interface AgentVerificationReport {
  summary: string;
  checks: AgentVerificationCheck[];
  previewReady: boolean;
}
interface AgentExecutionSpecScriptGroup {
  label: string;
  options: string[];
}
interface AgentExecutionSpec {
  summary: string;
  starterProfile: string;
  domainFocus?: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  qualityGates: string[];
  requiredFiles: string[];
  requiredScriptGroups: AgentExecutionSpecScriptGroup[];
  expectsReadme: boolean;
}
interface AgentTaskModelAttempt {
  stage: string;
  model: string;
  routeIndex: number;
  attempt: number;
  outcome: "success" | "transient-error" | "error" | "semantic-error";
  usedFallback: boolean;
  timestamp: string;
  error?: string;
}
interface AgentTaskTelemetry {
  selectedModel?: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  failureStage?: string;
  failureCategory?:
    | "missing-file"
    | "malformed-json"
    | "unsupported-path"
    | "wrong-scaffold"
    | "asset-missing"
    | "build-error"
    | "runtime-error"
    | "preview-error"
    | "lint-error"
    | "test-error"
    | "verification-error"
    | "unknown";
  finalVerificationResult?: "passed" | "failed" | "skipped" | "partial";
  verificationSummary?: string;
  lastStage?: string;
  failureMemoryHints?: string[];
  routeDiagnostics?: AgentTaskRouteTelemetrySummary;
  modelAttempts: AgentTaskModelAttempt[];
}
interface AgentModelRouteDiagnostics {
  routeKey: string;
  model: string;
  baseUrl: string;
  provider: "local" | "remote";
  score: number;
  scoreFactors: AgentModelRouteScoreFactor[];
  successes: number;
  failures: number;
  transientFailures: number;
  semanticFailures: number;
  lastUsedAt?: string;
}
interface AgentModelRouteScoreFactor {
  label: string;
  delta: number;
}
interface AgentTaskRouteFailureCount {
  model: string;
  count: number;
  blacklisted: boolean;
  hardFailuresUntilBlacklist: number;
  transientFailuresUntilBlacklist: number;
}
interface AgentTaskStageRouteDiagnostics {
  stage: string;
  model: string;
  baseUrl: string;
  provider: "local" | "remote";
  routeIndex: number;
  attempt: number;
  score: number;
  scoreFactors: AgentModelRouteScoreFactor[];
  failureCount: number;
  blacklisted: boolean;
  hardFailuresUntilBlacklist: number;
  transientFailuresUntilBlacklist: number;
  visionRequested: boolean;
  visionCapable: boolean;
  selectionReason: string;
}
interface AgentTaskRouteDiagnostics {
  taskId: string;
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  visionRequested: boolean;
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}
interface AgentTaskRouteTelemetrySummary {
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  visionRequested: boolean;
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}
interface AgentRouteDiagnostics {
  routes: AgentModelRouteDiagnostics[];
  task?: AgentTaskRouteDiagnostics;
}
interface AgentTaskRequest {
  prompt: string;
  attachments?: AttachmentPayload[];
  targetPath?: string;
}
interface AgentTask {
  id: string;
  prompt: string;
  attachments?: AttachmentPayload[];
  status: "running" | "completed" | "failed" | "stopped";
  createdAt: string;
  updatedAt: string;
  summary: string;
  steps: AgentTaskStep[];
  rollbackSnapshotId?: string;
  completionSnapshotId?: string;
  targetPath?: string;
  artifactType?: AgentArtifactType;
  output?: AgentTaskOutput;
  verification?: AgentVerificationReport;
  executionSpec?: AgentExecutionSpec;
  telemetry?: AgentTaskTelemetry;
}
type AgentArtifactType = "web-app" | "api-service" | "script-tool" | "library" | "desktop-app" | "workspace-change" | "unknown";
type AgentOutputPrimaryAction =
  | "preview-web"
  | "run-web-app"
  | "run-service"
  | "run-tool"
  | "run-desktop"
  | "inspect-package"
  | "inspect-workspace"
  | "preview"
  | "run-command"
  | "open-folder"
  | "inspect";
interface AgentTaskOutput {
  primaryAction: AgentOutputPrimaryAction;
  packageName?: string;
  workingDirectory?: string;
  runCommand?: string;
  usageTitle?: string;
  usageDetail?: string;
}
interface WorkspaceSnapshot {
  id: string;
  createdAt: string;
  label: string;
  workspaceRoot: string;
  fileCount: number;
  taskId?: string;
  kind?: "before-task" | "after-task" | "manual";
  targetPathHint?: string;
  topLevelEntries?: string[];
  targetEntries?: string[];
}
interface AgentSnapshotRestoreResult {
  ok: boolean;
  message: string;
  snapshotId?: string;
  snapshotLabel?: string;
  snapshotKind?: WorkspaceSnapshot["kind"];
  taskId?: string;
  targetPathHint?: string;
}
interface TerminalCommandResult {
  ok: boolean;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  durationMs: number;
  timedOut: boolean;
  commandLine: string;
  cwd: string;
}
interface WorkspaceFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}
interface WorkspaceFileReadResult {
  path: string;
  content: string;
  size: number;
}
interface WorkspaceFileSearchResult {
  path: string;
  line: number;
  preview: string;
}
interface ClaudeSaveGuard {
  requested: boolean;
  expectedPaths: string[];
}
interface ManagedSavePreviewState {
  msgId: string;
  parsed: { summary: string; edits: ClaudeManagedEdit[] };
  permissions: ClaudeManagedEditPermissions;
  baselines: ClaudeManagedEditBaseline[];
  verification: ManagedWriteVerificationReport | null;
}
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
  cloudProvider?: "openrouter" | "nvidia";
  imageProvider?: ImageProviderMode;
  defaultModel: string;
  routerPort: number;
  models: string[];
  customTemplates: PromptTemplate[];
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModels: string[];
  comfyuiBaseUrl?: string;
  localVoiceEnabled: boolean;
  localVoiceModel: string;
  claudeChatFilesystem?: {
    roots: string[];
    allowWrite: boolean;
  };
  mcpServers: McpServerConfig[];
  routing: { default: string; think: string; longContext: string; };
}
interface RouterStatus { running: boolean; pid?: number; port: number; }
interface TextPromptOptions {
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
}

interface ModeTemplate {
  name: string;
  content: string;
}

interface Window {
  api: {
    app: {
      workspacePath: () => Promise<string>;
      info: () => Promise<{ name: string; version: string }>;
      newWindow: () => Promise<{ ok: boolean; message: string }>;
      openExternal: (targetUrl: string) => Promise<{ ok: boolean; message: string }>;
      openPreview: (targetPath: string, preferredUrl?: string) => Promise<{ ok: boolean; message: string; url?: string }>;
      openPreviewWindow: (targetUrl: string, title?: string) => Promise<{ ok: boolean; message: string }>;
    };
    chat: {
      list: () => Promise<ChatSummary[]>;
      get: (id: string) => Promise<Chat | null>;
      create: (context?: ChatContext) => Promise<Chat>;
      delete: (id: string) => Promise<boolean>;
      rename: (id: string, title: string) => Promise<boolean>;
      export: (id: string) => Promise<{ ok: boolean; message: string }>;
      import: () => Promise<{ ok: boolean; message: string; chat?: Chat }>;
      appendMessage: (chatId: string, message: Message) => Promise<boolean>;
      updateMessage: (chatId: string, messageId: string, patch: Partial<Message>) => Promise<boolean>;
      setContext: (id: string, context: ChatContext) => Promise<boolean>;
      setSystemPrompt: (id: string, systemPrompt: string) => Promise<boolean>;
      summarize: (messages: Array<{ role: string; content: string }>) => Promise<string>;
      generateTitle: (chatId: string, firstUserMessage: string) => Promise<string>;
      transcribeAudio: (audioBytes: Uint8Array, mimeType?: string) => Promise<string>;
      send: (
        chatId: string,
        content: string,
        model: string,
        options?: { attachments?: AttachmentPayload[]; compareModel?: string; context?: ChatContext; enabledTools?: string[]; }
      ) => Promise<void>;
      stop: (chatId: string) => Promise<boolean>;
      onMessage: (cb: (chatId: string, msg: Message) => void) => void;
      onChunk: (cb: (chatId: string, msgId: string, chunk: string) => void) => void;
      onDone: (cb: (chatId: string, msgId: string) => void) => void;
      onError: (cb: (chatId: string, msgId: string, err: string) => void) => void;
      onStoreChanged: (cb: (payload?: { chatId?: string; reason?: string }) => void) => void;
    };
    images: {
      generate: (request: ImageGenerationRequest) => Promise<ImageGenerationResult>;
      listHistory: () => Promise<GeneratedImageHistoryItem[]>;
      save: (dataUrl: string, suggestedName?: string, historyId?: string) => Promise<ImageSaveResult>;
      deleteHistory: (historyId: string) => Promise<ImageHistoryMutationResult>;
    };
    attachments: {
      pick: () => Promise<AttachmentPayload[]>;
      pickWritableRoots: () => Promise<AttachmentPayload[]>;
    };
    templates: {
      list: () => Promise<PromptTemplate[]>;
      save: (name: string, content: string) => Promise<PromptTemplate[]>;
      delete: (name: string) => Promise<PromptTemplate[]>;
    };
    ollama: {
      check: () => Promise<{ ok: boolean; message?: string }>;
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
    claude: {
      status: () => Promise<ClaudeSessionStatus>;
      start: () => Promise<ClaudeSessionResult>;
      send: (
        prompt: string,
        options?: {
          chatId?: string;
          attachments?: AttachmentPayload[];
          enabledTools?: string[];
          includeFullTextAttachments?: boolean;
          filesystemAccess?: { roots: string[]; allowWrite: boolean };
        }
      ) => Promise<ClaudeSessionResult>;
      inspectEdits: (
        edits: ClaudeManagedEdit[],
        permissions: ClaudeManagedEditPermissions,
        baselineContents?: ClaudeManagedEditBaseline[]
      ) => Promise<ClaudeApplyEditsResult>;
      applyEdits: (
        edits: ClaudeManagedEdit[],
        permissions: ClaudeManagedEditPermissions,
        baselineContents?: ClaudeManagedEditBaseline[]
      ) => Promise<ClaudeApplyEditsResult>;
      verifyManagedEdits: (edits: ClaudeManagedEdit[]) => Promise<ManagedWriteVerificationReport>;
      repairManagedEdits: (edits: ClaudeManagedEdit[], verification: ManagedWriteVerificationReport) => Promise<ManagedWriteRepairResult>;
      stop: () => Promise<ClaudeSessionResult>;
      onOutput: (cb: (payload: ClaudeOutputPayload) => void) => void;
      onError: (cb: (message: string) => void) => void;
      onExit: (cb: (payload: { code: number | null; signal: string | null }) => void) => void;
    };
    agent: {
      listTasks: () => Promise<AgentTask[]>;
      getTask: (taskId: string) => Promise<AgentTask | null>;
      getLogs: (taskId: string) => Promise<string[]>;
      getRouteDiagnostics: (taskId?: string) => Promise<AgentRouteDiagnostics>;
      startTask: (request: string | AgentTaskRequest) => Promise<AgentTask>;
      restartTask: (taskId: string, mode: AgentTaskRestartMode) => Promise<AgentTask>;
      stopTask: (taskId: string) => Promise<boolean>;
      listSnapshots: () => Promise<WorkspaceSnapshot[]>;
      getRestoreState: () => Promise<AgentSnapshotRestoreResult | null>;
      restoreSnapshot: (snapshotId: string) => Promise<AgentSnapshotRestoreResult>;
    };
    terminal: {
      run: (request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) => Promise<TerminalCommandResult>;
    };
    workspace: {
      listFiles: (targetPath?: string, depth?: number) => Promise<WorkspaceFileEntry[]>;
      readFile: (targetPath: string) => Promise<WorkspaceFileReadResult>;
      writeFile: (targetPath: string, content: string) => Promise<{ ok: boolean; path: string; size: number }>;
      search: (pattern: string, targetPath?: string) => Promise<WorkspaceFileSearchResult[]>;
      pathExists: (targetPath: string) => Promise<boolean>;
      openPath: (targetPath: string) => Promise<{ ok: boolean; message: string }>;
    };
    settings: {
      get: () => Promise<Settings>;
      save: (partial: Partial<Settings>) => Promise<Settings>;
      onChanged: (cb: () => void) => void;
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
      onStateChanged: (cb: () => void) => void;
    };
  };
}

// â”€â”€ State â”€â”€
let currentChatId: string | null = null;
let activeChatContext: ChatContext | null = null;
let pendingRenameChatId: string | null = null;
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
let compareModeEnabled = false;
let mcpStatus: McpStatus = { servers: [], tools: [] };
let activeAgentTaskId: string | null = null;
let activeAgentTaskStatus: AgentTask["status"] | null = null;
let agentPollTimer: ReturnType<typeof setInterval> | null = null;
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
let imageHistoryItems: GeneratedImageHistoryItem[] = [];

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

function getInitialUiExperience(): UiExperienceMode {
  const saved = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return saved === "simple" ? "simple" : "default";
}

function applyUiExperience(mode: UiExperienceMode): void {
  currentUiExperience = mode;
  document.body.dataset["uiMode"] = mode;
  localStorage.setItem(UI_MODE_STORAGE_KEY, mode);

  const toggleBtn = document.getElementById("ui-mode-toggle-btn");
  const help = document.getElementById("ui-mode-help");
  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.textContent = mode === "simple" ? "Switch to Advanced UI" : "Switch to Simple UI";
  }
  if (help instanceof HTMLElement) {
    help.textContent = mode === "simple"
      ? "Simple UI is active. Setup stays focused on provider, API key, and default model."
      : "Simple UI hides route tuning, diagnostics, and other advanced controls until you need them.";
  }

  if (mode === "simple") {
    if (currentMode === "think") applyMode("code");
    const panel = document.getElementById("right-panel");
    const openTab = panel?.dataset["openTab"] ?? "";
    if (openTab === "router") openPanel("settings");
    const systemPromptPanel = document.getElementById("system-prompt-panel");
    if (systemPromptPanel instanceof HTMLElement) systemPromptPanel.style.display = "none";
    document.getElementById("system-prompt-toggle-btn")?.classList.remove("active");
  }

  applyProviderUiState(providerMode);
}

function toggleUiExperience(): void {
  applyUiExperience(currentUiExperience === "simple" ? "default" : "simple");
}

function getSidebarMaxWidth(): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 560));
}

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function updateSidebarWidthUi(width: number): void {
  const widthLabel = document.getElementById("sidebar-width-label");
  if (widthLabel instanceof HTMLElement) {
    widthLabel.textContent = `${width}px`;
  }

  const handle = document.getElementById("sidebar-resize-handle");
  if (handle instanceof HTMLElement) {
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemax", String(getSidebarMaxWidth()));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
  }
}

function applySidebarWidth(width: number, persist = true): void {
  currentSidebarWidth = clampSidebarWidth(width);
  document.documentElement.style.setProperty("--sidebar-w", `${currentSidebarWidth}px`);
  updateSidebarWidthUi(currentSidebarWidth);

  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(currentSidebarWidth));
  }
}

function getInitialSidebarWidth(): number {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(saved)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(saved);
}

function adjustSidebarWidth(delta: number): void {
  applySidebarWidth(currentSidebarWidth + delta);
}

function resetSidebarWidth(): void {
  applySidebarWidth(SIDEBAR_DEFAULT_WIDTH);
}

function getRightPanelMaxWidth(): number {
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, window.innerWidth - 220));
}

function clampRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(getRightPanelMaxWidth(), Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

function updateRightPanelWidthUi(width: number): void {
  const widthLabel = document.getElementById("panel-width-label");
  if (widthLabel instanceof HTMLElement) {
    widthLabel.textContent = `${width}px`;
  }

  const handle = document.getElementById("panel-resize-handle");
  if (handle instanceof HTMLElement) {
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemax", String(getRightPanelMaxWidth()));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
  }
}

function applyRightPanelWidth(width: number, persist = true): void {
  currentRightPanelWidth = clampRightPanelWidth(width);
  document.documentElement.style.setProperty("--panel-w", `${currentRightPanelWidth}px`);
  updateRightPanelWidthUi(currentRightPanelWidth);

  if (persist) {
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(currentRightPanelWidth));
  }
}

function getInitialRightPanelWidth(): number {
  const saved = Number(localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(saved)) return RIGHT_PANEL_DEFAULT_WIDTH;
  return clampRightPanelWidth(saved);
}

function adjustRightPanelWidth(delta: number): void {
  applyRightPanelWidth(currentRightPanelWidth + delta);
}

function resetRightPanelWidth(): void {
  applyRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
}

function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
}

function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen";
}

function hideOnboarding(): void {
  const modal = document.getElementById("onboarding-modal");
  if (modal instanceof HTMLElement) modal.style.display = "none";
  markOnboardingSeen();
}

function shouldShowOnboarding(): boolean {
  if (hasSeenOnboarding()) return false;
  const hasChats = cachedChatSummaries.length > 0;
  if (hasChats) return false;
  const hasCloudKey = Boolean((settings?.apiKey ?? "").trim());
  const hasOllama = (settings?.ollamaModels ?? []).length > 0;
  return !hasCloudKey && !hasOllama;
}

function showOnboarding(): void {
  const modal = document.getElementById("onboarding-modal");
  if (modal instanceof HTMLElement) modal.style.display = "flex";
}

function setClaudeStatus(text: string, tone: "ok" | "err" | "busy" | "" = ""): void {
  const btn = document.getElementById("quick-claude-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.title = text ? `Claude Code: ${text}` : "Claude Code";
  btn.classList.remove("status-ok", "status-err", "status-busy");
  if (tone) btn.classList.add(`status-${tone}`);
  btn.classList.toggle("active", currentMode === "claude");
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
    maybeAutoScroll();
    return;
  }

  const msgId = ensureClaudeAssistantMessage();
  const previous = claudeDraftByMessage.get(msgId) ?? renderedMessages.find((msg) => msg.id === msgId)?.content ?? "";
  const mapped = lines.map((line) => kind === "stderr" ? `Error: ${line}` : line);
  const nextContent = [previous, mapped.join("\n")].filter(Boolean).join("\n");
  claudeDraftByMessage.set(msgId, nextContent);
  scheduleClaudeMessageRender(msgId);
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
  const managedWriteIntent = isClaudeManagedWriteRequest(prompt, attachmentsToSend);
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
      filesystemAccess: settings?.claudeChatFilesystem
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
    openPanel("agent");
    const agentInput = document.getElementById("agent-prompt-input");
    if (agentInput instanceof HTMLTextAreaElement) {
      agentInput.focus();
      agentInput.setSelectionRange(agentInput.value.length, agentInput.value.length);
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
  updateDirectSaveUi();
  refreshChatProviderMenuUi();
}

function mountTopbarControls(): void {
  const topbarControls = document.getElementById("app-topbar-controls");
  const workspaceHeader = document.querySelector(".chat-header");
  const controls = workspaceHeader?.querySelector(".chat-header-right");
  if (!(topbarControls instanceof HTMLElement) || !(controls instanceof HTMLElement)) return;
  topbarControls.replaceChildren(controls);
}

function showToast(msg: string, duration = 2500) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

function reportSnapshotRestoreResult(message: string, ok: boolean): void {
  setAgentStatus(message, ok ? "ok" : "err");
  if (!ok || rightPanelTab !== "agent") {
    showToast(message, ok ? 2600 : 3800);
  }
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

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  const firstToken = withoutBearer.split(/\s+/)[0] ?? "";
  const extracted = trimmed.match(/sk-or-v1-[^\s"'`]+/i);
  if (extracted?.[0]) return extracted[0];

  return firstToken;
}

function setStatus(msg: string, type: "ok" | "err" | "" = "") {
  const el = $("settings-status");
  el.textContent = msg;
  el.className = "status-msg " + type;
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

function formatUiTime(value: string): string {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function setLocalAgentStatus(message: string, tone: "ok" | "err" | "" = ""): void {
  const el = document.getElementById("local-agent-status");
  if (!(el instanceof HTMLElement)) return;
  el.textContent = message;
  el.classList.remove("ok", "err");
  if (tone) el.classList.add(tone);
}

function setLocalAgentWorkspacePath(pathText: string): void {
  const el = document.getElementById("local-agent-workspace-path");
  if (!(el instanceof HTMLElement)) return;
  el.textContent = pathText;
  el.title = pathText;
}

async function refreshLocalAgentWorkspacePath(): Promise<void> {
  setLocalAgentWorkspacePath("Loading...");
  try {
    const workspacePath = await window.api.app.workspacePath();
    workspaceRootPath = workspacePath;
    setLocalAgentWorkspacePath(workspacePath);
  } catch (err) {
    workspaceRootPath = "";
    const message = err instanceof Error ? err.message : "Unavailable";
    setLocalAgentWorkspacePath(`Unavailable: ${message}`);
  }
}

async function resetClaudeSessionAfterManagedWrite(): Promise<void> {
  if (claudeSessionResetting) return;

  claudeSessionResetting = true;
  suppressClaudeExitNotice = true;
  claudeSessionRunning = false;
  setClaudeStatus("Resetting Claude Code...", "busy");

  try {
    await window.api.claude.stop();
  } catch {
    // A failed stop is non-fatal here; the next start attempt will surface a real error if needed.
  }

  try {
    const res = await window.api.claude.start();
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3500);
      appendClaudeLine(res.message, "stderr");
      return;
    }
    setClaudeStatus("Ready", "ok");
  } catch (err) {
    claudeSessionRunning = false;
    const msg = err instanceof Error ? err.message : "Failed to restart Claude Code.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3500);
    appendClaudeLine(msg, "stderr");
  } finally {
    claudeSessionResetting = false;
  }
}

async function ensureWorkspaceRootPath(): Promise<string> {
  if (workspaceRootPath.trim()) return workspaceRootPath.trim();

  try {
    const workspacePath = (await window.api.app.workspacePath()).trim();
    workspaceRootPath = workspacePath;
    if (workspacePath) setLocalAgentWorkspacePath(workspacePath);
    return workspacePath;
  } catch {
    return "";
  }
}

function getAgentTargetInput(): HTMLInputElement | null {
  const input = document.getElementById("agent-target-input");
  return input instanceof HTMLInputElement ? input : null;
}

function setAgentTargetInputValue(value: string): void {
  const targetInput = getAgentTargetInput();
  if (!targetInput) return;
  targetInput.value = value;
  targetInput.dispatchEvent(new Event("input"));
}

function normalizeAgentTargetPath(value: string, workspaceRoot = workspaceRootPath): string {
  let normalized = (value ?? "").trim().replace(/\\/g, "/");
  if (!normalized) return "";

  const normalizedWorkspaceRoot = (workspaceRoot ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedWorkspaceRoot) {
    const loweredPath = normalized.toLowerCase();
    const loweredRoot = normalizedWorkspaceRoot.toLowerCase();
    if (loweredPath === loweredRoot) {
      return ".";
    }
    if (loweredPath.startsWith(`${loweredRoot}/`)) {
      normalized = normalized.slice(normalizedWorkspaceRoot.length).replace(/^\/+/, "");
    }
  }

  normalized = normalized.replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/+$/, "");
  return normalized || ".";
}

function getRequestedAgentTargetPath(): string {
  return normalizeAgentTargetPath(getAgentTargetInput()?.value ?? "");
}

function shouldPromptForAgentTargetSelection(prompt: string): boolean {
  const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
  if (!normalizedPrompt) return false;
  if (normalizedPrompt.includes("generated-apps/")) return false;

  const actionSignals = ["build", "create", "make", "start", "bootstrap", "scaffold", "give me", "i want", "i need"];
  const scopeSignals = [
    "app",
    "project",
    "page",
    "site",
    "website",
    "landing page",
    "pricing page",
    "microsite",
    "showcase page",
    "marketing page",
    "dashboard",
    "admin panel",
    "analytics",
    "crud",
    "inventory",
    "contacts",
    "api",
    "service",
    "tool",
    "cli",
    "script",
    "library",
    "package",
    "module",
    "sdk",
    "kanban",
    "board",
    "workspace",
    "desktop",
    "desk",
    "tracker"
  ];
  const explicitlyNew = ["new app", "new project", "from scratch"].some((term) => normalizedPrompt.includes(term));
  const hasAction = actionSignals.some((term) => normalizedPrompt.includes(term));
  const hasScope = scopeSignals.some((term) => normalizedPrompt.includes(term));
  return (hasAction && hasScope) || explicitlyNew;
}

function extractAgentPromptTerms(prompt: string): string[] {
  const stopWords = new Set([
    "a", "an", "and", "app", "application", "build", "create", "for", "from", "in", "into", "make", "new",
    "page", "project", "site", "that", "the", "to", "tool", "with"
  ]);
  return (prompt ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !stopWords.has(term))
    .slice(0, 3);
}

function buildSuggestedAgentTargetPath(prompt: string): string {
  const namedMatch = /(?:called|named)\s+["']?([a-z0-9][a-z0-9 -]{1,40})["']?/i.exec(prompt);
  const rawName = namedMatch?.[1] ?? extractAgentPromptTerms(prompt).join("-");
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `generated-apps/${slug || "agent-app"}`;
}

function closeAgentTargetPromptModal(choice: AgentTargetPromptChoice | null = null): void {
  const modal = document.getElementById("agent-target-modal");
  if (modal instanceof HTMLElement) {
    modal.style.display = "none";
  }
  const resolvePrompt = pendingAgentTargetPromptResolve;
  pendingAgentTargetPromptResolve = null;
  resolvePrompt?.(choice);
}

function openAgentTargetPromptModal(prompt: string): Promise<AgentTargetPromptChoice | null> {
  if (pendingAgentTargetPromptResolve) {
    closeAgentTargetPromptModal(null);
  }

  const modal = $("agent-target-modal");
  const suggestion = buildSuggestedAgentTargetPath(prompt);
  $("agent-target-modal-suggestion").textContent = suggestion;
  modal.style.display = "flex";
  const suggestBtn = document.getElementById("agent-target-modal-suggest-btn");
  if (suggestBtn instanceof HTMLButtonElement) {
    suggestBtn.focus();
  }
  return new Promise((resolve) => {
    pendingAgentTargetPromptResolve = resolve;
  });
}

async function ensureAgentTargetSelectionBeforeStart(prompt: string): Promise<boolean> {
  if (getRequestedAgentTargetPath()) return true;
  if (!shouldPromptForAgentTargetSelection(prompt)) return true;

  const choice = await openAgentTargetPromptModal(prompt);
  if (choice === "suggested") {
    setAgentTargetInputValue(buildSuggestedAgentTargetPath(prompt));
    return true;
  }
  if (choice === "choose") {
    const picked = await pickAgentTargetFolder();
    if (!picked) {
      setAgentStatus("Agent start paused. No target folder selected.");
      return false;
    }
    return true;
  }
  if (choice === "skip") {
    return true;
  }

  setAgentStatus("Agent start cancelled.");
  return false;
}

async function pickAgentTargetFolder(): Promise<boolean> {
  const picked = await window.api.attachments.pickWritableRoots();
  const pickedPath = (picked[0]?.writableRoot ?? "").trim();
  if (!pickedPath) {
    return false;
  }

  const workspaceRoot = await ensureWorkspaceRootPath();
  const normalizedWorkspaceRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPickedPath = pickedPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const loweredRoot = normalizedWorkspaceRoot.toLowerCase();
  const loweredPicked = normalizedPickedPath.toLowerCase();

  if (!normalizedWorkspaceRoot || (loweredPicked !== loweredRoot && !loweredPicked.startsWith(`${loweredRoot}/`))) {
    const message = "Choose a folder inside the current workspace root.";
    setAgentStatus(message, "err");
    showToast(message, 2800);
    return false;
  }

  const targetInput = getAgentTargetInput();
  if (!targetInput) return false;

  targetInput.value = normalizeAgentTargetPath(pickedPath, workspaceRoot);
  targetInput.dispatchEvent(new Event("input"));
  targetInput.focus();
  showToast(`Agent target set to ${targetInput.value || "."}.`, 2200);
  return true;
}

function pickPreferredLocalCoderModel(models: string[]): string {
  const normalized = models
    .map((model) => model.trim())
    .filter(Boolean);

  const preferredMatchers = [
    /qwen2\.5-coder:14b/i,
    /qwen2\.5-coder:7b/i,
    /qwen2\.5-coder/i,
    /qwen3/i,
    /deepseek-coder/i,
    /codellama/i,
    /starcoder/i,
    /codegemma/i
  ];

  for (const matcher of preferredMatchers) {
    const hit = normalized.find((model) => matcher.test(model));
    if (hit) return hit;
  }

  return normalized[0] ?? "";
}

async function setupFreeLocalCodingMode(): Promise<void> {
  const setupBtn = document.getElementById("setup-local-agent-btn");
  if (setupBtn instanceof HTMLButtonElement) setupBtn.disabled = true;
  setLocalAgentStatus("Checking local Ollama runtime...");

  try {
    const check = await window.api.ollama.check();
    if (!check.ok) {
      setProviderMode("ollama");
      setLocalAgentStatus(
        (check.message ?? "Ollama is not installed.")
        + ` Install Ollama, run \`ollama pull ${LOCAL_CODER_PRIMARY}\`, then retry.`,
        "err"
      );
      showToast("Ollama not found. Install it and pull a local coder model first.", 4200);
      return;
    }

    setProviderMode("ollama");
    const baseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
    const models = await window.api.ollama.listModels(baseUrl);
    if (settings) settings.ollamaModels = models;
    renderOllamaModels(models);

    if (models.length === 0) {
      populateModels();
      setLocalAgentStatus(`Ollama is installed, but no local models were found. Run \`ollama pull ${LOCAL_CODER_PRIMARY}\` and try again.`, "err");
      showToast("No local Ollama models found. Pull a model first.", 3600);
      return;
    }

    const preferredModel = pickPreferredLocalCoderModel(models);
    const defaultModel = `ollama/${preferredModel}`;
    ($("default-model-input") as HTMLInputElement).value = defaultModel;
    ($("models-textarea") as HTMLTextAreaElement).value = models.map((model) => `ollama/${model}`).join("\n");

    settings = await window.api.settings.save({
      defaultModel,
      ollamaEnabled: true,
      ollamaBaseUrl: baseUrl,
      ollamaModels: models
    });

    renderOllamaModels(settings.ollamaModels ?? []);
    setProviderMode("ollama");
    populateModels();
    autoSwitchToOllamaIfNeeded();
    setStatus("Local Ollama mode saved.", "ok");
    setLocalAgentStatus(`Local coding mode is ready with ${preferredModel}. Recommended fallback: ${LOCAL_CODER_FALLBACK}. Next: prepare Filesystem MCP for this workspace.`, "ok");
    showToast(`Local mode ready: ${preferredModel}`, 2600);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to configure local mode.";
    setLocalAgentStatus(`Local setup failed: ${message}`, "err");
    showToast(`Local setup failed: ${message}`, 3600);
  } finally {
    if (setupBtn instanceof HTMLButtonElement) setupBtn.disabled = false;
  }
}

async function prepareWorkspaceFilesystemMcp(): Promise<void> {
  const prepBtn = document.getElementById("setup-filesystem-mcp-btn");
  if (prepBtn instanceof HTMLButtonElement) prepBtn.disabled = true;
  setLocalAgentStatus("Preparing Filesystem MCP for this workspace...");

  try {
    const workspacePath = await window.api.app.workspacePath();
    setLocalAgentWorkspacePath(workspacePath);
    const command = navigator.platform.toLowerCase().includes("win") ? "npx.cmd" : "npx";
    const args = ["-y", "@modelcontextprotocol/server-filesystem", workspacePath];

    ($("mcp-name-input") as HTMLInputElement).value = "Filesystem";
    ($("mcp-command-input") as HTMLInputElement).value = command;
    ($("mcp-args-input") as HTMLInputElement).value = JSON.stringify(args);

    await window.api.mcp.add({ name: "Filesystem", command, args });
    await refreshMcpStatus();
    openPanel("router");

    setLocalAgentStatus("Filesystem MCP saved for this workspace. Start it in the Router panel and enable the tool checkbox.", "ok");
    showToast("Filesystem MCP saved for this workspace.", 2600);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to prepare Filesystem MCP.";
    setLocalAgentStatus(`Filesystem MCP setup failed: ${message}`, "err");
    showToast(`Filesystem MCP setup failed: ${message}`, 3600);
  } finally {
    if (prepBtn instanceof HTMLButtonElement) prepBtn.disabled = false;
  }
}

function findFilesystemServer(): McpServerRuntime | null {
  return mcpStatus.servers.find((server) => {
    const haystack = `${server.name} ${server.command} ${server.args.join(" ")} ${server.tools.join(" ")}`.toLowerCase();
    return haystack.includes("file") || haystack.includes("filesystem") || haystack.includes("server-filesystem");
  }) ?? null;
}

function findFilesystemToolName(): string {
  const tool = mcpStatus.tools.find((name) => {
    const normalized = name.toLowerCase();
    return normalized.includes("file") || normalized.includes("filesystem") || normalized.includes("fs");
  });
  return tool ?? "Filesystem.tool";
}

async function ensureFilesystemToolReadyForEditSave(): Promise<boolean> {
  try {
    let filesystemServer = findFilesystemServer();
    if (!filesystemServer) {
      await prepareWorkspaceFilesystemMcp();
      await refreshMcpStatus();
      filesystemServer = findFilesystemServer();
    }

    if (!filesystemServer) {
      showToast("Filesystem MCP tayar nahi ho saka.", 3200);
      return false;
    }

    if (!filesystemServer.running) {
      const response = await window.api.mcp.start(filesystemServer.name);
      showToast(response.message, 2200);
      await refreshMcpStatus();
    }

    enabledMcpTools.add(findFilesystemToolName());
    renderMcpTools();
    updateDirectSaveUi();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filesystem tool auto-start failed.";
    showToast(message, 3600);
    return false;
  }
}

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
  const models = await window.api.ollama.listModels(baseUrl);
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

  if (models.length === 0) {
    setStatus(`Ollama is installed, but no local models were found. Run \`ollama pull ${LOCAL_CODER_PRIMARY}\` and retry.`, "err");
    showToast("No local Ollama models found. Pull a model first.", 3600);
    return;
  }

  setStatus(`Ollama ready with ${preferredModel}.`, "ok");
  showToast(`Ollama ready. Local models auto-load ho gaye: ${preferredModel}`, 2600);
}

function getEditableSourcePaths(items: AttachmentPayload[]): string[] {
  return items
    .filter((attachment) => attachment.type === "text")
    .map((attachment) => (attachment.sourcePath ?? "").trim())
    .filter(Boolean);
}

function getWritableRootPaths(items: AttachmentPayload[]): string[] {
  return items
    .map((attachment) => (attachment.writableRoot ?? "").trim())
    .filter(Boolean);
}

function getClaudeManagedEditPermissions(
  items: AttachmentPayload[],
): ClaudeManagedEditPermissions {
  const allowedPaths = getEditableSourcePaths(items);
  const allowedRoots = getWritableRootPaths(items);

  return { allowedPaths, allowedRoots };
}

function buildClaudeManagedEditBaselines(items: AttachmentPayload[]): ClaudeManagedEditBaseline[] {
  return items
    .filter((attachment) => attachment.type === "text")
    .map((attachment) => {
      const path = (attachment.sourcePath ?? "").trim();
      return path ? { path, content: attachment.content ?? "" } : null;
    })
    .filter((item): item is ClaudeManagedEditBaseline => Boolean(item));
}

function hasManagedSaveTargets(items: AttachmentPayload[]): boolean {
  const permissions = getClaudeManagedEditPermissions(items);
  return permissions.allowedPaths.length > 0 || permissions.allowedRoots.length > 0;
}

function hasFilesystemToolConfigured(): boolean {
  return mcpStatus.servers.some((server) => {
    const haystack = `${server.name} ${server.tools.join(" ")}`.toLowerCase();
    return server.running && (haystack.includes("file") || haystack.includes("filesystem") || haystack.includes("fs"));
  });
}

function hasFilesystemToolEnabled(): boolean {
  if (enabledMcpTools.size === 0) return false;
  return [...enabledMcpTools].some((tool) => {
    const normalized = tool.toLowerCase();
    return normalized.includes("file") || normalized.includes("filesystem") || normalized.includes("fs");
  });
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

function refreshCompareUi(): void {
  const compareBtn = $("compare-toggle-btn");
  const comparePill = $("compare-model-pill");
  compareBtn.style.display = "none";
  comparePill.style.display = compareModeEnabled ? "inline-flex" : "none";
  compareBtn.classList.toggle("active", compareModeEnabled);
}

function mergeAttachments(nextItems: AttachmentPayload[]): AttachmentPayload[] {
  const merged: AttachmentPayload[] = [];
  const seen = new Set<string>();
  for (const attachment of [...activeAttachments, ...nextItems]) {
    const key = `${attachment.type}:${attachment.name}:${attachment.content.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

function renderComposerAttachments(): void {
  const holder = $("composer-attachments");
  holder.innerHTML = "";

  if (activeAttachments.length === 0) {
    holder.style.display = "none";
    updateAttachButtonState();
    updateDirectSaveUi();
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
  updateAttachButtonState();
  updateDirectSaveUi();
}

function updateAttachButtonState(): void {
  const btn = $("attach-btn") as HTMLButtonElement;
  const count = activeAttachments.length;
  const label = count > 0
    ? `Attached ${count} item${count === 1 ? "" : "s"} (click to add more files/folders)`
    : "Attach files or folders";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.classList.toggle("has-items", count > 0);
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

function showHeaderToolsMenu(show: boolean): void {
  const dropdown = $("header-tools-menu");
  const btn = $("header-tools-menu-btn");
  dropdown.style.display = show ? "block" : "none";
  btn.setAttribute("aria-expanded", show ? "true" : "false");
  btn.classList.toggle("active", show);
}

function closeChatItemMenus(): void {
  activeChatActionMenuId = null;
  document.querySelectorAll<HTMLElement>(".chat-item-menu").forEach((menu) => {
    menu.style.display = "none";
    menu.setAttribute("data-open", "false");
  });
  document.querySelectorAll<HTMLButtonElement>(".chat-item-menu-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("active");
  });
}

function showChatItemMenu(chatId: string, button: HTMLButtonElement, menu: HTMLElement, show: boolean): void {
  closeChatItemMenus();
  if (!show) return;
  activeChatActionMenuId = chatId;
  menu.style.display = "block";
  button.setAttribute("aria-expanded", "true");
  button.classList.add("active");
}

function getHeaderToolsMenuItems(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".header-tools-menu-item"));
}

function focusHeaderToolsMenuItem(target: "first" | "last" | number): void {
  const items = getHeaderToolsMenuItems();
  if (items.length === 0) return;
  if (target === "first") {
    items[0]?.focus();
    return;
  }
  if (target === "last") {
    items[items.length - 1]?.focus();
    return;
  }
  items[Math.max(0, Math.min(items.length - 1, target))]?.focus();
}

function updateHeaderBuildLabel(name: string, version: string): void {
  const buildLabel = document.getElementById("header-build-value");
  if (!(buildLabel instanceof HTMLElement)) return;
  const trimmedName = (name ?? "").trim() || "Cipher Workspace";
  const trimmedVersion = (version ?? "").trim();
  buildLabel.textContent = trimmedVersion ? `v${trimmedVersion}` : trimmedName;
  buildLabel.title = trimmedVersion ? `${trimmedName} v${trimmedVersion}` : trimmedName;
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

function getClaudeChatFilesystemSettingsDraft(): { roots: string[]; allowWrite: boolean } {
  const rootsInput = document.getElementById("claude-chat-fs-roots");
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  return {
    roots: normalizeClaudeChatFilesystemRoots(rootsInput instanceof HTMLTextAreaElement ? rootsInput.value : ""),
    allowWrite: writeToggle instanceof HTMLInputElement && writeToggle.checked
  };
}

function renderClaudeChatFilesystemSettingsUi(filesystem: { roots: string[]; allowWrite: boolean } | null | undefined): void {
  const rootsInput = document.getElementById("claude-chat-fs-roots");
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  const status = document.getElementById("claude-chat-fs-status");
  const normalized = {
    roots: normalizeClaudeChatFilesystemRoots(filesystem?.roots ?? []),
    allowWrite: filesystem?.allowWrite === true
  };

  if (rootsInput instanceof HTMLTextAreaElement) {
    rootsInput.value = normalized.roots.join("\n");
  }
  if (writeToggle instanceof HTMLInputElement) {
    writeToggle.checked = normalized.allowWrite;
  }
  if (status instanceof HTMLElement) {
    status.textContent = normalized.roots.length === 0
      ? "Claude chat filesystem access is off."
      : normalized.allowWrite
        ? `Claude chat can read and write inside ${normalized.roots.length} approved folder${normalized.roots.length === 1 ? "" : "s"}.`
        : `Claude chat can read, list, and search inside ${normalized.roots.length} approved folder${normalized.roots.length === 1 ? "" : "s"}.`;
  }
}

async function loadAppInfo(): Promise<void> {
  try {
    const info = await window.api.app.info();
    updateHeaderBuildLabel(info.name, info.version);
  } catch {
    updateHeaderBuildLabel("Cipher Workspace", "");
  }
}

async function promptForTextInput(options: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    const modal = document.createElement("div");
    modal.className = "modal";

    const titleEl = document.createElement("p");
    titleEl.className = "modal-title";
    titleEl.textContent = options.title;

    const inputEl: HTMLInputElement | HTMLTextAreaElement = options.multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    inputEl.className = "field-input";
    inputEl.placeholder = options.placeholder ?? "";
    inputEl.value = options.initialValue ?? "";
    if (inputEl instanceof HTMLInputElement) {
      inputEl.type = "text";
    } else {
      inputEl.rows = 6;
      inputEl.style.minHeight = "140px";
    }

    const buttonRow = document.createElement("div");
    buttonRow.className = "btn-row";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn-primary";
    confirmBtn.type = "button";
    confirmBtn.textContent = options.confirmLabel ?? "Save";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-ghost";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    buttonRow.appendChild(confirmBtn);
    buttonRow.appendChild(cancelBtn);
    modal.appendChild(titleEl);
    modal.appendChild(inputEl);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);

    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(value);
    };

    const submit = (): void => {
      finish(inputEl.value);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      if (event.key === "Enter") {
        const canSubmit = !options.multiline || event.ctrlKey || event.metaKey;
        if (!canSubmit) return;
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
    };

    overlay.addEventListener("click", (event: Event) => {
      if (event.target === overlay) finish(null);
    });
    cancelBtn.onclick = () => finish(null);
    confirmBtn.onclick = submit;
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      inputEl.focus();
      if (inputEl instanceof HTMLInputElement) inputEl.select();
    });
  });
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
    empty.textContent = "No MCP tools available. Start a server to expose tools here.";
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
      updateDirectSaveUi();
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
    empty.textContent = "No MCP servers configured yet.";
    host.appendChild(empty);
    logEl.textContent = "MCP logs will appear here after a server starts.";
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
      startStop.disabled = true;
      remove.disabled = true;
      startStop.textContent = server.running ? "Stopping..." : "Starting...";
      try {
        const response = server.running
          ? await window.api.mcp.stop(server.name)
          : await window.api.mcp.start(server.name);
        showToast(response.message, response.ok ? 1800 : 3200);
        await refreshMcpStatus();
      } catch (err) {
        showToast(`MCP action failed: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
        startStop.disabled = false;
        remove.disabled = false;
        startStop.textContent = server.running ? "Stop" : "Start";
      }
    };

    const remove = document.createElement("button");
    remove.className = "btn-ghost-sm";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.onclick = async () => {
      startStop.disabled = true;
      remove.disabled = true;
      remove.textContent = "Removing...";
      try {
        await window.api.mcp.remove(server.name);
        showToast(`${server.name} removed.`, 1800);
        await refreshMcpStatus();
      } catch (err) {
        showToast(`Failed to remove MCP server: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
        startStop.disabled = false;
        remove.disabled = false;
        remove.textContent = "Remove";
      }
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

  if (!logEl.textContent.trim()) {
    logEl.textContent = "No MCP logs yet.";
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
  updateDirectSaveUi();
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
  applyProviderUiState(providerMode);
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

    const top = document.createElement("div");
    top.className = "chat-item-top";

    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = chat.title;

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";

    const time = document.createElement("span");
    time.className = "chat-item-time";
    time.textContent = formatUiTime(chat.updatedAt);

    const menuShell = document.createElement("div");
    menuShell.className = "chat-item-menu-shell";

    const menuBtn = document.createElement("button");
    menuBtn.className = "chat-item-menu-btn";
    menuBtn.type = "button";
    menuBtn.title = "Chat actions";
    menuBtn.setAttribute("aria-label", "Chat actions");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.25" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.75" cy="8" r="1.1"/></svg>';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menu.getAttribute("data-open") === "true";
      showChatItemMenu(chat.id, menuBtn, menu, !isOpen);
      menu.setAttribute("data-open", !isOpen ? "true" : "false");
    };

    const menu = document.createElement("div");
    menu.className = "chat-item-menu";
    menu.setAttribute("role", "menu");
    menu.style.display = "none";
    menu.setAttribute("data-open", "false");

    const rename = document.createElement("button");
    rename.className = "chat-item-menu-item";
    rename.type = "button";
    rename.setAttribute("role", "menuitem");
    rename.textContent = "Rename";
    rename.onclick = (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      openRenameModalForChat(chat.id, chat.title);
    };

    const exportBtn = document.createElement("button");
    exportBtn.className = "chat-item-menu-item";
    exportBtn.type = "button";
    exportBtn.setAttribute("role", "menuitem");
    exportBtn.textContent = "Export";
    exportBtn.onclick = async (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      await exportChatById(chat.id);
    };

    const del = document.createElement("button");
    del.className = "chat-item-menu-item danger";
    del.type = "button";
    del.setAttribute("role", "menuitem");
    del.textContent = "Delete";
    del.onclick = async (e) => {
      e.stopPropagation();
      closeChatItemMenus();
      await window.api.chat.delete(chat.id);
      if (currentChatId === chat.id) { currentChatId = null; clearMessages(); }
      await loadChatList();
    };

    top.appendChild(title);
    meta.appendChild(time);
    menu.appendChild(rename);
    menu.appendChild(exportBtn);
    menu.appendChild(del);
    menuShell.appendChild(menuBtn);
    menuShell.appendChild(menu);
    meta.appendChild(menuShell);
    top.appendChild(meta);
    item.appendChild(top);
    item.onclick = () => {
      closeChatItemMenus();
      void loadChat(chat.id);
    };
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

function getInitialChatIdFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get("chatId") ?? "";
  const value = raw.trim();
  return value || null;
}

function shouldOpenDraftChatFromLocation(): boolean {
  return (new URLSearchParams(window.location.search).get("draftChat") ?? "").trim() === "1";
}

function showChatProviderMenu(show: boolean): void {
  const menu = document.getElementById("chat-provider-menu");
  const button = document.getElementById("interaction-chat-btn");
  if (!(menu instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  chatProviderMenuOpen = show;
  menu.style.display = show ? "block" : "none";
  button.setAttribute("aria-expanded", show ? "true" : "false");
}

function refreshChatProviderMenuUi(): void {
  const providerItems: Array<[string, ProviderMode]> = [
    ["chat-provider-openrouter-btn", "openrouter"],
    ["chat-provider-nvidia-btn", "nvidia"],
    ["chat-provider-ollama-btn", "ollama"]
  ];
  const claudeActive = currentMode === "claude" || currentMode === "edit";

  for (const [id, mode] of providerItems) {
    document.getElementById(id)?.classList.toggle("active", !claudeActive && providerMode === mode);
  }
  document.getElementById("chat-provider-claude-btn")?.classList.toggle("active", claudeActive);
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
    showToast(`${providerName} ready. Base URL aur models auto-set ho gaye.`, 2600);
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

function updateChatHeaderTitle(title: string | null): void {
  const value = title?.trim() ?? "";
  $("chat-title-display").textContent = value;
  document.querySelector(".chat-title-stack")?.classList.toggle("is-empty", value.length === 0);
}

// â”€â”€ Load Chat â”€â”€
async function loadChat(id: string) {
  currentChatId = id;
  const chat = await window.api.chat.get(id);
  if (!chat) return;
  applyChatContextToUi(getStoredChatContext(chat));

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
  scrollToBottom(true);
  await loadChatList();
}

function createEmptyStateElement(): HTMLDivElement {
  const applyComposerDraft = (content: string) => {
    const input = $("composer-input") as HTMLTextAreaElement;
    input.value = content;
    input.dispatchEvent(new Event("input"));
    input.focus();
  };

  const recentChats = cachedChatSummaries.slice(0, 3);
  const quickActions = currentInteractionMode === "agent"
    ? [
        {
          label: "Build UI",
          desc: "Ship a focused feature with verification.",
          content: "Build a polished UI improvement in the current project, verify build and lint, and summarize what changed."
        },
        {
          label: "Fix Bug",
          desc: "Investigate and patch a safe fix.",
          content: "Investigate the current bug, make the smallest safe fix, run verification, and explain the root cause."
        },
        {
          label: "Continue Build",
          desc: "Keep momentum on an existing task output.",
          content: "Continue working on the current task output. Improve it, keep scope focused, and make sure it runs cleanly."
        }
      ]
    : [
        {
          label: "Explain Code",
          desc: "Break down logic, risks, and edge cases.",
          content: CHAT_MODE_TEMPLATES[0]?.content ?? "Explain this code clearly."
        },
        {
          label: "Write Reply",
          desc: "Draft a concise, natural response.",
          content: CHAT_MODE_TEMPLATES[1]?.content ?? "Help me write a clear reply."
        },
        {
          label: "Debug Idea",
          desc: "Think through likely causes and fixes.",
          content: CHAT_MODE_TEMPLATES[2]?.content ?? "Think through this bug with me."
        }
      ];

  const empty = document.createElement("div");
  empty.className = `empty-state${currentInteractionMode === "agent" ? " agent-empty-state" : " chat-empty-state"}`;
  empty.innerHTML = currentInteractionMode === "agent"
    ? '<div class="empty-hero"><div class="empty-kicker">Agent Mode</div><p><span class="empty-heading-icon" aria-hidden="true">&#9881;</span><span class="empty-heading-text">Agent workspace ready for supervised tasks.</span></p><span class="empty-hero-copy"><span class="empty-subtle-icon">&#8984;</span> Build, fix, continue, and verify work without leaving the main conversation.</span></div>'
    : '<div class="empty-hero"><div class="empty-kicker">Workspace Home</div><p><span class="empty-heading-icon" aria-hidden="true">&#10024;</span><span class="empty-heading-text">Start work from a smarter home screen.</span></p><span class="empty-hero-copy"><span class="empty-subtle-icon">&#8984;</span> Chat, think, write, and launch focused tasks from one workspace.</span></div>';

  const actions = document.createElement("div");
  actions.className = "empty-actions";
  actions.innerHTML = currentInteractionMode === "agent"
    ? '<button class="btn-primary empty-action-btn" type="button" data-empty-action="local">Setup Local AI</button>'
    : '<button class="btn-primary empty-action-btn" type="button" data-empty-action="new-chat">Start Chat</button><button class="btn-ghost empty-action-btn" type="button" data-empty-action="local">Setup Local AI</button>';
  empty.appendChild(actions);

  const grid = document.createElement("div");
  grid.className = `empty-workspace-grid${currentInteractionMode === "agent" ? " agent-layout" : " chat-layout"}`;

  const quickSection = document.createElement("section");
  quickSection.className = "empty-panel";
  quickSection.innerHTML = `<div class="empty-panel-head"><span class="empty-panel-kicker">Quick Actions</span><strong>${currentInteractionMode === "agent" ? "Launch a focused task" : "Start with a strong prompt"}</strong></div>`;
  const quickList = document.createElement("div");
  quickList.className = "empty-action-grid";
  for (const action of quickActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "empty-quick-card";
    button.innerHTML = `<strong>${action.label}</strong><span>${action.desc}</span>`;
    button.onclick = () => applyComposerDraft(action.content);
    quickList.appendChild(button);
  }
  quickSection.appendChild(quickList);
  grid.appendChild(quickSection);

  const recentSection = document.createElement("section");
  recentSection.className = `empty-panel${currentInteractionMode === "agent" ? " empty-panel-wide" : ""}`;
  recentSection.innerHTML = currentInteractionMode === "agent"
    ? `<div class="empty-panel-head"><span class="empty-panel-kicker">Recent Tasks</span><strong>${cachedAgentTasks.length > 0 ? "Continue agent work from here" : "No recent tasks yet"}</strong></div>`
    : `<div class="empty-panel-head"><span class="empty-panel-kicker">Recent Chats</span><strong>${recentChats.length > 0 ? "Jump back into your work" : "No recent chats yet"}</strong></div>`;
  const recentList = document.createElement("div");
  recentList.className = currentInteractionMode === "agent" ? "empty-agent-task-list" : "empty-chat-list";
  if (currentInteractionMode === "agent") {
    recentList.innerHTML = buildMainAgentTaskCards(cachedAgentTasks);
  } else {
    recentList.innerHTML = buildMainChatCards(recentChats);
  }
  recentSection.appendChild(recentList);
  grid.appendChild(recentSection);

  empty.appendChild(grid);

  const motto = document.createElement("small");
  motto.className = "empty-motto";
  motto.textContent = currentInteractionMode === "agent"
    ? "Agent mode inspects, edits, verifies, and logs progress."
    : "AI Workspace for Real Output";
  empty.appendChild(motto);
  return empty;
}

async function handleGuidedUiAction(action: string): Promise<void> {
  switch (action) {
    case "local":
      applyUiExperience("simple");
      setProviderMode("ollama");
      openPanel("settings");
      await setupFreeLocalCodingMode();
      return;
    case "new-chat":
      await createNewChat();
      return;
    default:
      return;
  }
}

function setupGuidedUiControls(): void {
  document.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const emptyAction = target?.closest<HTMLElement>("[data-empty-action]");
    const quickAction = target?.closest<HTMLElement>("[data-quick-action]");
    const action = emptyAction?.dataset["emptyAction"] ?? quickAction?.dataset["quickAction"] ?? "";
    if (!action) return;
    void handleGuidedUiAction(action);
  });
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
  const overlay = document.getElementById("chat-summary-overlay");
  const content = document.getElementById("chat-summary-content");
  if (overlay instanceof HTMLElement) overlay.style.display = "none";
  if (content instanceof HTMLElement) content.textContent = "";
}

function showSummaryOverlay(summary: string): void {
  const overlay = document.getElementById("chat-summary-overlay");
  const content = document.getElementById("chat-summary-content");
  if (!(overlay instanceof HTMLElement) || !(content instanceof HTMLElement)) return;
  content.textContent = summary.trim();
  overlay.style.display = "flex";
}

function clearMessages() {
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  $("messages").appendChild(createEmptyStateElement());
  updateMessageDensityState();
  updateChatHeaderTitle(null);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = "";
  activeAttachments = [];
  activeChatContext = getActiveUiChatContext();
  renderComposerAttachments();
  updateScrollBottomButton();
}

function openDraftChat(
  showEmptyState = true,
  options?: { preserveAttachments?: boolean; context?: ChatContext | null }
): void {
  currentChatId = null;
  clearRenderedMessages();
  hideSummaryOverlay();
  activeStreamingMessageIds.clear();
  resetClaudeRenderState();
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  const messages = $("messages");
  clearRenderedMessages();
  messages.scrollTop = 0;
  if (showEmptyState) {
    messages.appendChild(createEmptyStateElement());
  }
  updateMessageDensityState();
  updateChatHeaderTitle(null);
  $("rename-btn").style.display = "none";
  $("export-btn").style.display = "none";
  $("system-prompt-toggle-btn").style.display = "none";
  $("system-prompt-panel").style.display = "none";
  $("system-prompt-toggle-btn").classList.remove("active");
  ($("system-prompt-input") as HTMLTextAreaElement).value = "";
  if (!options?.preserveAttachments) activeAttachments = [];
  activeChatContext = normalizeChatContext(options?.context) ?? getActiveUiChatContext();
  renderComposerAttachments();
  updateScrollBottomButton();
  renderChatList(cachedChatSummaries);
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

interface ParsedAgentMessage {
  status?: string;
  activity?: string;
  latestUpdate?: string;
  artifactType?: AgentArtifactType;
  output?: AgentTaskOutput;
  target?: string;
  rollback?: string;
  summary?: string;
  steps: string[];
  logs: string[];
  files: string[];
  verifySummary?: string;
  verifyChecks: Array<{ label: string; status: "passed" | "failed" | "skipped"; details: string }>;
  previewUrl?: string;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function detectAgentPreviewUrl(logs: string[]): string | undefined {
  for (const rawLine of logs) {
    const line = stripAnsi(rawLine);
    const explicitUrl = line.match(/https?:\/\/[^\s]+/i)?.[0];
    if (explicitUrl) return explicitUrl.replace(/[)\].,]+$/, "");
  }

  for (const rawLine of logs) {
    const line = stripAnsi(rawLine);
    const viteLocal = line.match(/Local:\s*(https?:\/\/[^\s]+)/i)?.[1];
    if (viteLocal) return viteLocal.trim();

    const pythonServer = line.match(/python\s+-m\s+http\.server\s+(\d{2,5})/i)?.[1];
    if (pythonServer) return `http://localhost:${pythonServer}`;

    const genericPort = line.match(/\b(?:localhost|127\.0\.0\.1):(\d{2,5})\b/i)?.[1];
    if (genericPort) return `http://localhost:${genericPort}`;
  }

  return undefined;
}

function isPreviewPrimaryAction(action?: AgentOutputPrimaryAction): boolean {
  return action === "preview-web" || action === "preview";
}

function isRunPrimaryAction(action?: AgentOutputPrimaryAction): boolean {
  return action === "run-web-app"
    || action === "run-service"
    || action === "run-tool"
    || action === "run-desktop"
    || action === "run-command";
}

function getAgentRunCommandButtonLabel(action?: AgentOutputPrimaryAction): string {
  return isRunPrimaryAction(action) || isPreviewPrimaryAction(action) ? "Copy run command" : "Copy command";
}

function isPreviewableAgentResult(parsed: ParsedAgentMessage): boolean {
  if (!parsed.target) return false;
  if (parsed.artifactType && !isWebArtifactType(parsed.artifactType)) return false;
  if (parsed.output?.primaryAction && !isPreviewPrimaryAction(parsed.output.primaryAction)) return false;
  if (parsed.verifyChecks.some((check) => check.label === "Preview health" && check.status === "passed")) return true;
  return Boolean(parsed.previewUrl) && parsed.verifyChecks.some((check) => check.label === "Launch" && check.status === "passed");
}

function humanizeAgentStepTitle(title: string): string {
  const normalized = title.trim();
  const directMap: Record<string, string> = {
    "Inspect workspace": "inspecting the workspace",
    "Plan task execution": "planning the task",
    "Verify build and quality scripts": "verifying the build",
    "Bootstrap project workspace": "bootstrapping the project workspace",
    "Build page structure": "building the page structure",
    "Build dashboard structure": "building the dashboard structure",
    "Build CRUD layout": "building the CRUD layout",
    "Add data cards and tables": "adding data cards and tables",
    "Add create, edit, and delete flows": "adding create, edit, and delete flows",
    "Add note creation flow": "adding note creation flow",
    "Build notes interface": "building the notes interface",
    "Polish visual design": "polishing the visual design",
    "Polish dashboard design": "polishing the dashboard design",
    "Polish CRUD experience": "polishing the CRUD experience",
    "Implement requested changes": "applying the requested changes",
    "Final builder recovery": "recovering the app",
    "Final lint recovery": "recovering lint issues"
  };

  if (directMap[normalized]) return directMap[normalized];
  if (/^Implement:\s*/i.test(normalized)) {
    return humanizeAgentStepTitle(normalized.replace(/^Implement:\s*/i, ""));
  }
  if (/^Fix build attempt \d+/i.test(normalized)) return "fixing the build";
  if (/^Fix lint attempt \d+/i.test(normalized)) return "fixing lint issues";
  return `working on ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
}

function parseAgentPrimaryActionLabel(value: string, artifactType?: AgentArtifactType): AgentOutputPrimaryAction {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "preview web app":
    case "preview":
      return "preview-web";
    case "run web app":
      return "run-web-app";
    case "run service":
      return "run-service";
    case "run tool":
      return "run-tool";
    case "run desktop app":
      return "run-desktop";
    case "inspect package":
      return "inspect-package";
    case "inspect workspace":
      return "inspect-workspace";
    case "inspect":
      return artifactType === "library"
        ? "inspect-package"
        : artifactType === "workspace-change"
          ? "inspect-workspace"
          : "inspect";
    case "run command":
      if (artifactType === "api-service") return "run-service";
      if (artifactType === "script-tool") return "run-tool";
      if (artifactType === "desktop-app") return "run-desktop";
      if (artifactType === "web-app") return "run-web-app";
      return "run-command";
    case "open folder":
      return artifactType === "workspace-change" ? "inspect-workspace" : "open-folder";
    default:
      return "open-folder";
  }
}

function parseAgentMessageContent(content: string): ParsedAgentMessage {
  const lines = (content ?? "").split(/\r?\n/);
  const parsed: ParsedAgentMessage = { steps: [], logs: [], files: [], verifyChecks: [] };
  let mode: "summary" | "steps" | "logs" = "summary";
  let inLogFence = false;
  const summaryLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("Agent status: ")) {
      parsed.status = line.slice("Agent status: ".length).trim();
      continue;
    }
    if (line.startsWith("Activity: ")) {
      parsed.activity = line.slice("Activity: ".length).trim();
      continue;
    }
    if (line.startsWith("Latest update: ")) {
      parsed.latestUpdate = line.slice("Latest update: ".length).trim();
      continue;
    }
    if (line.startsWith("Artifact: ")) {
      parsed.artifactType = parseAgentArtifactTypeLabel(line.slice("Artifact: ".length).trim());
      continue;
    }
    if (line.startsWith("Primary action: ")) {
      const value = line.slice("Primary action: ".length).trim();
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.primaryAction = parseAgentPrimaryActionLabel(value, parsed.artifactType);
      continue;
    }
    if (line.startsWith("Run command: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.runCommand = line.slice("Run command: ".length).trim();
      continue;
    }
    if (line.startsWith("Working directory: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.workingDirectory = line.slice("Working directory: ".length).trim();
      continue;
    }
    if (line.startsWith("Package: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.packageName = line.slice("Package: ".length).trim();
      continue;
    }
    if (line.startsWith("Usage: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.usageDetail = line.slice("Usage: ".length).trim();
      continue;
    }
    if (line.startsWith("Usage title: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.usageTitle = line.slice("Usage title: ".length).trim();
      continue;
    }
    if (line.startsWith("Target: ")) {
      parsed.target = line.slice("Target: ".length).trim();
      continue;
    }
    if (line.startsWith("Rollback: ")) {
      parsed.rollback = line.slice("Rollback: ".length).trim();
      continue;
    }
    if (line.startsWith("Verification: ")) {
      parsed.verifySummary = line.slice("Verification: ".length).trim();
      continue;
    }
    if (line.startsWith("Verification check: ")) {
      const normalizedCheck = line.slice("Verification check: ".length).trim();
      const verifyCheckMatch = normalizedCheck.match(/^(.+?)\s*-\s*(passed|failed|skipped)\s*-\s*(.+)$/i);
      if (verifyCheckMatch) {
        parsed.verifyChecks.push({
          label: verifyCheckMatch[1].trim(),
          status: verifyCheckMatch[2].trim().toLowerCase() as "passed" | "failed" | "skipped",
          details: verifyCheckMatch[3].trim()
        });
      }
      continue;
    }
    if (line === "Steps:") {
      mode = "steps";
      continue;
    }
    if (line === "Recent logs:") {
      mode = "logs";
      continue;
    }
    if (line.startsWith("```")) {
      inLogFence = !inLogFence;
      continue;
    }
    if (!line.trim()) continue;

    if (mode === "logs" || inLogFence) {
      parsed.logs.push(line);
      continue;
    }
    if (mode === "steps" && line.startsWith("- ")) {
      const step = line.slice(2).trim();
      parsed.steps.push(step);
      const changedMatch = step.match(/Files changed:\s*(.+)$/i);
      if (changedMatch) {
        const files = changedMatch[1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .filter((value) => value.toLowerCase() !== "none");
        for (const file of files) {
          if (!parsed.files.includes(file)) parsed.files.push(file);
        }
      }
      const verifyMatch = step.match(/Verification finished:\s*(.+)$/i);
      if (verifyMatch) {
        parsed.verifySummary = verifyMatch[1].trim();
      }
      continue;
    }
    summaryLines.push(line);
  }

  parsed.previewUrl = detectAgentPreviewUrl(parsed.logs);
  parsed.summary = summaryLines.join(" ").trim();
  return parsed;
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

  const edited = await promptForTextInput({
    title: "Edit message",
    initialValue: message.content,
    confirmLabel: "Resend",
    multiline: true
  });
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

function sanitizeDownloadName(value: string): string {
  const compact = (value ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-");
  return compact.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "cipher-generated-image";
}

function renderMarkdown(text: string): string {
  if (!text) return "";

  const codeBlocks: string[] = [];
  const imageBlocks: string[] = [];
  const placeholderPrefix = "__CODE_BLOCK_";
  const imagePlaceholderPrefix = "__IMAGE_BLOCK_";

  const withCodePlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const normalizedLang = (lang ?? "").trim().toLowerCase();
    const langAttr = normalizedLang ? ` class="language-${escHtml(normalizedLang)}"` : "";
    const runnable = normalizedLang === "html" || normalizedLang === "javascript" || normalizedLang === "js";
    const runBtn = runnable ? '<button class="run-btn" type="button">Run</button>' : "";
    codeBlocks.push(`<div class="code-block" data-lang="${escHtml(normalizedLang)}"><div class="code-actions"><button class="copy-btn" type="button">Copy</button>${runBtn}</div><pre><code${langAttr}>${escHtml(code.trim())}</code></pre></div>`);
    return `${placeholderPrefix}${codeBlocks.length - 1}__`;
  });

  const withPlaceholders = withCodePlaceholders.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_m, alt, url) => {
    const label = (alt ?? "").trim() || "Generated image";
    const encodedUrl = escHtml(url);
    const suggestedName = sanitizeDownloadName(label);
    imageBlocks.push(
      `<figure class="message-image-card"><img class="message-image" src="${encodedUrl}" alt="${escHtml(label)}" loading="lazy" /><figcaption><span>${escHtml(label)}</span><button class="message-image-save-btn" type="button" data-image-name="${escHtml(suggestedName)}">Save image</button></figcaption></figure>`
    );
    return `${imagePlaceholderPrefix}${imageBlocks.length - 1}__`;
  });

  const escaped = escHtml(withPlaceholders)
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br>");

  return escaped
    .replace(/__CODE_BLOCK_(\d+)__/g, (_m, index) => codeBlocks[Number(index)] ?? "")
    .replace(/__IMAGE_BLOCK_(\d+)__/g, (_m, index) => imageBlocks[Number(index)] ?? "");
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
  const title = document.getElementById("code-preview-title");
  if (title) title.textContent = "HTML Preview";
  frame.removeAttribute("src");
  frame.srcdoc = html;
  modal.style.display = "flex";
}

function openImagePreview(item: GeneratedImageHistoryItem): void {
  const modal = document.getElementById("image-preview-modal");
  const image = document.getElementById("image-preview-image") as HTMLImageElement | null;
  const title = document.getElementById("image-preview-title");
  const meta = document.getElementById("image-preview-meta");
  if (!(modal instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

  const prompt = item.prompt.trim() || "Generated image preview";
  if (title instanceof HTMLElement) title.textContent = prompt;
  if (meta instanceof HTMLElement) {
    meta.textContent = `${compactModelName(item.model)} • ${item.aspectRatio} • ${formatImageHistoryTimestamp(item.createdAt)}`;
  }
  image.src = item.dataUrl;
  image.alt = prompt;
  modal.style.display = "flex";
}

function closePreviewWorkspace(): void {
  const workspace = document.getElementById("preview-workspace");
  const workspaceTitle = document.getElementById("preview-workspace-title");
  const workspaceTarget = document.getElementById("preview-workspace-target");
  const workspaceWebview = document.getElementById("preview-workspace-webview") as HTMLElement | null;
  const workspaceEmpty = document.getElementById("preview-workspace-empty");
  if (workspace) workspace.style.display = "none";
  if (workspaceTitle) workspaceTitle.textContent = "Task Output";
  if (workspaceTarget) workspaceTarget.textContent = "";
  if (workspaceWebview) workspaceWebview.setAttribute("src", "about:blank");
  if (workspaceEmpty) workspaceEmpty.classList.add("visible");
  document.body.classList.remove("preview-workspace-open");
}

async function openDetachedPreview(): Promise<void> {
  if (!activePreviewUrl) {
    showToast("No preview loaded.", 1800);
    return;
  }

  const title = activePreviewTarget
    ? activePreviewTarget.split("/").pop() ?? "Cipher Preview"
    : "Cipher Preview";
  const result = await window.api.app.openPreviewWindow(activePreviewUrl, title);
  showToast(result.message, result.ok ? 1800 : 2600);
}

function closeCodePreview(): void {
  const modal = $("code-preview-modal");
  const frame = $("code-preview-frame") as HTMLIFrameElement;
  const title = document.getElementById("code-preview-title");
  if (title) title.textContent = "HTML Preview";
  modal.style.display = "none";
  frame.removeAttribute("src");
  frame.srcdoc = "";
}

function closeImagePreviewModal(): void {
  const modal = document.getElementById("image-preview-modal");
  const image = document.getElementById("image-preview-image") as HTMLImageElement | null;
  const title = document.getElementById("image-preview-title");
  const meta = document.getElementById("image-preview-meta");
  if (title instanceof HTMLElement) title.textContent = "Image Preview";
  if (meta instanceof HTMLElement) meta.textContent = "Generated image";
  if (modal instanceof HTMLElement) modal.style.display = "none";
  if (image instanceof HTMLImageElement) {
    image.removeAttribute("src");
    image.alt = "Generated image preview";
  }
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
      updateChatHeaderTitle(title);
    }
    await loadChatList();
  } catch (err) {
    console.error("Title generation failed:", err);
  } finally {
    pendingTitleGeneration.delete(chatId);
  }
}

function closeStatsModal(): void {
  const statsModal = document.getElementById("stats-modal");
  if (statsModal instanceof HTMLElement) statsModal.style.display = "none";
  const statsBtn = document.getElementById("stats-btn");
  if (statsBtn instanceof HTMLElement) statsBtn.classList.remove("active");
}

async function openStatsModal(): Promise<void> {
  try {
    const stats = await window.api.stats.get();
    const setText = (id: string, value: string): void => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("stats-total-chats", String(stats.totalChats));
    setText("stats-total-messages", String(stats.totalMessages));
    setText("stats-most-used-model", stats.mostUsedModel);
    setText("stats-most-used-count", `${stats.mostUsedModelCount} messages`);
    setText("stats-avg-per-chat", String(stats.averageMessagesPerChat));

    const statsModal = document.getElementById("stats-modal");
    if (statsModal instanceof HTMLElement) statsModal.style.display = "flex";
    const statsBtn = document.getElementById("stats-btn");
    if (statsBtn instanceof HTMLElement) statsBtn.classList.add("active");
  } catch (err) {
    const statsBtn = document.getElementById("stats-btn");
    if (statsBtn instanceof HTMLElement) statsBtn.classList.remove("active");
    showToast(`Stats failed: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

function getMessagesBottomDistance(): number {
  const el = $("messages");
  return Math.max(0, el.scrollHeight - (el.scrollTop + el.clientHeight));
}

function isNearBottom(threshold = NEAR_BOTTOM_THRESHOLD_PX): boolean {
  return getMessagesBottomDistance() <= threshold;
}

function ensureScrollBottomButton(): HTMLButtonElement | null {
  const existing = document.getElementById("scroll-bottom-btn");
  if (existing instanceof HTMLButtonElement) return existing;

  const messages = document.getElementById("messages");
  if (!messages) return null;

  const btn = document.createElement("button");
  btn.id = "scroll-bottom-btn";
  btn.className = "scroll-bottom-btn";
  btn.type = "button";
  btn.style.display = "none";
  btn.title = "Jump to latest message";
  btn.textContent = "Latest ↓";
  messages.appendChild(btn);
  btn.onclick = () => {
    scrollToBottom(true);
  };
  return btn;
}

function updateScrollBottomButton(): void {
  const btn = ensureScrollBottomButton();
  if (!btn) return;
  const hasMessages = renderedMessages.length > 0;
  const show = hasMessages && !isNearBottom();
  btn.style.display = show ? "inline-flex" : "none";
}

function syncAutoScrollState(): void {
  shouldAutoScroll = isNearBottom();
  updateScrollBottomButton();
}

function scrollToBottom(forceAuto = false): void {
  const el = $("messages");
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    if (forceAuto) shouldAutoScroll = true;
    updateScrollBottomButton();
  });
}

function maybeAutoScroll(): void {
  if (shouldAutoScroll) {
    scrollToBottom();
    return;
  }
  updateScrollBottomButton();
}

function scheduleChunkAutoScroll(): void {
  if (chunkAutoScrollTimer) return;
  chunkAutoScrollTimer = setTimeout(() => {
    chunkAutoScrollTimer = null;
    maybeAutoScroll();
  }, 90);
}

function flushChunkAutoScroll(): void {
  if (chunkAutoScrollTimer) {
    clearTimeout(chunkAutoScrollTimer);
    chunkAutoScrollTimer = null;
  }
  maybeAutoScroll();
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

async function createNewChat(showEmptyState = true, context = activeChatContext ?? getActiveUiChatContext()): Promise<string> {
  const chat = await window.api.chat.create(context);
  currentChatId = chat.id;
  activeChatContext = normalizeChatContext(chat.context) ?? normalizeChatContext(context) ?? getActiveUiChatContext();
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
  renderedMessages = [];
  virtualItems = [];
  virtualItemHeights.clear();
  shouldAutoScroll = true;
  if (showEmptyState) {
    $("messages").appendChild(createEmptyStateElement());
  }
  activeAttachments = [];
  renderComposerAttachments();
  updateScrollBottomButton();
  await loadChatList();
  return chat.id;
}

// â”€â”€ Send Message â”€â”€
function isImageCapableModel(model: string): boolean {
  return /image|flux|riverflow|sourceful|vision/.test((model ?? "").trim().toLowerCase());
}

function getActiveImageGenerationProvider(): ImageProviderMode {
  return getImageProviderFromSettings(settings);
}

function getImageGenerationModelOptions(provider: ImageProviderMode): string[] {
  if (provider === "comfyui") return COMFYUI_IMAGE_MODELS;
  return provider === "nvidia" ? NVIDIA_IMAGE_MODELS : OPENROUTER_IMAGE_MODELS;
}

function isProviderCompatibleImageModel(provider: ImageProviderMode, model: string): boolean {
  const normalized = (model ?? "").trim();
  if (provider === "comfyui") {
    return getImageGenerationModelOptions(provider).includes(normalized)
      || /\.safetensors$/i.test(normalized);
  }
  return getImageGenerationModelOptions(provider).includes(normalized);
}

function refreshImageGenerationModelOptions(provider: ImageProviderMode): void {
  const datalist = document.getElementById("image-generation-model-options");
  if (!(datalist instanceof HTMLDataListElement)) return;
  datalist.innerHTML = "";
  for (const model of getImageGenerationModelOptions(provider)) {
    const option = document.createElement("option");
    option.value = model;
    datalist.appendChild(option);
  }
}

function populateImageGenerationAspectRatioOptions(): void {
  const selectIds = ["image-studio-aspect-select", "image-generation-aspect-select"];
  for (const selectId of selectIds) {
    const select = document.getElementById(selectId);
    if (!(select instanceof HTMLSelectElement)) continue;
    const currentValue = select.value;
    select.innerHTML = "";
    for (const ratio of IMAGE_GENERATION_ASPECT_RATIOS) {
      const option = document.createElement("option");
      option.value = ratio;
      option.textContent = ratio;
      select.appendChild(option);
    }
    select.value = IMAGE_GENERATION_ASPECT_RATIOS.includes(currentValue as ImageGenerationAspectRatio)
      ? currentValue
      : "1:1";
  }
}

function updateImageProviderButtons(provider: ImageProviderMode): void {
  document.getElementById("image-provider-openrouter-btn")?.classList.toggle("active", provider === "openrouter");
  document.getElementById("image-provider-nvidia-btn")?.classList.toggle("active", provider === "nvidia");
  document.getElementById("image-provider-comfyui-btn")?.classList.toggle("active", provider === "comfyui");
}

async function setImageProvider(provider: ImageProviderMode): Promise<void> {
  const current = getImageProviderFromSettings(settings);
  if (current === provider) {
    syncImageStudioControls(false);
    return;
  }
  settings = await window.api.settings.save({ imageProvider: provider });
  syncImageStudioControls(false);
}

function updateImageGenerationModalHelp(provider: ImageProviderMode): void {
  const help = document.getElementById("image-generation-help");
  if (!(help instanceof HTMLElement)) return;
  help.textContent = provider === "comfyui"
    ? "Local image generation uses ComfyUI. No cloud API key is required. Press Ctrl+Enter to submit."
    : provider === "nvidia"
      ? "Hosted image generation uses NVIDIA cloud APIs for this MVP free-tier path. Press Ctrl+Enter to submit."
      : "Hosted image generation uses OpenRouter. Press Ctrl+Enter to submit.";
}

function updateImageStudioHelp(provider: ImageProviderMode): void {
  const help = document.getElementById("image-studio-help");
  const status = document.getElementById("image-studio-status");
  if (help instanceof HTMLElement) {
    help.textContent = provider === "comfyui"
      ? "Local ComfyUI is active. Use a checkpoint like sd_xl_base_1.0.safetensors."
      : provider === "nvidia"
        ? "NVIDIA cloud image generation is active."
        : "OpenRouter hosted image generation is active.";
  }
  if (status instanceof HTMLElement && !imageGenerationSubmitting) {
    status.textContent = `${getImageProviderDisplayName(provider)} selected. Press Ctrl+Enter to generate.`;
  }
}

function syncImageStudioControls(prefillPrompt = false): void {
  const provider = getActiveImageGenerationProvider();
  const promptInput = document.getElementById("image-studio-prompt-input");
  const modelInput = document.getElementById("image-studio-model-input");
  const aspectSelect = document.getElementById("image-studio-aspect-select");
  const composerInput = document.getElementById("composer-input");
  const comfyuiBaseUrlInput = document.getElementById("comfyui-base-url-input");

  refreshImageGenerationModelOptions(provider);
  updateImageGenerationModalHelp(provider);
  updateImageStudioHelp(provider);
  updateImageProviderButtons(provider);

  if (promptInput instanceof HTMLTextAreaElement && prefillPrompt && composerInput instanceof HTMLTextAreaElement) {
    const composerText = composerInput.value.trim();
    if (composerText && !promptInput.value.trim()) {
      promptInput.value = composerText;
    }
  }

  if (modelInput instanceof HTMLInputElement) {
    const currentModel = modelInput.value.trim();
    modelInput.value = isProviderCompatibleImageModel(provider, currentModel)
      ? currentModel
      : getDefaultImageGenerationModel(provider);
  }

  if (comfyuiBaseUrlInput instanceof HTMLInputElement) {
    comfyuiBaseUrlInput.value = (settings?.comfyuiBaseUrl ?? "").trim() || COMFYUI_DEFAULT_BASE_URL;
  }

  if (aspectSelect instanceof HTMLSelectElement && !aspectSelect.value) {
    aspectSelect.value = "1:1";
  }
}

function setImageStudioStatus(message: string): void {
  const status = document.getElementById("image-studio-status");
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

function getDefaultImageGenerationModel(provider = getActiveImageGenerationProvider()): string {
  if (provider === "comfyui") {
    return COMFYUI_DEFAULT_IMAGE_MODEL;
  }

  const selectedModel = (($("model-select") as HTMLSelectElement | null)?.value ?? "").trim();
  if (isImageCapableModel(selectedModel)) return selectedModel;

  const configuredModels = settings?.models ?? [];
  return configuredModels.find((model) => isImageCapableModel(model))
    ?? getImageGenerationModelOptions(provider).find((model) => configuredModels.includes(model))
    ?? (provider === "nvidia" ? NVIDIA_DEFAULT_IMAGE_MODEL : OPENROUTER_DEFAULT_IMAGE_MODEL);
}

function buildImageGenerationUserPrompt(prompt: string, aspectRatio: ImageGenerationAspectRatio): string {
  return [
    `Generate image: ${prompt}`,
    `Aspect ratio: ${aspectRatio}`
  ].join("\n");
}

function buildImageGenerationAssistantMessage(result: ImageGenerationResult): string {
  const summary = result.text.trim() || `Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`;
  const imageBlocks = result.images
    .map((image, index) => `![Generated image ${index + 1}](${image.dataUrl})`)
    .join("\n\n");

  return [
    summary,
    "",
    `Provider: \`${getImageProviderDisplayName(result.provider)}\``,
    `Model: \`${result.model}\``,
    `Aspect ratio: \`${result.aspectRatio}\``,
    "",
    imageBlocks
  ].join("\n").trim();
}

function formatImageHistoryTimestamp(value?: string): string {
  if (!value) return "Not saved yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getImageHistorySortTime(item: GeneratedImageHistoryItem): number {
  const timestamps = [item.updatedAt, item.createdAt, item.lastSavedAt];
  for (const value of timestamps) {
    const parsed = Date.parse(value ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function createImageHistoryChip(label: string, tone: "default" | "accent" = "default"): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = `image-history-chip${tone === "accent" ? " accent" : ""}`;
  chip.textContent = label;
  chip.title = label;
  return chip;
}

function renderImageHistoryListInto(listId: string, emptyId: string): void {
  const list = document.getElementById(listId);
  const emptyState = document.getElementById(emptyId);
  if (!(list instanceof HTMLElement) || !(emptyState instanceof HTMLElement)) return;
  const isStudioVariant = listId === "image-studio-history-list";

  list.innerHTML = "";
  if (imageHistoryLoading) {
    emptyState.style.display = "block";
    emptyState.textContent = "Loading image history...";
    return;
  }

  if (imageHistoryItems.length === 0) {
    emptyState.style.display = "block";
    emptyState.textContent = "No generated images in history yet.";
    return;
  }

  emptyState.style.display = "none";
  const items = [...imageHistoryItems].sort((left, right) => getImageHistorySortTime(right) - getImageHistorySortTime(left));
  for (const [index, item] of items.entries()) {
    const card = document.createElement("article");
    card.className = `image-history-entry${isStudioVariant ? " is-gallery" : ""}`;

    const figure = document.createElement("figure");
    figure.className = `message-image-card image-history-card${isStudioVariant ? " is-gallery-card" : ""}`;

    const visual = document.createElement("div");
    visual.className = "image-history-visual";

    const image = document.createElement("img");
    image.className = "message-image";
    image.src = item.dataUrl;
    image.alt = item.prompt || "Generated image";
    image.loading = "lazy";
    visual.appendChild(image);
    figure.appendChild(visual);

    const caption = document.createElement("figcaption");
    caption.className = "image-history-caption";

    const top = document.createElement("div");
    top.className = "image-history-top";

    const info = document.createElement("div");
    info.className = "image-history-meta";

    const eyebrow = document.createElement("div");
    eyebrow.className = "image-history-overline";
    eyebrow.textContent = item.saveCount > 0
      ? "Saved asset"
      : index === 0
        ? "Latest render"
        : "Generated asset";
    info.appendChild(eyebrow);

    const prompt = document.createElement("strong");
    prompt.className = "image-history-prompt";
    prompt.textContent = item.prompt || "Untitled image prompt";
    prompt.title = prompt.textContent;
    info.appendChild(prompt);

    const chips = document.createElement("div");
    chips.className = "image-history-chips";
    chips.appendChild(createImageHistoryChip(compactModelName(item.model)));
    chips.appendChild(createImageHistoryChip(item.aspectRatio));
    chips.appendChild(createImageHistoryChip(formatImageHistoryTimestamp(item.createdAt)));
    if (item.saveCount > 0) {
      chips.appendChild(createImageHistoryChip(`Saved ${item.saveCount}x`, "accent"));
    }
    info.appendChild(chips);

    const details = document.createElement("div");
    details.className = "image-history-details image-history-meta-line";
    details.textContent = `${compactModelName(item.model)} • ${item.aspectRatio} • ${formatImageHistoryTimestamp(item.createdAt)}`;
    info.appendChild(details);

    const saved = document.createElement("div");
    saved.className = "image-history-details image-history-status-line";
    saved.textContent = item.saveCount > 0
      ? `Saved ${item.saveCount} time${item.saveCount === 1 ? "" : "s"} • ${formatImageHistoryTimestamp(item.lastSavedAt)}`
      : "Not saved outside Cipher yet";
    info.appendChild(saved);

    if (item.text.trim()) {
      const text = document.createElement("div");
      text.className = "image-history-note";
      text.textContent = item.text.trim();
      text.title = text.textContent;
      info.appendChild(text);
    }

    const actions = document.createElement("div");
    actions.className = "image-history-actions";

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "btn-ghost-sm image-history-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.onclick = () => {
      openImagePreview(item);
    };
    actions.appendChild(previewBtn);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "message-image-save-btn";
    saveBtn.dataset["imageName"] = sanitizeDownloadName(item.prompt || "cipher-generated-image");
    saveBtn.dataset["imageAssetId"] = item.id;
    saveBtn.textContent = "Save image";
    saveBtn.onclick = async () => {
      try {
        const result = await window.api.images.save(item.dataUrl, saveBtn.dataset["imageName"], item.id);
        showToast(result.message, result.ok ? 2200 : 2800);
        if (result.ok) {
          await refreshImageHistory();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Image save failed.", 2800);
      }
    };
    actions.appendChild(saveBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-ghost-sm image-history-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
      try {
        const result = await window.api.images.deleteHistory(item.id);
        showToast(result.message, result.ok ? 2200 : 2800);
        if (result.ok) {
          imageHistoryItems = imageHistoryItems.filter((entry) => entry.id !== item.id);
          renderImageHistoryViews();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Delete failed.", 2800);
      }
    };
    actions.appendChild(deleteBtn);

    top.appendChild(info);
    top.appendChild(actions);
    caption.appendChild(top);
    figure.appendChild(caption);
    card.appendChild(figure);
    list.appendChild(card);
  }
}

function renderImageHistoryViews(): void {
  renderImageHistoryListInto("image-history-list", "image-history-empty");
  renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
}

async function refreshImageHistory(): Promise<void> {
  imageHistoryLoading = true;
  renderImageHistoryViews();
  try {
    imageHistoryItems = await window.api.images.listHistory();
  } catch (err) {
    imageHistoryItems = [];
    showToast(err instanceof Error ? err.message : "Failed to load image history.", 3200);
  } finally {
    imageHistoryLoading = false;
    renderImageHistoryViews();
  }
}

function closeImageHistoryModal(): void {
  const modal = document.getElementById("image-history-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "none";
}

async function openImageHistoryModal(): Promise<void> {
  const modal = document.getElementById("image-history-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "flex";
  await refreshImageHistory();
}

function closeImageGenerationModal(force = false): void {
  if (imageGenerationSubmitting && !force) return;
  const modal = document.getElementById("image-generation-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "none";
  ($("image-generation-submit-btn") as HTMLButtonElement).disabled = false;
  ($("image-generation-cancel-btn") as HTMLButtonElement).disabled = false;
}

function openImageGenerationModal(): void {
  const imageProvider = getActiveImageGenerationProvider();
  if (imageProvider !== "comfyui" && !settings?.apiKey?.trim()) {
    showToast(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to generate images.`, 3200);
    openPanel("settings");
    return;
  }

  const promptInput = $("image-generation-prompt-input") as HTMLTextAreaElement;
  const modelInput = $("image-generation-model-input") as HTMLInputElement;
  const aspectSelect = $("image-generation-aspect-select") as HTMLSelectElement;
  const composerInput = $("composer-input") as HTMLTextAreaElement;
  const modal = $("image-generation-modal");
  const composerText = composerInput.value.trim();

  refreshImageGenerationModelOptions(imageProvider);
  updateImageGenerationModalHelp(imageProvider);
  promptInput.value = composerText || promptInput.value.trim();
  const currentModel = modelInput.value.trim();
  modelInput.value = isProviderCompatibleImageModel(imageProvider, currentModel)
    ? currentModel
    : getDefaultImageGenerationModel(imageProvider);
  aspectSelect.value = aspectSelect.value || "1:1";
  modal.style.display = "flex";
  promptInput.focus();
  promptInput.select();
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

async function submitImageStudioGeneration(): Promise<void> {
  if (imageGenerationSubmitting) return;

  const imageProvider = getActiveImageGenerationProvider();
  if (imageProvider !== "comfyui" && !settings?.apiKey?.trim()) {
    setImageStudioStatus(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to continue.`);
    showToast(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to generate images.`, 3200);
    openPanel("settings");
    return;
  }

  const promptInput = document.getElementById("image-studio-prompt-input");
  const modelInput = document.getElementById("image-studio-model-input");
  const aspectSelect = document.getElementById("image-studio-aspect-select");
  const generateBtn = document.getElementById("image-studio-generate-btn");

  if (!(promptInput instanceof HTMLTextAreaElement)
    || !(modelInput instanceof HTMLInputElement)
    || !(aspectSelect instanceof HTMLSelectElement)
    || !(generateBtn instanceof HTMLButtonElement)) {
    showToast("Image Studio controls are unavailable.", 3200);
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    setImageStudioStatus("Image prompt required.");
    promptInput.focus();
    showToast("Image prompt required.", 2200);
    return;
  }

  const requestedModel = modelInput.value.trim();
  const model = isProviderCompatibleImageModel(imageProvider, requestedModel)
    ? requestedModel
    : getDefaultImageGenerationModel(imageProvider);
  const aspectRatio = (aspectSelect.value || "1:1") as ImageGenerationAspectRatio;

  imageGenerationSubmitting = true;
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  modelInput.value = model;
  setImageStudioStatus(`Generating with ${compactModelName(model)}...`);

  try {
    const result = await window.api.images.generate({ prompt, provider: imageProvider, model, aspectRatio });
    await refreshImageHistory();
    setImageStudioStatus(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"} with ${compactModelName(result.model)} via ${getImageProviderDisplayName(result.provider)}.`);
    showToast(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`, 2200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed.";
    setImageStudioStatus(message);
    showToast(message, 3600);
  } finally {
    imageGenerationSubmitting = false;
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Image";
  }
}

async function sendMessage() {
  if (currentInteractionMode === "agent") {
    const resolvedPromptInput = resolveAgentPromptInput();
    const prompt = resolvedPromptInput?.input.value.trim() ?? "";
    if (!prompt) return;
    syncComposerAgentPrompts(resolvedPromptInput?.source ?? "composer");
    const started = await startAgentTaskPrompt(prompt);
    if (started) {
      clearAgentPrompts();
    }
    return;
  }
  if (currentMode === "claude") {
    await sendClaudePrompt();
    return;
  }
  if (currentMode === "edit") {
    await sendClaudeEditSavePrompt();
    return;
  }
  const input = $("composer-input") as HTMLTextAreaElement;
  const rawContent = input.value.trim();
  if (!rawContent && activeAttachments.length === 0) return;
  await sendChatPromptWithAttachments(rawContent, [...activeAttachments]);
}

// â”€â”€ IPC Events â”€â”€
async function openFreshWorkspaceWindow(): Promise<void> {
  try {
    const result = await window.api.app.newWindow();
    if (!result.ok) {
      showToast(result.message || "Failed to open a new window.", 2800);
      return;
    }
    showToast(result.message || "Opened a new workspace window.", 1800);
  } catch (err) {
    showToast(`Failed to open a new window: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}

async function syncChatStoreAcrossWindows(payload?: { chatId?: string; reason?: string }): Promise<void> {
  await loadChatList();
  const affectedChatId = (payload?.chatId ?? "").trim();
  if (!affectedChatId) return;

  if (payload?.reason === "delete" && currentChatId === affectedChatId) {
    currentChatId = null;
    const fallbackChatId = cachedChatSummaries[0]?.id;
    if (fallbackChatId) {
      await loadChat(fallbackChatId);
    } else {
      clearMessages();
    }
    return;
  }

  if (currentChatId === affectedChatId && (payload?.reason === "rename" || payload?.reason === "system-prompt" || payload?.reason === "context")) {
    await loadChat(affectedChatId);
  }
}

async function syncSettingsAcrossWindows(): Promise<void> {
  await loadSettings();
  await refreshMcpStatus();
}

async function syncRouterStateAcrossWindows(): Promise<void> {
  await refreshRouterStatus();
  await refreshMcpStatus();
}

function setupIpcListeners() {
  window.api.chat.onStoreChanged((payload) => {
    void syncChatStoreAcrossWindows(payload);
  });

  window.api.chat.onMessage((chatId, msg) => {
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
  });

  window.api.chat.onChunk((chatId, msgId, _chunk) => {
    if (chatId !== currentChatId) return;
    const existing = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    const updated = existing + _chunk;
    updateMessageContent(msgId, updated, false, false);
    scheduleChunkAutoScroll();
  });

  window.api.chat.onDone((chatId, msgId) => {
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
  });

  window.api.chat.onError((chatId, msgId, err) => {
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
  });

  window.api.settings.onChanged(() => {
    void syncSettingsAcrossWindows();
  });

  window.api.router.onStateChanged(() => {
    void syncRouterStateAcrossWindows();
  });

  window.api.claude.onOutput((payload) => {
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
  });

    window.api.claude.onError((message) => {
      claudeSessionRunning = false;
      claudeSessionChatId = null;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
    appendClaudeLine(message, "stderr");
    finalizeClaudeAssistantMessage(true);
    setClaudeStatus(message, "err");
    setStreamingUi(false);
    showToast(message, 3500);
  });

  window.api.claude.onExit((payload) => {
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
  applyLoadedSettingsToUi(loaded);
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
  const claudeChatFilesystem = getClaudeChatFilesystemSettingsDraft();
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
    showToast("API key ghalat format mein hai. Sirf sk-or-v1-... key paste karo.", 4500);
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

  await loadRouterLogs();
}

async function loadRouterLogs() {
  const logs = await window.api.router.logs();
  $("router-log").textContent = logs.join("\n");
}

function setAgentStatus(message: string, tone: "ok" | "err" | "" = ""): void {
  const el = $("agent-status-msg");
  el.textContent = message;
  el.className = `status-msg ${tone}`.trim();
}

function formatAgentTaskTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatRouteDiagnosticTimestamp(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type ModelHealthTone = "active" | "working" | "warning" | "blocked" | "failing" | "untested";

function getRouteDiagnosticsByModel(diagnostics: AgentRouteDiagnostics | null): Map<string, AgentModelRouteDiagnostics> {
  const map = new Map<string, AgentModelRouteDiagnostics>();
  for (const route of diagnostics?.routes ?? []) {
    if (!map.has(route.model)) map.set(route.model, route);
  }
  return map;
}

function getEffectiveTaskRouteState(task: AgentTask | null, diagnostics: AgentRouteDiagnostics | null): AgentTaskRouteDiagnostics | undefined {
  return diagnostics?.task ?? (task?.telemetry?.routeDiagnostics
    ? {
      taskId: task.id,
      blacklistedModels: task.telemetry.routeDiagnostics.blacklistedModels,
      failureCounts: task.telemetry.routeDiagnostics.failureCounts,
      visionRequested: task.telemetry.routeDiagnostics.visionRequested ?? false,
      activeStageRoutes: task.telemetry.routeDiagnostics.activeStageRoutes
    }
    : undefined);
}

function describeModelHealth(
  model: string,
  route: AgentModelRouteDiagnostics | undefined,
  taskState?: AgentTaskRouteDiagnostics
): { tone: ModelHealthTone; label: string; detail: string } {
  if (taskState?.blacklistedModels.includes(model)) {
    return { tone: "blocked", label: "Blocked", detail: "This model is blacklisted for the active task." };
  }
  if (taskState?.activeStageRoutes.some((entry) => entry.model === model)) {
    return { tone: "active", label: "Active", detail: "This model is in the current task's live route order." };
  }
  if (!route) {
    return { tone: "untested", label: "Untested", detail: "No reliability history captured yet." };
  }
  if (route.successes > 0 && route.failures === 0 && route.transientFailures === 0 && route.semanticFailures === 0) {
    return { tone: "working", label: "Working", detail: "Recent history is clean with successful runs." };
  }
  if (route.successes > 0) {
    return { tone: "warning", label: "Mixed", detail: "This model works, but it also has some failure history." };
  }
  if (route.failures > 0 || route.semanticFailures > 0) {
    return { tone: "failing", label: "Failing", detail: "This model only shows failed attempts right now." };
  }
  if (route.transientFailures > 0) {
    return { tone: "warning", label: "Unstable", detail: "Only transient failures have been seen so far." };
  }
  return { tone: "untested", label: "Untested", detail: "No useful reliability signal yet." };
}

function buildModelHealthBadgeTone(tone: ModelHealthTone): string {
  if (tone === "active" || tone === "working") return "ok";
  if (tone === "blocked" || tone === "failing") return "err";
  return "";
}

function renderRouteScoreFactors(factors: AgentModelRouteScoreFactor[] | undefined): string {
  const safeFactors = (factors ?? []).filter((factor) => factor && typeof factor.label === "string");
  if (safeFactors.length === 0) return "";
  return safeFactors.map((factor) => {
    const tone = factor.delta > 0 ? "ok" : factor.delta < 0 ? "err" : "";
    const deltaLabel = factor.delta > 0 ? `+${factor.delta}` : `${factor.delta}`;
    return `<span class="agent-history-badge ${tone}">${escHtml(`${deltaLabel} ${factor.label}`)}</span>`;
  }).join("");
}

function formatBlacklistProgress(entry: Pick<AgentTaskRouteFailureCount, "blacklisted" | "hardFailuresUntilBlacklist" | "transientFailuresUntilBlacklist">): string {
  if (entry.blacklisted) return "Blacklisted for this task";
  const hardLabel = entry.hardFailuresUntilBlacklist === 0
    ? "hard blacklist reached"
    : `${entry.hardFailuresUntilBlacklist} hard left`;
  const transientLabel = entry.transientFailuresUntilBlacklist === 0
    ? "transient blacklist reached"
    : `${entry.transientFailuresUntilBlacklist} transient left`;
  return `${hardLabel} / ${transientLabel}`;
}

function findBestKnownRoute(
  diagnostics: AgentRouteDiagnostics | null,
  provider: "remote" | "local"
): AgentModelRouteDiagnostics | null {
  return diagnostics?.routes.find((route) => route.provider === provider && route.successes > 0) ?? null;
}

function renderSettingsModelHealth(diagnostics: AgentRouteDiagnostics | null, task: AgentTask | null = null): void {
  const el = document.getElementById("settings-model-health");
  if (!(el instanceof HTMLElement)) return;

  if (!settings) {
    el.innerHTML = '<div class="settings-model-health-empty">Model health will appear after settings load.</div>';
    return;
  }

  const activeCloudProvider = getCloudProviderModeFromSettings(settings);
  const activeCloudProviderName = getProviderDisplayName(activeCloudProvider);
  const cloudModels = getVisibleModelsForProvider(settings, activeCloudProvider);
  const localModels = getVisibleModelsForProvider(settings, "ollama");
  const configuredModels = [...cloudModels, ...localModels];
  if (configuredModels.length === 0) {
    el.innerHTML = '<div class="settings-model-health-empty">Add models in Settings first. After the app uses them, health signals will start appearing here.</div>';
    return;
  }

  const routeByModel = getRouteDiagnosticsByModel(diagnostics);
  const taskState = getEffectiveTaskRouteState(task, diagnostics);
  const bestCloud = findBestKnownRoute(diagnostics, "remote");
  const bestLocal = findBestKnownRoute(diagnostics, "local");
  const summaryCards = [
    {
      title: "Implementation",
      model: (settings.routing?.default ?? settings.defaultModel ?? "").trim(),
      help: "Primary bias for normal coding and generation work."
    },
    {
      title: "Repair",
      model: (settings.routing?.think ?? settings.defaultModel ?? "").trim(),
      help: "Preferred model when fix or recovery work is needed."
    },
    {
      title: "Planning",
      model: (settings.routing?.longContext ?? settings.defaultModel ?? "").trim(),
      help: "Preferred model when broader task planning needs more context."
    }
  ];

  el.innerHTML = `
    <div class="settings-model-health-summary">
      <div class="settings-model-health-card">
        <div class="settings-model-health-head">
          <div>
            <div class="settings-model-health-title">Working now</div>
            <div class="settings-model-health-help">Fast answer for which model is actually performing well.</div>
          </div>
          <div class="settings-model-health-badges">
            <span class="agent-history-badge ${bestCloud ? "ok" : ""}">${escHtml(bestCloud ? `Best ${getCloudProviderLabelFromBaseUrl(bestCloud.baseUrl)}: ${bestCloud.model}` : `Best ${activeCloudProviderName}: no signal`)}</span>
            <span class="agent-history-badge ${bestLocal ? "ok" : ""}">${escHtml(bestLocal ? `Best local: ${bestLocal.model}` : "Best local: no signal")}</span>
          </div>
        </div>
        <div class="settings-model-health-badges">
          ${summaryCards.map((entry) => {
            const route = routeByModel.get(entry.model);
            const status = describeModelHealth(entry.model, route, taskState);
            return `<span class="agent-history-badge ${buildModelHealthBadgeTone(status.tone)}" title="${escHtml(entry.help)}">${escHtml(`${entry.title}: ${status.label}`)}</span>`;
          }).join("")}
        </div>
        <div class="settings-model-health-help">${escHtml(taskState?.blacklistedModels.length ? `Active task blacklist: ${taskState.blacklistedModels.join(", ")}` : "No active task blacklist right now.")}</div>
      </div>
    </div>
    <div class="settings-model-health-list">
      ${configuredModels.map((model) => {
        const route = routeByModel.get(model);
        const status = describeModelHealth(model, route, taskState);
        return `
          <div class="settings-model-health-item status-${status.tone}">
            <div class="settings-model-health-top">
              <div class="settings-model-health-model">
                <strong>${escHtml(model)}</strong>
                <span>${escHtml(getCloudProviderLabelForModel(model, route))}</span>
              </div>
              <span class="agent-history-badge ${buildModelHealthBadgeTone(status.tone)}">${escHtml(status.label)}</span>
            </div>
            <div class="settings-model-health-meta">
              ${renderModelCapabilityBadges(model)}
              <span class="agent-history-badge">${escHtml(`Success ${route?.successes ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.failures ?? 0) > 0 ? "err" : ""}">${escHtml(`Hard fail ${route?.failures ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.transientFailures ?? 0) > 0 ? "err" : ""}">${escHtml(`Transient ${route?.transientFailures ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.semanticFailures ?? 0) > 0 ? "err" : ""}">${escHtml(`Semantic ${route?.semanticFailures ?? 0}`)}</span>
              ${typeof route?.score === "number" ? `<span class="agent-history-badge ${route.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${route.score}`)}</span>` : ""}
            </div>
            ${route?.scoreFactors?.length ? `<div class="settings-model-health-meta">${renderRouteScoreFactors(route.scoreFactors)}</div>` : ""}
            <div class="settings-model-health-footnote">${escHtml(status.detail)}${route?.lastUsedAt ? ` Last used: ${formatRouteDiagnosticTimestamp(route.lastUsedAt)}.` : ""}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function summarizeAgentPrompt(prompt: string): string {
  const normalized = (prompt ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Untitled task";
  return normalized.length > 84 ? `${normalized.slice(0, 84)}...` : normalized;
}

function getSnapshotKindLabel(snapshot: WorkspaceSnapshot): string {
  if (snapshot.kind === "before-task") return "Before task";
  if (snapshot.kind === "after-task") return "After task";
  return "Snapshot";
}

function getSnapshotRestoreActionLabel(snapshot: WorkspaceSnapshot): string {
  if (snapshot.kind === "before-task") return "Restore Before Snapshot";
  if (snapshot.kind === "after-task") return "Restore After Snapshot";
  return "Restore Snapshot";
}

function getRestoreStateForTask(task: AgentTask): AgentSnapshotRestoreResult | null {
  if (!activeAgentRestoreState?.ok) return null;
  return activeAgentRestoreState.taskId === task.id ? activeAgentRestoreState : null;
}

function getRestoreStateBadgeLabel(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") return "Current Before state";
  if (result.snapshotKind === "after-task") return "Current After state";
  return "Current restored state";
}

function getRestoreStateSummary(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") return "Current workspace is on the Before snapshot for this task.";
  if (result.snapshotKind === "after-task") return "Current workspace is on the After snapshot for this task.";
  return "Current workspace matches a restored snapshot for this task.";
}

function getRestoreStateDetail(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") {
    return "Generated output from this run may be missing until you restore After.";
  }
  if (result.snapshotKind === "after-task") {
    return "The finished task output should be available in the workspace again.";
  }
  return result.message;
}

function buildSnapshotRestoreWarning(snapshot: WorkspaceSnapshot): string {
  const lines = [
    `${getSnapshotRestoreActionLabel(snapshot)} "${snapshot.label}"?`,
    "",
    "This will replace the current workspace state."
  ];
  if (snapshot.kind === "before-task") {
    lines.push("This snapshot was taken before the linked task started.");
    if (snapshot.targetPathHint) {
      lines.push(`It may remove files created later under: ${snapshot.targetPathHint}`);
    }
  } else if (snapshot.kind === "after-task") {
    lines.push("This snapshot was taken after the linked task completed.");
    if (snapshot.targetPathHint) {
      lines.push(`It should include the generated workspace state under: ${snapshot.targetPathHint}`);
    }
  }
  return lines.join("\n");
}

function buildSnapshotRestoreSummary(snapshot: WorkspaceSnapshot): string {
  const parts = [
    getSnapshotKindLabel(snapshot),
    snapshot.targetPathHint ? `Target: ${snapshot.targetPathHint}` : "",
    `${snapshot.fileCount} files`
  ].filter(Boolean);
  return parts.join(" | ");
}

function formatSnapshotFileSample(snapshot: WorkspaceSnapshot | null): string {
  if (!snapshot) return "No snapshot available.";
  const sampleFiles = snapshot.targetEntries && snapshot.targetEntries.length > 0
    ? snapshot.targetEntries
    : snapshot.topLevelEntries && snapshot.topLevelEntries.length > 0
      ? snapshot.topLevelEntries
      : [];
  return sampleFiles.length > 0 ? sampleFiles.join("\n") : "No file sample available for this snapshot.";
}

function openSnapshotRestoreModal(snapshot: WorkspaceSnapshot): void {
  pendingSnapshotRestoreId = snapshot.id;
  $("snapshot-restore-label").textContent = snapshot.label || snapshot.id;
  $("snapshot-restore-badges").innerHTML = [
    `<span class="agent-history-badge">${escHtml(getSnapshotKindLabel(snapshot))}</span>`,
    `<span class="agent-history-badge">${escHtml(`${snapshot.fileCount} files`)}</span>`,
    snapshot.targetPathHint ? `<span class="agent-history-badge">${escHtml(snapshot.targetPathHint)}</span>` : ""
  ].filter(Boolean).join("");
  $("snapshot-restore-warning").textContent = buildSnapshotRestoreWarning(snapshot);
  $("snapshot-restore-files").textContent = formatSnapshotFileSample(snapshot);
  $("snapshot-restore-confirm-btn").textContent = getSnapshotRestoreActionLabel(snapshot);

  const compareSection = $("snapshot-compare-section");
  const compareBefore = $("snapshot-compare-before");
  const compareAfter = $("snapshot-compare-after");
  const compareSummary = $("snapshot-compare-summary");
  const taskSnapshots = snapshot.taskId ? getSnapshotsForTask(snapshot.taskId) : [];
  const beforeSnapshot = taskSnapshots.find((item) => item.kind === "before-task") ?? null;
  const afterSnapshot = taskSnapshots.find((item) => item.kind === "after-task") ?? null;

  if (beforeSnapshot && afterSnapshot && beforeSnapshot.id !== afterSnapshot.id) {
    compareBefore.textContent = formatSnapshotFileSample(beforeSnapshot);
    compareAfter.textContent = formatSnapshotFileSample(afterSnapshot);
    const beforeEntries = new Set((beforeSnapshot.targetEntries && beforeSnapshot.targetEntries.length > 0
      ? beforeSnapshot.targetEntries
      : beforeSnapshot.topLevelEntries) ?? []);
    const afterEntries = (afterSnapshot.targetEntries && afterSnapshot.targetEntries.length > 0
      ? afterSnapshot.targetEntries
      : afterSnapshot.topLevelEntries) ?? [];
    const addedEntries = afterEntries.filter((entry) => !beforeEntries.has(entry));
    compareSummary.textContent = addedEntries.length > 0
      ? `Only in After: ${addedEntries.slice(0, 4).join(", ")}${addedEntries.length > 4 ? ", ..." : ""}`
      : "Before and After samples overlap heavily for this task.";
    compareSection.style.display = "block";
  } else {
    compareBefore.textContent = "";
    compareAfter.textContent = "";
    compareSummary.textContent = "";
    compareSection.style.display = "none";
  }

  $("snapshot-restore-modal").style.display = "flex";
}

function closeSnapshotRestoreModal(): void {
  pendingSnapshotRestoreId = null;
  $("snapshot-restore-modal").style.display = "none";
  $("snapshot-compare-before").textContent = "";
  $("snapshot-compare-after").textContent = "";
  $("snapshot-compare-summary").textContent = "";
  $("snapshot-compare-section").style.display = "none";
}

function compactAgentProviderFailureMessage(message: string): string {
  const normalized = (message ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "unknown failure";
  if (/overloaded/i.test(normalized)) return "provider overloaded";
  if (/rate limit|api error 429/i.test(normalized)) return "rate limited";
  if (/timed out|timeout|aborted due to timeout|operation was aborted/i.test(normalized)) return "timed out";
  if (/insufficient .*credits|budget|api error 402/i.test(normalized)) return "insufficient credits";
  if (/malformed json/i.test(normalized)) return "malformed JSON";
  if (/empty response/i.test(normalized)) return "empty response";
  if (/api error (\d{3})/i.test(normalized)) {
    const code = normalized.match(/api error (\d{3})/i)?.[1] ?? "";
    return code ? `API ${code}` : normalized;
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function parseExhaustedAgentModelRoutes(summary: string): { stage: string; routes: Array<{ model: string; reason: string }> } | null {
  const normalized = (summary ?? "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.+?) exhausted all configured model routes\. Tried:\s*(.+?)\.?$/i);
  if (!match) return null;

  const stage = (match[1] ?? "Agent request").trim();
  const detail = (match[2] ?? "").trim();
  const routes = detail
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => {
      const routeMatch = part.match(/^(.+?) \((?:\d+) attempts?: (.+)\)$/i);
      if (!routeMatch) {
        return { model: part, reason: "request failed" };
      }
      const model = (routeMatch[1] ?? "").trim();
      const message = (routeMatch[2] ?? "")
        .split(/\s*\|\s*/)
        .map((value) => value.trim())
        .find(Boolean) ?? "";
      return { model, reason: compactAgentProviderFailureMessage(message) };
    });

  return { stage, routes };
}

function summarizeExhaustedAgentModelRoutes(summary: string): string | null {
  const parsed = parseExhaustedAgentModelRoutes(summary);
  if (!parsed) return null;
  if (parsed.routes.length === 0) return `${parsed.stage} exhausted all configured model routes.`;
  return `${parsed.stage} failed after trying ${parsed.routes.map((route) => `${route.model}: ${route.reason}`).join("; ")}.`;
}

function summarizeAgentTaskSummary(summary: string, fallbackStatus: AgentTask["status"]): string {
  const normalized = (summary ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return `Task ${fallbackStatus}.`;
  const exhaustedRoutes = summarizeExhaustedAgentModelRoutes(normalized);
  if (exhaustedRoutes) {
    return exhaustedRoutes.length > 180 ? `${exhaustedRoutes.slice(0, 177)}...` : exhaustedRoutes;
  }
  const withoutVerification = normalized.replace(/\s+Verification:\s+.+?\.?$/i, "").trim();
  const concise = withoutVerification || normalized;
  return concise.length > 180 ? `${concise.slice(0, 180)}...` : concise;
}

function buildExhaustedRouteText(summary: string | undefined): string[] {
  const parsed = parseExhaustedAgentModelRoutes(summary ?? "");
  if (!parsed || parsed.routes.length === 0) return [];
  return [
    `Model fallback: ${parsed.stage}`,
    ...parsed.routes.slice(0, 4).map((route) => `Model tried: ${route.model} - ${route.reason}`)
  ];
}

function formatAgentArtifactType(artifactType?: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Web app";
    case "api-service":
      return "API service";
    case "script-tool":
      return "Script tool";
    case "library":
      return "Library";
    case "desktop-app":
      return "Desktop app";
    case "workspace-change":
      return "Workspace change";
    default:
      return "Unknown artifact";
  }
}

function getArtifactResultTitle(artifactType?: AgentArtifactType, primaryAction?: AgentOutputPrimaryAction): string {
  if (primaryAction === "inspect-package") return "Prepared package output";
  if (primaryAction === "inspect-workspace") return "Prepared workspace changes";
  if (primaryAction === "run-service") return "Prepared API service";
  if (primaryAction === "run-tool") return "Prepared script tool";
  if (primaryAction === "run-desktop") return "Prepared desktop app";
  if (primaryAction === "run-web-app" || primaryAction === "preview-web") return "Prepared web app";

  switch (artifactType) {
    case "web-app":
      return "Prepared web app";
    case "api-service":
      return "Prepared API service";
    case "script-tool":
      return "Prepared script tool";
    case "library":
      return "Prepared library output";
    case "desktop-app":
      return "Prepared desktop app";
    case "workspace-change":
      return "Prepared workspace changes";
    default:
      return "Prepared task output";
  }
}

function parseAgentArtifactTypeLabel(value: string): AgentArtifactType | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "web app":
      return "web-app";
    case "api service":
      return "api-service";
    case "script tool":
      return "script-tool";
    case "library":
      return "library";
    case "desktop app":
      return "desktop-app";
    case "workspace change":
      return "workspace-change";
    case "unknown artifact":
      return "unknown";
    default:
      return undefined;
  }
}

function isWebArtifactType(artifactType?: AgentArtifactType): boolean {
  return artifactType === "web-app";
}

function isTaskPreviewable(task: AgentTask): boolean {
  if (!task.targetPath || !task.verification?.previewReady) return false;
  return task.artifactType ? isWebArtifactType(task.artifactType) : true;
}

function getArtifactOpenLabel(artifactType?: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Open App Folder";
    case "api-service":
      return "Open Service Folder";
    case "script-tool":
      return "Open Tool Folder";
    case "library":
      return "Open Package Folder";
    case "desktop-app":
      return "Open App Folder";
    case "workspace-change":
      return "Open Changed Folder";
    default:
      return "Open Folder";
  }
}

function formatAgentPrimaryAction(action?: AgentOutputPrimaryAction): string {
  switch (action) {
    case "preview-web":
      return "Preview web app";
    case "run-web-app":
      return "Run web app";
    case "run-service":
      return "Run service";
    case "run-tool":
      return "Run tool";
    case "run-desktop":
      return "Run desktop app";
    case "inspect-package":
      return "Inspect package";
    case "inspect-workspace":
      return "Inspect workspace";
    case "preview":
      return "Preview";
    case "run-command":
      return "Run command";
    case "inspect":
      return "Inspect";
    case "open-folder":
      return "Open folder";
    default:
      return "Open folder";
  }
}

function getArtifactUsageCopy(artifactType?: AgentArtifactType): { title: string; detail: string } | null {
  switch (artifactType) {
    case "web-app":
      return {
        title: "Primary surface: browser preview.",
        detail: "Use Preview for the running app and Open App Folder when you need the source project."
      };
    case "api-service":
      return {
        title: "Primary surface: runnable service.",
        detail: "Open Service Folder to inspect the codebase and run the API from its project directory."
      };
    case "script-tool":
      return {
        title: "Primary surface: runnable tool.",
        detail: "Open Tool Folder to inspect the files and run the script or CLI locally."
      };
    case "library":
      return {
        title: "Primary surface: package source.",
        detail: "Open Package Folder to inspect the implementation, tests, and build outputs."
      };
    case "desktop-app":
      return {
        title: "Primary surface: desktop project.",
        detail: "Open App Folder to inspect the desktop project and run it from its local workspace."
      };
    case "workspace-change":
      return {
        title: "Primary surface: workspace files.",
        detail: "Open Changed Folder to inspect the files changed by this task inside the current workspace."
      };
    default:
      return null;
  }
}

async function refreshAgentTaskTargetStates(tasks: AgentTask[]): Promise<void> {
  const next = new Map<string, boolean>();
  await Promise.all(tasks.map(async (task) => {
    if (!task.targetPath) return;
    try {
      next.set(task.id, await window.api.workspace.pathExists(task.targetPath));
    } catch {
      next.set(task.id, false);
    }
  }));

  taskTargetExistsById.clear();
  for (const [taskId, exists] of next.entries()) {
    taskTargetExistsById.set(taskId, exists);
  }
}

function isTaskTargetMissing(task: AgentTask): boolean {
  return Boolean(task.targetPath) && taskTargetExistsById.get(task.id) === false;
}

function getSnapshotsForTask(taskId: string): WorkspaceSnapshot[] {
  return cachedAgentSnapshots
    .filter((snapshot) => snapshot.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getLatestSnapshotForTask(taskId: string, kind: WorkspaceSnapshot["kind"]): WorkspaceSnapshot | null {
  return getSnapshotsForTask(taskId).find((snapshot) => snapshot.kind === kind) ?? null;
}

function buildTaskSnapshotBadges(task: AgentTask): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const restoreState = getRestoreStateForTask(task);
  if (!beforeSnapshot && !afterSnapshot) return "";

  return `
    <div class="agent-history-badges task-snapshot-badges">
      ${beforeSnapshot ? `<span class="agent-history-badge">${escHtml("Before task")}</span>` : ""}
      ${afterSnapshot ? `<span class="agent-history-badge ok">${escHtml("After task")}</span>` : ""}
      ${restoreState ? `<span class="agent-history-badge ${restoreState.snapshotKind === "before-task" ? "err" : "ok"}">${escHtml(getRestoreStateBadgeLabel(restoreState))}</span>` : ""}
    </div>
  `;
}

function buildTaskMissingTargetState(task: AgentTask): string {
  if (!isTaskTargetMissing(task)) return "";

  return `
    <div class="task-missing-target">
      <div class="task-missing-target-title">Target is not in the current workspace state.</div>
      <div class="task-missing-target-detail">If you restored a Before snapshot, this task output may have been removed.</div>
    </div>
  `;
}

function buildTaskSnapshotActions(task: AgentTask, variant: "main" | "panel"): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const restoreState = getRestoreStateForTask(task);
  if (!beforeSnapshot && !afterSnapshot) return "";

  const attr = variant === "main" ? "data-main-agent-snapshot-id" : "data-agent-history-snapshot-id";
  const showAfterAction = Boolean(afterSnapshot) && restoreState?.snapshotKind !== "after-task" && restoreState?.snapshotKind !== "before-task";
  const showBeforeAction = Boolean(beforeSnapshot) && restoreState?.snapshotKind !== "before-task";
  if (!showAfterAction && !showBeforeAction) return "";

  return `
    <div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"} task-snapshot-actions">
      ${showAfterAction && afterSnapshot ? `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(afterSnapshot.id)}">Restore After</button>` : ""}
      ${showBeforeAction && beforeSnapshot ? `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(beforeSnapshot.id)}">Restore Before</button>` : ""}
    </div>
  `;
}

function buildTaskSnapshotHint(task: AgentTask): string {
  const restoreState = getRestoreStateForTask(task);
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  if (!beforeSnapshot && !afterSnapshot) return "";
  if (restoreState?.snapshotKind === "before-task") {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output when you want to return to the post-task state.</div>';
  }
  if (restoreState?.snapshotKind === "after-task") {
    return '<div class="task-snapshot-hint">Restore Before will undo this task again if you want the pre-task workspace state.</div>';
  }
  if (beforeSnapshot && afterSnapshot) {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output. Restore Before undoes this run.</div>';
  }
  if (afterSnapshot) {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output state.</div>';
  }
  return '<div class="task-snapshot-hint">Restore Before returns the workspace to the state before this run.</div>';
}

function buildTaskRestoreState(task: AgentTask, variant: "main" | "panel"): string {
  const restoreState = getRestoreStateForTask(task);
  if (!restoreState) return "";

  const tone = restoreState.snapshotKind === "before-task" ? "warn" : restoreState.snapshotKind === "after-task" ? "ok" : "neutral";
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const recoverAttr = variant === "main" ? "data-main-agent-snapshot-id" : "data-agent-history-snapshot-id";
  const recoverCta = restoreState.snapshotKind === "before-task" && afterSnapshot
    ? `<button class="btn-ghost-sm task-restore-state-cta" type="button" ${recoverAttr}="${escHtml(afterSnapshot.id)}">Restore After to Recover</button>`
    : "";

  return `
    <div class="task-restore-state task-restore-state-${tone}">
      <div class="task-restore-state-copy">
        <div class="task-restore-state-title">${escHtml(getRestoreStateSummary(restoreState))}</div>
        <div class="task-restore-state-detail">${escHtml(getRestoreStateDetail(restoreState))}</div>
      </div>
      ${recoverCta}
    </div>
  `;
}

function buildTaskSnapshotDiff(task: AgentTask): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const afterEntries = afterSnapshot?.targetEntries ?? [];
  const beforeEntries = beforeSnapshot?.targetEntries ?? [];

  if (afterEntries.length === 0 && beforeEntries.length === 0) return "";

  const addedEntries = afterEntries.filter((entry) => !beforeEntries.includes(entry)).slice(0, 4);
  const visibleEntries = (addedEntries.length > 0 ? addedEntries : afterEntries).slice(0, 4);
  if (visibleEntries.length === 0) return "";

  const label = addedEntries.length > 0 ? "After snapshot adds" : "After snapshot includes";
  return `
    <div class="task-snapshot-diff">
      <span class="task-snapshot-diff-label">${escHtml(label)}</span>
      <div class="task-snapshot-diff-list">
        ${visibleEntries.map((entry) => `<span class="agent-history-badge">${escHtml(entry)}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildTaskPrimaryActions(task: AgentTask, variant: "main" | "panel"): string {
  const targetMissing = isTaskTargetMissing(task);
  const previewAttr = variant === "main" ? "data-main-agent-history-preview" : "data-agent-history-preview";
  const openAttr = variant === "main" ? "data-main-agent-history-open-folder" : "data-agent-history-open-folder";
  const copyRunAttr = variant === "main" ? "data-main-agent-history-copy-run" : "data-agent-history-copy-run";
  const buttons: string[] = [];
  const copyRunButton = task.output?.runCommand
    ? `<button class="btn-ghost-sm" type="button" ${copyRunAttr}="${escHtml(task.id)}">${escHtml(getAgentRunCommandButtonLabel(task.output.primaryAction))}</button>`
    : "";

  const previewButton = isTaskPreviewable(task)
    ? `<button class="btn-ghost-sm" type="button" ${previewAttr}="${escHtml(task.id)}"${targetMissing ? " disabled" : ""}>Preview</button>`
    : "";
  const openFolderButton = task.targetPath
    ? `<button class="btn-ghost-sm" type="button" ${openAttr}="${escHtml(task.id)}"${targetMissing ? " disabled" : ""}>${escHtml(getArtifactOpenLabel(task.artifactType))}</button>`
    : "";

  if (isPreviewPrimaryAction(task.output?.primaryAction)) {
    if (previewButton) buttons.push(previewButton);
    if (copyRunButton) buttons.push(copyRunButton);
    if (openFolderButton) buttons.push(openFolderButton);
  } else if (isRunPrimaryAction(task.output?.primaryAction)) {
    if (copyRunButton) buttons.push(copyRunButton);
    if (openFolderButton) buttons.push(openFolderButton);
    if (previewButton) buttons.push(previewButton);
  } else {
    if (openFolderButton) buttons.push(openFolderButton);
    if (copyRunButton) buttons.push(copyRunButton);
    if (previewButton) buttons.push(previewButton);
  }

  if (buttons.length === 0) return "";
  return `<div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"}">${buttons.join("")}</div>`;
}

function canRestartAgentTask(task: AgentTask): boolean {
  return task.status === "failed" || task.status === "stopped";
}

function getAgentRestartModeLabel(mode: AgentTaskRestartMode): string {
  if (mode === "retry-clean") return "Retry Clean";
  if (mode === "continue-fix") return "Continue Fix";
  return "Retry";
}

function buildTaskRestartActions(task: AgentTask, variant: "main" | "panel"): string {
  if (!canRestartAgentTask(task)) return "";
  const attr = variant === "main" ? "data-main-agent-restart-task-id" : "data-agent-history-restart-task-id";
  const buttons = (["retry", "retry-clean", "continue-fix"] as AgentTaskRestartMode[]).map((mode) => {
    return `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(task.id)}" data-agent-restart-mode="${escHtml(mode)}">${escHtml(getAgentRestartModeLabel(mode))}</button>`;
  });
  return `<div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"}">${buttons.join("")}</div>`;
}

function hasPackagingVerificationFailure(task: AgentTask): boolean {
  return (task.verification?.checks ?? []).some((check) => {
    if (check.status !== "failed") return false;
    return check.label === "Windows packaging" || /windows installer packaging failed/i.test(check.details);
  });
}

function buildPackagingRetryButton(task: AgentTask, variant: "main" | "panel"): string {
  if (!canRestartAgentTask(task) || !hasPackagingVerificationFailure(task)) return "";
  const attr = variant === "main" ? "data-main-agent-restart-task-id" : "data-agent-history-restart-task-id";
  return `<button class="btn-ghost-sm task-result-overview-retry" type="button" ${attr}="${escHtml(task.id)}" data-agent-restart-mode="continue-fix">Retry</button>`;
}

function buildVerificationMiniBadges(checks: AgentVerificationReport["checks"] | undefined, limit = 3): string {
  if (!checks || checks.length === 0) return "";
  return checks
    .slice(0, limit)
    .map((check) => `<span class="agent-history-badge ${check.status === "passed" ? "ok" : check.status === "failed" ? "err" : ""}">${escHtml(`${check.label}: ${check.status}`)}</span>`)
    .join("");
}

function buildExhaustedRouteBadges(summary: string | undefined): string {
  const parsed = parseExhaustedAgentModelRoutes(summary ?? "");
  if (!parsed || parsed.routes.length === 0) return "";
  const badges = parsed.routes
    .slice(0, 3)
    .map((route) => `<span class="agent-history-badge err">${escHtml(`${route.model}: ${route.reason}`)}</span>`)
    .join("");
  return `
    <div class="task-result-overview-verify">
      <strong>Models tried</strong>
      <span class="task-result-overview-meta">${badges}</span>
    </div>
  `;
}

function formatStarterProfileLabel(profile?: string): string {
  const normalized = (profile ?? "").trim();
  if (!normalized) return "Custom";
  return normalized
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function formatDomainFocusLabel(domainFocus?: string): string {
  const normalized = (domainFocus ?? "").trim();
  if (!normalized) return "General";
  if (normalized === "crm") return "CRM";
  if (normalized === "admin") return "Internal Admin";
  return normalized
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function buildExecutionSpecSection(spec?: AgentExecutionSpec): string {
  if (!spec) return "";

  const deliverables = spec.deliverables.slice(0, 4);
  const acceptance = spec.acceptanceCriteria.slice(0, 4);
  const qualityGates = spec.qualityGates.slice(0, 4);
  const scriptGroups = spec.requiredScriptGroups.slice(0, 3).map((group) => `${group.label}: ${group.options.join(" / ")}`);
  const fileBadges = spec.requiredFiles.slice(0, 4);

  return `
    <div class="task-result-overview-spec">
      <div class="task-result-overview-spec-head">
        <strong>Execution brief</strong>
        <span class="agent-history-badge">${escHtml(formatStarterProfileLabel(spec.starterProfile))}</span>
      </div>
      <div class="task-result-overview-spec-summary">${escHtml(spec.summary)}</div>
      ${spec.domainFocus ? `<div class="task-result-overview-spec-list"><strong>Domain focus</strong><span>${escHtml(formatDomainFocusLabel(spec.domainFocus))}</span></div>` : ""}
      ${deliverables.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Deliverables</strong><span>${escHtml(deliverables.join(" | "))}</span></div>` : ""}
      ${acceptance.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Acceptance</strong><span>${escHtml(acceptance.join(" | "))}</span></div>` : ""}
      ${qualityGates.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Quality gates</strong><span>${escHtml(qualityGates.join(" | "))}</span></div>` : ""}
      ${scriptGroups.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Required scripts</strong><span>${escHtml(scriptGroups.join(" | "))}</span></div>` : ""}
      ${fileBadges.length > 0 ? `<div class="task-result-overview-meta">${fileBadges.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

function buildReviewList(title: string, items: string[], tone: "default" | "warn" | "err" = "default"): string {
  if (items.length === 0) return "";
  return `
    <div class="task-review-card ${tone !== "default" ? `task-review-card-${tone}` : ""}">
      <strong>${escHtml(title)}</strong>
      <ul class="task-review-list">
        ${items.map((item) => `<li>${escHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function buildTaskReviewSection(task: AgentTask): string {
  const plannedFiles = (task.executionSpec?.requiredFiles ?? []).slice(0, 8);
  const fileOverflow = (task.executionSpec?.requiredFiles?.length ?? 0) - plannedFiles.length;
  const verifierFindings = (task.verification?.checks ?? [])
    .filter((check) => check.status !== "passed")
    .slice(0, 5)
    .map((check) => `${check.label}: ${check.status}. ${check.details}`);
  const repairTrail = task.steps
    .filter((step) => /fix|repair|recovery/i.test(step.title) || /fix|repair/i.test(step.summary ?? ""))
    .slice(-4)
    .map((step) => `${step.title} (${step.status})${step.summary ? `: ${step.summary}` : ""}`);
  const memoryHints = (task.telemetry?.failureMemoryHints ?? []).slice(0, 3);

  if (plannedFiles.length === 0 && verifierFindings.length === 0 && repairTrail.length === 0 && memoryHints.length === 0) {
    return "";
  }

  const plannedItems = fileOverflow > 0
    ? [...plannedFiles, `+${fileOverflow} more planned path${fileOverflow === 1 ? "" : "s"}`]
    : plannedFiles;

  return `
    <div class="task-review-grid">
      ${buildReviewList("Planned file map", plannedItems)}
      ${buildReviewList("Verifier findings", verifierFindings, verifierFindings.some((item) => /failed/i.test(item)) ? "err" : "warn")}
      ${buildReviewList("Repair trail", repairTrail)}
      ${buildReviewList("Memory hints used", memoryHints, "warn")}
    </div>
  `;
}

function buildTaskResultOverview(task: AgentTask, variant: "main" | "panel"): string {
  const artifactLabel = formatAgentArtifactType(task.artifactType);
  const resultTitle = getArtifactResultTitle(task.artifactType, task.output?.primaryAction);
  const usage = task.output?.usageTitle && task.output?.usageDetail
    ? { title: task.output.usageTitle, detail: task.output.usageDetail }
    : getArtifactUsageCopy(task.artifactType);
  const meta = [
    task.output?.primaryAction ? `Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}` : "",
    task.output?.runCommand ? `Run: ${task.output.runCommand}` : "",
    task.output?.workingDirectory ? `Dir: ${task.output.workingDirectory}` : "",
    task.output?.packageName ? `Package: ${task.output.packageName}` : ""
  ].filter(Boolean);
  const telemetryMeta = [
    task.telemetry?.selectedModel ? `Model: ${task.telemetry.selectedModel}` : "",
    task.telemetry?.fallbackUsed && task.telemetry.fallbackModel ? `Fallback: ${task.telemetry.fallbackModel}` : "",
    task.telemetry?.failureStage ? `Failure stage: ${task.telemetry.failureStage}` : "",
    task.telemetry?.failureCategory ? `Failure type: ${task.telemetry.failureCategory}` : "",
    task.telemetry?.finalVerificationResult ? `Verification result: ${task.telemetry.finalVerificationResult}` : "",
    task.telemetry?.routeDiagnostics?.blacklistedModels.length
      ? `Blacklisted models: ${task.telemetry.routeDiagnostics.blacklistedModels.length}`
      : "",
    task.telemetry?.routeDiagnostics?.activeStageRoutes.length
      ? `Remembered routes: ${task.telemetry.routeDiagnostics.activeStageRoutes.length}`
      : ""
  ].filter(Boolean);
  const verificationBadges = buildVerificationMiniBadges(task.verification?.checks);
  const exhaustedRouteBadges = buildExhaustedRouteBadges(task.summary);
  const packagingRetryButton = buildPackagingRetryButton(task, variant);

  return `
    <div class="task-result-overview">
      <div class="task-result-overview-head">
        <div class="task-result-overview-title">${escHtml(task.status === "failed" ? "Result needs attention" : resultTitle)}</div>
        ${task.artifactType ? `<span class="agent-history-badge">${escHtml(artifactLabel)}</span>` : ""}
      </div>
      ${task.summary ? `<div class="task-result-overview-summary">${escHtml(summarizeAgentTaskSummary(task.summary, task.status))}</div>` : ""}
      ${buildExecutionSpecSection(task.executionSpec)}
      ${buildTaskReviewSection(task)}
      ${usage ? `<div class="task-result-overview-usage"><strong>${escHtml(usage.title)}</strong><span>${escHtml(usage.detail)}</span></div>` : ""}
      ${task.verification?.summary ? `<div class="task-result-overview-verify"><div class="task-result-overview-verify-head"><strong>Verification</strong>${packagingRetryButton}</div><span>${escHtml(task.verification.summary)}</span></div>` : ""}
      ${exhaustedRouteBadges}
      ${meta.length > 0 ? `<div class="task-result-overview-meta">${meta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${telemetryMeta.length > 0 ? `<div class="task-result-overview-meta">${telemetryMeta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${verificationBadges ? `<div class="task-result-overview-meta">${verificationBadges}</div>` : ""}
    </div>
  `;
}

function buildParsedResultOverview(parsed: ParsedAgentMessage): string {
  const artifactLabel = parsed.artifactType ? formatAgentArtifactType(parsed.artifactType) : "Task output";
  const resultTitle = getArtifactResultTitle(parsed.artifactType, parsed.output?.primaryAction);
  const usage = parsed.output?.usageDetail
    ? {
      title: parsed.output.usageTitle ?? `Primary action: ${formatAgentPrimaryAction(parsed.output.primaryAction)}`,
      detail: parsed.output.usageDetail
    }
    : getArtifactUsageCopy(parsed.artifactType);
  const meta = [
    parsed.output?.primaryAction ? `Primary action: ${formatAgentPrimaryAction(parsed.output.primaryAction)}` : "",
    parsed.output?.runCommand ? `Run: ${parsed.output.runCommand}` : "",
    parsed.output?.workingDirectory ? `Dir: ${parsed.output.workingDirectory}` : "",
    parsed.output?.packageName ? `Package: ${parsed.output.packageName}` : ""
  ].filter(Boolean);
  const verificationBadges = parsed.verifyChecks.length > 0
    ? parsed.verifyChecks
      .slice(0, 3)
      .map((check) => `<span class="agent-history-badge ${check.status === "passed" ? "ok" : check.status === "failed" ? "err" : ""}">${escHtml(`${check.label}: ${check.status}`)}</span>`)
      .join("")
    : "";
  const exhaustedRouteBadges = buildExhaustedRouteBadges(parsed.summary);

  if (!parsed.summary && !usage && !parsed.verifySummary && meta.length === 0 && !verificationBadges) {
    return "";
  }

  return `
    <section class="agent-card-summary-block agent-card-result-overview">
      <div class="agent-card-summary-label">Result Overview</div>
      <div class="task-result-overview-head">
        <div class="task-result-overview-title">${escHtml(parsed.status === "failed" ? "Result needs attention" : resultTitle)}</div>
        ${parsed.artifactType ? `<span class="agent-history-badge">${escHtml(artifactLabel)}</span>` : ""}
      </div>
      ${parsed.summary ? `<div class="task-result-overview-summary">${escHtml(summarizeAgentTaskSummary(parsed.summary, (parsed.status as AgentTask["status"]) || "completed"))}</div>` : ""}
      ${usage ? `<div class="task-result-overview-usage"><strong>${escHtml(usage.title)}</strong><span>${escHtml(usage.detail)}</span></div>` : ""}
      ${parsed.verifySummary ? `<div class="task-result-overview-verify"><strong>Verification</strong><span>${escHtml(parsed.verifySummary)}</span></div>` : ""}
      ${exhaustedRouteBadges}
      ${meta.length > 0 ? `<div class="task-result-overview-meta">${meta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${verificationBadges ? `<div class="task-result-overview-meta">${verificationBadges}</div>` : ""}
    </section>
  `;
}

function buildMainChatCards(chats: ChatSummary[]): string {
  const recentChats = chats.slice(0, 4);
  if (recentChats.length === 0) {
    return '<div class="empty-panel-note">Your recent conversations will appear here for quick access.</div>';
  }

  return recentChats.map((chat) => `
    <div class="empty-chat-card${chat.id === currentChatId ? " active" : ""}" data-main-chat-history-id="${escHtml(chat.id)}">
      <div class="empty-chat-top">
        <strong>${escHtml(chat.title)}</strong>
        <span>${escHtml(formatUiTime(chat.updatedAt))}</span>
      </div>
      <div class="empty-chat-meta">
        <span class="agent-history-badge">${escHtml(`${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`)}</span>
      </div>
    </div>
  `).join("");
}

function buildMainAgentTaskCards(tasks: AgentTask[]): string {
  const recentTasks = tasks.slice(0, 4);
  if (recentTasks.length === 0) {
    return '<div class="empty-panel-note">Run your first supervised task and it will appear here.</div>';
  }

  return recentTasks.map((task) => {
    const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
    const targetMissing = isTaskTargetMissing(task);

    return `
      <div class="empty-agent-task-card${task.id === activeAgentTaskId ? " active" : ""}" data-main-agent-history-id="${escHtml(task.id)}">
        <div class="empty-agent-task-top">
          <strong>${escHtml(summarizeAgentPrompt(task.prompt))}</strong>
          <span>${escHtml(formatAgentTaskTimestamp(task.updatedAt))}</span>
        </div>
        ${buildTaskResultOverview(task, "main")}
        <div class="empty-agent-task-badges">
          <span class="agent-history-badge ${tone}">${escHtml(task.status)}</span>
          ${task.artifactType ? `<span class="agent-history-badge">${escHtml(formatAgentArtifactType(task.artifactType))}</span>` : ""}
          ${task.verification?.summary ? `<span class="agent-history-badge">${escHtml(task.verification.summary)}</span>` : ""}
          ${targetMissing ? `<span class="agent-history-badge err">${escHtml("Target missing")}</span>` : ""}
        </div>
        ${buildTaskSnapshotBadges(task)}
        ${buildTaskSnapshotActions(task, "main")}
        ${buildTaskRestoreState(task, "main")}
        ${buildTaskMissingTargetState(task)}
        ${buildTaskSnapshotHint(task)}
        ${buildTaskSnapshotDiff(task)}
        ${buildTaskRestartActions(task, "main")}
        ${buildTaskPrimaryActions(task, "main")}
      </div>
    `;
  }).join("");
}

function renderAgentHistoryFilters(): void {
  const filterRoot = $("agent-history-filters");
  filterRoot.querySelectorAll<HTMLElement>("[data-agent-history-filter]").forEach((el) => {
    el.classList.toggle("active", (el.dataset["agentHistoryFilter"] ?? "all") === agentHistoryFilter);
  });
}

function renderAgentHistoryControls(totalCount: number, visibleCount: number): void {
  const controlsEl = $("agent-history-controls");
  const toggleBtn = $("agent-history-toggle-btn") as HTMLButtonElement;

  if (totalCount <= 1) {
    controlsEl.style.display = "none";
    toggleBtn.textContent = "Show More";
    return;
  }

  controlsEl.style.display = "flex";
  if (agentHistoryExpanded) {
    toggleBtn.textContent = "Show Less";
    return;
  }

  const hiddenCount = Math.max(0, totalCount - visibleCount);
  toggleBtn.textContent = hiddenCount > 0 ? `Show More (${hiddenCount})` : "Show More";
}

function syncAgentHistoryPanelWidth(): void {
  const panel = document.getElementById("right-panel");
  const isAgentPanelOpen = panel instanceof HTMLElement
    && panel.style.display !== "none"
    && (panel.dataset["openTab"] ?? rightPanelTab) === "agent";

  if (!isAgentPanelOpen) return;

  if (agentHistoryExpanded) {
    if (agentHistoryCollapsedPanelWidth === null) {
      agentHistoryCollapsedPanelWidth = currentRightPanelWidth;
    }
    applyRightPanelWidth(getRightPanelMaxWidth());
    return;
  }

  if (agentHistoryCollapsedPanelWidth !== null) {
    applyRightPanelWidth(agentHistoryCollapsedPanelWidth);
    agentHistoryCollapsedPanelWidth = null;
  }
}

function renderAgentHistory(tasks: AgentTask[]): void {
  const historyEl = $("agent-history");
  cachedAgentTasks = tasks;
  renderAgentHistoryFilters();
  refreshEmptyStateIfNeeded();
  const filteredTasks = agentHistoryFilter === "all"
    ? tasks
    : tasks.filter((task) => task.status === agentHistoryFilter);

  if (filteredTasks.length === 0) {
    historyEl.innerHTML = '<div class="agent-history-empty">Recent agent tasks will appear here with status and verification details.</div>';
    renderAgentHistoryControls(0, 0);
    return;
  }

  const visibleTasks = agentHistoryExpanded ? filteredTasks : filteredTasks.slice(0, 1);
  historyEl.innerHTML = visibleTasks.map((task) => {
    const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
    const targetMissing = isTaskTargetMissing(task);
    const verificationBadge = task.verification?.summary
      ? `<span class="agent-history-badge ${tone}">${escHtml(task.verification.summary)}</span>`
      : "";
    const artifactBadge = task.artifactType
      ? `<span class="agent-history-badge">${escHtml(formatAgentArtifactType(task.artifactType))}</span>`
      : "";
    const targetBadge = task.targetPath
      ? `<span class="agent-history-badge">${escHtml(task.targetPath)}</span>`
      : "";
    const failedReasons = (task.verification?.checks ?? [])
      .filter((check) => check.status === "failed")
      .slice(0, 2)
      .map((check) => `<div class="agent-history-reason">${escHtml(`${check.label}: ${summarizeAgentTaskSummary(check.details, "failed")}`)}</div>`)
      .join("");
    const passedCount = (task.verification?.checks ?? []).filter((check) => check.status === "passed").length;
    const failedCount = (task.verification?.checks ?? []).filter((check) => check.status === "failed").length;
    const skippedCount = (task.verification?.checks ?? []).filter((check) => check.status === "skipped").length;
    const verificationStats = task.verification
      ? `<div class="agent-history-stats">
          <span class="agent-history-badge ok">${escHtml(`${passedCount} passed`)}</span>
          ${failedCount > 0 ? `<span class="agent-history-badge err">${escHtml(`${failedCount} failed`)}</span>` : ""}
          ${skippedCount > 0 ? `<span class="agent-history-badge">${escHtml(`${skippedCount} skipped`)}</span>` : ""}
        </div>`
      : "";

    return `
      <button class="agent-history-item${task.id === activeAgentTaskId ? " active" : ""}" type="button" data-agent-history-id="${escHtml(task.id)}">
        <div class="agent-history-top">
          <div class="agent-history-title">${escHtml(summarizeAgentPrompt(task.prompt))}</div>
          <div class="agent-history-meta">${escHtml(formatAgentTaskTimestamp(task.updatedAt))}</div>
        </div>
        ${buildTaskResultOverview(task, "panel")}
        ${failedReasons ? `<div class="agent-history-reasons">${failedReasons}</div>` : ""}
        <div class="agent-history-badges">
          <span class="agent-history-badge ${tone}">${escHtml(task.status)}</span>
          ${artifactBadge}
          ${verificationBadge}
          ${targetBadge}
          ${targetMissing ? `<span class="agent-history-badge err">${escHtml("Target missing")}</span>` : ""}
        </div>
        ${buildTaskSnapshotBadges(task)}
        ${buildTaskSnapshotActions(task, "panel")}
        ${buildTaskRestoreState(task, "panel")}
        ${buildTaskMissingTargetState(task)}
        ${buildTaskSnapshotHint(task)}
        ${buildTaskSnapshotDiff(task)}
        ${verificationStats}
        ${buildTaskRestartActions(task, "panel")}
        ${buildTaskPrimaryActions(task, "panel")}
      </button>
    `;
  }).join("");
  renderAgentHistoryControls(filteredTasks.length, visibleTasks.length);
}

function syncActiveAgentTaskSelectionUi(): void {
  renderAgentHistory(cachedAgentTasks);
}

function renderAgentSnapshots(snapshots: WorkspaceSnapshot[]): void {
  const snapshotsEl = $("agent-snapshots");
  cachedAgentSnapshots = snapshots;

  if (snapshots.length === 0) {
    snapshotsEl.innerHTML = '<div class="agent-history-empty">Rollback snapshots will appear here after agent tasks start.</div>';
    return;
  }

  snapshotsEl.innerHTML = snapshots.slice(0, 10).map((snapshot) => `
    <div class="agent-history-item">
      <div class="agent-history-top">
        <div class="agent-history-title">${escHtml(snapshot.label || snapshot.id)}</div>
        <div class="agent-history-meta">${escHtml(formatAgentTaskTimestamp(snapshot.createdAt))}</div>
      </div>
      <div class="agent-history-summary">${escHtml(snapshot.id)}</div>
      <div class="agent-snapshot-meta">
        <span class="agent-history-badge">${escHtml(getSnapshotKindLabel(snapshot))}</span>
        <span class="agent-history-badge">${escHtml(`${snapshot.fileCount} files`)}</span>
        ${snapshot.taskId ? `<span class="agent-history-badge">${escHtml(snapshot.taskId)}</span>` : ""}
        ${snapshot.targetPathHint ? `<span class="agent-history-badge">${escHtml(snapshot.targetPathHint)}</span>` : ""}
      </div>
      <div class="agent-snapshot-actions">
        ${snapshot.taskId ? `<button class="btn-ghost-sm" type="button" data-agent-snapshot-task-id="${escHtml(snapshot.taskId)}">View Task</button>` : ""}
        <button class="btn-ghost-sm" type="button" data-agent-snapshot-id="${escHtml(snapshot.id)}">Restore</button>
      </div>
    </div>
  `).join("");
}

function renderAgentRouteDiagnostics(diagnostics: AgentRouteDiagnostics | null, task: AgentTask | null = null): void {
  const el = document.getElementById("agent-route-health");
  if (!(el instanceof HTMLElement)) return;
  cachedAgentRouteDiagnostics = diagnostics;
  renderSettingsModelHealth(diagnostics, task);

  if (!diagnostics || diagnostics.routes.length === 0) {
    el.innerHTML = '<div class="agent-route-health-empty">Reliability stats will appear here after the agent has tried at least one model route.</div>';
    return;
  }

  const topRoutes = diagnostics.routes.slice(0, 6);
  const taskState = getEffectiveTaskRouteState(task, diagnostics);
  const taskMarkup = taskState
    ? `
      <div class="agent-route-health-block">
        <div class="agent-route-health-title">Active task route state</div>
        <div class="agent-route-health-help">${escHtml(diagnostics.task ? "Task-specific blacklisting and remembered stage routes exist only while a task is active." : "This route-state summary was persisted on the task before runtime cleanup.")}</div>
        <div class="agent-route-health-summary">
          <span class="agent-history-badge">${escHtml(`Task: ${taskState.taskId}`)}</span>
          <span class="agent-history-badge ${taskState.blacklistedModels.length > 0 ? "err" : "ok"}">${escHtml(taskState.blacklistedModels.length > 0 ? `${taskState.blacklistedModels.length} blacklisted` : "No blacklist")}</span>
          <span class="agent-history-badge ${taskState.activeStageRoutes.length > 0 ? "ok" : ""}">${escHtml(`${taskState.activeStageRoutes.length} stage routes`)}</span>
          ${taskState.visionRequested ? '<span class="agent-history-badge ok">Vision input</span>' : ""}
        </div>
        ${taskState.blacklistedModels.length > 0 ? `<div class="agent-route-health-stats">${taskState.blacklistedModels.map((model) => `<span class="agent-history-badge err">${escHtml(`Blocked: ${model}`)}</span>`).join("")}</div>` : ""}
        ${taskState.failureCounts.length > 0 ? `<div class="agent-route-health-stats">${taskState.failureCounts.map((entry) => `<span class="agent-history-badge ${entry.blacklisted ? "err" : ""}">${escHtml(`${entry.model}: ${entry.count} failure${entry.count === 1 ? "" : "s"} • ${formatBlacklistProgress(entry)}`)}</span>`).join("")}</div>` : ""}
        ${taskState.activeStageRoutes.length > 0 ? `<div class="agent-route-health-stage-list">${taskState.activeStageRoutes.map((entry) => `
          <div class="agent-route-health-stage">
            <span class="agent-history-badge ok">${escHtml(entry.stage)}</span>
            <span class="agent-history-badge">${escHtml(entry.model)}</span>
            <span class="agent-history-badge">${escHtml(`Route ${entry.routeIndex + 1}`)}</span>
            <span class="agent-history-badge">${escHtml(`Attempt ${entry.attempt}`)}</span>
            <span class="agent-history-badge ${entry.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${entry.score}`)}</span>
            <span class="agent-history-badge ${entry.blacklisted ? "err" : ""}">${escHtml(formatBlacklistProgress(entry))}</span>
            ${entry.visionRequested ? `<span class="agent-history-badge ${entry.visionCapable ? "ok" : "err"}">${escHtml(entry.visionCapable ? "Vision-selected" : "Vision fallback")}</span>` : ""}
            ${renderRouteScoreFactors(entry.scoreFactors)}
            <div class="agent-route-health-footnote">${escHtml(entry.selectionReason)}</div>
          </div>
        `).join("")}</div>` : '<div class="agent-route-health-help">No stage route is currently remembered for this task.</div>'}
      </div>
    `
    : `
      <div class="agent-route-health-block">
        <div class="agent-route-health-title">Active task route state</div>
        <div class="agent-route-health-help">Select or start an agent task to inspect blacklist and remembered stage routes here.</div>
      </div>
    `;

  el.innerHTML = `
    ${taskMarkup}
    <div class="agent-route-health-block">
      <div class="agent-route-health-title">Global route reliability</div>
      <div class="agent-route-health-help">Higher scores move a model earlier in runtime route ordering. Semantic failures are penalized harder than transient failures, and transient failures blacklist more slowly.</div>
      <div class="agent-route-health-grid">
        ${topRoutes.map((route) => `
          <div class="agent-route-health-item">
            <div class="agent-route-health-top">
              <div class="agent-route-health-model">
                <strong>${escHtml(route.model)}</strong>
                <span>${escHtml(route.baseUrl)}</span>
              </div>
              <span class="agent-history-badge ${route.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${route.score}`)}</span>
            </div>
            <div class="agent-route-health-stats">
              <span class="agent-history-badge ${route.provider === "local" ? "ok" : ""}">${escHtml(route.provider === "local" ? "Local" : "Cloud")}</span>
              ${renderModelCapabilityBadges(route.model)}
              <span class="agent-history-badge">${escHtml(`${route.successes} success`)}</span>
              <span class="agent-history-badge ${route.failures > 0 ? "err" : ""}">${escHtml(`${route.failures} hard fail`)}</span>
              <span class="agent-history-badge ${route.transientFailures > 0 ? "err" : ""}">${escHtml(`${route.transientFailures} transient`)}</span>
              <span class="agent-history-badge ${route.semanticFailures > 0 ? "err" : ""}">${escHtml(`${route.semanticFailures} semantic`)}</span>
            </div>
            ${route.scoreFactors.length > 0 ? `<div class="agent-route-health-stats">${renderRouteScoreFactors(route.scoreFactors)}</div>` : ""}
            <div class="agent-route-health-footnote">${escHtml(`Last used: ${formatRouteDiagnosticTimestamp(route.lastUsedAt)}`)}</div>
          </div>
        `).join("")}
      </div>
      <div class="agent-route-health-footnote">Showing the top ${topRoutes.length} routes by current reliability score.</div>
    </div>
  `;
}

async function refreshAgentRouteDiagnostics(taskId?: string): Promise<void> {
  try {
    const diagnostics = await window.api.agent.getRouteDiagnostics(taskId);
    const task = taskId ? (cachedAgentTasks.find((item) => item.id === taskId) ?? null) : null;
    renderAgentRouteDiagnostics(diagnostics, task);
  } catch (err) {
    const el = document.getElementById("agent-route-health");
    const message = err instanceof Error ? err.message : "Unable to load route health.";
    if (el instanceof HTMLElement) {
      el.innerHTML = `<div class="agent-route-health-empty">${escHtml(message)}</div>`;
    }
    const settingsEl = document.getElementById("settings-model-health");
    if (settingsEl instanceof HTMLElement) {
      settingsEl.innerHTML = `<div class="settings-model-health-empty">${escHtml(message)}</div>`;
    }
  }
}

async function refreshAgentSnapshots(): Promise<void> {
  activeAgentRestoreState = await window.api.agent.getRestoreState();
  const snapshots = await window.api.agent.listSnapshots();
  renderAgentSnapshots(snapshots);
}

function renderAgentTask(task: AgentTask | null, logs: string[]): void {
  const stepsEl = $("agent-steps");
  const logEl = $("agent-log");
  const targetEl = $("agent-target-msg");

  if (!task) {
    activeAgentTaskStatus = null;
    stepsEl.textContent = "No agent task started yet.";
    logEl.textContent = logs.join("\n");
    targetEl.textContent = "Target: workspace root";
    return;
  }

  const restoreState = getRestoreStateForTask(task);
  const activity = buildAgentActivityLabel(task);
  const stepLines = [
    `Status: ${task.status}`,
    `Activity: ${activity}`,
    `Prompt: ${task.prompt}`,
    ...(task.attachments?.length ? [`Attachments: ${task.attachments.map((attachment) => attachment.name).join(" | ")}`] : []),
    ...(task.artifactType ? [`Artifact: ${formatAgentArtifactType(task.artifactType)}`] : []),
    ...(task.executionSpec?.starterProfile ? [`Starter profile: ${formatStarterProfileLabel(task.executionSpec.starterProfile)}`] : []),
    ...(task.executionSpec?.domainFocus ? [`Domain focus: ${formatDomainFocusLabel(task.executionSpec.domainFocus)}`] : []),
    ...(task.executionSpec?.summary ? [`Execution brief: ${task.executionSpec.summary}`] : []),
    ...(task.executionSpec?.deliverables?.length ? [`Deliverables: ${task.executionSpec.deliverables.join(" | ")}`] : []),
    ...(task.executionSpec?.acceptanceCriteria?.length ? [`Acceptance: ${task.executionSpec.acceptanceCriteria.join(" | ")}`] : []),
    ...(task.executionSpec?.qualityGates?.length ? [`Quality gates: ${task.executionSpec.qualityGates.join(" | ")}`] : []),
    ...(task.executionSpec?.requiredFiles?.length ? [`Planned file map: ${task.executionSpec.requiredFiles.slice(0, 8).join(" | ")}`] : []),
    ...(task.output?.primaryAction ? [`Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}`] : []),
    ...(task.output?.runCommand ? [`Run command: ${task.output.runCommand}`] : []),
    ...(task.output?.workingDirectory ? [`Working directory: ${task.output.workingDirectory}`] : []),
    ...(task.output?.packageName ? [`Package: ${task.output.packageName}`] : []),
    ...(task.output?.usageDetail ? [`How to use: ${task.output.usageDetail}`] : []),
    ...(!task.output?.usageDetail && getArtifactUsageCopy(task.artifactType) ? [`How to use: ${getArtifactUsageCopy(task.artifactType)?.detail}`] : []),
    ...(task.targetPath ? [`Target: ${task.targetPath}`] : []),
    ...(restoreState ? [`Workspace state: ${getRestoreStateSummary(restoreState)}`] : []),
    ...(task.rollbackSnapshotId ? [`Rollback: ${task.rollbackSnapshotId}`] : []),
    ...(task.completionSnapshotId ? [`After snapshot: ${task.completionSnapshotId}`] : []),
    ...(task.verification ? [`Verification: ${task.verification.summary}`] : []),
    ...(task.verification?.checks.map((check) => `Verification check: ${check.label} - ${check.status} - ${check.details}`) ?? []),
    ...(task.telemetry?.failureMemoryHints?.length ? [`Memory hints used: ${task.telemetry.failureMemoryHints.join(" | ")}`] : []),
    ...(task.summary ? [`Summary: ${summarizeAgentTaskSummary(task.summary, task.status)}`] : []),
    ...buildExhaustedRouteText(task.summary),
    "",
    ...task.steps.map((step) => `${step.status.toUpperCase()} - ${step.title}${step.summary ? ` - ${step.summary}` : ""}`)
  ];
  stepsEl.textContent = stepLines.join("\n").trim();
  logEl.textContent = logs.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  targetEl.textContent = restoreState
    ? `Target: ${task.targetPath ?? "workspace root"} | ${task.artifactType ? `${formatAgentArtifactType(task.artifactType)} | ` : ""}${getRestoreStateSummary(restoreState)}`
    : `Target: ${task.targetPath ?? "workspace root"}${task.artifactType ? ` | ${formatAgentArtifactType(task.artifactType)}` : ""}`;
}

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

function ensureAgentPolling(): void {
  if (agentPollTimer) return;
  agentPollTimer = setInterval(() => {
    void refreshAgentTask(true);
  }, 2000);
}

function getAgentApprovalWarning(prompt: string): string | null {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const warnings: string[] = [];
  if (["build a new", "create a new", "bootstrap", "scaffold", "generated-apps/"].some((term) => normalized.includes(term))) {
    warnings.push("This task may scaffold a new project folder.");
  }
  if (["npm install", "install dependencies", "install package", "add dependency", "package.json"].some((term) => normalized.includes(term))) {
    warnings.push("This task may install or change dependencies.");
  }
  if (["remove", "delete", "rewrite", "replace entire", "overwrite"].some((term) => normalized.includes(term))) {
    warnings.push("This task may overwrite or remove files.");
  }

  if (warnings.length === 0) return null;
  return `${warnings.join(" ")} A rollback snapshot will be created automatically. Continue?`;
}

function buildAgentChatContent(task: AgentTask, logs: string[]): string {
  const lines: string[] = [
    `Agent status: ${task.status}`,
    `Activity: ${buildAgentActivityLabel(task)}`,
    ...(buildAgentLatestUpdateLabel(task) ? [`Latest update: ${buildAgentLatestUpdateLabel(task)}`] : []),
    ...(task.artifactType ? [`Artifact: ${formatAgentArtifactType(task.artifactType)}`] : []),
    ...(task.executionSpec?.starterProfile ? [`Starter profile: ${formatStarterProfileLabel(task.executionSpec.starterProfile)}`] : []),
    ...(task.executionSpec?.domainFocus ? [`Domain focus: ${formatDomainFocusLabel(task.executionSpec.domainFocus)}`] : []),
    ...(task.executionSpec?.summary ? [`Execution brief: ${task.executionSpec.summary}`] : []),
    ...(task.executionSpec?.deliverables?.length ? [`Deliverables: ${task.executionSpec.deliverables.join(" | ")}`] : []),
    ...(task.executionSpec?.acceptanceCriteria?.length ? [`Acceptance: ${task.executionSpec.acceptanceCriteria.join(" | ")}`] : []),
    ...(task.executionSpec?.qualityGates?.length ? [`Quality gates: ${task.executionSpec.qualityGates.join(" | ")}`] : []),
    ...(task.output?.primaryAction ? [`Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}`] : []),
    ...(task.output?.runCommand ? [`Run command: ${task.output.runCommand}`] : []),
    ...(task.output?.workingDirectory ? [`Working directory: ${task.output.workingDirectory}`] : []),
    ...(task.output?.packageName ? [`Package: ${task.output.packageName}`] : []),
    ...(task.output?.usageTitle ? [`Usage title: ${task.output.usageTitle}`] : []),
    ...(task.output?.usageDetail ? [`Usage: ${task.output.usageDetail}`] : []),
    ...(task.targetPath ? [`Target: ${task.targetPath}`] : []),
    ...(task.rollbackSnapshotId ? [`Rollback: ${task.rollbackSnapshotId}`] : []),
    ...(task.completionSnapshotId ? [`After snapshot: ${task.completionSnapshotId}`] : []),
    ...(task.verification ? [`Verification: ${task.verification.summary}`] : []),
    ...(task.summary ? ["", task.summary] : [])
  ];

  if (task.verification?.checks.length) {
    lines.push(...task.verification.checks.map((check) => `Verification check: ${check.label} - ${check.status} - ${check.details}`));
  }

  if (task.steps.length > 0) {
    lines.push("", "Steps:");
    for (const step of task.steps) {
      lines.push(`- ${step.status.toUpperCase()} ${step.title}${step.summary ? `: ${step.summary}` : ""}`);
    }
  }

  const recentLogs = logs.slice(-6);
  if (recentLogs.length > 0) {
    lines.push("", "Recent logs:", "```text", ...recentLogs, "```");
  }

  return lines.join("\n").trim();
}

function buildAgentActivityLabel(task: AgentTask): string {
  const runningStep = task.steps.find((step) => step.status === "running");
  const latestStep = runningStep ?? task.steps[task.steps.length - 1];
  if (!latestStep) return "Agent is working...";

  const activityPhrase = humanizeAgentStepTitle(latestStep.title);

  if (!activityPhrase) return "Agent is working...";
  if (task.status === "completed") return "Agent completed the task.";
  if (task.status === "failed") return "Agent hit a failure.";
  return `Agent is ${activityPhrase}...`;
}

function buildAgentLatestUpdateLabel(task: AgentTask): string {
  const latestStep = task.steps[task.steps.length - 1];
  if (!latestStep) return "";
  if (latestStep.summary?.trim()) return latestStep.summary.trim();
  return latestStep.title.trim();
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toDisplayLabel(value: string, fallback = "Desktop app"): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return fallback;

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canPromptToLaunchDesktopApp(task: AgentTask): boolean {
  return task.status === "completed"
    && task.artifactType === "desktop-app"
    && task.output?.primaryAction === "run-desktop"
    && Boolean(task.output.runCommand?.trim())
    && Boolean((task.output.workingDirectory ?? task.targetPath)?.trim());
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

async function promptToLaunchDesktopApp(task: AgentTask): Promise<void> {
  if (!canPromptToLaunchDesktopApp(task)) return;
  handledDesktopLaunchPromptTasks.add(task.id);
  pendingDesktopLaunchPromptTasks.delete(task.id);

  const workingDirectory = (task.output?.workingDirectory ?? task.targetPath ?? "").trim();
  const runCommand = (task.output?.runCommand ?? "").trim();
  if (!workingDirectory || !runCommand) return;

  const packageName = toDisplayLabel(task.output?.packageName?.trim() || "", "Desktop app");
  const shouldOpen = window.confirm(
    `${packageName} build successful. Do you want to open it now?\n\nCommand: ${runCommand}\nFolder: ${workingDirectory}`
  );
  if (!shouldOpen) {
    showToast("Desktop app is ready. You can run it later from the generated folder.", 2600);
    return;
  }

  const launchScript = [
    `$wd = ${quotePowerShellLiteral(workingDirectory)}`,
    `$cmd = ${quotePowerShellLiteral(runCommand)}`,
    "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $wd -ArgumentList @('/k', $cmd)"
  ].join("; ");

  try {
    const result = await window.api.terminal.run({
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", launchScript],
      timeoutMs: 10000
    });
    if (result.ok) {
      showToast("Desktop app launch started.", 2200);
      return;
    }
    showToast("Desktop app launch failed. Use the Run command shown in the result card.", 3200);
  } catch {
    showToast("Desktop app launch failed. Run it manually from the generated folder.", 3200);
  }
}

async function ensureChatForAgentOutput(): Promise<string> {
  if (currentChatId) return currentChatId;
  return createNewChat(false);
}

async function appendAgentTaskToChat(prompt: string, task: AgentTask): Promise<void> {
  const chatId = await ensureChatForAgentOutput();
  const now = new Date().toISOString();
  const userMessage: Message = {
    id: `agent-user-${task.id}`,
    role: "user",
    content: prompt,
    createdAt: now,
    metadata: task.attachments?.length ? { attachmentNames: task.attachments.map((attachment) => attachment.name) } : undefined
  };
  const assistantMessage: Message = {
    id: `agent-assistant-${task.id}`,
    role: "assistant",
    content: buildAgentChatContent(task, []),
    createdAt: now,
    model: "Agent"
  };

  await window.api.chat.appendMessage(chatId, userMessage);
  appendMessage(userMessage);
  await window.api.chat.appendMessage(chatId, assistantMessage);
  appendMessage(assistantMessage);
  agentChatMessageMap.set(task.id, {
    chatId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id
  });
}

async function updateAgentTaskInChat(task: AgentTask, logs: string[]): Promise<void> {
  const mapped = agentChatMessageMap.get(task.id);
  if (!mapped) return;
  const content = buildAgentChatContent(task, logs);
  updateMessageContent(mapped.assistantMessageId, content, true, true);
  try {
    await window.api.chat.updateMessage(mapped.chatId, mapped.assistantMessageId, {
      content,
      model: "Agent"
    });
  } catch {
    // Keep UI responsive even if persistence fails.
  }
}

async function startAgentTaskPrompt(prompt: string): Promise<boolean> {
  const normalized = (prompt ?? "").trim();
  if (!normalized) {
    setAgentStatus("Agent prompt required.", "err");
    return false;
  }
  const targetReady = await ensureAgentTargetSelectionBeforeStart(normalized);
  if (!targetReady) {
    return false;
  }
  const attachmentsToSend = [...activeAttachments];
  const targetPath = getRequestedAgentTargetPath();

  try {
    const warning = getAgentApprovalWarning(normalized);
    if (warning && !window.confirm(warning)) {
      setAgentStatus("Agent task cancelled before start.");
      return false;
    }
    const targetInput = getAgentTargetInput();
    if (targetInput) {
      targetInput.value = targetPath;
    }
    const task = await window.api.agent.startTask({
      prompt: normalized,
      attachments: attachmentsToSend,
      targetPath: targetPath || undefined
    });
    activeAgentRestoreState = null;
    activeAgentTaskId = task.id;
    pendingAutoOpenAgentPreviewTaskId = task.id;
    pendingDesktopLaunchPromptTasks.add(task.id);
    handledDesktopLaunchPromptTasks.delete(task.id);
    cachedAgentTasks = [task, ...cachedAgentTasks.filter((item) => item.id !== task.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(normalized, task);
    activeAttachments = [];
    renderComposerAttachments();
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus("Agent task started.");
    renderAgentTask(task, []);
    ensureAgentPolling();
    void refreshAgentTask(true);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start agent task.";
    setAgentStatus(message, "err");
    showToast(message, 3200);
    return false;
  }
}

async function restartAgentTaskPrompt(taskId: string, mode: AgentTaskRestartMode): Promise<boolean> {
  const sourceTask = cachedAgentTasks.find((task) => task.id === taskId) ?? null;
  if (!sourceTask) {
    setAgentStatus("Agent task not found.", "err");
    return false;
  }

  if (mode === "retry-clean") {
    const confirmed = window.confirm(
      "Retry Clean will restore the Before snapshot for this task and then start a new run. Current workspace files outside preserved folders will be replaced. Continue?"
    );
    if (!confirmed) {
      setAgentStatus("Clean retry cancelled.");
      return false;
    }
  }

  try {
    const restarted = await window.api.agent.restartTask(taskId, mode);
    activeAgentRestoreState = null;
    activeAgentTaskId = restarted.id;
    pendingAutoOpenAgentPreviewTaskId = restarted.id;
    pendingDesktopLaunchPromptTasks.add(restarted.id);
    handledDesktopLaunchPromptTasks.delete(restarted.id);
    cachedAgentTasks = [restarted, ...cachedAgentTasks.filter((item) => item.id !== restarted.id)];
    syncActiveAgentTaskSelectionUi();
    await appendAgentTaskToChat(restarted.prompt, restarted);
    setStreamingUi(true, "Agent is starting...");
    setAgentStatus(`${getAgentRestartModeLabel(mode)} started.`);
    renderAgentTask(restarted, []);
    ensureAgentPolling();
    void refreshAgentTask(true);
    showToast(`${getAgentRestartModeLabel(mode)} started.`, 1800);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to ${getAgentRestartModeLabel(mode).toLowerCase()}.`;
    setAgentStatus(message, "err");
    showToast(message, 3200);
    return false;
  }
}

function setupAgentControls(): void {
  const agentInput = $("agent-prompt-input") as HTMLTextAreaElement;
  const agentTargetInput = $("agent-target-input") as HTMLInputElement;
  agentInput.addEventListener("input", () => {
    if (currentInteractionMode === "agent") {
      syncComposerAgentPrompts("agent");
    }
  });
  agentInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
  agentTargetInput.addEventListener("blur", () => {
    agentTargetInput.value = getRequestedAgentTargetPath();
  });

  $("agent-paste-btn").addEventListener("click", async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (!pasted.trim()) {
        showToast("Clipboard is empty.", 1800);
        return;
      }
      agentInput.value = pasted;
      agentInput.dispatchEvent(new Event("input"));
      agentInput.focus();
      showToast("Prompt pasted.", 1800);
    } catch {
      showToast("Clipboard paste is not available here.", 2400);
    }
  });

  $("agent-target-pick-btn").addEventListener("click", () => {
    void pickAgentTargetFolder();
  });

  $("agent-target-clear-btn").addEventListener("click", () => {
    agentTargetInput.value = "";
    agentTargetInput.focus();
  });

  $("agent-start-btn").addEventListener("click", async () => {
    const prompt = agentInput.value.trim();
    if (!prompt) {
      setAgentStatus("Agent prompt required.", "err");
      agentInput.focus();
      return;
    }

    syncComposerAgentPrompts("agent");
    const started = await startAgentTaskPrompt(prompt);
    if (started) {
      clearAgentPrompts();
    }
  });

  $("agent-stop-btn").addEventListener("click", async () => {
    if (!activeAgentTaskId) {
      setAgentStatus("No active agent task.");
      return;
    }

    const stopped = await window.api.agent.stopTask(activeAgentTaskId);
    setAgentStatus(stopped ? "Stop requested." : "No running agent process to stop.", stopped ? "" : "err");
    void refreshAgentTask(true);
  });

  $("agent-restore-btn").addEventListener("click", async () => {
    try {
      const latest = cachedAgentSnapshots[0] ?? (await window.api.agent.listSnapshots())[0];
      if (!latest) {
        setAgentStatus("No rollback snapshot found.", "err");
        return;
      }
      openSnapshotRestoreModal(latest);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore rollback snapshot.";
      setAgentStatus(message, "err");
      showToast(message, 3600);
    }
  });
  $("agent-refresh-snapshots-btn").addEventListener("click", () => {
    void refreshAgentTask(true);
  });

  $("agent-copy-steps-btn").addEventListener("click", async () => {
    const text = $("agent-steps").textContent ?? "";
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "Agent steps copied." : "Copy failed", 1800);
  });

  $("agent-copy-log-btn").addEventListener("click", async () => {
    const text = $("agent-log").textContent ?? "";
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "Agent log copied." : "Copy failed", 1800);
  });
  $("agent-refresh-route-health-btn").addEventListener("click", () => {
    void refreshAgentRouteDiagnostics(activeAgentTaskId ?? undefined);
  });
  $("model-health-refresh-btn").addEventListener("click", () => {
    void refreshAgentRouteDiagnostics(activeAgentTaskId ?? undefined);
  });

  document.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const chatItem = target?.closest<HTMLElement>("[data-main-chat-history-id]");
    if (chatItem) {
      const chatId = chatItem.dataset["mainChatHistoryId"] ?? "";
      if (chatId) {
        event.preventDefault();
        event.stopPropagation();
        void loadChat(chatId);
      }
      return;
    }
    const snapshotBtn = target?.closest<HTMLElement>("[data-main-agent-snapshot-id]");
    if (snapshotBtn) {
      const snapshotId = snapshotBtn.dataset["mainAgentSnapshotId"] ?? "";
      const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
      if (snapshot) {
        event.preventDefault();
        event.stopPropagation();
        openSnapshotRestoreModal(snapshot);
      }
      return;
    }
    const restartBtn = target?.closest<HTMLElement>("[data-main-agent-restart-task-id]");
    if (restartBtn) {
      const taskId = restartBtn.dataset["mainAgentRestartTaskId"] ?? "";
      const mode = (restartBtn.dataset["agentRestartMode"] ?? "retry") as AgentTaskRestartMode;
      if (taskId) {
        event.preventDefault();
        event.stopPropagation();
        void restartAgentTaskPrompt(taskId, mode);
      }
      return;
    }
    const previewBtn = target?.closest<HTMLElement>("[data-main-agent-history-preview]");
    if (previewBtn) {
      if (previewBtn instanceof HTMLButtonElement && previewBtn.disabled) return;
      const taskId = previewBtn.dataset["mainAgentHistoryPreview"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void openManagedPreview(task.targetPath, "", false).catch(() => {
          showToast("Preview open failed", 2200);
        });
      }
      return;
    }
    const copyRunBtn = target?.closest<HTMLElement>("[data-main-agent-history-copy-run]");
    if (copyRunBtn) {
      const taskId = copyRunBtn.dataset["mainAgentHistoryCopyRun"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.output?.runCommand) {
        event.preventDefault();
        event.stopPropagation();
        void copyTextToClipboard(task.output.runCommand).then((ok) => {
          showToast(ok ? "Run command copied." : "Copy failed", 1800);
        });
      }
      return;
    }
    const openFolderBtn = target?.closest<HTMLElement>("[data-main-agent-history-open-folder]");
    if (openFolderBtn) {
      if (openFolderBtn instanceof HTMLButtonElement && openFolderBtn.disabled) return;
      const taskId = openFolderBtn.dataset["mainAgentHistoryOpenFolder"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void window.api.workspace.openPath(task.targetPath).then((result) => {
          showToast(result.message, result.ok ? 1800 : 2400);
        }).catch(() => {
          showToast("Open folder failed", 2200);
        });
      }
      return;
    }
    const item = target?.closest<HTMLElement>("[data-main-agent-history-id]");
    if (!item) return;
    const taskId = item.dataset["mainAgentHistoryId"] ?? "";
    if (!taskId) return;
    activeAgentTaskId = taskId;
    syncActiveAgentTaskSelectionUi();
    const selected = cachedAgentTasks.find((task) => task.id === taskId);
    if (selected?.status === "running") ensureAgentPolling();
    void refreshAgentTask(true);
  });

  $("agent-history").addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const snapshotBtn = target?.closest<HTMLElement>("[data-agent-history-snapshot-id]");
    if (snapshotBtn) {
      const snapshotId = snapshotBtn.dataset["agentHistorySnapshotId"] ?? "";
      const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
      if (snapshot) {
        event.preventDefault();
        event.stopPropagation();
        openSnapshotRestoreModal(snapshot);
      }
      return;
    }
    const restartBtn = target?.closest<HTMLElement>("[data-agent-history-restart-task-id]");
    if (restartBtn) {
      const taskId = restartBtn.dataset["agentHistoryRestartTaskId"] ?? "";
      const mode = (restartBtn.dataset["agentRestartMode"] ?? "retry") as AgentTaskRestartMode;
      if (taskId) {
        event.preventDefault();
        event.stopPropagation();
        void restartAgentTaskPrompt(taskId, mode);
      }
      return;
    }
    const previewBtn = target?.closest<HTMLElement>("[data-agent-history-preview]");
    if (previewBtn) {
      if (previewBtn instanceof HTMLButtonElement && previewBtn.disabled) return;
      const taskId = previewBtn.dataset["agentHistoryPreview"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void openManagedPreview(task.targetPath, "", false).catch(() => {
          showToast("Preview open failed", 2200);
        });
      }
      return;
    }
    const copyRunBtn = target?.closest<HTMLElement>("[data-agent-history-copy-run]");
    if (copyRunBtn) {
      const taskId = copyRunBtn.dataset["agentHistoryCopyRun"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.output?.runCommand) {
        event.preventDefault();
        event.stopPropagation();
        void copyTextToClipboard(task.output.runCommand).then((ok) => {
          showToast(ok ? "Run command copied." : "Copy failed", 1800);
        });
      }
      return;
    }
    const openFolderBtn = target?.closest<HTMLElement>("[data-agent-history-open-folder]");
    if (openFolderBtn) {
      if (openFolderBtn instanceof HTMLButtonElement && openFolderBtn.disabled) return;
      const taskId = openFolderBtn.dataset["agentHistoryOpenFolder"] ?? "";
      const task = cachedAgentTasks.find((item) => item.id === taskId);
      if (task?.targetPath) {
        event.preventDefault();
        event.stopPropagation();
        void window.api.workspace.openPath(task.targetPath).then((result) => {
          showToast(result.message, result.ok ? 1800 : 2400);
        }).catch(() => {
          showToast("Open folder failed", 2200);
        });
      }
      return;
    }
    const item = target?.closest<HTMLElement>("[data-agent-history-id]");
    if (!item) return;
    const taskId = item.dataset["agentHistoryId"] ?? "";
    if (!taskId) return;
    activeAgentTaskId = taskId;
    syncActiveAgentTaskSelectionUi();
    const selected = cachedAgentTasks.find((task) => task.id === taskId);
    if (selected?.status === "running") ensureAgentPolling();
    void refreshAgentTask(true);
  });
  $("agent-history-filters").querySelectorAll<HTMLElement>("[data-agent-history-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = (button.dataset["agentHistoryFilter"] ?? "all") as "all" | AgentTask["status"];
      agentHistoryFilter = nextFilter;
      agentHistoryExpanded = false;
      syncAgentHistoryPanelWidth();
      renderAgentHistory(cachedAgentTasks);
    });
  });
  $("agent-history-toggle-btn").addEventListener("click", () => {
    agentHistoryExpanded = !agentHistoryExpanded;
    syncAgentHistoryPanelWidth();
    renderAgentHistory(cachedAgentTasks);
  });
  $("agent-snapshots").addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const taskBtn = target?.closest<HTMLElement>("[data-agent-snapshot-task-id]");
    if (taskBtn) {
      const taskId = taskBtn.dataset["agentSnapshotTaskId"] ?? "";
      const relatedTask = cachedAgentTasks.find((item) => item.id === taskId);
      if (!taskId || !relatedTask) {
        showToast("Related task not available.", 2200);
        return;
      }
      activeAgentTaskId = taskId;
      syncActiveAgentTaskSelectionUi();
      if (relatedTask.status === "running") ensureAgentPolling();
      void refreshAgentTask(true);
      return;
    }
    const restoreBtn = target?.closest<HTMLElement>("[data-agent-snapshot-id]");
    if (!restoreBtn) return;
    const snapshotId = restoreBtn.dataset["agentSnapshotId"] ?? "";
    const snapshot = cachedAgentSnapshots.find((item) => item.id === snapshotId);
    if (!snapshotId || !snapshot) return;
    openSnapshotRestoreModal(snapshot);
  });
}

// â”€â”€ Panel Toggle â”€â”€
let rightPanelTab = "settings";

function setPanelBody(tab: string): void {
  const settingsBody = document.querySelector<HTMLElement>('.panel-body[data-panel="settings"]');
  const routerBody = document.querySelector<HTMLElement>('.panel-body[data-panel="router"]');
  const agentBody = document.querySelector<HTMLElement>('.panel-body[data-panel="agent"]');
  if (!settingsBody || !routerBody || !agentBody) return;

  const showSettings = tab === "settings";
  const showRouter = tab === "router";
  const showAgent = tab === "agent";
  settingsBody.classList.toggle("active", showSettings);
  settingsBody.style.display = showSettings ? "flex" : "none";

  routerBody.classList.toggle("active", showRouter);
  routerBody.style.display = showRouter ? "flex" : "none";

  agentBody.classList.toggle("active", showAgent);
  agentBody.style.display = showAgent ? "flex" : "none";
}

function refreshPreviewFrame(): void {
  if (!activePreviewUrl) return;
  const separator = activePreviewUrl.includes("?") ? "&" : "?";
  const refreshedUrl = `${activePreviewUrl}${separator}refresh=${Date.now()}`;
  const workspaceWebview = document.getElementById("preview-workspace-webview") as HTMLElement | null;
  if (workspaceWebview) {
    workspaceWebview.setAttribute("src", refreshedUrl);
  }
}

async function openManagedPreview(targetPath: string, preferredUrl = "", auto = false): Promise<void> {
  const result = await window.api.app.openPreview(targetPath, preferredUrl);
  if (!result.ok || !result.url) {
    showToast(result.message || "Preview open failed", result.ok ? 2000 : 2600);
    return;
  }

  closePreviewWorkspace();
  activePreviewUrl = result.url;
  activePreviewTarget = targetPath;
  await openDetachedPreview();
  if (!auto) showToast(result.message || "Task preview ready.", 1800);
}

function openPanel(tab: string) {
  if (tab !== "agent" && agentHistoryCollapsedPanelWidth !== null) {
    applyRightPanelWidth(agentHistoryCollapsedPanelWidth);
    agentHistoryCollapsedPanelWidth = null;
  }

  rightPanelTab = tab;
  const panel = $("right-panel");
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.dataset["openTab"] = tab;
  $("panel-title").textContent = tab === "router"
    ? "Router"
    : tab === "agent"
      ? "Agent"
      : tab === "preview"
        ? "Preview"
        : "Settings";

  document.querySelectorAll<HTMLElement>(".panel-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset["tab"] === tab);
  });
  setPanelBody(tab);

  const settingsBtn = document.getElementById("settings-toggle-btn");
  const routerBtn = document.getElementById(ROUTER_TOGGLE_BUTTON_ID);
  const agentBtn = document.getElementById(AGENT_TOGGLE_BUTTON_ID);
  if (!(settingsBtn instanceof HTMLElement)) return;
  settingsBtn.classList.toggle("active", tab === "settings");
  if (routerBtn instanceof HTMLElement) routerBtn.classList.toggle("active", tab === "router");
  if (agentBtn instanceof HTMLElement) agentBtn.classList.toggle("active", tab === "agent");

  if (tab === "router") {
    void refreshRouterStatus();
    void loadRouterLogs();
    void refreshMcpStatus();
  }
  if (tab === "agent") {
    syncAgentHistoryPanelWidth();
    void refreshAgentTask(true);
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
function setupRightPanelResizeControls(): void {
  const handle = document.getElementById("panel-resize-handle");
  const smallerBtn = document.getElementById("panel-width-smaller-btn");
  const largerBtn = document.getElementById("panel-width-larger-btn");
  const resetBtn = document.getElementById("panel-width-reset-btn");

  if (!(handle instanceof HTMLElement)) return;

  let dragging = false;
  let startX = 0;
  let startWidth = currentRightPanelWidth;

  const finishResize = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("panel-resizing");
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(currentRightPanelWidth));
  };

  const resizeToClientX = (clientX: number) => {
    const nextWidth = startWidth + (startX - clientX);
    applyRightPanelWidth(nextWidth, false);
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    dragging = true;
    startX = event.clientX;
    startWidth = currentRightPanelWidth;
    document.body.classList.add("panel-resizing");
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    resizeToClientX(event.clientX);
  });

  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("resize", () => applyRightPanelWidth(currentRightPanelWidth, false));

  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustRightPanelWidth(RIGHT_PANEL_WIDTH_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustRightPanelWidth(-RIGHT_PANEL_WIDTH_STEP);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applyRightPanelWidth(getRightPanelMaxWidth());
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applyRightPanelWidth(RIGHT_PANEL_MIN_WIDTH);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetRightPanelWidth();
    }
  });

  if (smallerBtn instanceof HTMLButtonElement) {
    smallerBtn.addEventListener("click", () => adjustRightPanelWidth(-RIGHT_PANEL_WIDTH_STEP));
  }
  if (largerBtn instanceof HTMLButtonElement) {
    largerBtn.addEventListener("click", () => adjustRightPanelWidth(RIGHT_PANEL_WIDTH_STEP));
  }
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener("click", resetRightPanelWidth);
  }
}

function setupSidebarResizeControls(): void {
  const handle = document.getElementById("sidebar-resize-handle");
  const smallerBtn = document.getElementById("sidebar-width-smaller-btn");
  const largerBtn = document.getElementById("sidebar-width-larger-btn");
  const resetBtn = document.getElementById("sidebar-width-reset-btn");

  if (!(handle instanceof HTMLElement)) return;

  let dragging = false;
  let startX = 0;
  let startWidth = currentSidebarWidth;

  const finishResize = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("sidebar-resizing");
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(currentSidebarWidth));
  };

  const resizeToClientX = (clientX: number) => {
    const nextWidth = startWidth + (clientX - startX);
    applySidebarWidth(nextWidth, false);
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    dragging = true;
    startX = event.clientX;
    startWidth = currentSidebarWidth;
    document.body.classList.add("sidebar-resizing");
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    resizeToClientX(event.clientX);
  });

  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("resize", () => applySidebarWidth(currentSidebarWidth, false));

  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustSidebarWidth(-SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustSidebarWidth(SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(getSidebarMaxWidth());
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(SIDEBAR_MIN_WIDTH);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetSidebarWidth();
    }
  });

  if (smallerBtn instanceof HTMLButtonElement) {
    smallerBtn.addEventListener("click", () => adjustSidebarWidth(-SIDEBAR_WIDTH_STEP));
  }
  if (largerBtn instanceof HTMLButtonElement) {
    largerBtn.addEventListener("click", () => adjustSidebarWidth(SIDEBAR_WIDTH_STEP));
  }
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener("click", resetSidebarWidth);
  }
}

function openRenameModalForChat(chatId: string, title: string): void {
  pendingRenameChatId = chatId;
  const modal = $("rename-modal");
  modal.style.display = "flex";
  ($("rename-input") as HTMLInputElement).value = title;
  ($("rename-input") as HTMLInputElement).focus();
}

function openRenameModal() {
  if (!currentChatId) return;
  openRenameModalForChat(currentChatId, $("chat-title-display").textContent ?? "");
}

function closeRenameModal(): void {
  pendingRenameChatId = null;
  $("rename-modal").style.display = "none";
}

async function exportChatById(chatId: string): Promise<void> {
  const res = await window.api.chat.export(chatId);
  showToast(res.message, res.ok ? 2200 : 3200);
}

async function confirmRename() {
  const chatId = pendingRenameChatId ?? currentChatId;
  if (!chatId) return;
  const title = ($("rename-input") as HTMLInputElement).value.trim();
  if (!title) return;
  await window.api.chat.rename(chatId, title);
  if (currentChatId === chatId) {
      updateChatHeaderTitle(title);
  }
  closeRenameModal();
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

  activeAttachments = mergeAttachments(attachments);
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

  const resizeComposer = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 88)}px`;
    input.style.overflowY = input.scrollHeight > 88 ? "auto" : "hidden";
  };

  input.addEventListener("input", () => {
    resizeComposer();
    if (currentInteractionMode === "agent") {
      syncComposerAgentPrompts("composer");
    }
  });
  resizeComposer();
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
  const btn = document.getElementById("voice-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  if (!LOCAL_VOICE_SUPPORTED) {
    btn.style.display = "none";
    btn.disabled = true;
    return;
  }
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const canCaptureAudio = Boolean(navigator.mediaDevices?.getUserMedia);
  let pcmRecording = false;
  let pcmChunks: Float32Array[] = [];
  let pcmContext: AudioContext | null = null;
  let pcmSource: MediaStreamAudioSourceNode | null = null;
  let pcmProcessor: ScriptProcessorNode | null = null;

  const hasConfiguredVoiceTranscription = (): boolean => {
    return Boolean(settings?.localVoiceEnabled);
  };

  if (!hasMediaRecorder && !canCaptureAudio) {
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
    if (!hasConfiguredVoiceTranscription()) {
      showToast("Voice transcription needs a cloud API key in Settings.", 3200);
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
    if (!hasConfiguredVoiceTranscription()) {
      showToast("Enable local voice in Settings first.", 3200);
      return;
    }

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
      }

      const ok = await ensureMicPermission();
      if (!ok) return;

      voiceRecorderMode = true;
      await startRecorderMode();
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

    activeAttachments = mergeAttachments(picked);
    renderComposerAttachments();
    showToast(`${picked.length} attachment${picked.length === 1 ? "" : "s"} added.`, 1800);
  });

  $("interaction-chat-btn").addEventListener("click", () => {
    showChatProviderMenu(!chatProviderMenuOpen);
  });

  document.getElementById("chat-provider-openrouter-btn")?.addEventListener("click", () => {
    void selectChatProvider("openrouter");
  });
  document.getElementById("chat-provider-nvidia-btn")?.addEventListener("click", () => {
    void selectChatProvider("nvidia");
  });
  document.getElementById("chat-provider-ollama-btn")?.addEventListener("click", () => {
    void selectChatProvider("ollama");
  });
  document.getElementById("chat-provider-claude-btn")?.addEventListener("click", () => {
    void selectChatProvider("claude");
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const advancedShell = document.getElementById("composer-advanced-shell");
    if (!target.closest("#chat-provider-menu") && !target.closest("#interaction-chat-btn")) {
      showChatProviderMenu(false);
    }
    if (advancedShell instanceof HTMLDetailsElement && !target.closest("#composer-advanced-shell")) {
      advancedShell.open = false;
    }
  });

  $("header-tools-menu-btn").addEventListener("click", () => {
    const dropdown = $("header-tools-menu");
    const isOpen = dropdown.style.display !== "none";
    showHeaderToolsMenu(!isOpen);
  });

  $("header-tools-menu-btn").addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showHeaderToolsMenu(true);
      focusHeaderToolsMenuItem("first");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      showHeaderToolsMenu(true);
      focusHeaderToolsMenuItem("last");
    }
  });

  Array.from(document.querySelectorAll<HTMLElement>(".header-tools-menu-item")).forEach((menuItem) => {
    menuItem.addEventListener("click", () => showHeaderToolsMenu(false));
  });

  $("header-tools-menu").addEventListener("keydown", (event: KeyboardEvent) => {
    const items = getHeaderToolsMenuItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      showHeaderToolsMenu(false);
      $("header-tools-menu-btn").focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusHeaderToolsMenuItem(currentIndex < 0 ? 0 : (currentIndex + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusHeaderToolsMenuItem(currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusHeaderToolsMenuItem("first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusHeaderToolsMenuItem("last");
      return;
    }
    if (event.key === "Tab") {
      showHeaderToolsMenu(false);
    }
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("#header-tools-menu") || target.closest("#header-tools-menu-btn")) return;
    showHeaderToolsMenu(false);
  });

  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".chat-item-menu") || target.closest(".chat-item-menu-btn")) return;
    closeChatItemMenus();
  });
}

function setupPreviewPanel(): void {
  $("preview-workspace-refresh-btn").addEventListener("click", () => {
    if (!activePreviewUrl) {
      showToast("No preview loaded.", 1800);
      return;
    }
    refreshPreviewFrame();
  });

  $("preview-workspace-browser-btn").addEventListener("click", async () => {
    if (!activePreviewUrl) {
      showToast("No preview loaded.", 1800);
      return;
    }
    const result = await window.api.app.openExternal(activePreviewUrl);
    showToast(result.message, result.ok ? 1800 : 2600);
  });

  $("preview-workspace-close-btn").addEventListener("click", closePreviewWorkspace);
  $("preview-workspace-detach-btn").addEventListener("click", () => {
    void openDetachedPreview();
  });
}

async function refreshClaudeSessionStatus(): Promise<void> {
  try {
    const status = await window.api.claude.status();
    claudeSessionRunning = Boolean(status.running);
    if (!status.running) {
      setClaudeStatus("Idle", "");
      return;
    }
    const pidLabel = typeof status.pid === "number" ? `Running (pid ${status.pid})` : "Ready";
    setClaudeStatus(pidLabel, "ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to read Claude status.";
    setClaudeStatus(message, "err");
  }
}

function setupClaudePanel() {
  void refreshClaudeSessionStatus();
}

function setupModeSwitcher() {
  const modeButtons: Array<{ id: string; mode: UiMode }> = [
    { id: "mode-write-btn", mode: "write" },
    { id: "mode-code-btn", mode: "code" },
    { id: "mode-think-btn", mode: "think" },
    { id: "mode-edit-btn", mode: "edit" }
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
    void syncChatContextAfterUiChange();
  });
  refreshCompareUi();
}

function setupOllamaControls() {
  const openrouterBtn = document.getElementById("provider-openrouter-btn");
  const nvidiaBtn = document.getElementById("provider-nvidia-btn");
  const ollamaBtn = document.getElementById("provider-ollama-btn");
  openrouterBtn?.addEventListener("click", () => {
    setProviderMode("openrouter");
    void syncChatContextAfterUiChange();
  });
  nvidiaBtn?.addEventListener("click", () => {
    setProviderMode("nvidia");
    void syncChatContextAfterUiChange();
  });
  ollamaBtn?.addEventListener("click", () => {
    setProviderMode("ollama");
    void syncChatContextAfterUiChange();
  });
  $("refresh-ollama-models-btn").addEventListener("click", () => {
    void refreshOllamaModels();
  });
  $("setup-local-agent-btn").addEventListener("click", () => {
    void setupFreeLocalCodingMode();
  });
  $("setup-filesystem-mcp-btn").addEventListener("click", () => {
    void prepareWorkspaceFilesystemMcp();
  });
}

function setupMcpControls() {
  $("mcp-add-btn").addEventListener("click", async () => {
    const name = ($("mcp-name-input") as HTMLInputElement).value.trim();
    const command = ($("mcp-command-input") as HTMLInputElement).value.trim();
    const args = parseArgsInput(($("mcp-args-input") as HTMLInputElement).value);
    const addBtn = $("mcp-add-btn") as HTMLButtonElement;

    if (!name || !command) {
      showToast("MCP name aur command required hain.", 2200);
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    try {
      await window.api.mcp.add({ name, command, args });
      ($("mcp-name-input") as HTMLInputElement).value = "";
      ($("mcp-command-input") as HTMLInputElement).value = "";
      ($("mcp-args-input") as HTMLInputElement).value = "";
      await refreshMcpStatus();
      showToast("MCP server saved.");
    } catch (err) {
      showToast(`Failed to save MCP server: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add MCP";
    }
  });
}

function setupMessageInteractions() {
  $("messages").addEventListener("click", async (event: Event) => {
    const target = event.target as HTMLElement;
    const imageSaveBtn = target.closest(".message-image-save-btn") as HTMLButtonElement | null;
    if (imageSaveBtn) {
      const figure = imageSaveBtn.closest(".message-image-card");
      const imageEl = figure?.querySelector<HTMLImageElement>(".message-image");
      const dataUrl = imageEl?.src ?? "";
      const suggestedName = imageSaveBtn.dataset["imageName"] ?? "cipher-generated-image";
      const assetId = imageSaveBtn.dataset["imageAssetId"];
      try {
        const result = await window.api.images.save(dataUrl, suggestedName, assetId);
        showToast(result.message, result.ok ? 2200 : 2800);
        const historyModal = document.getElementById("image-history-modal");
        if (result.ok && historyModal instanceof HTMLElement && historyModal.style.display !== "none") {
          void refreshImageHistory();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Image save failed.", 2800);
      }
      return;
    }

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
    if (!btn) {
      const agentBtn = target.closest(".agent-inline-btn") as HTMLButtonElement | null;
      if (!agentBtn) return;
      const action = agentBtn.dataset["agentAction"] ?? "";
      const wrapper = agentBtn.closest(".msg-wrapper") as HTMLElement | null;
      const msgId = wrapper?.dataset["id"] ?? "";
      const message = renderedMessages.find((item) => item.id === msgId);
      const parsed = parseAgentMessageContent(message?.content ?? "");

      if (action === "copy-target") {
        const ok = await copyTextToClipboard(agentBtn.dataset["agentTarget"] ?? parsed.target ?? "");
        showToast(ok ? "Target copied." : "Copy failed", 1800);
        return;
      }
      if (action === "open-target") {
        const targetPath = agentBtn.dataset["agentTarget"] ?? parsed.target ?? "";
        const result = await window.api.workspace.openPath(targetPath);
        showToast(result.message, result.ok ? 1800 : 2600);
        return;
      }
      if (action === "open-preview") {
        const previewUrl = agentBtn.dataset["agentPreview"] ?? parsed.previewUrl ?? "";
        const targetPath = agentBtn.dataset["agentTarget"] ?? parsed.target ?? "";
        await openManagedPreview(targetPath, previewUrl);
        return;
      }
      if (action === "copy-summary") {
        const ok = await copyTextToClipboard(parsed.summary ?? "");
        showToast(ok ? "Summary copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-run-command") {
        const ok = await copyTextToClipboard(parsed.output?.runCommand ?? "");
        showToast(ok ? "Run command copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-logs") {
        const ok = await copyTextToClipboard(parsed.logs.join("\n"));
        showToast(ok ? "Logs copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-files") {
        const ok = await copyTextToClipboard(parsed.files.join("\n"));
        showToast(ok ? "Files copied." : "Copy failed", 1800);
        return;
      }
      if (action === "copy-file") {
        const ok = await copyTextToClipboard(agentBtn.dataset["agentFile"] ?? "");
        showToast(ok ? "File copied." : "Copy failed", 1800);
        return;
      }
      return;
    }
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
  $("panel-title").textContent = "Settings";
  document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
  setPanelBody("none");
  document.getElementById("settings-toggle-btn")?.classList.remove("active");
  document.getElementById(ROUTER_TOGGLE_BUTTON_ID)?.classList.remove("active");
  document.getElementById(AGENT_TOGGLE_BUTTON_ID)?.classList.remove("active");
}

function setupVirtualScrolling() {
  const messages = $("messages");
  messages.addEventListener("scroll", () => {
    syncAutoScrollState();
    if (virtualItems.length > VIRTUAL_FULL_RENDER_THRESHOLD) {
      scheduleVirtualRender(false);
    }
  }, { passive: true });
  window.addEventListener("resize", () => {
    updateScrollBottomButton();
    scheduleVirtualRender(false);
  });
}

function setupOnboardingControls(): void {
  $("onboarding-close-btn").addEventListener("click", hideOnboarding);
  $("onboarding-openrouter-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("openrouter");
    openPanel("settings");
    showToast("Paste your OpenRouter key in Settings to continue.", 2800);
  });
  $("onboarding-nvidia-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("nvidia");
    openPanel("settings");
    showToast("Paste your NVIDIA key in Settings to continue.", 2800);
  });
  $("onboarding-local-btn").addEventListener("click", () => {
    markOnboardingSeen();
    hideOnboarding();
    applyUiExperience("simple");
    setProviderMode("ollama");
    openPanel("settings");
    void setupFreeLocalCodingMode();
  });
  $("onboarding-modal").addEventListener("click", (event: Event) => {
    if (event.target === $("onboarding-modal")) hideOnboarding();
  });
}

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

// â”€â”€ Init â”€â”€
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
  window.setInterval(() => {
    const panel = $("right-panel");
    if (panel.style.display !== "none" && (panel.dataset["openTab"] ?? "") === "router") {
      void refreshMcpStatus();
    }
  }, 2000);

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
        setClaudeStatus("Stopping Claude Code...", "busy");
        try {
          const res = await window.api.claude.stop();
          claudeSessionRunning = Boolean(res.running);
          claudeSessionChatId = null;
          finalizeClaudeAssistantMessage(true);
          setStreamingUi(false);
          setClaudeStatus(res.ok ? "Stopped" : res.message, res.ok ? "" : "err");
          if (!res.ok) showToast(res.message, 3000);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to stop Claude Code.";
          setClaudeStatus(msg, "err");
          showToast(msg, 3200);
        }
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
  const claudeChatFsRootsInput = document.getElementById("claude-chat-fs-roots");
  claudeChatFsRootsInput?.addEventListener("input", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  const claudeChatFsWriteToggle = document.getElementById("claude-chat-fs-write-toggle");
  claudeChatFsWriteToggle?.addEventListener("change", () => {
    renderClaudeChatFilesystemSettingsUi(getClaudeChatFilesystemSettingsDraft());
  });
  $("claude-chat-fs-add-btn").addEventListener("click", async () => {
    const picked = await window.api.attachments.pickWritableRoots();
    const nextRoots = normalizeClaudeChatFilesystemRoots([
      ...getClaudeChatFilesystemSettingsDraft().roots,
      ...picked.map((item) => item.writableRoot ?? "").filter(Boolean)
    ]);
    renderClaudeChatFilesystemSettingsUi({
      roots: nextRoots,
      allowWrite: getClaudeChatFilesystemSettingsDraft().allowWrite
    });
    showToast(nextRoots.length > 0 ? "Claude chat folders updated. Save Settings dabao." : "No folders selected.", 2400);
  });
  $("claude-chat-fs-clear-btn").addEventListener("click", () => {
    renderClaudeChatFilesystemSettingsUi({ roots: [], allowWrite: false });
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
    await refreshRouterStatus();
  };
  $("stop-router-btn").onclick = async () => {
    const res = await window.api.router.stop();
    setRouterMsg(res.message);
    await refreshRouterStatus();
  };
  document.getElementById("refresh-diagnostics-btn")?.addEventListener("click", refreshRouterStatus);

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
      await refreshRouterStatus();
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





