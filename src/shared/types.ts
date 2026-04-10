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
  };
}
export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  systemPrompt?: string;
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
  defaultModel: string;
  routerPort: number;
  models: string[];
  customTemplates: PromptTemplate[];
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModels: string[];
  localVoiceEnabled: boolean;
  localVoiceModel: string;
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

export type AgentTaskModelAttemptOutcome = "success" | "transient-error" | "error" | "semantic-error";
export type AgentTaskFinalVerificationResult = AgentVerificationStatus | "partial";
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

export interface AgentTaskTelemetry {
  selectedModel?: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  failureStage?: string;
  failureCategory?: AgentTaskFailureCategory;
  finalVerificationResult?: AgentTaskFinalVerificationResult;
  verificationSummary?: string;
  lastStage?: string;
  routeDiagnostics?: AgentTaskRouteTelemetrySummary;
  modelAttempts: AgentTaskModelAttempt[];
}

export interface AgentModelRouteDiagnostics {
  routeKey: string;
  model: string;
  baseUrl: string;
  provider: "local" | "remote";
  score: number;
  successes: number;
  failures: number;
  transientFailures: number;
  semanticFailures: number;
  lastUsedAt?: string;
}

export interface AgentTaskRouteFailureCount {
  model: string;
  count: number;
}

export interface AgentTaskStageRouteDiagnostics {
  stage: string;
  model: string;
  baseUrl: string;
  provider: "local" | "remote";
  routeIndex: number;
  attempt: number;
}

export interface AgentTaskRouteDiagnostics {
  taskId: string;
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}

export interface AgentTaskRouteTelemetrySummary {
  blacklistedModels: string[];
  failureCounts: AgentTaskRouteFailureCount[];
  activeStageRoutes: AgentTaskStageRouteDiagnostics[];
}

export interface AgentRouteDiagnostics {
  routes: AgentModelRouteDiagnostics[];
  task?: AgentTaskRouteDiagnostics;
}

export interface AgentTaskOutput {
  primaryAction: AgentOutputPrimaryAction;
  packageName?: string;
  workingDirectory?: string;
  runCommand?: string;
  usageTitle?: string;
  usageDetail?: string;
}

export interface AgentTask {
  id: string;
  prompt: string;
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
  telemetry?: AgentTaskTelemetry;
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
  | "chat:setSystemPrompt"
  | "chat:summarize"
  | "chat:generateTitle"
  | "chat:transcribeAudio"
  | "chat:send"
  | "chat:stop"
  | "stats:get"
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
  | "claude:applyEdits"
  | "claude:verifyManagedEdits"
  | "claude:repairManagedEdits"
  | "claude:stop"
  | "agent:listTasks"
  | "agent:getTask"
  | "agent:getLogs"
  | "agent:startTask"
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
