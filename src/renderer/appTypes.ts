interface AttachmentPayload {
  name: string;
  type: "text" | "image";
  content: string;
  mimeType?: string;
  sourcePath?: string;
  writableRoot?: string;
}
type ThemeMode = "dark" | "light";
type UiMode = "write" | "code" | "think" | "claude" | "edit";
type ProviderMode = "openrouter" | "nvidia" | "ollama";
type CloudProviderMode = Exclude<ProviderMode, "ollama">;
type ImageProviderMode = CloudProviderMode | "comfyui";
type InteractionMode = "chat" | "agent" | "image";
type UiExperienceMode = "default" | "simple";
type ImageStudioSortMode = "newest" | "oldest" | "prompt-az" | "prompt-za";
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
interface ImageHistoryListRequest {
  offset?: number;
  limit?: number;
}
interface GeneratedImageHistoryPage {
  items: GeneratedImageHistoryItem[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
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
type AgentTaskRunMode = "standard" | "build-product";
type AgentTaskDoDGateId = "plan" | "implement" | "verify" | "repair" | "package" | "installer-smoke" | "approve";
interface AgentTaskDoDGateOutcome {
  gate: AgentTaskDoDGateId;
  status: "passed" | "failed" | "skipped";
  summary: string;
  updatedAt: string;
}
interface AgentTaskTelemetry {
  runMode?: AgentTaskRunMode;
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
  dodGateOutcomes?: AgentTaskDoDGateOutcome[];
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
interface AgentTaskRunBudget {
  maxRuntimeMs?: number;
  maxCommands?: number;
  maxFileEdits?: number;
  maxRepairAttempts?: number;
}
interface AgentTaskRunBudgetUsage {
  runtimeMs: number;
  commands: number;
  fileEdits: number;
  repairAttempts: number;
}
interface AgentTaskPlanPreview {
  prompt: string;
  runMode: AgentTaskRunMode;
  targetPath?: string;
  workingDirectory: string;
  artifactType: AgentArtifactType;
  summary: string;
  stages: string[];
  workItems: string[];
  candidateFiles: string[];
  qualityGates: string[];
  requiredScripts: string[];
}
interface AgentTaskRequest {
  prompt: string;
  attachments?: AttachmentPayload[];
  targetPath?: string;
  runMode?: AgentTaskRunMode;
  budget?: AgentTaskRunBudget;
}
interface AgentPromptPreflightIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  suggestion?: string;
}
interface AgentPromptPreflightResult {
  ok: boolean;
  normalizedPrompt: string;
  runMode: AgentTaskRunMode;
  inferredArtifact: AgentArtifactType;
  requirementIds: string[];
  issues: AgentPromptPreflightIssue[];
  summary: string;
}
interface AgentTask {
  id: string;
  prompt: string;
  attachments?: AttachmentPayload[];
  runMode?: AgentTaskRunMode;
  budget?: AgentTaskRunBudget;
  budgetUsage?: AgentTaskRunBudgetUsage;
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
interface AgentTaskChangedPayload {
  taskId?: string;
  status?: AgentTask["status"];
  updatedAt?: string;
  reason: "task" | "log" | "restore";
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
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    rootConfigs?: Array<{
      path: string;
      label?: string;
      allowWrite?: boolean;
      overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    }>;
    temporaryRoots?: string[];
    budgets?: {
      maxFilesPerTurn?: number;
      maxBytesPerTurn?: number;
      maxToolCallsPerTurn?: number;
    };
    auditEnabled?: boolean;
    requireWritePlan?: boolean;
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
      onMessage: (cb: (chatId: string, msg: Message) => void) => () => void;
      onChunk: (cb: (chatId: string, msgId: string, chunk: string) => void) => () => void;
      onDone: (cb: (chatId: string, msgId: string) => void) => () => void;
      onError: (cb: (chatId: string, msgId: string, err: string) => void) => () => void;
      onStoreChanged: (cb: (payload?: { chatId?: string; reason?: string }) => void) => () => void;
    };
    images: {
      generate: (request: ImageGenerationRequest) => Promise<ImageGenerationResult>;
      listHistory: () => Promise<GeneratedImageHistoryItem[]>;
      listHistoryPage: (request?: ImageHistoryListRequest) => Promise<GeneratedImageHistoryPage>;
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
      onChanged: (cb: () => void) => () => void;
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
      onOutput: (cb: (payload: ClaudeOutputPayload) => void) => () => void;
      onError: (cb: (message: string) => void) => () => void;
      onExit: (cb: (payload: { code: number | null; signal: string | null }) => void) => () => void;
    };
    agent: {
      listTasks: () => Promise<AgentTask[]>;
      getTask: (taskId: string) => Promise<AgentTask | null>;
      getLogs: (taskId: string) => Promise<string[]>;
      getRouteDiagnostics: (taskId?: string) => Promise<AgentRouteDiagnostics>;
      preflightPrompt: (request: string | AgentTaskRequest) => Promise<AgentPromptPreflightResult>;
      previewPlan: (request: string | AgentTaskRequest) => Promise<AgentTaskPlanPreview>;
      startTask: (request: string | AgentTaskRequest) => Promise<AgentTask>;
      restartTask: (taskId: string, mode: AgentTaskRestartMode) => Promise<AgentTask>;
      stopTask: (taskId: string) => Promise<boolean>;
      listSnapshots: () => Promise<WorkspaceSnapshot[]>;
      getRestoreState: () => Promise<AgentSnapshotRestoreResult | null>;
      restoreSnapshot: (snapshotId: string) => Promise<AgentSnapshotRestoreResult>;
      onChanged: (cb: (payload?: AgentTaskChangedPayload) => void) => () => void;
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
      onChanged: (cb: () => void) => () => void;
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
      onLog: (cb: (line: string) => void) => () => void;
      onStateChanged: (cb: () => void) => () => void;
    };
  };
}


