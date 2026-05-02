export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  model?: string;
  error?: string;
  metadata?: {
    attachmentNames?: string[];
    compareGroup?: string;
    compareSlot?: "A" | "B";
    generatedImageAssetIds?: string[];
  };
}

export type ChatProvider = "openrouter" | "nvidia" | "ollama" | "claude";

export interface ChatContext {
  provider: ChatProvider;
  selectedModel?: string;
  compareModel?: string;
  compareEnabled?: boolean;
}

export type ClaudeChatOverwritePolicy = "create-only" | "allow-overwrite" | "ask-before-overwrite";

export interface ClaudeChatFilesystemRootConfig {
  path: string;
  label?: string;
  allowWrite?: boolean;
  overwritePolicy?: ClaudeChatOverwritePolicy;
}

export interface ClaudeChatFilesystemBudgets {
  maxFilesPerTurn?: number;
  maxBytesPerTurn?: number;
  maxToolCallsPerTurn?: number;
}

export interface ClaudeChatFilesystemSettings {
  roots: string[];
  allowWrite: boolean;
  overwritePolicy?: ClaudeChatOverwritePolicy;
  rootConfigs?: ClaudeChatFilesystemRootConfig[];
  temporaryRoots?: string[];
  budgets?: ClaudeChatFilesystemBudgets;
  auditEnabled?: boolean;
  requireWritePlan?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  systemPrompt?: string;
  context?: ChatContext;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Settings {
  apiKey: string;
  baseUrl: string;
  cloudProvider?: "openrouter" | "nvidia";
  imageProvider?: ImageProvider;
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
  claudeChatFilesystem?: ClaudeChatFilesystemSettings;
  mcpServers: McpServerConfig[];
  routing: {
    default: string;
    think: string;
    longContext: string;
  };
}

export interface PromptTemplate {
  name: string;
  content: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

export interface AttachmentPayload {
  name: string;
  type: "text" | "image";
  content: string;
  mimeType?: string;
  sourcePath?: string;
  writableRoot?: string;
}

export type ImageGenerationAspectRatio =
  | "1:1"
  | "1:2"
  | "2:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9";

export interface GeneratedImageAsset {
  id?: string;
  dataUrl: string;
  mimeType: string;
}

export type ImageProvider = "openrouter" | "nvidia" | "comfyui";

export interface ImageGenerationRequest {
  prompt: string;
  provider?: ImageProvider;
  model?: string;
  aspectRatio?: ImageGenerationAspectRatio;
}

export interface ImageGenerationResult {
  provider: ImageProvider;
  model: string;
  prompt: string;
  aspectRatio: ImageGenerationAspectRatio;
  text: string;
  images: GeneratedImageAsset[];
}

export interface ImageSaveResult {
  ok: boolean;
  message: string;
  path?: string;
}

export interface GeneratedImageHistoryItem {
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

export interface ImageHistoryListRequest {
  offset?: number;
  limit?: number;
}

export interface GeneratedImageHistoryPage {
  items: GeneratedImageHistoryItem[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
}

export interface ImageHistoryMutationResult {
  ok: boolean;
  message: string;
}

export interface RouterStatus {
  running: boolean;
  pid?: number;
  port: number;
}

export interface OllamaCheckResult {
  ok: boolean;
  message?: string;
}

export interface ClaudeManagedEdit {
  path: string;
  content: string;
}

export interface ClaudeManagedEditPermissions {
  allowedPaths: string[];
  allowedRoots: string[];
}

export interface ClaudeApplyEditsResult {
  ok: boolean;
  savedFiles: string[];
  backupFiles: Array<{ path: string; backupPath: string }>;
  unchangedFiles: string[];
  failedFiles: Array<{ path: string; reason: string }>;
  message: string;
}

export interface ManagedWriteVerificationFinding {
  severity: "error" | "warn";
  message: string;
  path?: string;
}

export interface ManagedWriteVerificationReport {
  ok: boolean;
  status: "passed" | "warning" | "blocked" | "skipped";
  summary: string;
  findings: ManagedWriteVerificationFinding[];
  reviewerModel?: string;
  rawResponse?: string;
}

export interface ManagedWriteRepairResult {
  ok: boolean;
  summary: string;
  edits: ClaudeManagedEdit[];
  reviewerModel?: string;
  rawResponse?: string;
  error?: string;
}

export type AgentTaskStatus = "running" | "completed" | "failed" | "stopped";
export type AgentTaskRestartMode = "retry" | "retry-clean" | "continue-fix";
export type AgentArtifactType = "web-app" | "api-service" | "script-tool" | "library" | "desktop-app" | "workspace-change" | "unknown";
export type AgentVerificationStatus = "passed" | "failed" | "skipped";
export type AgentOutputPrimaryAction =
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

export interface AgentTaskStep {
  id: string;
  title: string;
  status: AgentTaskStatus;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
}

export interface AgentVerificationCheck {
  id: string;
  label: string;
  status: AgentVerificationStatus;
  details: string;
}

export interface AgentVerificationReport {
  summary: string;
  checks: AgentVerificationCheck[];
  previewReady: boolean;
}

export interface AgentExecutionSpecScriptGroup {
  label: string;
  options: string[];
}

export interface AgentExecutionSpec {
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

export type AgentTaskModelAttemptOutcome = "success" | "transient-error" | "error" | "semantic-error";
export type AgentTaskFinalVerificationResult = AgentVerificationStatus | "partial";
export type AgentTaskRunMode = "standard" | "build-product";
export type AgentTaskDoDGateId = "plan" | "implement" | "verify" | "repair" | "package" | "installer-smoke" | "approve";
export type AgentTaskFailureCategory =
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

export interface AgentTaskModelAttempt {
  stage: string;
  model: string;
  routeIndex: number;
  attempt: number;
  outcome: AgentTaskModelAttemptOutcome;
  usedFallback: boolean;
  timestamp: string;
  error?: string;
}

export interface AgentTaskDoDGateOutcome {
  gate: AgentTaskDoDGateId;
  status: AgentVerificationStatus;
  summary: string;
  updatedAt: string;
}

export interface AgentTaskTelemetry {
  runMode?: AgentTaskRunMode;
  selectedModel?: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  failureStage?: string;
  failureCategory?: AgentTaskFailureCategory;
  finalVerificationResult?: AgentTaskFinalVerificationResult;
  verificationSummary?: string;
  lastStage?: string;
  failureMemoryHints?: string[];
  dodGateOutcomes?: AgentTaskDoDGateOutcome[];
  routeDiagnostics?: AgentTaskRouteTelemetrySummary;
  modelAttempts: AgentTaskModelAttempt[];
}

export interface AgentModelRouteDiagnostics {
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

export interface AgentModelRouteScoreFactor {
  label: string;
  delta: number;
}

export interface AgentTaskRouteFailureCount {
  model: string;
  count: number;
  blacklisted: boolean;
  hardFailuresUntilBlacklist: number;
  transientFailuresUntilBlacklist: number;
}

export interface AgentTaskStageRouteDiagnostics {
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

export interface AgentTaskRouteDiagnostics {
  taskId: string;
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  visionRequested: boolean;
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}

export interface AgentTaskRouteTelemetrySummary {
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  visionRequested: boolean;
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}

export interface AgentRouteDiagnostics {
  routes: AgentModelRouteDiagnostics[];
  task?: AgentTaskRouteDiagnostics;
}

export interface AgentTaskRunBudget {
  maxRuntimeMs?: number;
  maxCommands?: number;
  maxFileEdits?: number;
  maxRepairAttempts?: number;
}

export interface AgentTaskRunBudgetUsage {
  runtimeMs: number;
  commands: number;
  fileEdits: number;
  repairAttempts: number;
}

export interface AgentTaskPlanPreview {
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

export interface AgentTaskRequest {
  prompt: string;
  attachments?: AttachmentPayload[];
  targetPath?: string;
  runMode?: AgentTaskRunMode;
  budget?: AgentTaskRunBudget;
}

export interface AgentPromptPreflightIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  suggestion?: string;
}

export interface AgentPromptPreflightResult {
  ok: boolean;
  normalizedPrompt: string;
  runMode: AgentTaskRunMode;
  inferredArtifact: AgentArtifactType;
  requirementIds: string[];
  issues: AgentPromptPreflightIssue[];
  summary: string;
}

export interface AgentTaskOutput {
  primaryAction: AgentOutputPrimaryAction;
  packageName?: string;
  workingDirectory?: string;
  runCommand?: string;
  run?: string;
  installer?: string;
  knownLimitations?: string[];
  nextFixes?: string[];
  usageTitle?: string;
  usageDetail?: string;
}

export interface AgentTask {
  id: string;
  prompt: string;
  attachments?: AttachmentPayload[];
  runMode?: AgentTaskRunMode;
  budget?: AgentTaskRunBudget;
  budgetUsage?: AgentTaskRunBudgetUsage;
  status: AgentTaskStatus;
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

export type AgentTaskChangedReason = "task" | "log" | "restore";

export interface AgentTaskChangedPayload {
  taskId?: string;
  status?: AgentTaskStatus;
  updatedAt?: string;
  reason: AgentTaskChangedReason;
}

export interface WorkspaceSnapshot {
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

export interface AgentSnapshotRestoreResult {
  ok: boolean;
  message: string;
  snapshotId?: string;
  snapshotLabel?: string;
  snapshotKind?: WorkspaceSnapshot["kind"];
  taskId?: string;
  targetPathHint?: string;
}

export interface TerminalCommandRequest {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface TerminalCommandResult {
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

export interface WorkspaceFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface WorkspaceFileReadResult {
  path: string;
  content: string;
  size: number;
}

export interface WorkspaceFileSearchResult {
  path: string;
  line: number;
  preview: string;
}

export type IpcChannel =
  | "app:workspacePath"
  | "app:getInfo"
  | "app:newWindow"
  | "app:openExternal"
  | "app:openPreview"
  | "app:openPreviewWindow"
  | "chat:list"
  | "chat:get"
  | "chat:create"
  | "chat:delete"
  | "chat:rename"
  | "chat:export"
  | "chat:import"
  | "chat:appendMessage"
  | "chat:updateMessage"
  | "chat:setContext"
  | "chat:setSystemPrompt"
  | "chat:summarize"
  | "chat:generateTitle"
  | "chat:transcribeAudio"
  | "chat:send"
  | "chat:stop"
  | "stats:get"
  | "images:generate"
  | "images:listHistory"
  | "images:listHistoryPage"
  | "images:save"
  | "images:deleteHistory"
  | "settings:get"
  | "settings:save"
  | "attachments:pick"
  | "attachments:pickWritableRoots"
  | "templates:list"
  | "templates:save"
  | "templates:delete"
  | "ollama:check"
  | "ollama:listModels"
  | "mcp:list"
  | "mcp:add"
  | "mcp:remove"
  | "mcp:start"
  | "mcp:stop"
  | "mcp:status"
  | "claude:status"
  | "claude:start"
  | "claude:send"
  | "claude:inspectEdits"
  | "claude:applyEdits"
  | "claude:verifyManagedEdits"
  | "claude:repairManagedEdits"
  | "claude:stop"
  | "agent:listTasks"
  | "agent:getTask"
  | "agent:getLogs"
  | "agent:previewPlan"
  | "agent:startTask"
  | "agent:restartTask"
  | "agent:stopTask"
  | "agent:listSnapshots"
  | "agent:getRouteDiagnostics"
  | "agent:getRestoreState"
  | "agent:restoreSnapshot"
  | "terminal:run"
  | "workspace:listFiles"
  | "workspace:readFile"
  | "workspace:writeFile"
  | "workspace:search"
  | "workspace:pathExists"
  | "workspace:openPath"
  | "clipboard:writeText"
  | "router:status"
  | "router:logs"
  | "router:start"
  | "router:stop"
  | "router:test";
