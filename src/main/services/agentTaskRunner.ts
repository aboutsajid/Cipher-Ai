import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { CcrService } from "./ccrService";
import type { SettingsStore } from "./settingsStore";
import type {
  AttachmentPayload,
  AgentExecutionSpec,
  AgentArtifactType,
  AgentTaskChangedPayload,
  AgentTaskChangedReason,
  AgentModelRouteScoreFactor,
  AgentRouteDiagnostics,
  AgentTaskRestartMode,
  AgentTaskFinalVerificationResult,
  AgentTaskFailureCategory,
  AgentTaskModelAttempt,
  AgentTaskOutput,
  AgentTaskRouteTelemetrySummary,
  AgentSnapshotRestoreResult,
  AgentTask,
  AgentTaskTelemetry,
  AgentTaskStep,
  AgentVerificationCheck,
  AgentVerificationReport,
  AgentVerificationStatus,
  TerminalCommandRequest,
  TerminalCommandResult,
  WorkspaceSnapshot,
  WorkspaceFileEntry,
  WorkspaceFileReadResult,
  WorkspaceFileSearchResult
} from "../../shared/types";
import { normalizeAttachments } from "../attachmentSupport";
import { buildAttachmentAwarePromptMessages, type ChatHistoryEntry } from "../chatSendSupport";
import {
  buildStagePreferredCloudModelList,
  getDefaultBaseUrlForCloudProvider,
  getModelCapabilityHints,
  inferCloudProvider
} from "../../shared/modelCatalog";
import { isIgnoredWorkspaceFolder, isSnapshotPreserveFolder } from "./workspaceFolderGuards";

const MAX_LOG_LINES = 400;
const TASK_STATE_PERSIST_DEBOUNCE_MS = 80;
const MAX_MODEL_ATTEMPTS = 60;
const MAX_FILE_READ_BYTES = 256_000;
const MAX_FILE_WRITE_BYTES = MAX_FILE_READ_BYTES;
const MAX_SEARCH_RESULTS = 200;
const MAX_FIX_ATTEMPTS = 2;
const MAX_CONTEXT_FILES = 8;
const STARTUP_VERIFY_MS = 12_000;
const AGENT_MODEL_REQUEST_TIMEOUT_MS = 120_000;
const AGENT_MODEL_TRANSIENT_RETRY_LIMIT = 2;
const AGENT_MODEL_BLACKLIST_THRESHOLD = 2;
const AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD = 3;
const MAX_FAILURE_MEMORY_ENTRIES = 48;
const MAX_UNREFERENCED_AUTO_SNAPSHOTS = 24;
const TEXT_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".html", ".css", ".scss", ".mjs", ".cjs", ".yml", ".yaml"
]);
interface PackageScripts {
  build?: string;
  lint?: string;
  test?: string;
  start?: string;
  dev?: string;
  [key: string]: string | undefined;
}

interface PackageManifest {
  name?: string;
  description?: string;
  private?: boolean;
  version?: string;
  type?: string;
  main?: string;
  exports?: string | Record<string, string>;
  scripts?: PackageScripts;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
}

interface ModelRoute {
  model: string;
  baseUrl: string;
  apiKey: string;
  skipAuth: boolean;
}

interface StructuredEdit {
  path: string;
  content: string;
}

interface FixResponse {
  summary: string;
  edits: StructuredEdit[];
}

interface ParsedFixResponse {
  fix?: FixResponse;
  extractedJson: string;
  issue?: "no-usable-edits" | "schema-mismatch";
}

interface ParseFixResponseOptions {
  strictSchema?: boolean;
}

interface StructuredEditValidationResult {
  acceptedEdits: StructuredEdit[];
  rejectedEdits: Array<{ path: string; reason: string }>;
}

interface HeuristicFixResult {
  summary: string;
  edits: StructuredEdit[];
}

interface HeuristicImplementationResult {
  summary: string;
  edits: StructuredEdit[];
}

interface StartupProbeResult {
  status: AgentVerificationStatus;
  details: string;
}

interface BrowserSmokeResult {
  status: AgentVerificationStatus;
  details: string;
}

interface StartupVerificationProbe {
  label: string;
  run: (result: TerminalCommandResult) => Promise<StartupProbeResult>;
}

type StarterProfile =
  | "react-web-app"
  | "react-dashboard"
  | "react-crud"
  | "react-kanban"
  | "react-notes"
  | "static-marketing"
  | "electron-desktop"
  | "node-api-service"
  | "node-cli"
  | "node-library"
  | "workspace-change";

type DomainFocus =
  | "operations"
  | "crm"
  | "inventory"
  | "scheduling"
  | "finance"
  | "admin"
  | "generic";

interface TaskExecutionSpecScriptGroup {
  label: string;
  options: string[];
}

interface TaskExecutionSpec extends AgentExecutionSpec {
  summary: string;
  starterProfile: StarterProfile;
  domainFocus: DomainFocus;
  deliverables: string[];
  acceptanceCriteria: string[];
  qualityGates: string[];
  requiredFiles: string[];
  requiredScriptGroups: TaskExecutionSpecScriptGroup[];
  expectsReadme: boolean;
}

interface TaskRepositoryContext {
  summary: string;
  workspaceShape: "single-package" | "monorepo" | "static-site" | "unknown";
  packageManager: "npm" | "pnpm" | "yarn" | "unknown";
  languageStyle: "typescript" | "javascript" | "mixed" | "unknown";
  moduleFormat: "esm" | "commonjs" | "mixed" | "unknown";
  uiFramework: "react" | "nextjs" | "none" | "unknown";
  styling: "css" | "tailwind" | "mixed" | "unknown";
  testing: "vitest" | "jest" | "node:test" | "none" | "unknown";
  linting: "eslint" | "biome" | "none" | "unknown";
  conventions: string[];
}

interface TaskExecutionPlan {
  summary: string;
  candidateFiles: string[];
  requestedPaths: string[];
  promptTerms: string[];
  workingDirectory: string;
  workspaceManifest: string[];
  repositoryContext: TaskRepositoryContext;
  workItems: TaskWorkItem[];
  spec: TaskExecutionSpec;
  promptRequirements: PromptRequirement[];
  workspaceKind: "static" | "react" | "generic";
  builderMode: "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
}

interface TaskWorkItem {
  title: string;
  instruction: string;
  allowedPaths?: string[];
}

interface PromptRequirement {
  id: string;
  label: string;
  terms: string[];
  mode: "all" | "any";
}

interface WorkspaceInspectionResult {
  summary: string;
  scripts: PackageScripts;
  packageName?: string;
  packageManifest?: PackageManifest | null;
  topLevelEntries: WorkspaceFileEntry[];
}

interface BootstrapPlan {
  targetDirectory: string;
  template: "react-vite" | "nextjs" | "static" | "node-package";
  artifactType?: AgentArtifactType;
  starterProfile: StarterProfile;
  domainFocus: DomainFocus;
  projectName: string;
  summary: string;
  commands: TerminalCommandRequest[];
}

interface ModelRouteStats {
  successes: number;
  failures: number;
  transientFailures: number;
  semanticFailures: number;
  lastUsedAt?: string;
}

interface FailureMemoryEntry {
  key: string;
  artifactType: AgentArtifactType | "unknown";
  category: AgentTaskFailureCategory;
  stage: string;
  signature: string;
  guidance: string;
  example: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface TaskStageRouteState {
  route: ModelRoute;
  routeIndex: number;
  attempt: number;
}

interface StoredSnapshotEntry {
  directoryName: string;
  directoryPath: string;
  snapshot: WorkspaceSnapshot | null;
}

type AgentRoutingStage = "planner" | "generator" | "repair";

interface AgentTaskRunnerHooks {
  onTaskChanged?: (payload: AgentTaskChangedPayload) => void;
}

export class AgentTaskRunner {
  private readonly workspaceRoot: string;
  private readonly settingsStore: SettingsStore;
  private readonly ccrService: CcrService;
  private readonly snapshotRoot: string;
  private readonly taskStatePath: string;
  private readonly tasks = new Map<string, AgentTask>();
  private readonly taskLogs = new Map<string, string[]>();
  private readonly activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly modelRouteStats = new Map<string, ModelRouteStats>();
  private readonly failureMemory = new Map<string, FailureMemoryEntry>();
  private readonly taskModelFailureCounts = new Map<string, Map<string, number>>();
  private readonly taskModelBlacklist = new Map<string, Set<string>>();
  private readonly taskStageRoutes = new Map<string, Map<string, TaskStageRouteState>>();
  private readonly onTaskChanged?: (payload: AgentTaskChangedPayload) => void;
  private lastRestoreState: AgentSnapshotRestoreResult | null = null;
  private activeTaskId: string | null = null;
  private lastTaskStatePersistAt = 0;

  constructor(workspaceRoot: string, settingsStore: SettingsStore, ccrService: CcrService, hooks: AgentTaskRunnerHooks = {}) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.settingsStore = settingsStore;
    this.ccrService = ccrService;
    this.onTaskChanged = hooks.onTaskChanged;
    this.snapshotRoot = join(this.workspaceRoot, ".cipher-snapshots");
    this.taskStatePath = join(this.snapshotRoot, "agent-task-state.json");
    this.loadPersistedTaskState();
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  listTasks(): AgentTask[] {
    return [...this.tasks.values()]
      .map((task) => this.cloneTask(task))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private emitTaskChanged(reason: AgentTaskChangedReason, taskId?: string): void {
    if (!this.onTaskChanged) return;
    const normalizedTaskId = (taskId ?? "").trim();
    const task = normalizedTaskId ? this.tasks.get(normalizedTaskId) : null;
    this.onTaskChanged({
      reason,
      taskId: normalizedTaskId || undefined,
      status: task?.status,
      updatedAt: task?.updatedAt
    });
  }

  private buildRestoreSuccessMessage(snapshot: WorkspaceSnapshot): string {
    const targetSuffix = snapshot.targetPathHint ? ` for ${snapshot.targetPathHint}` : "";
    if (snapshot.kind === "after-task") {
      return `Restored After snapshot${targetSuffix}. The finished task output is back in the current workspace state.`;
    }
    if (snapshot.kind === "before-task") {
      return `Restored Before snapshot${targetSuffix}. The workspace is back to the state before this task ran.`;
    }
    return snapshot.label
      ? `Restored snapshot "${snapshot.label}"${targetSuffix}.`
      : `Snapshot restored${targetSuffix}.`;
  }

  private isRetriableWorkspaceFsError(error: unknown): boolean {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    return code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
  }

  private isNoSpaceLeftError(error: unknown): boolean {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    const message = error instanceof Error ? error.message : String(error ?? "");
    return code === "ENOSPC" || /\bENOSPC\b|no space left on device/i.test(message);
  }

  private async withWorkspaceFsRetry<T>(operation: () => Promise<T>, attempts = 4, delayMs = 150): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!this.isRetriableWorkspaceFsError(error) || attempt === attempts - 1) {
          throw error;
        }
        await delay(delayMs * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Workspace filesystem retry exhausted.");
  }

  getTask(taskId: string): AgentTask | null {
    const task = this.tasks.get(taskId);
    return task ? this.cloneTask(task) : null;
  }

  getTaskLogs(taskId: string): string[] {
    return [...(this.taskLogs.get(taskId) ?? [])];
  }

  getRouteDiagnostics(taskId?: string): AgentRouteDiagnostics {
    const routes = [...this.modelRouteStats.entries()]
      .map(([routeKey, stats]) => {
        const [provider, baseUrl, ...modelParts] = routeKey.split("|");
        const model = modelParts.join("|");
        return {
          routeKey,
          model,
          baseUrl,
          provider: provider === "local" ? "local" as const : "remote" as const,
          score: this.getModelRouteScore({
            model,
            baseUrl,
            skipAuth: provider === "local"
          }),
          scoreFactors: this.buildModelRouteScoreFactors({
            model,
            baseUrl,
            skipAuth: provider === "local"
          }),
          successes: stats.successes,
          failures: stats.failures,
          transientFailures: stats.transientFailures,
          semanticFailures: stats.semanticFailures,
          lastUsedAt: stats.lastUsedAt
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "");
      });

    const normalizedTaskId = (taskId ?? "").trim();
    if (!normalizedTaskId) {
      return { routes };
    }
    const taskSummary = this.buildTaskRouteTelemetrySummary(normalizedTaskId);

    return {
      routes,
      task: {
        taskId: normalizedTaskId,
        blacklistedModels: taskSummary.blacklistedModels,
        failureCounts: taskSummary.failureCounts,
        visionRequested: taskSummary.visionRequested,
        activeStageRoutes: taskSummary.activeStageRoutes
      }
    };
  }

  private loadPersistedTaskState(): void {
    try {
      if (!existsSync(this.taskStatePath)) return;
      const raw = readFileSync(this.taskStatePath, "utf8");
      const parsed = JSON.parse(raw) as {
        tasks?: AgentTask[];
        logs?: Record<string, string[]>;
        lastRestoreState?: AgentSnapshotRestoreResult | null;
        modelRouteStats?: Record<string, ModelRouteStats>;
        failureMemory?: FailureMemoryEntry[];
      };
      let recoveredInterruptedTasks = false;

      for (const task of parsed.tasks ?? []) {
        if (!task?.id) continue;
        const recoveredTask = this.recoverInterruptedTask(task);
        if (recoveredTask.status === "stopped" && task.status === "running") {
          recoveredInterruptedTasks = true;
        }
        this.tasks.set(task.id, recoveredTask);
      }

      for (const [taskId, logs] of Object.entries(parsed.logs ?? {})) {
        if (!taskId) continue;
        const nextLogs = Array.isArray(logs) ? logs.slice(-MAX_LOG_LINES) : [];
        const task = this.tasks.get(taskId);
        if (task?.status === "stopped" && (parsed.tasks ?? []).some((entry) => entry?.id === taskId && entry.status === "running")) {
          nextLogs.push("Recovered interrupted task after app restart. Marked as stopped.");
        }
        this.taskLogs.set(taskId, nextLogs.slice(-MAX_LOG_LINES));
      }

      if (parsed.lastRestoreState?.ok) {
        this.lastRestoreState = { ...parsed.lastRestoreState };
      }

      for (const [routeKey, stats] of Object.entries(parsed.modelRouteStats ?? {})) {
        if (!routeKey || !stats) continue;
        this.modelRouteStats.set(routeKey, {
          successes: Math.max(0, Number(stats.successes) || 0),
          failures: Math.max(0, Number(stats.failures) || 0),
          transientFailures: Math.max(0, Number(stats.transientFailures) || 0),
          semanticFailures: Math.max(0, Number(stats.semanticFailures) || 0),
          lastUsedAt: typeof stats.lastUsedAt === "string" ? stats.lastUsedAt : undefined
        });
      }

      for (const entry of parsed.failureMemory ?? []) {
        if (!entry?.key || !entry?.category || !entry?.stage || !entry?.guidance) continue;
        this.failureMemory.set(entry.key, {
          key: entry.key,
          artifactType: entry.artifactType ?? "unknown",
          category: entry.category,
          stage: entry.stage,
          signature: entry.signature ?? "general",
          guidance: entry.guidance,
          example: entry.example ?? "",
          count: Math.max(1, Number(entry.count) || 1),
          firstSeenAt: typeof entry.firstSeenAt === "string" ? entry.firstSeenAt : new Date().toISOString(),
          lastSeenAt: typeof entry.lastSeenAt === "string" ? entry.lastSeenAt : new Date().toISOString()
        });
      }

      if (recoveredInterruptedTasks) {
        this.persistTaskState();
      }
    } catch {
      // Ignore malformed persisted task state.
    }
  }

  private recoverInterruptedTask(task: AgentTask): AgentTask {
    const cloned = this.cloneTask(task);
    if (cloned.status !== "running") return cloned;

    const recoveredAt = new Date().toISOString();
    cloned.status = "stopped";
    cloned.updatedAt = recoveredAt;
    cloned.summary = "Task stopped because the previous app session ended before the agent finished.";
    cloned.steps = cloned.steps.map((step) => {
      if (step.status !== "running") return step;
      return {
        ...step,
        status: "stopped",
        finishedAt: step.finishedAt ?? recoveredAt,
        summary: (step.summary ?? "").trim() || "Interrupted when the previous app session ended."
      };
    });
    return cloned;
  }

  private queueTaskStatePersist(taskId?: string): void {
    const nowMs = Date.now();
    if (nowMs - this.lastTaskStatePersistAt < TASK_STATE_PERSIST_DEBOUNCE_MS) return;
    this.persistTaskStateNow(nowMs, taskId, "log");
  }

  private persistTaskStateNow(persistedAt = Date.now(), taskId?: string, reason: AgentTaskChangedReason = "task"): void {
    try {
      if (!existsSync(this.snapshotRoot)) {
        mkdirSync(this.snapshotRoot, { recursive: true });
      }

      const payload = {
        tasks: [...this.tasks.values()].map((task) => this.cloneTask(task)),
        logs: Object.fromEntries([...this.taskLogs.entries()].map(([taskId, logs]) => [taskId, [...logs]])),
        lastRestoreState: this.lastRestoreState ? { ...this.lastRestoreState } : null,
        modelRouteStats: Object.fromEntries([...this.modelRouteStats.entries()].map(([key, value]) => [key, { ...value }])),
        failureMemory: [...this.failureMemory.values()]
          .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
          .slice(0, MAX_FAILURE_MEMORY_ENTRIES)
          .map((entry) => ({ ...entry }))
      };
      writeFileSync(this.taskStatePath, JSON.stringify(payload, null, 2), "utf8");
      this.lastTaskStatePersistAt = persistedAt;
      this.emitTaskChanged(reason, taskId);
    } catch {
      // Ignore persistence failures; runtime state remains authoritative.
    }
  }

  private persistTaskState(taskId?: string, reason: AgentTaskChangedReason = "task"): void {
    this.persistTaskStateNow(Date.now(), taskId, reason);
  }

  private async hasSnapshot(snapshotId: string): Promise<boolean> {
    if (!snapshotId) return false;
    try {
      await stat(join(this.snapshotRoot, snapshotId, "meta.json"));
      return true;
    } catch {
      return false;
    }
  }

  async getLastRestoreState(): Promise<AgentSnapshotRestoreResult | null> {
    if (!this.lastRestoreState?.ok) return null;

    const snapshotId = (this.lastRestoreState.snapshotId ?? "").trim();
    const taskId = (this.lastRestoreState.taskId ?? "").trim();
    const hasValidSnapshot = await this.hasSnapshot(snapshotId);
    const hasValidTask = !taskId || this.tasks.has(taskId);
    if (!hasValidSnapshot || !hasValidTask) {
      this.lastRestoreState = null;
      this.persistTaskState(taskId || undefined);
      return null;
    }

    return { ...this.lastRestoreState };
  }

  async listSnapshots(): Promise<WorkspaceSnapshot[]> {
    try {
      const entries = await readdir(this.snapshotRoot, { withFileTypes: true });
      const snapshots: WorkspaceSnapshot[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = join(this.snapshotRoot, entry.name, "meta.json");
        try {
          const raw = await readFile(metaPath, "utf8");
          const parsed = JSON.parse(raw) as WorkspaceSnapshot;
          if (parsed?.id) snapshots.push(parsed);
        } catch {
          // Ignore malformed snapshots.
        }
      }
      return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  private collectReferencedSnapshotIds(): Set<string> {
    const referencedIds = new Set<string>();

    for (const task of this.tasks.values()) {
      const rollbackSnapshotId = (task.rollbackSnapshotId ?? "").trim();
      const completionSnapshotId = (task.completionSnapshotId ?? "").trim();
      if (rollbackSnapshotId) referencedIds.add(rollbackSnapshotId);
      if (completionSnapshotId) referencedIds.add(completionSnapshotId);
    }

    const restoredSnapshotId = (this.lastRestoreState?.snapshotId ?? "").trim();
    if (restoredSnapshotId) referencedIds.add(restoredSnapshotId);

    return referencedIds;
  }

  private async listStoredSnapshotEntries(): Promise<StoredSnapshotEntry[]> {
    try {
      const entries = await readdir(this.snapshotRoot, { withFileTypes: true });
      const snapshots: StoredSnapshotEntry[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const directoryPath = join(this.snapshotRoot, entry.name);
        const metaPath = join(directoryPath, "meta.json");
        let snapshot: WorkspaceSnapshot | null = null;

        try {
          const raw = await readFile(metaPath, "utf8");
          const parsed = JSON.parse(raw) as WorkspaceSnapshot;
          if (parsed?.id) {
            snapshot = parsed;
          }
        } catch {
          snapshot = null;
        }

        snapshots.push({
          directoryName: entry.name,
          directoryPath,
          snapshot
        });
      }

      return snapshots;
    } catch {
      return [];
    }
  }

  private async removeSnapshotDirectory(directoryPath: string): Promise<void> {
    await this.withWorkspaceFsRetry(
      () => rm(directoryPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
    );
  }

  private async pruneStoredSnapshots(options?: { aggressive?: boolean }): Promise<number> {
    const referencedIds = this.collectReferencedSnapshotIds();
    const entries = await this.listStoredSnapshotEntries();
    const keepUnreferenced = options?.aggressive ? 4 : MAX_UNREFERENCED_AUTO_SNAPSHOTS;
    let removed = 0;

    const invalidEntries = entries.filter((entry) => !entry.snapshot);
    for (const entry of invalidEntries) {
      await this.removeSnapshotDirectory(entry.directoryPath);
      removed += 1;
    }

    const autoUnreferenced = entries
      .filter((entry) => {
        const snapshot = entry.snapshot;
        if (!snapshot?.id) return false;
        if (referencedIds.has(snapshot.id)) return false;
        return snapshot.kind !== "manual";
      })
      .sort((a, b) => {
        const left = a.snapshot?.createdAt ?? "";
        const right = b.snapshot?.createdAt ?? "";
        return right.localeCompare(left);
      });

    for (const entry of autoUnreferenced.slice(keepUnreferenced)) {
      await this.removeSnapshotDirectory(entry.directoryPath);
      removed += 1;
    }

    return removed;
  }

  async restoreSnapshot(snapshotId: string): Promise<AgentSnapshotRestoreResult> {
    const normalizedId = (snapshotId ?? "").trim();
    if (!normalizedId) return { ok: false, message: "Snapshot ID is required." };

    const snapshotDir = join(this.snapshotRoot, normalizedId, "files");
    const metaPath = join(this.snapshotRoot, normalizedId, "meta.json");

    let snapshot: WorkspaceSnapshot | null = null;
    try {
      const raw = await readFile(metaPath, "utf8");
      snapshot = JSON.parse(raw) as WorkspaceSnapshot;
    } catch {
      return { ok: false, message: "Snapshot metadata not found." };
    }

    try {
      await stat(snapshotDir);
    } catch {
      return { ok: false, message: "Snapshot files not found." };
    }

    if (snapshot.topLevelEntries && snapshot.topLevelEntries.length > 0) {
      try {
        const snapshotEntries = (await readdir(snapshotDir, { withFileTypes: true }))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b));
        const missingEntries = snapshot.topLevelEntries.filter((entry) => !snapshotEntries.includes(entry));
        if (missingEntries.length > 0) {
          return {
            ok: false,
            message: `Snapshot is incomplete and cannot be restored safely. Missing entries: ${missingEntries.join(", ")}.`
          };
        }
      } catch {
        return { ok: false, message: "Snapshot could not be validated before restore." };
      }
    }

    try {
      const restoreTargetPath = this.resolveSnapshotScopedRestoreTarget(snapshot);
      if (restoreTargetPath) {
        await this.restoreSnapshotTarget(snapshotDir, restoreTargetPath);
      } else {
        const rootEntries = await readdir(this.workspaceRoot, { withFileTypes: true });
        for (const entry of rootEntries) {
          if (isSnapshotPreserveFolder(entry.name) || isIgnoredWorkspaceFolder(entry.name)) continue;
          try {
            await this.withWorkspaceFsRetry(
              () => rm(join(this.workspaceRoot, entry.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
            );
          } catch (error) {
            const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
            if (code !== "ENOENT") {
              throw error;
            }
          }
        }

        const snapshotEntries = await readdir(snapshotDir, { withFileTypes: true });
        for (const entry of snapshotEntries) {
          try {
            await this.withWorkspaceFsRetry(
              () => cp(join(snapshotDir, entry.name), join(this.workspaceRoot, entry.name), { recursive: true, force: true })
            );
          } catch (error) {
            const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
            if (code !== "ENOENT") {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown restore error";
      return { ok: false, message: `Snapshot restore failed: ${message}` };
    }

    const result: AgentSnapshotRestoreResult = {
      ok: true,
      message: this.buildRestoreSuccessMessage(snapshot),
      snapshotId: snapshot.id,
      snapshotLabel: snapshot.label,
      snapshotKind: snapshot.kind,
      taskId: snapshot.taskId,
      targetPathHint: snapshot.targetPathHint
    };
    this.lastRestoreState = result;
    this.persistTaskState(snapshot.taskId, "restore");
    return result;
  }

  async startTask(prompt: string, attachments: AttachmentPayload[] = [], targetPath?: string): Promise<AgentTask> {
    this.ensureNoRunningTask();

    const taskId = `agent_${randomUUID()}`;
    const now = new Date().toISOString();
    const normalizedAttachments = normalizeAttachments(attachments);
    const normalizedTargetPath = this.normalizeTaskTargetPath(targetPath);
    const initialArtifactType = this.classifyArtifactType((prompt ?? "").trim());
    const task: AgentTask = {
      id: taskId,
      prompt: (prompt ?? "").trim(),
      attachments: normalizedAttachments,
      status: "running",
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      targetPath: normalizedTargetPath,
      artifactType: initialArtifactType,
      output: this.buildTaskOutput(initialArtifactType, undefined, (prompt ?? "").trim()),
      executionSpec: undefined,
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      }
    };

    const snapshot = await this.createSnapshot(`Before agent task: ${task.prompt.slice(0, 80)}`, taskId, {
      kind: "before-task",
      targetPathHint: normalizedTargetPath ?? this.extractGeneratedAppDirectoryFromPrompt(task.prompt) ?? undefined
    });
    task.rollbackSnapshotId = snapshot.id;

    this.tasks.set(taskId, task);
    this.taskLogs.set(taskId, []);
    this.taskModelFailureCounts.delete(taskId);
    this.taskModelBlacklist.delete(taskId);
    this.taskStageRoutes.delete(taskId);
    this.activeTaskId = taskId;
    this.lastRestoreState = null;
    this.appendLog(taskId, `Agent task started. Rollback snapshot: ${snapshot.id}`);
    if (normalizedAttachments.length > 0) {
      this.appendLog(taskId, `Task attachments: ${normalizedAttachments.map((attachment) => attachment.name).join(", ")}`);
    }
    this.persistTaskState(taskId);

    void this.runTask(taskId);
    return this.cloneTask(task);
  }

  async restartTask(taskId: string, mode: AgentTaskRestartMode): Promise<AgentTask> {
    const normalizedTaskId = (taskId ?? "").trim();
    const task = this.tasks.get(normalizedTaskId);
    if (!task) {
      throw new Error("Agent task not found.");
    }
    if (task.status === "running") {
      throw new Error("Cannot restart a running task. Stop it first.");
    }

    this.ensureNoRunningTask();

    if (mode === "retry-clean") {
      const rollbackSnapshotId = (task.rollbackSnapshotId ?? "").trim();
      if (!rollbackSnapshotId) {
        throw new Error("Rollback snapshot is not available for a clean retry.");
      }
      const restored = await this.restoreSnapshot(rollbackSnapshotId);
      if (!restored.ok) {
        throw new Error(restored.message || "Clean retry could not restore the rollback snapshot.");
      }
    }

    const nextPrompt = this.buildRestartPrompt(task, mode);
    const restarted = await this.startTask(nextPrompt, task.attachments ?? [], task.targetPath);
    this.appendLog(restarted.id, `Restarted from ${task.id} using ${this.describeRestartMode(mode)}.`);
    return restarted;
  }

  async stopTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    const proc = this.activeProcesses.get(taskId);
    if (!task && !proc) return false;

    if (task && task.status === "running") {
      task.status = "stopped";
      task.summary = "Stop requested.";
      task.updatedAt = new Date().toISOString();
      this.persistTaskState(task.id);
    }

    if (proc) {
      try {
        await this.terminateProcessTree(proc);
      } catch {
        if (!task) return false;
      }
    }

    this.appendLog(taskId, "Stop requested.");
    return true;
  }

  async runTerminalCommand(request: TerminalCommandRequest): Promise<TerminalCommandResult> {
    return this.executeCommand("manual", request);
  }

  async listWorkspaceFiles(targetPath = ".", depth = 2): Promise<WorkspaceFileEntry[]> {
    const root = this.resolveWorkspacePath(targetPath);
    return this.scanEntries(root, Math.max(0, Math.min(depth, 6)));
  }

  async readWorkspaceFile(targetPath: string): Promise<WorkspaceFileReadResult> {
    const fullPath = this.resolveWorkspacePath(targetPath);
    const fileInfo = await stat(fullPath);
    if (!fileInfo.isFile()) {
      throw new Error("Target path is not a file.");
    }
    if (fileInfo.size > MAX_FILE_READ_BYTES) {
      throw new Error(`File is too large to read in-app (${fileInfo.size} bytes).`);
    }

    const content = await readFile(fullPath, "utf8");
    return {
      path: this.toWorkspaceRelative(fullPath),
      content,
      size: fileInfo.size
    };
  }

  async writeWorkspaceFile(targetPath: string, content: string): Promise<{ ok: boolean; path: string; size: number }> {
    const fullPath = this.resolveWorkspacePath(targetPath);
    const contentBytes = Buffer.byteLength(content, "utf8");
    if (contentBytes > MAX_FILE_WRITE_BYTES) {
      throw new Error(`File is too large to write in-app (${contentBytes} bytes).`);
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
    const info = await stat(fullPath);
    return {
      ok: true,
      path: this.toWorkspaceRelative(fullPath),
      size: info.size
    };
  }

  async searchWorkspace(pattern: string, targetPath = "."): Promise<WorkspaceFileSearchResult[]> {
    const normalizedPattern = (pattern ?? "").trim().toLowerCase();
    if (!normalizedPattern) return [];

    const root = this.resolveWorkspacePath(targetPath);
    const files = await this.scanEntries(root, 6);
    const results: WorkspaceFileSearchResult[] = [];

    for (const entry of files) {
      if (entry.type !== "file") continue;
      if (!TEXT_FILE_EXTENSIONS.has(extname(entry.path).toLowerCase())) continue;
      const fullPath = this.resolveWorkspacePath(entry.path);
      const info = await stat(fullPath);
      if (info.size > MAX_FILE_READ_BYTES) continue;

      let content = "";
      try {
        content = await readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].toLowerCase().includes(normalizedPattern)) continue;
        results.push({
          path: entry.path,
          line: i + 1,
          preview: lines[i].trim().slice(0, 240)
        });
        if (results.length >= MAX_SEARCH_RESULTS) return results;
      }
    }

    return results;
  }

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      const inspection = await this.runStep(task, "Inspect workspace", async () => {
        const packageJson = await this.tryReadPackageJson();
        const scripts = this.extractScripts(packageJson);
        const topLevelEntries = await this.listWorkspaceFiles(".", 2);
        this.appendLog(task.id, `Workspace root: ${this.workspaceRoot}`);
        this.appendLog(task.id, `Top-level entries scanned: ${topLevelEntries.length}`);
        if (packageJson?.name) this.appendLog(task.id, `Detected package: ${packageJson.name}`);
        if (Object.keys(scripts).length > 0) {
          this.appendLog(task.id, `Detected scripts: ${Object.keys(scripts).join(", ")}`);
        }
        return {
          summary: packageJson?.name
            ? `Workspace inspected. Package ${packageJson.name} found.`
            : "Workspace inspected.",
          scripts,
          packageName: packageJson?.name,
          packageManifest: packageJson,
          topLevelEntries
        };
      });

      let workingDirectory = ".";
      const explicitTargetContext = (task.targetPath ?? "").trim();
      const generatedAppContext = explicitTargetContext ? null : this.extractGeneratedAppDirectoryFromPrompt(task.prompt);
      if (explicitTargetContext) {
        workingDirectory = explicitTargetContext;
        task.targetPath = explicitTargetContext;
        this.appendLog(task.id, `Using user-selected target path: ${workingDirectory}`);
        await this.ensureExplicitTaskWorkspace(task, workingDirectory);
      }
      if (generatedAppContext) {
        workingDirectory = generatedAppContext;
        task.targetPath = generatedAppContext;
        this.appendLog(task.id, `Using generated app context from prompt: ${workingDirectory}`);
        await this.ensureExplicitGeneratedAppWorkspace(task, workingDirectory);
      }
      const bootstrapPlan = explicitTargetContext || generatedAppContext ? null : this.detectBootstrapPlan(task.prompt, inspection);
      if (bootstrapPlan) {
        const bootstrap = await this.runStep(task, "Bootstrap project workspace", async () => {
          const result = await this.executeBootstrapPlan(task.id, bootstrapPlan);
          workingDirectory = bootstrapPlan.targetDirectory;
          task.targetPath = bootstrapPlan.targetDirectory;
          return { summary: result.summary };
        });
        this.appendLog(task.id, bootstrap.summary);
      }
      if (!task.targetPath) {
        task.targetPath = workingDirectory;
      }

      const plan = await this.runStep(task, "Plan task execution", async () => {
        const executionPlan = await this.buildExecutionPlan(task.prompt, workingDirectory, task.attachments ?? []);
        const packageManifest = await this.tryReadPackageJson(executionPlan.workingDirectory);
        const scripts = this.resolveVerificationScripts(packageManifest, executionPlan);
        task.artifactType = this.classifyArtifactType(task.prompt, executionPlan, undefined, packageManifest ?? inspection.packageManifest);
        task.output = this.buildTaskOutput(task.artifactType, {
          packageName: packageManifest?.name ?? inspection.packageName,
          scripts,
          workingDirectory: executionPlan.workingDirectory
        }, task.prompt);
        task.executionSpec = this.cloneExecutionSpec(executionPlan.spec);
        this.appendLog(task.id, `Planned files: ${executionPlan.candidateFiles.join(", ") || "(none)"}`);
        this.appendLog(task.id, `Planned work items: ${executionPlan.workItems.map((item) => item.title).join(", ") || "(none)"}`);
        this.appendLog(task.id, `Execution spec: ${executionPlan.spec.summary}`);
        return {
          summary: executionPlan.summary,
          plan: executionPlan
        };
      });

      if (!this.isVerificationOnlyPrompt(task.prompt)) {
        const appliedFiles = new Set<string>();
        for (const [index, workItem] of plan.plan.workItems.entries()) {
          await this.runStep(task, `Implement: ${workItem.title}`, async () => {
            let implementation: FixResponse;
            const preferHeuristicImplementation = this.shouldPreferHeuristicImplementation(task.prompt, plan.plan);
            if (preferHeuristicImplementation) {
              const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan.plan);
              if (!heuristicImplementation || heuristicImplementation.edits.length === 0) {
                return { summary: `No useful implementation produced for ${workItem.title}.` };
              }
              this.appendLog(task.id, `Using heuristic-first implementation: ${heuristicImplementation.summary}`);
              implementation = {
                summary: heuristicImplementation.summary,
                edits: heuristicImplementation.edits
              };
            } else {
              try {
                implementation = await this.requestTaskImplementation(task.id, workItem.instruction, plan.plan, workItem);
              } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown implementation failure.";
                this.appendLog(task.id, `Model-based implementation failed for "${workItem.title}": ${message}`);
                const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan.plan);
                if (!heuristicImplementation || heuristicImplementation.edits.length === 0) {
                  throw err;
                }
                this.appendLog(task.id, `Using heuristic implementation fallback: ${heuristicImplementation.summary}`);
                implementation = {
                  summary: heuristicImplementation.summary,
                  edits: heuristicImplementation.edits
                };
              }
              implementation.edits = this.filterValidEdits(implementation.edits, plan.plan, workItem);
              if (!this.hasUsefulImplementation(implementation, workItem)) {
                const reason = implementation.summary || "Model returned no useful file changes.";
                this.appendLog(task.id, `Model-based implementation failed for "${workItem.title}": ${reason}`);
                const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan.plan);
                if (!heuristicImplementation || heuristicImplementation.edits.length === 0) {
                  return { summary: `No useful implementation produced for ${workItem.title}.` };
                }
                this.appendLog(task.id, `Using heuristic implementation fallback: ${heuristicImplementation.summary}`);
                implementation = {
                  summary: heuristicImplementation.summary,
                  edits: this.filterValidEdits(heuristicImplementation.edits, plan.plan, workItem)
                };
              }
            }
            implementation.edits = this.filterValidEdits(implementation.edits, plan.plan, workItem);
            if (implementation.edits.length === 0) {
              return { summary: `No file changes were applied for ${workItem.title}.` };
            }

            const applied = await this.applyStructuredEdits(task.id, index, implementation.edits);
            for (const file of applied) appliedFiles.add(file);
            return {
              summary: `${implementation.summary || `Applied ${workItem.title}.`} Files changed: ${applied.join(", ") || "none"}.`
            };
          });
        }

        const implementationSummary = appliedFiles.size > 0
          ? `Implementation finished across ${plan.plan.workItems.length} work item(s). Files changed: ${[...appliedFiles].join(", ")}.`
          : `Implementation finished across ${plan.plan.workItems.length} work item(s) with no file changes.`;
        this.appendLog(task.id, implementationSummary);
        task.steps.push({
          id: `step_${randomUUID()}`,
          title: "Implement requested changes",
          status: "completed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          summary: implementationSummary
        });
      } else {
        this.appendLog(task.id, "Skipping implementation step for verification-only prompt.");
      }

      await this.runDeferredStep(task, "Verify build and quality scripts", async () => {
        await this.prepareGeneratedWorkspace(task.id, plan.plan);
        const packageJson = await this.tryReadPackageJson(plan.plan.workingDirectory);
        const verificationArtifactType = task.artifactType ?? this.classifyArtifactType(task.prompt, plan.plan, undefined, packageJson ?? inspection.packageManifest);
        task.artifactType = verificationArtifactType;
        const scripts = this.resolveVerificationScripts(packageJson, plan.plan);
        const buildLabel = this.getBuildVerificationLabel(verificationArtifactType);
        const lintLabel = this.getLintVerificationLabel(verificationArtifactType);
        const testLabel = this.getTestVerificationLabel(verificationArtifactType);
        const runtimeLabel = this.getLaunchVerificationLabel(verificationArtifactType);
        const runtimeScript = this.resolveRuntimeVerificationScript(scripts);
        const outputArtifactType = task.artifactType ?? this.classifyArtifactType(task.prompt, plan.plan, task.verification, packageJson ?? inspection.packageManifest);
        task.output = this.buildTaskOutput(outputArtifactType, {
          packageName: packageJson?.name,
          scripts,
          workingDirectory: plan.plan.workingDirectory,
          verification: task.verification
        }, task.prompt);
        let checks: AgentVerificationCheck[] = [];

        await this.pruneUnexpectedGeneratedAppFiles(task.id, plan.plan);

        const entryCheck = await this.verifyExpectedEntryFiles(plan.plan, verificationArtifactType);
        checks.push(entryCheck);
        this.updateTaskVerification(task, checks);

        if (scripts.build) {
          let build = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.plan.workingDirectory));
          if (!build.ok) {
            build = await this.tryAutoFixBuild(task, build, plan.plan);
          }
          checks.push({
            id: "build",
            label: buildLabel,
            status: build.ok ? "passed" : "failed",
            details: build.ok ? `${buildLabel} completed successfully.` : `${buildLabel} still failing after fix attempts.`
          });
          this.updateTaskVerification(task, checks);
          if (!build.ok) {
            throw new Error(this.buildCommandFailureMessage(buildLabel, build, "still failing after agent fix attempts"));
          }
        } else {
          this.appendLog(task.id, `No ${buildLabel.toLowerCase()} script found.`);
          checks.push({
            id: "build",
            label: buildLabel,
            status: "skipped",
            details: "No build script found."
          });
          this.updateTaskVerification(task, checks);
        }

        if (scripts.lint) {
          let lint = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.plan.workingDirectory));
          if (!lint.ok) {
            lint = await this.tryAutoFixLint(task, lint, plan.plan);
          }
          checks.push({
            id: "lint",
            label: lintLabel,
            status: lint.ok ? "passed" : "failed",
            details: lint.ok ? `${lintLabel} completed successfully.` : `${lintLabel} still failing after fix attempts.`
          });
          this.updateTaskVerification(task, checks);
          if (!lint.ok) {
            throw new Error(this.buildCommandFailureMessage(lintLabel, lint, "still failing after agent fix attempts"));
          }
        } else {
          this.appendLog(task.id, `No ${lintLabel.toLowerCase()} script found.`);
          checks.push({
            id: "lint",
            label: lintLabel,
            status: "skipped",
            details: "No lint script found."
          });
          this.updateTaskVerification(task, checks);
        }

        if (scripts.test && !/no test specified/i.test(scripts.test)) {
          const test = await this.executeCommand(task.id, this.buildNpmScriptRequest("test", 120_000, plan.plan.workingDirectory));
          checks.push({
            id: "test",
            label: testLabel,
            status: test.ok ? "passed" : "failed",
            details: test.ok ? `${testLabel} completed successfully.` : `${testLabel} reported failures.`
          });
          this.updateTaskVerification(task, checks);
          if (!test.ok) {
            throw new Error(this.buildCommandFailureMessage(testLabel, test, "reported failures"));
          }
        } else {
          this.appendLog(task.id, `No meaningful ${testLabel.toLowerCase()} script found.`);
          checks.push({
            id: "test",
            label: testLabel,
            status: "skipped",
            details: "No meaningful test script found."
          });
        }
        this.updateTaskVerification(task, checks);

        if (runtimeScript && this.shouldVerifyLaunch(verificationArtifactType)) {
          let launch = await this.executeArtifactRuntimeVerification(task.id, runtimeScript, verificationArtifactType, plan.plan, scripts);
          if (!launch.ok) {
            launch = await this.tryAutoFixLaunch(task, launch, plan.plan, verificationArtifactType, runtimeLabel);
          }
          checks.push({
            id: "launch",
            label: runtimeLabel,
            status: launch.ok ? "passed" : "failed",
            details: this.buildRuntimeVerificationDetails(verificationArtifactType, runtimeScript, launch.ok)
          });
          this.updateTaskVerification(task, checks);
          if (!launch.ok) {
            throw new Error(this.buildCommandFailureMessage(runtimeLabel, launch, "still failing after agent fix attempts"));
          }
          if (this.shouldVerifyServedWebPage(verificationArtifactType)) {
            const servedPage = await this.verifyServedWebPage(plan.plan, scripts, runtimeScript, launch);
            checks.push(servedPage);
            this.updateTaskVerification(task, checks);
            if (servedPage.status === "failed") {
              throw new Error(servedPage.details || "Served web page verification failed.");
            }
          }
          if (this.shouldVerifyRuntimeDepth(verificationArtifactType)) {
            const runtimeDepth = await this.verifyRuntimeDepth(plan.plan, verificationArtifactType, scripts, runtimeScript, launch);
            if (runtimeDepth) {
              checks.push(runtimeDepth);
              this.updateTaskVerification(task, checks);
              if (runtimeDepth.status === "failed") {
                throw new Error(runtimeDepth.details || "Runtime depth verification failed.");
              }
            }
          }
        } else if (this.shouldVerifyLaunch(verificationArtifactType)) {
          this.appendLog(task.id, `No ${runtimeLabel.toLowerCase()} script found.`);
          checks.push({
            id: "launch",
            label: runtimeLabel,
            status: "skipped",
            details: "No start or dev script found."
          });
          this.updateTaskVerification(task, checks);
        } else {
          this.appendLog(task.id, `${runtimeLabel} verification not required for ${verificationArtifactType}.`);
        }

        if (this.shouldVerifyWindowsPackaging(verificationArtifactType, plan.plan)) {
          const packaging = await this.verifyWindowsDesktopPackaging(task.id, plan.plan, scripts);
          checks.push(packaging);
          this.updateTaskVerification(task, checks);
          if (packaging.status === "failed") {
            throw new Error(packaging.details || "Windows packaging verification failed.");
          }
        }

        if (this.shouldVerifyPreviewHealth(verificationArtifactType)) {
          let previewHealth = await this.verifyPreviewHealth(plan.plan, scripts);
          if (previewHealth.status === "failed") {
            const repaired = await this.tryAutoFixPreviewHealth(task, previewHealth, plan.plan, scripts, buildLabel);
            if (repaired) {
              previewHealth = await this.verifyPreviewHealth(plan.plan, scripts);
            }
          }
          checks.push(previewHealth);
          this.updateTaskVerification(task, checks);
          if (previewHealth.status === "failed") {
            throw new Error(previewHealth.details || "Preview health verification failed.");
          }
        }

        if (this.shouldVerifyUiSmoke(verificationArtifactType)) {
          let uiSmoke = await this.verifyBasicUiSmoke(plan.plan);
          if (uiSmoke.status === "failed") {
            const repaired = await this.tryAutoFixUiSmoke(task, uiSmoke, plan.plan, scripts, buildLabel, lintLabel, testLabel);
            if (repaired) {
              uiSmoke = await this.verifyBasicUiSmoke(plan.plan);
            }
          }
          checks.push(uiSmoke);
          this.updateTaskVerification(task, checks);
          if (uiSmoke.status === "failed") {
            throw new Error(uiSmoke.details || "Basic UI smoke verification failed.");
          }
        }

        const specChecks = await this.verifyExecutionSpec(plan.plan, verificationArtifactType, scripts);
        checks.push(...specChecks);
        this.updateTaskVerification(task, checks);
        if (specChecks.some((check) => check.status === "failed")) {
          const repaired = await this.tryAutoFixExecutionSpec(task, plan.plan, verificationArtifactType, specChecks);
          if (repaired) {
            await this.rerunVerificationAfterContentRepair(task, plan.plan, checks, verificationArtifactType, {
              buildLabel,
              lintLabel,
              testLabel,
              runtimeLabel
            });
            checks = checks.filter((check) => check.id !== "spec-deliverables" && check.id !== "spec-hygiene");
            const rerunSpecChecks = await this.verifyExecutionSpec(plan.plan, verificationArtifactType, this.resolveVerificationScripts(await this.tryReadPackageJson(plan.plan.workingDirectory), plan.plan));
            checks.push(...rerunSpecChecks);
            this.updateTaskVerification(task, checks);
            if (rerunSpecChecks.some((check) => check.status === "failed")) {
              throw new Error(rerunSpecChecks.find((check) => check.status === "failed")?.details || "Execution spec verification failed after repair.");
            }
          } else {
            throw new Error(specChecks.find((check) => check.status === "failed")?.details || "Execution spec verification failed.");
          }
        }

        let requirementChecks = await this.verifyPromptRequirements(plan.plan);
        checks.push(...requirementChecks);
        this.updateTaskVerification(task, checks);
        if (requirementChecks.some((check) => check.status === "failed")) {
          const repaired = await this.tryAutoFixPromptRequirements(task, plan.plan, requirementChecks);
          if (repaired) {
            await this.rerunVerificationAfterContentRepair(task, plan.plan, checks, verificationArtifactType, {
              buildLabel,
              lintLabel,
              testLabel,
              runtimeLabel
            });

            requirementChecks = await this.verifyPromptRequirements(plan.plan);
            checks = checks.filter((check) => !check.id.startsWith("req-") && check.id !== "requirements");
            checks.push(...requirementChecks);
            this.updateTaskVerification(task, checks);
          }
        }
        if (requirementChecks.some((check) => check.status === "failed")) {
          throw new Error(this.buildRequirementFailureMessage(requirementChecks));
        }

        const finalEntryCheck = await this.verifyExpectedEntryFiles(plan.plan, verificationArtifactType);
        this.upsertVerificationCheck(checks, finalEntryCheck);
        this.updateTaskVerification(task, checks);
        if (finalEntryCheck.status === "failed") {
          throw new Error(finalEntryCheck.details || "Required entry files are still missing.");
        }

        const finalPackageJson = await this.tryReadPackageJson(plan.plan.workingDirectory);
        const finalScripts = this.resolveVerificationScripts(finalPackageJson, plan.plan);
        const report = this.buildVerificationReport(checks, verificationArtifactType);
        task.verification = report;
        task.artifactType = this.classifyArtifactType(task.prompt, plan.plan, report, finalPackageJson ?? packageJson ?? inspection.packageManifest);
        task.output = this.buildTaskOutput(task.artifactType, {
          packageName: finalPackageJson?.name ?? packageJson?.name,
          scripts: finalScripts,
          workingDirectory: plan.plan.workingDirectory,
          verification: report
        }, task.prompt);
        return { summary: `Verification finished: ${report.summary}.` };
      });

      await this.runStep(task, "Approve generated output", async () => {
        const finalPackageJson = await this.tryReadPackageJson(plan.plan.workingDirectory);
        const finalScripts = this.resolveVerificationScripts(finalPackageJson, plan.plan);
        const approval = this.buildTaskApproval(plan.plan, task, finalPackageJson, finalScripts);
        if (!approval.ok) {
          throw new Error(approval.summary);
        }
        return { summary: approval.summary };
      });

      this.ensureVerificationRequired(task);
      task.status = "completed";
      task.summary = this.buildCompletedTaskSummary(task);
      task.updatedAt = new Date().toISOString();
      try {
        const completionSnapshot = await this.createSnapshot(`After agent task: ${task.prompt.slice(0, 80)}`, task.id, {
          kind: "after-task",
          targetPathHint: task.targetPath ?? this.extractGeneratedAppDirectoryFromPrompt(task.prompt) ?? undefined
        });
        task.completionSnapshotId = completionSnapshot.id;
        this.appendLog(task.id, `Completion snapshot created: ${completionSnapshot.id}`);
      } catch (snapshotError) {
        const message = snapshotError instanceof Error ? snapshotError.message : "Unknown snapshot error";
        this.appendLog(task.id, `Completion snapshot failed: ${message}`);
      }
      this.appendLog(task.id, "Agent task completed.");
      this.persistTaskState(task.id);
    } catch (err) {
      task.status = task.status === "stopped" ? "stopped" : "failed";
      task.summary = err instanceof Error ? err.message : "Agent task failed.";
      task.updatedAt = new Date().toISOString();
      if (task.status === "failed") {
        this.markTaskFailureStage(task, this.getMostRelevantFailureStage(task), task.summary);
      }
      this.appendLog(task.id, `Agent task failed: ${task.summary}`);
      this.persistTaskState(task.id);
    } finally {
      if (this.activeTaskId === task.id) {
        this.activeTaskId = null;
      }
      this.activeProcesses.delete(task.id);
      this.taskModelFailureCounts.delete(task.id);
      this.taskModelBlacklist.delete(task.id);
      this.taskStageRoutes.delete(task.id);
      this.persistTaskState(task.id);
    }
  }

  private updateTaskVerification(task: AgentTask, checks: AgentVerificationCheck[]): void {
    task.verification = this.buildVerificationReport(checks, task.artifactType);
    this.updateTaskVerificationTelemetry(task, task.verification);
    task.updatedAt = new Date().toISOString();
    this.persistTaskState(task.id);
  }

  private ensureVerificationRequired(task: AgentTask): void {
    const verificationStep = task.steps.find((step) => step.title === "Verify build and quality scripts");
    if (!verificationStep || verificationStep.status !== "completed") {
      throw new Error("Verification is required before completing an agent task.");
    }
    const approvalStep = task.steps.find((step) => step.title === "Approve generated output");
    if (!approvalStep || approvalStep.status !== "completed") {
      throw new Error("Approval is required before completing an agent task.");
    }

    const verification = task.verification;
    if (!verification || verification.checks.length === 0) {
      throw new Error("Verification report is required before completing an agent task.");
    }
  }

  private buildTaskApproval(
    plan: TaskExecutionPlan,
    task: AgentTask,
    packageManifest: PackageManifest | null,
    scripts: PackageScripts
  ): { ok: boolean; summary: string } {
    const verification = task.verification;
    if (!verification || verification.checks.length === 0) {
      return {
        ok: false,
        summary: "Approval failed: verification report is missing."
      };
    }

    const failedChecks = verification.checks.filter((check) => check.status === "failed");
    if (failedChecks.length > 0) {
      return {
        ok: false,
        summary: `Approval failed: verification still has failing checks (${failedChecks.map((check) => check.label).join(", ")}).`
      };
    }

    const requiresDesktopApproval = plan.spec.starterProfile === "electron-desktop" || task.artifactType === "desktop-app";
    if (!requiresDesktopApproval) {
      return {
        ok: true,
        summary: "Approval passed: verification checks are clear."
      };
    }

    const findings: string[] = [];
    if (task.artifactType !== "desktop-app") {
      findings.push("artifact was not classified as a desktop app");
    }
    if (!packageManifest) {
      findings.push("package.json is missing");
    }
    if (packageManifest && (!packageManifest.main || !packageManifest.main.trim())) {
      findings.push("package.json is missing the Electron main entry");
    }
    if (!scripts.build) {
      findings.push("build script is missing");
    }
    if (!scripts.start && !scripts.dev) {
      findings.push("runtime launch script is missing");
    }
    if (typeof scripts["package:win"] !== "string" || !scripts["package:win"]?.trim()) {
      findings.push("package:win script is missing");
    }

    if (findings.length > 0) {
      return {
        ok: false,
        summary: `Approval failed for desktop output: ${findings.join("; ")}.`
      };
    }

    return {
      ok: true,
      summary: "Approval passed for desktop output: verification cleared and packaging signals are present."
    };
  }

  private buildCompletedTaskSummary(task: AgentTask): string {
    const artifact = this.describeArtifactType(task.artifactType);
    const target = (task.targetPath ?? "").trim();
    const normalizedTarget = target === "." ? "" : target;
    const targetPart = normalizedTarget ? ` for ${normalizedTarget}` : "";
    const verificationPart = task.verification?.summary ? ` Verification: ${task.verification.summary}.` : "";
    return `Completed ${artifact}${targetPart}.${verificationPart}`.trim();
  }

  private buildRequirementFailureMessage(checks: AgentVerificationCheck[]): string {
    const failed = checks.filter((check) => check.status === "failed");
    if (failed.length === 0) return "Prompt requirements not met.";
    return `Prompt requirements not met: ${failed.map((check) => check.label).join(", ")}.`;
  }

  private buildCommandFailureMessage(label: string, result: TerminalCommandResult, qualifier = "failed"): string {
    const reason = result.timedOut
      ? `timed out after ${Math.max(1, Math.round(result.durationMs / 1000))}s`
      : typeof result.code === "number"
        ? `exited with code ${result.code}`
        : result.signal
          ? `ended with signal ${result.signal}`
          : "did not complete successfully";
    const detail = this.extractTerminalFailureDetail(result);
    return `${label} ${qualifier}. ${reason}.${detail ? ` Last output: ${detail}` : ""}`.trim();
  }

  private extractTerminalFailureDetail(result: TerminalCommandResult): string {
    const lines = (result.combinedOutput || `${result.stderr}\n${result.stdout}`)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return "";
    const candidate = lines[lines.length - 1].replace(/\s+/g, " ");
    return candidate.length > 220 ? `${candidate.slice(0, 217)}...` : candidate;
  }

  private describeArtifactType(artifactType: AgentArtifactType | undefined): string {
    switch (artifactType) {
      case "web-app":
        return "web app";
      case "api-service":
        return "API service";
      case "script-tool":
        return "script tool";
      case "library":
        return "library";
      case "desktop-app":
        return "desktop app";
      case "workspace-change":
        return "workspace change";
      default:
        return "task";
    }
  }

  private upsertVerificationCheck(checks: AgentVerificationCheck[], next: AgentVerificationCheck): void {
    const index = checks.findIndex((check) => check.id === next.id);
    if (index >= 0) {
      checks[index] = next;
      return;
    }
    checks.push(next);
  }

  private async tryAutoFixPromptRequirements(
    task: AgentTask,
    plan: TaskExecutionPlan,
    requirementChecks: AgentVerificationCheck[]
  ): Promise<boolean> {
    const failedRequirements = requirementChecks.filter((check) => check.status === "failed");
    if (failedRequirements.length === 0) return false;

    const repair = await this.runStep(task, "Fix prompt requirement mismatch", async () => {
      const heuristic = await this.tryHeuristicImplementation(
        task.id,
        `${task.prompt}\nRepair these missing requirements: ${failedRequirements.map((check) => check.label).join(", ")}.`,
        plan
      );
      if (!heuristic || heuristic.edits.length === 0) {
        throw new Error("No requirement-repair edits were produced.");
      }

      const scopedEdits = this.filterValidEdits(heuristic.edits, plan);
      if (scopedEdits.length === 0) {
        throw new Error("Requirement-repair edits were outside the planned scope.");
      }

      const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 2, scopedEdits);
      await this.prepareGeneratedWorkspace(task.id, plan);
      return {
        summary: `${heuristic.summary} Repaired prompt mismatches. Files changed: ${applied.join(", ") || "none"}.`
      };
    });

    return repair.summary.length > 0;
  }

  private ensureNoRunningTask(): void {
    if (!this.activeTaskId) return;
    const active = this.tasks.get(this.activeTaskId);
    if (active && active.status === "running") {
      throw new Error("Another agent task is already running.");
    }
  }

  private buildRestartPrompt(task: AgentTask, mode: AgentTaskRestartMode): string {
    const originalPrompt = (task.prompt ?? "").trim();
    const targetPath = (task.targetPath ?? "").trim();
    const targetHint = targetPath
      ? `\n\nUse the same target path: ${targetPath}.`
      : "";

    if (mode === "retry") {
      return `${originalPrompt}${targetHint}`.trim();
    }

    if (mode === "retry-clean") {
      return `${originalPrompt}${targetHint}\n\nThis is a clean retry from the Before snapshot. Rebuild the task from a fresh pre-task workspace state.`.trim();
    }

    const failureSummary = (task.summary ?? "").trim();
    const verificationFailures = (task.verification?.checks ?? [])
      .filter((check) => check.status === "failed")
      .slice(0, 4)
      .map((check) => `${check.label}: ${check.details}`);

    return [
      targetPath
        ? `Continue fixing the existing task output in ${targetPath}.`
        : "Continue fixing the existing task output.",
      `Original request:\n${originalPrompt}`,
      failureSummary ? `Previous task result:\n${failureSummary}` : "",
      verificationFailures.length > 0
        ? `Verification failures to fix:\n- ${verificationFailures.join("\n- ")}`
        : "",
      "Reuse and repair the current files when possible. Keep scope focused on fixing the failed output and getting verification to pass."
    ].filter(Boolean).join("\n\n");
  }

  private describeRestartMode(mode: AgentTaskRestartMode): string {
    if (mode === "retry-clean") return "Retry Clean";
    if (mode === "continue-fix") return "Continue Fix";
    return "Retry";
  }

  private async tryAutoFixExecutionSpec(
    task: AgentTask,
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType,
    specChecks: AgentVerificationCheck[]
  ): Promise<boolean> {
    const failedChecks = specChecks.filter((check) => check.status === "failed");
    if (failedChecks.length === 0) return false;

    const failureOutput = failedChecks.map((check) => `${check.label}: ${check.details}`).join("\n");
    const commandResult: TerminalCommandResult = {
      ok: false,
      code: 1,
      signal: null,
      stdout: "",
      stderr: failureOutput,
      combinedOutput: failureOutput,
      durationMs: 0,
      timedOut: false,
      commandLine: "execution-spec-verification",
      cwd: this.resolveWorkspacePath(plan.workingDirectory)
    };

    const repair = await this.runStep(task, "Fix execution brief mismatch", async () => {
      const contextFiles = await this.collectFixContextFiles(failureOutput, plan);
      if (contextFiles.length === 0) {
        throw new Error("Execution brief repair could not continue because no useful context files were found.");
      }

      let fix: FixResponse;
      try {
        fix = await this.requestStructuredFix(
          task.id,
          `${task.prompt}\nRepair the execution brief mismatches for ${artifactType}. Required deliverables: ${plan.spec.deliverables.join(", ")}. Acceptance criteria: ${plan.spec.acceptanceCriteria.join(" ")}. Quality gates: ${plan.spec.qualityGates.join(" ")}`,
          commandResult,
          contextFiles,
          1,
          "Execution spec",
          plan
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown execution brief repair failure.";
        this.appendLog(task.id, `Model-based execution brief repair failed: ${message}`);
        const heuristic = await this.tryHeuristicImplementation(
          task.id,
          `${task.prompt}\nRepair these execution brief failures: ${failedChecks.map((check) => check.details).join(" ")}`,
          plan
        );
        if (!heuristic || heuristic.edits.length === 0) {
          throw error;
        }
        fix = {
          summary: heuristic.summary,
          edits: heuristic.edits
        };
      }

      const scopedEdits = this.filterValidEdits(fix.edits, plan);
      if (scopedEdits.length === 0) {
        throw new Error("Execution brief repair produced no scoped edits.");
      }

      const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 4, scopedEdits);
      await this.prepareGeneratedWorkspace(task.id, plan);
      return {
        summary: `${fix.summary || "Applied execution brief fixes."} Files changed: ${applied.join(", ") || "none"}.`
      };
    });

    return repair.summary.length > 0;
  }

  private async tryAutoFixUiSmoke(
    task: AgentTask,
    check: AgentVerificationCheck,
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    buildLabel: string,
    lintLabel: string,
    testLabel: string
  ): Promise<boolean> {
    if (!plan.builderMode || (plan.workspaceKind !== "static" && plan.workspaceKind !== "react")) {
      return false;
    }

    const fix = await this.tryHeuristicImplementation(
      task.id,
      `${task.prompt}\nRepair the failed UI smoke checks: ${check.details}`,
      plan
    );
    if (!fix || fix.edits.length === 0) return false;

    this.appendLog(task.id, `Using heuristic UI smoke fallback: ${fix.summary}`);
    const scopedEdits = this.filterValidEdits(fix.edits, plan);
    if (scopedEdits.length === 0) return false;

    const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 3, scopedEdits);
    if (applied.length === 0) return false;
    await this.prepareGeneratedWorkspace(task.id, plan);

    if (scripts.build) {
      const build = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
      if (!build.ok) {
        throw new Error(this.buildCommandFailureMessage(buildLabel, build, "failed after UI smoke repair"));
      }
    }

    if (scripts.lint) {
      const lint = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.workingDirectory));
      if (!lint.ok) {
        throw new Error(this.buildCommandFailureMessage(lintLabel, lint, "failed after UI smoke repair"));
      }
    }

    if (scripts.test && !/no test specified/i.test(scripts.test)) {
      const test = await this.executeCommand(task.id, this.buildNpmScriptRequest("test", 120_000, plan.workingDirectory));
      if (!test.ok) {
        throw new Error(this.buildCommandFailureMessage(testLabel, test, "failed after UI smoke repair"));
      }
    }

    return true;
  }

  private async ensureExplicitGeneratedAppWorkspace(task: AgentTask, targetDirectory: string): Promise<void> {
    const targetPath = this.resolveWorkspacePath(targetDirectory);
    const exists = await this.pathExists(targetPath);
    const normalizedPrompt = (task.prompt ?? "").trim().toLowerCase();

    if (exists) {
      await this.ensureStaticWorkspaceScripts(targetDirectory);
      return;
    }

    if (this.isVerificationOnlyPrompt(task.prompt) && !this.looksLikeNewProjectPrompt(normalizedPrompt)) {
      throw new Error(`Target app does not exist yet: ${targetDirectory}`);
    }

    const bootstrapPlan = this.buildBootstrapPlanForTarget(task.prompt, targetDirectory);
    this.appendLog(task.id, `Bootstrapping explicit generated app target: ${targetDirectory}`);
    const result = await this.executeBootstrapPlan(task.id, bootstrapPlan);
    this.appendLog(task.id, result.summary);
  }

  private async ensureExplicitTaskWorkspace(task: AgentTask, targetDirectory: string): Promise<void> {
    const targetPath = this.resolveWorkspacePath(targetDirectory);
    const normalizedPrompt = (task.prompt ?? "").trim().toLowerCase();

    try {
      const info = await stat(targetPath);
      if (!info.isDirectory()) {
        throw new Error(`Target folder is not a directory: ${targetDirectory}`);
      }
      return;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code && code !== "ENOENT") {
        throw error;
      }
    }

    if (this.isVerificationOnlyPrompt(task.prompt) && !this.looksLikeNewProjectPrompt(normalizedPrompt)) {
      throw new Error(`Target folder does not exist yet: ${targetDirectory}`);
    }

    if (this.looksLikeNewProjectPrompt(normalizedPrompt)) {
      this.appendLog(task.id, `Bootstrapping explicit target path: ${targetDirectory}`);
      const bootstrapPlan = this.buildBootstrapPlanForTarget(task.prompt, targetDirectory);
      const result = await this.executeBootstrapPlan(task.id, bootstrapPlan);
      this.appendLog(task.id, result.summary);
      return;
    }

    await mkdir(targetPath, { recursive: true });
    this.appendLog(task.id, `Created target folder: ${targetDirectory}`);
  }

  private buildVerificationReport(checks: AgentVerificationCheck[], artifactType?: AgentArtifactType): AgentVerificationReport {
    const passed = checks.filter((check) => check.status === "passed").length;
    const failed = checks.filter((check) => check.status === "failed").length;
    const skipped = checks.filter((check) => check.status === "skipped").length;
    const summary = this.buildVerificationSummary(checks, artifactType, passed, failed, skipped);
    const previewReady = artifactType === "web-app" && checks.some((check) => check.id === "preview-health" && check.status === "passed");
    return {
      summary,
      checks: checks.map((check) => ({ ...check })),
      previewReady
    };
  }

  private buildVerificationSummary(
    checks: AgentVerificationCheck[],
    artifactType: AgentArtifactType | undefined,
    passed: number,
    failed: number,
    skipped: number
  ): string {
    if (failed === 0) {
      const passedLabels = checks
        .filter((check) => check.status === "passed" && !check.id.startsWith("req-") && check.id !== "requirements")
        .map((check) => check.label);
      const runtimeLabel = this.getLaunchVerificationLabel(artifactType ?? "unknown");
      switch (artifactType) {
        case "web-app":
          if (
            passedLabels.includes("Web build")
            && passedLabels.includes(runtimeLabel)
            && passedLabels.includes("Preview health")
            && passedLabels.includes("UI smoke")
          ) {
            return "Web build, launch, preview, and smoke passed.";
          }
          if (passedLabels.includes("Web build") && passedLabels.includes(runtimeLabel) && passedLabels.includes("Preview health")) {
            return "Web build, launch, and preview passed.";
          }
          break;
        case "api-service":
          if (passedLabels.includes("Service build") && passedLabels.includes(runtimeLabel)) {
            return "Service build and boot passed.";
          }
          break;
        case "script-tool":
          if (passedLabels.includes("Tool build") && passedLabels.includes(runtimeLabel)) {
            return "Tool build and run passed.";
          }
          break;
        case "library":
          if (passedLabels.includes("Package build") && passedLabels.includes("Package tests")) {
            return "Package build and tests passed.";
          }
          if (passedLabels.includes("Package build")) {
            return "Package build passed.";
          }
          break;
        case "desktop-app":
          if (
            passedLabels.includes("App build")
            && passedLabels.includes(runtimeLabel)
            && passedLabels.includes("Windows packaging")
          ) {
            return "App build, start, and Windows packaging passed.";
          }
          if (passedLabels.includes("App build") && passedLabels.includes(runtimeLabel)) {
            return "App build and start passed.";
          }
          break;
        default:
          break;
      }
    }

    const summaryParts = [
      `${passed} passed`,
      ...(failed > 0 ? [`${failed} failed`] : []),
      ...(skipped > 0 ? [`${skipped} skipped`] : [])
    ];
    return summaryParts.join(", ");
  }

  private classifyArtifactType(
    prompt: string,
    plan?: TaskExecutionPlan | null,
    verification?: AgentVerificationReport | null,
    packageManifest?: PackageManifest | null
  ): AgentArtifactType {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (verification?.previewReady) return "web-app";
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    const packageArtifact = this.inferArtifactTypeFromPackage(packageManifest);
    if (promptArtifact === "desktop-app") return promptArtifact;
    if (promptArtifact === "api-service" || promptArtifact === "script-tool" || promptArtifact === "library") return promptArtifact;
    if (promptArtifact === "web-app") return promptArtifact;
    if (packageArtifact === "desktop-app") return packageArtifact;
    if (packageArtifact) return packageArtifact;
    if (plan?.workspaceKind === "static" || plan?.workspaceKind === "react") return "web-app";
    if (promptArtifact) return promptArtifact;
    if (normalized.length > 0) return "workspace-change";
    return "unknown";
  }

  private inferArtifactTypeFromPrompt(normalizedPrompt: string): AgentArtifactType | null {
    if (!normalizedPrompt) return null;
    if (this.looksLikeDesktopPrompt(normalizedPrompt)) return "desktop-app";
    if (this.looksLikeCrudAppPrompt(normalizedPrompt)) return "web-app";
    if (/\b(api|backend|server|endpoint|rest|graphql|express|fastify|hono|nest)\b/.test(normalizedPrompt)) return "api-service";
    if (/\b(library|sdk|package|module)\b/.test(normalizedPrompt)) return "library";
    if (/\b(script|cli|command line|automation|bot|cron|utility|tool)\b/.test(normalizedPrompt)) return "script-tool";
    if (/\b(web app|website|landing page|pricing page|frontend|dashboard|marketing site|marketing page|react app|vite app|kanban|task board|microsite|showcase page)\b/.test(normalizedPrompt)) return "web-app";
    return null;
  }

  private looksLikeDesktopPrompt(normalizedPrompt: string): boolean {
    if (/\b(electron|tauri)\b/.test(normalizedPrompt)) return true;
    if (/\b(desktop app|desktop shell|desktop tool|desktop workspace|desktop client|desktop manager|snippet desk)\b/.test(normalizedPrompt)) {
      return true;
    }
    if (/\b(standalone app|standalone application|standalone desktop app|native app|native desktop app)\b/.test(normalizedPrompt)) {
      return true;
    }
    if (
      /\bwindows\b/.test(normalizedPrompt)
      && /\b(app|application|software|program|tool|utility|client|workspace|calculator|editor|manager|tracker)\b/.test(normalizedPrompt)
      && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)
    ) {
      return true;
    }
    if (
      /\b(pc|computer|laptop)\b/.test(normalizedPrompt)
      && /\b(app|application|software|program|tool|utility|calculator|editor|manager|tracker)\b/.test(normalizedPrompt)
      && /\b(standalone|desktop|native|installed|installable)\b/.test(normalizedPrompt)
      && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)
    ) {
      return true;
    }
    if (/\bdesktop\b/.test(normalizedPrompt) && !/\b(website|site|landing page|pricing page|homepage|microsite|marketing page|showcase page|web app|frontend|browser)\b/.test(normalizedPrompt)) {
      return true;
    }
    return false;
  }

  private looksLikeCrudAppPrompt(normalizedPrompt: string): boolean {
    if (!normalizedPrompt) return false;
    const mentionsDashboard = /\b(dashboard|admin panel|analytics|wallboard|kpi|incident|escalation)\b/.test(normalizedPrompt);
    const reminderOnlyFollowups = /\bfollow-?up reminders?\b/.test(normalizedPrompt)
      && !/\b(add|create|edit|update|saved list|tracker|status|next contact date|owner assignment|mark (?:one )?(?:paid|packed|shipped|approved|resolved))\b/.test(normalizedPrompt);
    if (mentionsDashboard && reminderOnlyFollowups) {
      return false;
    }

    const directCrudSignals = [
      "crud",
      "inventory app",
      "contacts app",
      "admin tool",
      "admin console",
      "record manager",
      "tracker",
      "follow-up tracker",
      "follow up tracker",
      "customer follow-up",
      "customer follow up",
      "lead tracker",
      "outreach",
      "field service",
      "service visits",
      "visit tracker",
      "dispatch follow",
      "supplier dispute",
      "supplier disputes"
    ];
    if (directCrudSignals.some((term) => normalizedPrompt.includes(term))) {
      return true;
    }

    const mentionsCrudWorkspace = /\b(internal tool|admin console|admin workspace|operations workspace)\b/.test(normalizedPrompt);
    const mentionsStatefulCollection = /\b(table|issue list|main issue list|status|due date|due dates|resolution status|mark (?:one )?(?:paid|packed|shipped|approved|resolved)|vendor|vendors|payment status|visit|visits|technician|saved list|saved dispute list|owner assignment|assignment|dispute|disputes|team)\b/.test(normalizedPrompt);
    return mentionsCrudWorkspace && mentionsStatefulCollection;
  }

  private inferArtifactTypeFromPackage(packageManifest?: PackageManifest | null): AgentArtifactType | null {
    if (!packageManifest) return null;

    const dependencyNames = [
      ...Object.keys(packageManifest.dependencies ?? {}),
      ...Object.keys(packageManifest.devDependencies ?? {})
    ].map((name) => name.toLowerCase());
    const depSet = new Set(dependencyNames);
    const nameAndDescription = [
      packageManifest.name ?? "",
      packageManifest.description ?? "",
      packageManifest.main ?? ""
    ].join(" ").toLowerCase();
    const scriptValues = Object.values(packageManifest.scripts ?? {}).join(" ").toLowerCase();
    const hasDependency = (pattern: RegExp): boolean => dependencyNames.some((name) => pattern.test(name));

    if (
      depSet.has("electron") ||
      depSet.has("electron-builder") ||
      depSet.has("tauri") ||
      hasDependency(/^@tauri-apps\//) ||
      /\b(electron|desktop|tauri)\b/.test(nameAndDescription) ||
      /launch-electron|electron-builder/.test(scriptValues)
    ) {
      return "desktop-app";
    }

    if (
      hasDependency(/^(express|fastify|hono|koa|ws)$/) ||
      hasDependency(/^@nestjs\//) ||
      hasDependency(/graphql|apollo-server|trpc|serverless|supabase/) ||
      /\b(api|backend|server|service)\b/.test(nameAndDescription)
    ) {
      return "api-service";
    }

    if (packageManifest.bin || /\b(cli|command line|automation tool)\b/.test(nameAndDescription)) {
      return "script-tool";
    }

    if (!packageManifest.scripts?.start && !packageManifest.scripts?.dev && (packageManifest.scripts?.build || packageManifest.scripts?.test)) {
      return "library";
    }

    if (
      hasDependency(/^(react|react-dom|next|vite|vue|svelte|astro)$/) ||
      hasDependency(/^@vitejs\//)
    ) {
      return "web-app";
    }

    return null;
  }

  private buildTaskOutput(
    artifactType: AgentArtifactType,
    context?: {
      packageName?: string;
      scripts?: PackageScripts;
      workingDirectory?: string;
      verification?: AgentVerificationReport;
    },
    prompt = ""
  ): AgentTaskOutput {
    const workingDirectory = (context?.workingDirectory ?? "").trim() || undefined;
    const packageName = (context?.packageName ?? "").trim() || undefined;
    const runCommand = this.resolvePreferredRunCommand(artifactType, context?.scripts);
    const packageCommand = context?.scripts?.["package:win"] ? "npm run package:win" : undefined;
    const hasPreview = artifactType === "web-app" && Boolean(context?.verification?.previewReady);

    switch (artifactType) {
      case "web-app":
        return {
          primaryAction: hasPreview ? "preview-web" : (runCommand ? "run-web-app" : "open-folder"),
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: hasPreview ? "Primary action: preview the web app." : "Primary action: run the web app locally.",
          usageDetail: hasPreview
            ? "Use Preview to inspect the running app. Open the app folder when you need the project files."
            : runCommand
              ? `Run ${runCommand} from ${workingDirectory ?? "the project folder"} to start the app locally.`
              : "Open the app folder to inspect or run the project locally."
        };
      case "api-service":
        return {
          primaryAction: runCommand ? "run-service" : "open-folder",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: run the service locally.",
          usageDetail: runCommand
            ? `Run ${runCommand} from ${workingDirectory ?? "the service folder"} to boot the API.`
            : "Open the service folder to inspect the codebase and start the API manually."
        };
      case "script-tool":
        return {
          primaryAction: runCommand ? "run-tool" : "open-folder",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: run the tool locally.",
          usageDetail: runCommand
            ? `Run ${runCommand} from ${workingDirectory ?? "the tool folder"} to execute the tool.`
            : "Open the tool folder to inspect and run the script or CLI manually."
        };
      case "library":
        return {
          primaryAction: "inspect-package",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: inspect the package source.",
          usageDetail: runCommand
            ? `Open the package folder to inspect the source. ${runCommand} is the most relevant package command right now.`
            : "Open the package folder to inspect the source, tests, and build configuration."
        };
      case "desktop-app":
        return {
          primaryAction: runCommand ? "run-desktop" : "open-folder",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: run the desktop project locally.",
          usageDetail: runCommand
            ? `Run ${runCommand} from ${workingDirectory ?? "the app folder"} to start the desktop app.${packageCommand ? ` Use ${packageCommand} there to build a Windows installer.` : ""}`
            : "Open the app folder to inspect and run the desktop project manually."
        };
      case "workspace-change":
        return {
          primaryAction: "inspect-workspace",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: inspect the changed workspace files.",
          usageDetail: workingDirectory
            ? `Open ${workingDirectory} to review the files changed by this task.`
            : "Open the relevant workspace folder to review the files changed by this task."
        };
      default:
        return {
          primaryAction: runCommand ? "run-command" : "open-folder",
          packageName,
          workingDirectory,
          runCommand,
          usageTitle: "Primary action: inspect the task output.",
          usageDetail: prompt.trim()
            ? "Open the target folder to inspect what the task produced."
            : "Inspect the output files and run the project locally if needed."
        };
    }
  }

  private resolvePreferredRunCommand(artifactType: AgentArtifactType, scripts?: PackageScripts): string | undefined {
    const commandFor = (scriptName: keyof PackageScripts): string => scriptName === "start"
      ? "npm start"
      : `npm run ${scriptName}`;

    if (!scripts) return undefined;

    if (artifactType === "web-app") {
      if (scripts.dev) return commandFor("dev");
      if (scripts.start) return commandFor("start");
      return undefined;
    }

    if (artifactType === "api-service" || artifactType === "desktop-app" || artifactType === "script-tool") {
      if (scripts.start) return commandFor("start");
      if (scripts.dev) return commandFor("dev");
      return undefined;
    }

    if (artifactType === "library") {
      if (scripts.build) return commandFor("build");
      if (scripts.test) return commandFor("test");
      return undefined;
    }

    if (scripts.start) return commandFor("start");
    if (scripts.dev) return commandFor("dev");
    if (scripts.build) return commandFor("build");
    return undefined;
  }

  private async verifyExpectedEntryFiles(plan: TaskExecutionPlan, artifactType: AgentArtifactType): Promise<AgentVerificationCheck> {
    const requiredPaths = new Set<string>();
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    const entryLabel = this.getEntryVerificationLabel(artifactType);

    if (artifactType === "workspace-change" || artifactType === "unknown") {
      if (await this.pathExists(this.resolveWorkspacePath(workingDirectory))) {
        return {
          id: "entry-files",
          label: entryLabel,
          status: "passed",
          details: `Working directory is present: ${workingDirectory}.`
        };
      }
      return {
        id: "entry-files",
        label: entryLabel,
        status: "failed",
        details: `Working directory is missing: ${workingDirectory}.`
      };
    }

    if (plan.workspaceKind === "static") {
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "index.html"));
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "styles.css"));
    } else if (plan.workspaceKind === "react") {
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "package.json"));
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "index.html"));
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "src/main.tsx"));
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "src/App.tsx"));
      if (artifactType === "desktop-app") {
        requiredPaths.add(this.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
        requiredPaths.add(this.joinWorkspacePath(workingDirectory, "electron/main.mjs"));
      }
    } else {
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "package.json"));
    }

    const conflictingPaths = await this.collectConflictingWorkspaceFiles(plan);

    const present: string[] = [];
    const missing: string[] = [];
    for (const path of requiredPaths) {
      try {
        await stat(this.resolveWorkspacePath(path));
        present.push(path);
      } catch {
        missing.push(path);
      }
    }

    for (const requestedPath of plan.requestedPaths ?? []) {
      if (!this.isPathInsideWorkingDirectory(requestedPath, workingDirectory)) continue;
      if (await this.isRequestedEntryPathSatisfied(requestedPath, plan, artifactType)) {
        present.push(requestedPath);
      } else {
        missing.push(requestedPath);
      }
    }

    if (conflictingPaths.length > 0) {
      return {
        id: "entry-files",
        label: entryLabel,
        status: "failed",
        details: `Conflicting ${plan.workspaceKind} scaffold files found: ${conflictingPaths.join(", ")}.`
      };
    }

    if (missing.length > 0) {
      return {
        id: "entry-files",
        label: entryLabel,
        status: "failed",
        details: `Missing required files: ${missing.join(", ")}.`
      };
    }

    return {
      id: "entry-files",
      label: entryLabel,
      status: "passed",
      details: `Found required files: ${present.join(", ")}.`
    };
  }

  private async isRequestedEntryPathSatisfied(
    requestedPath: string,
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType
  ): Promise<boolean> {
    try {
      await stat(this.resolveWorkspacePath(requestedPath));
      return true;
    } catch {
      // allow compatible modern desktop scaffold aliases below
    }

    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    for (const aliasGroup of this.getRequestedEntryPathAliasGroups(requestedPath, workingDirectory, plan, artifactType)) {
      if (await this.allFilesExist(aliasGroup)) {
        return true;
      }
    }

    return false;
  }

  private getRequestedEntryPathAliasGroups(
    requestedPath: string,
    workingDirectory: string,
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType
  ): string[][] {
    if (artifactType !== "desktop-app" || plan.workspaceKind !== "react") {
      return [];
    }

    const fileName = requestedPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
    switch (fileName) {
      case "main.js":
        return [
          [this.joinWorkspacePath(workingDirectory, "electron/main.mjs")],
          [this.joinWorkspacePath(workingDirectory, "electron/main.js")],
          [this.joinWorkspacePath(workingDirectory, "electron/main.ts")]
        ];
      case "preload.js":
        return [
          [this.joinWorkspacePath(workingDirectory, "electron/preload.mjs")],
          [this.joinWorkspacePath(workingDirectory, "electron/preload.js")],
          // Modern Electron React shells can wire preload behavior directly from the main process.
          [this.joinWorkspacePath(workingDirectory, "electron/main.mjs")]
        ];
      case "renderer.js":
        return [
          [this.joinWorkspacePath(workingDirectory, "src/main.tsx")],
          [this.joinWorkspacePath(workingDirectory, "src/main.jsx")],
          [this.joinWorkspacePath(workingDirectory, "src/App.tsx"), this.joinWorkspacePath(workingDirectory, "index.html")],
          [this.joinWorkspacePath(workingDirectory, "src/App.jsx"), this.joinWorkspacePath(workingDirectory, "index.html")]
        ];
      case "styles.css":
        return [
          [this.joinWorkspacePath(workingDirectory, "src/index.css")],
          [this.joinWorkspacePath(workingDirectory, "src/App.css")],
          [this.joinWorkspacePath(workingDirectory, "src/styles.css")],
          [this.joinWorkspacePath(workingDirectory, "dist/assets")]
        ];
      default:
        return [];
    }
  }

  private getEntryVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "web-app":
        return "Entry files";
      case "api-service":
        return "Service entry";
      case "script-tool":
        return "Tool entry";
      case "library":
        return "Package entry";
      case "desktop-app":
        return "App entry";
      case "workspace-change":
        return "Workspace target";
      default:
        return "Entry files";
    }
  }

  private getBuildVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "web-app":
        return "Web build";
      case "api-service":
        return "Service build";
      case "script-tool":
        return "Tool build";
      case "library":
        return "Package build";
      case "desktop-app":
        return "App build";
      default:
        return "Build";
    }
  }

  private getLintVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "api-service":
        return "Service lint";
      case "script-tool":
        return "Tool lint";
      case "library":
        return "Package lint";
      case "desktop-app":
        return "App lint";
      case "web-app":
        return "Web lint";
      default:
        return "Lint";
    }
  }

  private getTestVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "api-service":
        return "Service tests";
      case "script-tool":
        return "Tool tests";
      case "library":
        return "Package tests";
      case "desktop-app":
        return "App tests";
      case "web-app":
        return "Web tests";
      default:
        return "Tests";
    }
  }

  private getLaunchVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "web-app":
        return "Launch";
      case "api-service":
        return "Service boot";
      case "script-tool":
        return "Run";
      case "desktop-app":
        return "App start";
      default:
        return "Launch";
    }
  }

  private getPackagingVerificationLabel(artifactType: AgentArtifactType): string {
    switch (artifactType) {
      case "desktop-app":
        return "Windows packaging";
      default:
        return "Packaging";
    }
  }

  private resolveRuntimeVerificationScript(scripts: PackageScripts): "start" | "dev" | null {
    if (scripts.start) return "start";
    if (scripts.dev) return "dev";
    return null;
  }

  private shouldVerifyWindowsPackaging(artifactType: AgentArtifactType, plan: TaskExecutionPlan): boolean {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    return artifactType === "desktop-app"
      && process.platform === "win32"
      && workingDirectory.startsWith("generated-apps/");
  }

  private async findGeneratedDesktopInstaller(workingDirectory: string): Promise<string | null> {
    const baseDirectory = this.resolveWorkspacePath(workingDirectory);
    const preferredOutputDirectories = ["release", "release-package"];
    try {
      const rootEntries = await readdir(baseDirectory, { withFileTypes: true });
      const dynamicFallbackDirectories = rootEntries
        .filter((entry) => entry.isDirectory() && /^release-package-/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));
      for (const outputDirectory of [...preferredOutputDirectories, ...dynamicFallbackDirectories]) {
        const releaseDirectory = this.resolveWorkspacePath(this.joinWorkspacePath(workingDirectory, outputDirectory));
        try {
          const entries = await readdir(releaseDirectory, { withFileTypes: true });
          const installer = entries.find((entry) => entry.isFile() && /\.exe$/i.test(entry.name));
          if (installer) {
            return this.joinWorkspacePath(workingDirectory, outputDirectory, installer.name);
          }
        } catch {
          // continue searching fallback output directories
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private parseCommandArgs(command: string): string[] {
    const tokens = command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? [];
    return tokens.map((token) => {
      const trimmed = token.trim();
      if (
        (trimmed.startsWith("\"") && trimmed.endsWith("\""))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  private buildElectronBuilderPackagingRequest(
    script: string,
    workingDirectory: string,
    outputDirectory: string
  ): TerminalCommandRequest | null {
    const normalizedScript = (script ?? "").trim();
    if (!/^electron-builder(?:\s|$)/i.test(normalizedScript)) return null;

    const scriptArgs = this.parseCommandArgs(normalizedScript.replace(/^electron-builder(?:\s+)?/i, ""))
      .filter((arg) => !/^--config\.directories\.output=/i.test(arg));

    return {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["exec", "electron-builder", "--", ...scriptArgs, `--config.directories.output=${outputDirectory}`],
      cwd: workingDirectory,
      timeoutMs: 300_000
    };
  }

  private async verifyWindowsDesktopPackaging(
    taskId: string,
    plan: TaskExecutionPlan,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck> {
    const scriptName = "package:win";
    const label = this.getPackagingVerificationLabel("desktop-app");
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!scripts[scriptName]) {
      return {
        id: "packaging",
        label,
        status: "failed",
        details: `Missing required ${scriptName} script for Windows packaging.`
      };
    }

    const maxPackagingAttempts = 3;
    await this.cleanupGeneratedDesktopPackagingState(taskId, workingDirectory);

    let packaging: TerminalCommandResult | null = null;

    for (let attempt = 1; attempt <= maxPackagingAttempts; attempt += 1) {
      packaging = await this.executeCommand(taskId, this.buildNpmScriptRequest(scriptName, 300_000, workingDirectory));
      if (packaging.ok) {
        break;
      }
      if (!this.isTransientGeneratedPackagingLockFailure(packaging) || attempt === maxPackagingAttempts) {
        break;
      }

      this.appendLog(
        taskId,
        `Windows packaging hit a transient workspace lock in ${workingDirectory}; retry ${attempt + 1}/${maxPackagingAttempts} after cleanup.`
      );
      await this.cleanupGeneratedDesktopPackagingState(taskId, workingDirectory);
      await delay(400 * attempt);
    }
    if (!packaging?.ok && packaging && this.isTransientGeneratedPackagingLockFailure(packaging)) {
      const isolatedOutputDirectory = `release-package-${Date.now().toString(36)}`;
      const isolatedPackagingRequest = this.buildElectronBuilderPackagingRequest(scripts[scriptName], workingDirectory, isolatedOutputDirectory);
      if (isolatedPackagingRequest) {
        this.appendLog(
          taskId,
          `Windows packaging is retrying in isolated output ${isolatedOutputDirectory} for ${workingDirectory} after repeated file-lock failures.`
        );
        await this.cleanupGeneratedDesktopPackagingState(taskId, workingDirectory);
        packaging = await this.executeCommand(taskId, isolatedPackagingRequest);
      }
    }
    if (!packaging?.ok) {
      return {
        id: "packaging",
        label,
        status: "failed",
        details: packaging && this.isTransientGeneratedPackagingLockFailure(packaging)
          ? "Windows installer packaging failed after retrying through release cleanup for a transient file lock."
          : "Windows installer packaging failed."
      };
    }

    const installerPath = await this.findGeneratedDesktopInstaller(workingDirectory);
    if (!installerPath) {
      return {
        id: "packaging",
        label,
        status: "failed",
        details: "Windows packaging finished without producing an .exe installer."
      };
    }

    return {
      id: "packaging",
      label,
      status: "passed",
      details: `Built Windows installer: ${installerPath}.`
    };
  }

  private async generatedNodePackageNeedsInstall(workingDirectory: string): Promise<boolean> {
    const normalizedWorkingDirectory = (workingDirectory ?? ".").replace(/\\/g, "/");
    if (!normalizedWorkingDirectory.startsWith("generated-apps/")) return false;

    const packageJson = await this.tryReadPackageJson(normalizedWorkingDirectory);
    const dependencies = Object.keys(packageJson?.dependencies ?? {});
    const devDependencies = Object.keys(packageJson?.devDependencies ?? {});
    const requiredPackages = [...new Set([...dependencies, ...devDependencies])];
    if (requiredPackages.length === 0) return false;

    for (const packageName of requiredPackages) {
      const packagePath = this.joinWorkspacePath(
        normalizedWorkingDirectory,
        "node_modules",
        ...packageName.split("/"),
        "package.json"
      );
      try {
        await stat(this.resolveWorkspacePath(packagePath));
      } catch {
        return true;
      }
    }

    return false;
  }

  private async ensureGeneratedNodePackageDependencies(taskId: string, plan: TaskExecutionPlan): Promise<void> {
    const normalizedWorkingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!normalizedWorkingDirectory.startsWith("generated-apps/")) return;
    if (plan.workspaceKind === "static") return;
    const artifactType = this.tasks.get(taskId)?.artifactType;
    const dependencyInstallTimeoutMs = artifactType === "desktop-app" ? 300_000 : 180_000;

    if (!(await this.generatedNodePackageNeedsInstall(normalizedWorkingDirectory))) return;

    await this.cleanupGeneratedWorkspaceInstallLocks(taskId, normalizedWorkingDirectory, artifactType);
    this.appendLog(taskId, `Installing generated node-package dependencies in ${normalizedWorkingDirectory}.`);
    let install = await this.executeCommand(taskId, {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["install"],
      cwd: normalizedWorkingDirectory,
      timeoutMs: dependencyInstallTimeoutMs
    });
    if (!install.ok && this.isTransientGeneratedInstallLockFailure(install)) {
      this.appendLog(taskId, `Dependency install hit a transient workspace lock in ${normalizedWorkingDirectory}; retrying after cleanup.`);
      await this.cleanupGeneratedWorkspaceInstallLocks(taskId, normalizedWorkingDirectory, artifactType);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      install = await this.executeCommand(taskId, {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["install"],
        cwd: normalizedWorkingDirectory,
        timeoutMs: dependencyInstallTimeoutMs
      });
    }
    if (!install.ok) {
      if (this.isRecoverableGeneratedInstallFailure(install)) {
        const recovered = await this.tryAutoFixGeneratedNodePackageInstall(taskId, plan, install);
        if (recovered) return;
      }
      throw new Error(this.buildCommandFailureMessage("Dependency install", install, "failed while running npm install"));
    }
  }

  private isRecoverableGeneratedInstallFailure(result: TerminalCommandResult): boolean {
    const normalized = `${result.combinedOutput || ""}\n${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
    return [
      "no matching version found",
      "error code etarget",
      "error notarget",
      "unable to resolve dependency tree",
      "could not resolve dependency",
      "conflicting peer dependency",
      "404 not found - get https://registry.npmjs.org/"
    ].some((term) => normalized.includes(term));
  }

  private isTransientGeneratedInstallLockFailure(result: TerminalCommandResult): boolean {
    const normalized = `${result.combinedOutput || ""}\n${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
    return normalized.includes("error code ebusy")
      || normalized.includes("resource busy or locked")
      || normalized.includes("default_app.asar")
      || normalized.includes("errno -4082");
  }

  private isTransientGeneratedPackagingLockFailure(result: TerminalCommandResult): boolean {
    const normalized = `${result.combinedOutput || ""}\n${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
    return normalized.includes("error code ebusy")
      || normalized.includes("error code eperm")
      || normalized.includes("errno -4082")
      || normalized.includes("resource busy or locked")
      || normalized.includes("the process cannot access the file because it is being used by another process")
      || normalized.includes("win-unpacked\\resources\\app.asar")
      || normalized.includes("win-unpacked/resources/app.asar")
      || normalized.includes("operation not permitted, unlink")
      || normalized.includes("cannot unlink")
      || normalized.includes("err_electron_builder_cannot_execute");
  }

  private async cleanupGeneratedDesktopPackagingState(taskId: string, workingDirectory: string): Promise<void> {
    await this.cleanupGeneratedWorkspaceInstallLocks(taskId, workingDirectory, "desktop-app");

    const cleanupPaths = [
      this.joinWorkspacePath(workingDirectory, "release/win-unpacked/resources/app.asar"),
      this.joinWorkspacePath(workingDirectory, "release/win-unpacked/resources/app.asar.unpacked"),
      this.joinWorkspacePath(workingDirectory, "release/win-unpacked/resources"),
      this.joinWorkspacePath(workingDirectory, "release/win-unpacked"),
      this.joinWorkspacePath(workingDirectory, "release"),
      this.joinWorkspacePath(workingDirectory, "release-package/win-unpacked/resources/app.asar"),
      this.joinWorkspacePath(workingDirectory, "release-package/win-unpacked/resources/app.asar.unpacked"),
      this.joinWorkspacePath(workingDirectory, "release-package/win-unpacked/resources"),
      this.joinWorkspacePath(workingDirectory, "release-package/win-unpacked"),
      this.joinWorkspacePath(workingDirectory, "release-package"),
      this.joinWorkspacePath(workingDirectory, "release-stage/win-unpacked/resources/app.asar"),
      this.joinWorkspacePath(workingDirectory, "release-stage/win-unpacked/resources/app.asar.unpacked"),
      this.joinWorkspacePath(workingDirectory, "release-stage")
    ];

    for (const cleanupPath of cleanupPaths) {
      try {
        await this.withWorkspaceFsRetry(
          () => rm(this.resolveWorkspacePath(cleanupPath), { recursive: true, force: true }),
          5,
          200
        );
      } catch {
        this.appendLog(taskId, `Generated desktop packaging cleanup could not fully remove ${cleanupPath}.`);
      }
    }
  }

  private async cleanupGeneratedWorkspaceInstallLocks(
    taskId: string,
    workingDirectory: string,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    if (artifactType !== "desktop-app" || process.platform !== "win32") return;

    const absoluteWorkingDirectory = this.resolveWorkspacePath(workingDirectory).replace(/\//g, "\\");
    const escapedAbsoluteWorkingDirectory = absoluteWorkingDirectory.replace(/'/g, "''");
    const command = [
      `$workspace = '${escapedAbsoluteWorkingDirectory}'`,
      "$processes = Get-CimInstance Win32_Process | Where-Object {",
      "  $_.ProcessId -ne $PID -and (",
      "    (($_.CommandLine -as [string]) -like \"*$workspace*\") -or",
      "    (($_.ExecutablePath -as [string]) -like \"*$workspace*\")",
      "  )",
      "}",
      "foreach ($proc in $processes) {",
      "  try {",
      "    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop",
      "  } catch {",
      "  }",
      "}"
    ].join("\n");
    const encodedCommand = Buffer.from(command, "utf16le").toString("base64");

    const cleanup = await this.executeCommand(taskId, {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
      cwd: workingDirectory,
      timeoutMs: 15_000
    });
    if (!cleanup.ok) {
      this.appendLog(taskId, `Generated workspace lock cleanup finished with warnings for ${workingDirectory}.`);
    }
  }

  private async tryAutoFixGeneratedNodePackageInstall(
    taskId: string,
    plan: TaskExecutionPlan,
    installResult: TerminalCommandResult
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const dependencyInstallTimeoutMs = task.artifactType === "desktop-app" ? 300_000 : 180_000;

    const contextFiles = await this.collectFixContextFiles(installResult.combinedOutput, plan);
    let fix: FixResponse | null = null;
    let usedModelFix = false;

    if (contextFiles.length > 0) {
      this.appendLog(taskId, `Preparing ${contextFiles.length} context file(s) for dependency-install repair.`);
      try {
        fix = await this.requestStructuredFix(taskId, task.prompt, installResult, contextFiles, 1, "Dependency install", plan);
        usedModelFix = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown dependency-install repair failure.";
        this.appendLog(taskId, `Model-based dependency-install repair failed: ${message}`);
      }
    }

    const scopedFixEdits = fix ? this.filterValidEdits(fix.edits, plan) : [];
    if (!fix || scopedFixEdits.length === 0) {
      const heuristicFix = await this.tryHeuristicImplementation(taskId, task.prompt, plan);
      if (!heuristicFix || heuristicFix.edits.length === 0) {
        return false;
      }
      this.appendLog(taskId, `Using heuristic dependency-install recovery: ${heuristicFix.summary}`);
      fix = {
        summary: heuristicFix.summary,
        edits: this.filterValidEdits(heuristicFix.edits, plan)
      };
      if (fix.edits.length === 0) {
        return false;
      }
      usedModelFix = false;
    } else {
      fix.edits = scopedFixEdits;
    }

    const applied = await this.applyStructuredEdits(taskId, 1, fix.edits);
    this.appendLog(taskId, `${fix.summary || "Applied dependency-install recovery edits."} Files changed: ${applied.join(", ") || "none"}.`);

    const normalizedWorkingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!(await this.generatedNodePackageNeedsInstall(normalizedWorkingDirectory))) {
      return true;
    }

    const retryInstall = await this.executeCommand(taskId, {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["install"],
      cwd: normalizedWorkingDirectory,
      timeoutMs: dependencyInstallTimeoutMs
    });
    if (!retryInstall.ok) {
      if (usedModelFix) {
        this.recordFailedRepairVerification(taskId, "Dependency install", retryInstall.combinedOutput);
      }
      return false;
    }

    this.appendLog(taskId, "Dependency install succeeded after recovery edits.");
    return true;
  }

  private async prepareGeneratedWorkspace(taskId: string, plan: TaskExecutionPlan): Promise<void> {
    const artifactType = this.tasks.get(taskId)?.artifactType;
    await this.ensureGeneratedAppPackageJson(plan, artifactType);
    await this.ensureGeneratedReactProjectFiles(plan, artifactType);
    await this.ensureGeneratedProjectReadme(plan, artifactType);
    await this.ensureGeneratedNodePackageDependencies(taskId, plan);
  }

  private async ensureGeneratedProjectReadme(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;
    const spec = plan.spec ?? this.buildTaskExecutionSpec(
      "",
      workingDirectory,
      plan.workspaceKind ?? "generic",
      plan.builderMode ?? null,
      artifactType ?? null,
      plan.requestedPaths ?? []
    );
    if (!spec.expectsReadme) return;

    const readmePath = this.joinWorkspacePath(workingDirectory, "README.md");
    if (await this.pathExists(this.resolveWorkspacePath(readmePath))) {
      return;
    }

    await this.writeWorkspaceFile(readmePath, this.buildProjectReadme(
      this.toDisplayNameFromDirectory(workingDirectory),
      artifactType ?? null,
      spec,
      plan.workingDirectory
    ));
  }

  private async ensureBootstrapProjectReadme(plan: BootstrapPlan): Promise<void> {
    const readmePath = this.joinWorkspacePath(plan.targetDirectory, "README.md");
    if (await this.pathExists(this.resolveWorkspacePath(readmePath))) {
      return;
    }

    const spec = this.buildTaskExecutionSpec(
      `Create ${plan.projectName}`,
      plan.targetDirectory,
      plan.template === "static" ? "static" : (plan.template === "node-package" ? "generic" : "react"),
      null,
      plan.artifactType ?? null,
      []
    );
    await this.writeWorkspaceFile(
      readmePath,
      this.buildProjectReadme(this.toDisplayNameFromDirectory(plan.targetDirectory), plan.artifactType, {
        ...spec,
        starterProfile: plan.starterProfile
      }, plan.targetDirectory)
    );
  }

  private buildProjectReadme(
    projectName: string,
    artifactType: AgentArtifactType | null | undefined,
    spec: TaskExecutionSpec,
    workingDirectory: string
  ): string {
    const runLines: string[] = [];
    if (artifactType === "desktop-app") {
      runLines.push("- `npm install`");
      runLines.push("- `npm start`");
      runLines.push("- `npm run build`");
      runLines.push("- `npm run package:win`");
    } else if (artifactType === "api-service" || artifactType === "script-tool") {
      runLines.push("- `npm install`");
      runLines.push("- `npm start`");
      runLines.push("- `npm run build`");
    } else if (artifactType === "library") {
      runLines.push("- `npm install`");
      runLines.push("- `npm run build`");
    } else if (spec.starterProfile === "static-marketing") {
      runLines.push("- `npm run build`");
      runLines.push("- `npm start`");
    } else {
      runLines.push("- `npm install`");
      runLines.push("- `npm run dev`");
      runLines.push("- `npm run build`");
    }

    return [
      `# ${projectName}`,
      "",
      `Starter profile: ${this.describeStarterProfile(spec.starterProfile)}.`,
      `Target folder: \`${workingDirectory}\`.`,
      "",
      "## Deliverables",
      ...spec.deliverables.map((item) => `- ${item}`),
      "",
      "## Acceptance Criteria",
      ...spec.acceptanceCriteria.map((item) => `- ${item}`),
      "",
      "## Quality Gates",
      ...spec.qualityGates.map((item) => `- ${item}`),
      "",
      "## Run",
      ...runLines,
      ""
    ].join("\n");
  }

  private usesStartupVerification(artifactType: AgentArtifactType): boolean {
    return artifactType === "web-app" || artifactType === "api-service" || artifactType === "desktop-app";
  }

  private shouldVerifyLaunch(artifactType: AgentArtifactType): boolean {
    return artifactType !== "library" && artifactType !== "workspace-change";
  }

  private shouldVerifyPreviewHealth(artifactType: AgentArtifactType): boolean {
    return artifactType === "web-app";
  }

  private shouldVerifyUiSmoke(artifactType: AgentArtifactType): boolean {
    return artifactType === "web-app";
  }

  private shouldVerifyServedWebPage(artifactType: AgentArtifactType): boolean {
    return artifactType === "web-app";
  }

  private shouldVerifyRuntimeDepth(artifactType: AgentArtifactType): boolean {
    return artifactType === "api-service" || artifactType === "script-tool" || artifactType === "desktop-app";
  }

  private async executeArtifactRuntimeVerification(
    taskId: string,
    scriptName: "start" | "dev",
    artifactType: AgentArtifactType,
    plan: TaskExecutionPlan,
    scripts: PackageScripts
  ): Promise<TerminalCommandResult> {
    const cwd = plan.workingDirectory;
    if (artifactType === "script-tool") {
      const initialRequest = this.buildNpmScriptRequest(scriptName, 45_000, cwd);
      const initialResult = await this.executeCommand(taskId, initialRequest);
      if (initialResult.ok || !this.looksLikeCliUsageFailure(initialResult.combinedOutput || "")) {
        return initialResult;
      }

      const taskPrompt = this.tasks.get(taskId)?.prompt ?? "";
      const fixturePath = await this.ensureScriptToolVerificationFixture(cwd, `${taskPrompt}\n${initialResult.combinedOutput || ""}`);
      this.appendLog(taskId, `Retrying tool runtime verification with fixture input: ${fixturePath}`);
      return this.executeCommand(taskId, this.buildNpmScriptRequest(scriptName, 45_000, cwd, [fixturePath]));
    }

    const request = this.buildNpmScriptRequest(scriptName, 45_000, cwd);
    if (this.usesStartupVerification(artifactType)) {
      const startupProbe: StartupVerificationProbe | undefined = artifactType === "web-app"
        ? {
          label: "served-page",
          run: async (result: TerminalCommandResult) => this.probeServedWebPage(plan, scripts, scriptName, result)
        }
        : artifactType === "api-service"
          ? {
            label: "api-probe",
            run: async (result: TerminalCommandResult) => this.probeApiService(plan, scripts, scriptName, result)
          }
          : undefined;
      return this.executeStartupVerification(taskId, request, STARTUP_VERIFY_MS, startupProbe);
    }
    return this.executeCommand(taskId, request);
  }

  private buildRuntimeVerificationDetails(
    artifactType: AgentArtifactType,
    scriptName: "start" | "dev",
    ok: boolean
  ): string {
    if (this.usesStartupVerification(artifactType)) {
      return ok
        ? `${scriptName} responded during startup verification.`
        : `${scriptName} still failed during startup verification.`;
    }
    return ok
      ? `${scriptName} completed successfully during runtime verification.`
      : `${scriptName} failed during runtime verification.`;
  }

  private buildRuntimeVerificationAfterRepairDetails(
    artifactType: AgentArtifactType,
    scriptName: "start" | "dev"
  ): string {
    if (this.usesStartupVerification(artifactType)) {
      return `${scriptName} responded after requirement repair.`;
    }
    return `${scriptName} completed successfully after requirement repair.`;
  }

  private async rerunVerificationAfterContentRepair(
    task: AgentTask,
    plan: TaskExecutionPlan,
    checks: AgentVerificationCheck[],
    artifactType: AgentArtifactType,
    labels: {
      buildLabel: string;
      lintLabel: string;
      testLabel: string;
      runtimeLabel: string;
    }
  ): Promise<{ scripts: PackageScripts; runtimeScript: "start" | "dev" | null }> {
    const packageJson = await this.tryReadPackageJson(plan.workingDirectory);
    const scripts = this.resolveVerificationScripts(packageJson, plan);
    const runtimeScript = this.resolveRuntimeVerificationScript(scripts);

    if (scripts.build) {
      const build = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
      this.upsertVerificationCheck(checks, {
        id: "build",
        label: labels.buildLabel,
        status: build.ok ? "passed" : "failed",
        details: build.ok ? `${labels.buildLabel} completed successfully after repair.` : `${labels.buildLabel} failed after repair.`
      });
      if (!build.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(this.buildCommandFailureMessage(labels.buildLabel, build, "failed after repair"));
      }
    }

    if (scripts.lint) {
      const lint = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.workingDirectory));
      this.upsertVerificationCheck(checks, {
        id: "lint",
        label: labels.lintLabel,
        status: lint.ok ? "passed" : "failed",
        details: lint.ok ? `${labels.lintLabel} completed successfully after repair.` : `${labels.lintLabel} failed after repair.`
      });
      if (!lint.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(this.buildCommandFailureMessage(labels.lintLabel, lint, "failed after repair"));
      }
    }

    if (scripts.test && !/no test specified/i.test(scripts.test)) {
      const test = await this.executeCommand(task.id, this.buildNpmScriptRequest("test", 120_000, plan.workingDirectory));
      this.upsertVerificationCheck(checks, {
        id: "test",
        label: labels.testLabel,
        status: test.ok ? "passed" : "failed",
        details: test.ok ? `${labels.testLabel} completed successfully after repair.` : `${labels.testLabel} failed after repair.`
      });
      if (!test.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(this.buildCommandFailureMessage(labels.testLabel, test, "failed after repair"));
      }
    }

    if (runtimeScript && this.shouldVerifyLaunch(artifactType)) {
      const launch = await this.executeArtifactRuntimeVerification(task.id, runtimeScript, artifactType, plan, scripts);
      this.upsertVerificationCheck(checks, {
        id: "launch",
        label: labels.runtimeLabel,
        status: launch.ok ? "passed" : "failed",
        details: launch.ok
          ? this.buildRuntimeVerificationAfterRepairDetails(artifactType, runtimeScript)
          : `${labels.runtimeLabel} failed after repair.`
      });
      if (!launch.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(this.buildCommandFailureMessage(labels.runtimeLabel, launch, "failed after repair"));
      }
      if (this.shouldVerifyServedWebPage(artifactType)) {
        const servedPage = await this.verifyServedWebPage(plan, scripts, runtimeScript, launch);
        this.upsertVerificationCheck(checks, servedPage);
        if (servedPage.status === "failed") {
          this.updateTaskVerification(task, checks);
          throw new Error(servedPage.details || "Served web page failed after repair.");
        }
      }
      if (this.shouldVerifyRuntimeDepth(artifactType)) {
        const runtimeDepth = await this.verifyRuntimeDepth(plan, artifactType, scripts, runtimeScript, launch);
        if (runtimeDepth) {
          this.upsertVerificationCheck(checks, runtimeDepth);
          if (runtimeDepth.status === "failed") {
            this.updateTaskVerification(task, checks);
            throw new Error(runtimeDepth.details || "Runtime depth verification failed after repair.");
          }
        }
      }
    }

    if (this.shouldVerifyWindowsPackaging(artifactType, plan)) {
      const packaging = await this.verifyWindowsDesktopPackaging(task.id, plan, scripts);
      this.upsertVerificationCheck(checks, packaging);
      if (packaging.status === "failed") {
        this.updateTaskVerification(task, checks);
        throw new Error(packaging.details || "Windows packaging failed after repair.");
      }
    }

    if (this.shouldVerifyPreviewHealth(artifactType)) {
      let previewHealth = await this.verifyPreviewHealth(plan, scripts);
      if (previewHealth.status === "failed") {
        const repaired = await this.tryAutoFixPreviewHealth(task, previewHealth, plan, scripts, labels.buildLabel);
        if (repaired) {
          previewHealth = await this.verifyPreviewHealth(plan, scripts);
        }
      }
      this.upsertVerificationCheck(checks, previewHealth);
      if (previewHealth.status === "failed") {
        this.updateTaskVerification(task, checks);
        throw new Error(previewHealth.details || "Preview health failed after repair.");
      }
    }

    if (this.shouldVerifyUiSmoke(artifactType)) {
      let uiSmoke = await this.verifyBasicUiSmoke(plan);
      if (uiSmoke.status === "failed") {
        const repaired = await this.tryAutoFixUiSmoke(task, uiSmoke, plan, scripts, labels.buildLabel, labels.lintLabel, labels.testLabel);
        if (repaired) {
          uiSmoke = await this.verifyBasicUiSmoke(plan);
        }
      }
      this.upsertVerificationCheck(checks, uiSmoke);
      if (uiSmoke.status === "failed") {
        this.updateTaskVerification(task, checks);
        throw new Error(uiSmoke.details || "Basic UI smoke failed after repair.");
      }
    }

    this.updateTaskVerification(task, checks);
    return { scripts, runtimeScript };
  }

  private async verifyServedWebPage(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<AgentVerificationCheck> {
    const cachedProbe = this.extractServedPageProbeResult(launch.combinedOutput || "");
    if (cachedProbe) {
      return {
        id: "served-page",
        label: "Served page",
        status: cachedProbe.status,
        details: cachedProbe.details
      };
    }

    const probeResult = await this.probeServedWebPage(plan, scripts, runtimeScript, launch);
    return {
      id: "served-page",
      label: "Served page",
      status: probeResult.status,
      details: probeResult.details
    };
  }

  private async verifyRuntimeDepth(
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<AgentVerificationCheck | null> {
    switch (artifactType) {
      case "api-service":
        return this.verifyApiRuntimeDepth(launch);
      case "script-tool":
        return this.verifyCliRuntimeDepth(plan, launch);
      case "desktop-app":
        return this.verifyDesktopInteractionProbe(plan, scripts);
      default:
        return null;
    }
  }

  private verifyApiRuntimeDepth(launch: TerminalCommandResult): AgentVerificationCheck {
    const cachedProbe = this.extractApiProbeResult(launch.combinedOutput || "");
    if (!cachedProbe) {
      return {
        id: "api-probe",
        label: "API probe",
        status: "failed",
        details: "API runtime probe did not return a structured result during startup verification."
      };
    }

    return {
      id: "api-probe",
      label: "API probe",
      status: cachedProbe.status,
      details: cachedProbe.details
    };
  }

  private async verifyCliRuntimeDepth(
    plan: TaskExecutionPlan,
    launch: TerminalCommandResult
  ): Promise<AgentVerificationCheck> {
    const output = this.stripAnsiControlSequences(launch.combinedOutput || "").trim();
    if (!output) {
      return {
        id: "cli-probe",
        label: "CLI probe",
        status: "failed",
        details: "CLI runtime verification produced no output."
      };
    }

    if (this.looksLikeCliUsageFailure(output)) {
      return {
        id: "cli-probe",
        label: "CLI probe",
        status: "failed",
        details: "CLI runtime still returned usage guidance instead of completing a real probe run."
      };
    }

    const expectsJson = await this.cliProbeExpectsJson(plan);
    if (!expectsJson) {
      return {
        id: "cli-probe",
        label: "CLI probe",
        status: "passed",
        details: `CLI runtime produced ${output.length} characters of output during the verification run.`
      };
    }

    const parsed = this.parseJsonFromOutput(output);
    if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
      return {
        id: "cli-probe",
        label: "CLI probe",
        status: "failed",
        details: "CLI runtime did not emit parseable JSON output during the verification probe."
      };
    }

    return {
      id: "cli-probe",
      label: "CLI probe",
      status: "passed",
      details: "CLI runtime emitted parseable JSON output during the verification probe."
    };
  }

  private async verifyDesktopInteractionProbe(
    plan: TaskExecutionPlan,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck> {
    const previewRoot = await this.resolvePreviewRoot(plan, scripts);
    const indexPath = this.joinWorkspacePath(previewRoot, "index.html");
    if (!(await this.pathExists(this.resolveWorkspacePath(indexPath)))) {
      return {
        id: "desktop-interaction",
        label: "Desktop interaction",
        status: "failed",
        details: `Desktop preview entry is missing: ${indexPath}.`
      };
    }

    const previewUrl = pathToFileURL(this.resolveWorkspacePath(indexPath)).toString();
    const smoke = await this.runServedPageBrowserSmoke(previewUrl, plan);
    return {
      id: "desktop-interaction",
      label: "Desktop interaction",
      status: smoke.status,
      details: smoke.status === "passed"
        ? `Desktop preview interaction passed against ${indexPath}. ${smoke.details}`
        : smoke.status === "skipped"
          ? `Desktop preview interaction was skipped for ${indexPath}. ${smoke.details}`
          : `Desktop preview interaction failed for ${indexPath}. ${smoke.details}`
    };
  }

  private async probeApiService(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<StartupProbeResult> {
    const baseUrl = await this.resolveApiServiceBaseUrl(plan, scripts, runtimeScript, launch);
    if (!baseUrl) {
      return {
        status: "failed",
        details: "Could not determine a reachable API base URL from runtime output or generated source files."
      };
    }

    const routes = await this.collectApiProbeRoutes(plan);
    const healthUrl = new URL(routes.healthPath, baseUrl).toString();
    const health = await this.fetchJsonWithTimeout(healthUrl);
    if (!health.ok) {
      return {
        status: "failed",
        details: `Health probe failed at ${healthUrl}: ${health.error}`
      };
    }

    const healthPayload = health.payload;
    if (!healthPayload || typeof healthPayload !== "object" || Array.isArray(healthPayload)) {
      return {
        status: "failed",
        details: `Health probe at ${healthUrl} did not return a JSON object payload.`
      };
    }

    const statusValue = String((healthPayload as Record<string, unknown>).status ?? "").toLowerCase();
    if (statusValue && !["ok", "healthy", "up", "ready"].includes(statusValue)) {
      return {
        status: "failed",
        details: `Health probe at ${healthUrl} returned an unexpected status value: ${statusValue}.`
      };
    }

    if (!routes.collectionPath) {
      return {
        status: "passed",
        details: `Health endpoint responded with JSON from ${healthUrl}. No collection endpoint was inferred from the generated service sources.`
      };
    }

    const collectionUrl = new URL(routes.collectionPath, baseUrl).toString();
    const collection = await this.fetchJsonWithTimeout(collectionUrl);
    if (!collection.ok) {
      return {
        status: "failed",
        details: `Collection probe failed at ${collectionUrl}: ${collection.error}`
      };
    }

    if (!this.isApiCollectionPayload(collection.payload)) {
      return {
        status: "failed",
        details: `Collection probe at ${collectionUrl} did not return a recognizable JSON collection payload.`
      };
    }

    if (!routes.supportsCreate) {
      return {
        status: "passed",
        details: `Health and collection endpoints responded with JSON at ${healthUrl} and ${collectionUrl}.`
      };
    }

    const createPayload = this.buildApiProbeCreatePayload(routes.primaryField, plan.spec?.domainFocus ?? "generic");
    const create = await this.fetchJsonWithTimeout(collectionUrl, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(createPayload)
    });
    if (!create.ok) {
      return {
        status: "failed",
        details: `Create probe failed at ${collectionUrl}: ${create.error}`
      };
    }

    if (!create.payload || typeof create.payload !== "object" || Array.isArray(create.payload)) {
      return {
        status: "failed",
        details: `Create probe at ${collectionUrl} did not return a JSON object payload.`
      };
    }

    const createdRecord = create.payload as Record<string, unknown>;
    const createdPrimaryValue = String(createdRecord[routes.primaryField] ?? "").trim();
    if (!createdPrimaryValue) {
      return {
        status: "failed",
        details: `Create probe at ${collectionUrl} returned JSON but did not include the expected ${routes.primaryField} field.`
      };
    }

    return {
      status: "passed",
      details: `Health, collection, and create probes responded with JSON at ${healthUrl} and ${collectionUrl}.`
    };
  }

  private async probeServedWebPage(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<StartupProbeResult> {
    const url = this.resolveServedWebPageUrl(plan, scripts, runtimeScript, launch);
    if (!url) {
      return {
        status: "skipped",
        details: "Could not determine a reachable web URL from runtime verification output."
      };
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        response = await fetch(url, {
          headers: { Accept: "text/html" },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failed",
        details: `Could not fetch served page at ${url}: ${message}`
      };
    }

    const html = await response.text();
    const normalized = html.toLowerCase();
    const contentType = response.headers.get("content-type") ?? "";
    const failures: string[] = [];

    if (!response.ok) failures.push(`Served page returned HTTP ${response.status}.`);
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      failures.push(`Served page did not return HTML content-type (${contentType}).`);
    }
    if (!/<html/i.test(html)) failures.push("Served page response did not include an <html> root.");
    if (!/<body/i.test(html)) failures.push("Served page response did not include a <body> element.");
    if (plan.workspaceKind === "react" && !/(id=["']root["']|data-reactroot|<script[^>]+src=)/i.test(html)) {
      failures.push("Served React page did not expose a root container or bootstrap script.");
    }
    if (plan.workspaceKind === "static" && plan.builderMode !== null) {
      if (!/<h1|<h2|<h3/i.test(normalized)) failures.push("Served page did not include a visible heading.");
      if (!/<button|type="submit"|href="#/i.test(normalized)) failures.push("Served page did not include a primary action marker.");
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        details: `${failures.join(" ")} URL: ${url}`
      };
    }

    const browserSmoke = await this.runServedPageBrowserSmoke(url, plan);
    if (browserSmoke.status === "failed") {
      return {
        status: "failed",
        details: `${browserSmoke.details} URL: ${url}`
      };
    }
    if (browserSmoke.status === "skipped") {
      return {
        status: "passed",
        details: `Fetched live HTML successfully from ${url}. Browser smoke skipped: ${browserSmoke.details}`
      };
    }

    return {
      status: "passed",
      details: `Fetched live HTML and browser smoke successfully from ${url}.`
    };
  }

  private async runServedPageBrowserSmoke(
    url: string,
    plan: TaskExecutionPlan
  ): Promise<BrowserSmokeResult> {
    const electronBinary = this.resolveElectronBinary();
    if (!electronBinary) {
      return {
        status: "skipped",
        details: "Electron runtime was not available for browser smoke."
      };
    }

    const helperPath = join(this.workspaceRoot, "scripts", "browser-smoke.cjs");
    if (!existsSync(helperPath)) {
      return {
        status: "skipped",
        details: "Browser smoke helper script is missing."
      };
    }

    const promptRequirementArgs = [...new Set((plan.promptRequirements ?? []).map((requirement) => requirement.id.trim()).filter(Boolean))]
      .flatMap((requirement) => ["--prompt-requirement", requirement]);

    const result = await this.executeDetachedCommand("manual", {
      command: electronBinary,
      args: [
        helperPath,
        "--url",
        url,
        "--workspace-kind",
        plan.workspaceKind,
        "--builder-mode",
        plan.builderMode ?? "",
        ...promptRequirementArgs,
        "--timeout-ms",
        "15000"
      ],
      cwd: this.workspaceRoot,
      timeoutMs: 20_000
    }, false);

    const parsed = this.parseBrowserSmokeResult(result.combinedOutput || "");
    if (parsed) {
      if (parsed.status === "failed" && this.isBrowserSmokeInfrastructureFailure(parsed.details)) {
        return {
          status: "skipped",
          details: `Browser smoke helper was unavailable: ${parsed.details}`
        };
      }
      return parsed;
    }

    if (!result.ok) {
      return {
        status: "skipped",
        details: `Browser smoke command failed before producing a structured result: ${result.combinedOutput || result.stderr || result.stdout || "Unknown error."}`
      };
    }

    return {
      status: "skipped",
      details: "Browser smoke produced no structured result."
    };
  }

  private resolveServedWebPageUrl(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): string | null {
    const combinedOutput = this.stripAnsiControlSequences(launch.combinedOutput || "");
    const urlMatches = [...combinedOutput.matchAll(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s]*)?/gi)];
    if (urlMatches.length > 0) {
      return urlMatches[0]?.[0] ?? null;
    }

    const scriptValue = runtimeScript === "start" ? scripts.start : scripts.dev;
    if (plan.workspaceKind === "static" && /http\.server\s+4173/.test(scriptValue ?? "")) {
      return "http://127.0.0.1:4173/";
    }
    if (plan.workspaceKind === "react" && /\bvite\b/.test(scriptValue ?? "")) {
      return "http://127.0.0.1:5173/";
    }
    return null;
  }

  private stripAnsiControlSequences(value: string): string {
    return (value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  }

  private parseBrowserSmokeResult(output: string): BrowserSmokeResult | null {
    const normalizedOutput = this.stripAnsiControlSequences(output ?? "").trim();
    if (!normalizedOutput) return null;
    const lines = normalizedOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line?.startsWith("{")) continue;
      try {
        const parsed = JSON.parse(line) as { status?: string; details?: string };
        const status = parsed.status?.toLowerCase();
        if (status !== "passed" && status !== "failed" && status !== "skipped") {
          continue;
        }
        return {
          status,
          details: typeof parsed.details === "string" && parsed.details.trim()
            ? parsed.details.trim()
            : "Browser smoke returned no details."
        };
      } catch {
        // ignore malformed lines and keep scanning upward
      }
    }
    return null;
  }

  private isBrowserSmokeInfrastructureFailure(details: string): boolean {
    const normalized = (details ?? "").toLowerCase();
    return normalized.includes("whenready")
      || normalized.includes("cannot read properties of undefined")
      || normalized.includes("browser smoke command failed")
      || normalized.includes("unknown error");
  }

  private extractServedPageProbeResult(output: string): StartupProbeResult | null {
    const match = /\[served-page\]\s+(passed|failed|skipped)\s+\|\s+([^\n\r]+)/i.exec(output ?? "");
    if (!match) return null;
    const status = match[1]?.toLowerCase();
    if (status !== "passed" && status !== "failed" && status !== "skipped") {
      return null;
    }
    return {
      status,
      details: match[2]?.trim() ?? ""
    };
  }

  private extractApiProbeResult(output: string): StartupProbeResult | null {
    const match = /\[api-probe\]\s+(passed|failed|skipped)\s+\|\s+([^\n\r]+)/i.exec(output ?? "");
    if (!match) return null;
    const status = match[1]?.toLowerCase();
    if (status !== "passed" && status !== "failed" && status !== "skipped") {
      return null;
    }
    return {
      status,
      details: match[2]?.trim() ?? ""
    };
  }

  private resolveElectronBinary(): string | null {
    try {
      const electronBinary = require("electron");
      return typeof electronBinary === "string" && electronBinary.trim() ? electronBinary : null;
    } catch {
      return null;
    }
  }

  private looksLikeCliUsageFailure(output: string): boolean {
    const normalized = (output ?? "").toLowerCase();
    if (!normalized) return false;
    return /usage:|missing required|requires? an argument|expects? .*file|provide .*file|no input file|markdown-file/.test(normalized);
  }

  private async ensureScriptToolVerificationFixture(cwd: string, hint = ""): Promise<string> {
    const normalizedHint = (hint ?? "").toLowerCase();
    const fixtureName = normalizedHint.includes("json")
      ? ".cipher-tool-smoke.json"
      : normalizedHint.includes("csv")
        ? ".cipher-tool-smoke.csv"
        : ".cipher-tool-smoke.md";
    const fixturePath = this.joinWorkspacePath(cwd, fixtureName);
    const fixtureContent = fixtureName.endsWith(".json")
      ? `${JSON.stringify({
        name: "Cipher Workspace Fixture",
        status: "ok",
        owner: "agent-smoke",
        checks: [
          { id: "summary", passed: true },
          { id: "structure", passed: true }
        ]
      }, null, 2)}\n`
      : fixtureName.endsWith(".csv")
        ? [
          "name,status,count",
          "alpha,ok,3",
          "beta,warning,1",
          "gamma,ok,5"
        ].join("\n") + "\n"
        : [
          "# Launch Notes",
          "",
          "## Summary",
          "Cipher Workspace generated this verification fixture.",
          "",
          "## Next Steps",
          "- Confirm the tool can read a markdown file.",
          "- Confirm it prints a compact summary."
        ].join("\n") + "\n";
    await this.writeWorkspaceFile(fixturePath, fixtureContent);
    return fixtureName;
  }

  private async cliProbeExpectsJson(plan: TaskExecutionPlan): Promise<boolean> {
    const promptTerms = plan.promptTerms.join(" ").toLowerCase();
    if (
      /\b(json output|output json|emit json|return json|returns json|print json|prints json|json report|json summary)\b/.test(promptTerms)
    ) {
      return true;
    }
    const source = await this.safeReadFirstContextFile([
      this.joinWorkspacePath(plan.workingDirectory, "src/index.js"),
      this.joinWorkspacePath(plan.workingDirectory, "src/index.mjs"),
      this.joinWorkspacePath(plan.workingDirectory, "bin/cli.mjs")
    ]);
    const normalized = (source ?? "").toLowerCase();
    return normalized.includes("json.stringify");
  }

  private parseJsonFromOutput(output: string): unknown {
    const trimmed = (output ?? "").trim();
    if (!trimmed) return null;
    const candidates = [trimmed];
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      candidates.push(trimmed.slice(firstObject, lastObject + 1));
    }
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray !== -1 && lastArray > firstArray) {
      candidates.push(trimmed.slice(firstArray, lastArray + 1));
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // keep trying looser slices
      }
    }
    return null;
  }

  private buildFetchHeaders(init?: RequestInit): HeadersInit {
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    return headers;
  }

  private async fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<{
    ok: boolean;
    error?: string;
    payload?: unknown;
  }> {
    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        response = await fetch(url, {
          headers: this.buildFetchHeaders(init),
          method: init?.method,
          body: init?.body,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`
      };
    }

    try {
      return {
        ok: true,
        payload: await response.json()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Invalid JSON response: ${message}` };
    }
  }

  private isApiCollectionPayload(payload: unknown): boolean {
    if (Array.isArray(payload)) {
      return true;
    }
    if (!payload || typeof payload !== "object") {
      return false;
    }
    return Object.values(payload as Record<string, unknown>).some((value) => Array.isArray(value));
  }

  private async resolveApiServiceBaseUrl(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<string | null> {
    const explicit = this.resolveServedWebPageUrl(plan, scripts, runtimeScript, launch);
    if (explicit) {
      try {
        const parsed = new URL(explicit);
        return `${parsed.origin}/`;
      } catch {
        // fall through to source inference
      }
    }

    const port = await this.inferApiServicePort(plan);
    return port ? `http://127.0.0.1:${port}/` : null;
  }

  private async inferApiServicePort(plan: TaskExecutionPlan): Promise<number | null> {
    const source = await this.safeReadFirstContextFile([
      this.joinWorkspacePath(plan.workingDirectory, "src/server.js"),
      this.joinWorkspacePath(plan.workingDirectory, "src/index.js")
    ]);
    if (!source) return 3000;

    const envPortMatch = /process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/i.exec(source);
    if (envPortMatch) {
      const port = Number.parseInt(envPortMatch[1] ?? "", 10);
      if (Number.isFinite(port) && port > 0) return port;
    }

    const listenMatch = /listen\(\s*(\d{2,5})\s*(?:[,)]|\))/i.exec(source);
    if (listenMatch) {
      const port = Number.parseInt(listenMatch[1] ?? "", 10);
      if (Number.isFinite(port) && port > 0) return port;
    }

    return 3000;
  }

  private async collectApiProbeRoutes(plan: TaskExecutionPlan): Promise<{
    healthPath: string;
    collectionPath: string | null;
    supportsCreate: boolean;
    primaryField: string;
  }> {
    const source = await this.safeReadFirstContextFile([
      this.joinWorkspacePath(plan.workingDirectory, "src/server.js"),
      this.joinWorkspacePath(plan.workingDirectory, "src/index.js")
    ]);
    const normalized = source ?? "";
    const getRoutes = [...normalized.matchAll(/req\.method\s*===\s*['"]GET['"]\s*&&\s*(?:url\.pathname|pathname)\s*===\s*['"]([^'"]+)['"]/gi)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value) && value.startsWith("/"));
    const postRoutes = [...normalized.matchAll(/req\.method\s*===\s*['"]POST['"]\s*&&\s*(?:url\.pathname|pathname)\s*===\s*['"]([^'"]+)['"]/gi)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value) && value.startsWith("/"));

    const healthPath = getRoutes.find((value) => /^\/health\/?$/i.test(value)) ?? "/health";
    const collectionPath = getRoutes.find((value) => value !== healthPath && value !== "/");
    const supportsCreate = Boolean(collectionPath && postRoutes.includes(collectionPath));
    const primaryField = this.inferApiProbePrimaryField(normalized, plan.spec?.domainFocus ?? "generic");
    return {
      healthPath,
      collectionPath: collectionPath ?? null,
      supportsCreate,
      primaryField
    };
  }

  private inferApiProbePrimaryField(source: string, domainFocus: DomainFocus): string {
    const bodyFieldMatches = [...(source ?? "").matchAll(/body\.(\w+)/g)]
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value) && !["status", "owner", "amount", "id"].includes(value));
    if (bodyFieldMatches.length > 0) {
      return bodyFieldMatches[0];
    }

    switch (domainFocus) {
      case "finance":
        return "customer";
      case "operations":
        return "subject";
      case "scheduling":
        return "guest";
      default:
        return "title";
    }
  }

  private buildApiProbeCreatePayload(primaryField: string, domainFocus: DomainFocus): Record<string, unknown> {
    const primaryValue = domainFocus === "finance"
      ? "Cipher Probe Account"
      : domainFocus === "operations"
        ? "Cipher Probe Incident"
        : domainFocus === "scheduling"
          ? "Cipher Probe Booking"
          : "Cipher Probe Item";
    return {
      [primaryField]: primaryValue,
      status: "active",
      owner: "agent-smoke"
    };
  }

  private async safeReadFirstContextFile(paths: string[]): Promise<string | null> {
    for (const path of paths) {
      const file = await this.safeReadContextFile(path);
      if (file?.content) {
        return file.content;
      }
    }
    return null;
  }

  private async verifyPromptRequirements(plan: TaskExecutionPlan): Promise<AgentVerificationCheck[]> {
    if (plan.promptRequirements.length === 0) {
      return [{
        id: "requirements",
        label: "Prompt match",
        status: "skipped",
        details: "No explicit prompt requirements detected."
      }];
    }

    const content = await this.collectRequirementVerificationContent(plan);
    return plan.promptRequirements.map((requirement) => {
      const normalizedTerms = requirement.terms.map((term) => term.toLowerCase());
      const matchedTerms = normalizedTerms.filter((term) => content.includes(term));
      const passed = requirement.mode === "all"
        ? matchedTerms.length === normalizedTerms.length
        : matchedTerms.length > 0;

      return {
        id: requirement.id,
        label: requirement.label,
        status: passed ? "passed" : "failed",
        details: passed
          ? `Matched ${matchedTerms.join(", ")}.`
          : `Missing prompt evidence for: ${normalizedTerms.filter((term) => !matchedTerms.includes(term)).join(", ")}.`
      };
    });
  }

  private async verifyExecutionSpec(
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck[]> {
    const deliverableCheck = await this.verifySpecDeliverables(plan);
    const hygieneCheck = await this.verifySpecProjectHygiene(plan, artifactType, scripts);
    return [deliverableCheck, hygieneCheck];
  }

  private async verifySpecDeliverables(plan: TaskExecutionPlan): Promise<AgentVerificationCheck> {
    if (plan.spec.requiredFiles.length === 0) {
      return {
        id: "spec-deliverables",
        label: "Plan deliverables",
        status: "skipped",
        details: "No additional deliverables were required by the execution spec."
      };
    }

    const missing: string[] = [];
    const present: string[] = [];
    for (const file of plan.spec.requiredFiles) {
      if (await this.pathExists(this.resolveWorkspacePath(file))) {
        present.push(file);
      } else {
        missing.push(file);
      }
    }

    if (missing.length > 0) {
      return {
        id: "spec-deliverables",
        label: "Plan deliverables",
        status: "failed",
        details: `Missing expected deliverables for ${plan.spec.starterProfile}: ${missing.join(", ")}.`
      };
    }

    return {
      id: "spec-deliverables",
      label: "Plan deliverables",
      status: "passed",
      details: `Confirmed ${present.length} spec deliverable file(s) for ${plan.spec.starterProfile}.`
    };
  }

  private async verifySpecProjectHygiene(
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck> {
    const issues: string[] = [];
    const packageJsonPath = this.joinWorkspacePath(plan.workingDirectory, "package.json");
    const hasPackageJson = await this.pathExists(this.resolveWorkspacePath(packageJsonPath));

    if (plan.workspaceKind !== "static" || hasPackageJson) {
      if (!hasPackageJson) {
        issues.push(`Missing package manifest: ${packageJsonPath}.`);
      } else {
        const rawManifest = await this.safeReadContextFile(packageJsonPath);
        const parsedManifest = rawManifest ? this.parseLoosePackageManifest(rawManifest.content) : null;
        if (!parsedManifest) {
          issues.push(`Malformed package manifest: ${packageJsonPath}.`);
        } else {
          if (!parsedManifest.name?.trim()) {
            issues.push("package.json is missing a package name.");
          }
          if (!parsedManifest.version?.trim()) {
            issues.push("package.json is missing a version.");
          }
        }
      }
    }

    for (const group of plan.spec.requiredScriptGroups) {
      const matched = group.options.find((name) => Boolean(scripts[name]));
      if (!matched) {
        issues.push(`Missing ${group.label} script. Expected one of: ${group.options.join(", ")}.`);
      }
    }

    if (plan.spec.expectsReadme) {
      const readmePath = this.joinWorkspacePath(plan.workingDirectory, "README.md");
      if (!(await this.pathExists(this.resolveWorkspacePath(readmePath)))) {
        issues.push(`Missing README: ${readmePath}.`);
      }
    }

    if (issues.length > 0) {
      return {
        id: "spec-hygiene",
        label: "Project hygiene",
        status: "failed",
        details: issues.join(" ")
      };
    }

    return {
      id: "spec-hygiene",
      label: "Project hygiene",
      status: "passed",
      details: `Project hygiene passed for ${artifactType} using the ${plan.spec.starterProfile} profile.`
    };
  }

  private async verifyPreviewHealth(
    plan: TaskExecutionPlan,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck> {
    const previewRoot = await this.resolvePreviewRoot(plan, scripts);
    const indexPath = this.joinWorkspacePath(previewRoot, "index.html");

    let html = "";
    try {
      html = (await this.readWorkspaceFile(indexPath)).content;
    } catch {
      return {
        id: "preview-health",
        label: "Preview health",
        status: "failed",
        details: `Preview entry is missing: ${indexPath}.`
      };
    }

    const stylesheetRefs = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]+href=["']([^"']+)["']/gi)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value) && !value.startsWith("http"));
    const scriptRefs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value) && !value.startsWith("http"));

    const assetProblems: string[] = [];
    for (const ref of [...stylesheetRefs, ...scriptRefs]) {
      const resolved = this.resolvePreviewAssetPath(previewRoot, ref);
      if (!resolved) {
        assetProblems.push(`Unsupported asset path: ${ref}`);
        continue;
      }
      if (!(await this.pathExists(this.resolveWorkspacePath(resolved)))) {
        assetProblems.push(`Missing asset: ${resolved}`);
      }
    }

    if (assetProblems.length > 0) {
      return {
        id: "preview-health",
        label: "Preview health",
        status: "failed",
        details: assetProblems.join(" ")
      };
    }

    const cssProblems: string[] = [];
    for (const ref of stylesheetRefs) {
      const resolved = this.resolvePreviewAssetPath(previewRoot, ref);
      if (!resolved) continue;
      try {
        const css = (await this.readWorkspaceFile(resolved)).content;
        if (!this.isLikelyValidStylesheet(css)) {
          cssProblems.push(`Malformed stylesheet: ${resolved}`);
        }
      } catch {
        cssProblems.push(`Unreadable stylesheet: ${resolved}`);
      }
    }

    const expectsStyles = plan.workspaceKind === "static" || plan.builderMode !== null;
    if (expectsStyles && stylesheetRefs.length === 0) {
      cssProblems.push("No stylesheet reference found in preview entry.");
    }

    if (cssProblems.length > 0) {
      return {
        id: "preview-health",
        label: "Preview health",
        status: "failed",
        details: cssProblems.join(" ")
      };
    }

    const bootstrapProblems = await this.collectPreviewBootstrapProblems(plan, previewRoot, html, scriptRefs);
    if (bootstrapProblems.length > 0) {
      return {
        id: "preview-health",
        label: "Preview health",
        status: "failed",
        details: bootstrapProblems.join(" ")
      };
    }

    return {
      id: "preview-health",
      label: "Preview health",
      status: "passed",
      details: `Preview entry, bootstrap wiring, and ${stylesheetRefs.length + scriptRefs.length} linked asset(s) look healthy.`
    };
  }

  private async verifyBasicUiSmoke(plan: TaskExecutionPlan): Promise<AgentVerificationCheck> {
    const sources = await this.collectUiSmokeSources(plan);
    const joined = sources.join("\n").toLowerCase();
    const promptRequirements = plan.promptRequirements ?? [];
    const hasHeading = /<h1|<h2|<h3/.test(joined);
    const hasPrimaryAction = /<button|type="submit"|type='submit'|href="#/.test(joined);
    const placeholderMarkers = this.detectStarterPlaceholderSignals(joined);
    const requiresInputFlow = plan.builderMode === "notes" || plan.builderMode === "crud" || plan.builderMode === "kanban";
    const requiresCoreProductInputs = promptRequirements.some((requirement) => /^(req-summary|req-transcript|req-video-source|req-search-filter|req-persistence|req-export|req-ingest|req-auth|req-settings)$/.test(requirement.id));
    const requiresSummaryOutput = promptRequirements.some((requirement) => requirement.id === "req-summary");
    const hasInputs = /<form|<input|<textarea|onchange=|onchange\s*=|onchange\{|value=\{/.test(joined);
    const hasInteraction = /onsubmit=|onclick=|addeventlistener\("submit"|addeventlistener\('submit'|addeventlistener\("click"|addeventlistener\('click'|set[a-z0-9_]+\(/.test(joined);
    const hasStatefulFlow = /localstorage|usestate|set[a-z0-9_]+\(|\.push\(|\.splice\(|\.filter\(|\.map\(|replacechildren|appendchild|render[a-z0-9_]*\(|json\.stringify|new formdata|notes\s*=|records\s*=/.test(joined);
    const hasCollectionView = /<ul|<ol|<table|<tbody|role="list"|role='list'|notes-list|records-list|note-card|record-row|recent activity|kanban-grid|kanban-lane|kanban-card|board-column|task-card/.test(joined);
    const hasSummaryOutput = /\bsummary|takeaways?|chapters?|key points?|insights?|brief|generated brief|action items\b/.test(joined);
    const requiresNotesPersistenceFlow = plan.builderMode === "notes";
    const hasNotesPersistenceFlow = /notes-list|note-card|note-date|note-actions|data-note-delete|setnotes|state\.notes|createdat|search notes|save note/.test(joined);
    const requiresCrudMutationFlow = plan.builderMode === "crud";
    const hasCrudMutationFlow = /edit|update|delete|remove|mark paid|archive|approve|reject|status-badge|data-record-edit|data-record-delete|handlemarkpaid|handleedit|handledelete/.test(joined);

    const failures: string[] = [];
    if (placeholderMarkers.length > 0) {
      failures.push(`Starter placeholder markers were detected: ${placeholderMarkers.join(", ")}.`);
    }
    if (!hasHeading) failures.push("No visible heading was detected.");
    if (!hasPrimaryAction) failures.push("No primary action button or call-to-action was detected.");
    if (requiresInputFlow && (!hasInputs || !hasInteraction)) {
      failures.push("Expected data-entry flow markers were not detected for this app type.");
    }
    if (requiresInputFlow && (!hasStatefulFlow || !hasCollectionView)) {
      failures.push("Expected stateful save/update flow markers were not detected for this app type.");
    }
    if (requiresNotesPersistenceFlow && !hasNotesPersistenceFlow) {
      failures.push("Expected note persistence markers like notes lists, note metadata, or save-note flows were not detected.");
    }
    if (requiresCrudMutationFlow && !hasCrudMutationFlow) {
      failures.push("Expected CRUD mutation markers like edit, delete, update, or status actions were not detected.");
    }
    if (requiresCoreProductInputs && (!hasInputs || !hasInteraction)) {
      failures.push("Expected core product input markers were not detected for this prompt.");
    }
    if (requiresCoreProductInputs && !hasStatefulFlow && !hasCollectionView) {
      failures.push("Expected product workflow or result-surface markers were not detected for this prompt.");
    }
    if (requiresSummaryOutput && !hasSummaryOutput) {
      failures.push("Expected summary result markers were not detected for this prompt.");
    }

    if (failures.length > 0) {
      return {
        id: "ui-smoke",
        label: "UI smoke",
        status: "failed",
        details: failures.join(" ")
      };
    }

    const summaryParts = [
      hasHeading ? "heading" : "",
      hasPrimaryAction ? "primary action" : "",
      requiresInputFlow ? "input flow" : "",
      requiresInputFlow && hasStatefulFlow ? "stateful flow" : "",
      requiresNotesPersistenceFlow && hasNotesPersistenceFlow ? "notes persistence flow" : "",
      requiresCrudMutationFlow && hasCrudMutationFlow ? "crud mutation flow" : ""
    ].filter(Boolean);
    return {
      id: "ui-smoke",
      label: "UI smoke",
      status: "passed",
      details: `Detected ${summaryParts.join(", ")} in the generated web app sources.`
    };
  }

  private async collectUiSmokeSources(plan: TaskExecutionPlan): Promise<string[]> {
    const candidates = plan.workspaceKind === "static"
      ? [
        this.joinWorkspacePath(plan.workingDirectory, "index.html"),
        this.joinWorkspacePath(plan.workingDirectory, "app.js")
      ]
      : [
        this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx"),
        this.joinWorkspacePath(plan.workingDirectory, "src/main.tsx"),
        this.joinWorkspacePath(plan.workingDirectory, "index.html")
      ];

    const sources: string[] = [];
    for (const targetPath of candidates) {
      try {
        const file = await this.readWorkspaceFile(targetPath);
        sources.push(file.content);
      } catch {
        // ignore missing files; verification will fail on absent signals
      }
    }
    return sources;
  }

  private async collectPreviewBootstrapProblems(
    plan: TaskExecutionPlan,
    previewRoot: string,
    html: string,
    scriptRefs: string[]
  ): Promise<string[]> {
    const problems: string[] = [];
    const normalizedHtml = html.toLowerCase();

    if (plan.workspaceKind === "react") {
      if (!/<div[^>]+id=["']root["']/i.test(html)) {
        problems.push("React preview entry is missing a #root container.");
      }

      const mainPath = this.joinWorkspacePath(plan.workingDirectory, "src/main.tsx");
      try {
        const mainContent = (await this.readWorkspaceFile(mainPath)).content;
        if (!this.hasPreviewBootstrapSignals(mainContent, "react")) {
          problems.push(`React entry ${mainPath} does not include an obvious root render call.`);
        }
      } catch {
        problems.push(`React entry is missing: ${mainPath}.`);
      }

      const previewRootNormalized = previewRoot.replace(/\\/g, "/");
      const workingDirectoryNormalized = plan.workingDirectory.replace(/\\/g, "/");
      const usesBuiltPreview = previewRootNormalized !== workingDirectoryNormalized;
      if (usesBuiltPreview) {
        const hasBuiltScript = scriptRefs.some((ref) => /\.js($|[?#])/i.test(ref));
        if (!hasBuiltScript) {
          problems.push("React preview entry does not load a built JavaScript entry asset.");
        }
      } else if (!/src\/main\.(t|j)sx?/.test(normalizedHtml) && !scriptRefs.some((ref) => /src\/main\.(t|j)sx?/i.test(ref))) {
        problems.push("React preview entry does not load the main application entry.");
      }
      return problems;
    }

    const appScriptPath = this.joinWorkspacePath(previewRoot, "app.js");
    const appScriptExists = await this.pathExists(this.resolveWorkspacePath(appScriptPath));
    if (!appScriptExists) return problems;

    const hasAppScriptRef = scriptRefs.some((ref) => {
      const resolved = this.resolvePreviewAssetPath(previewRoot, ref);
      return resolved === appScriptPath || /(^|\/)app\.js$/i.test(ref);
    });
    if (!hasAppScriptRef) {
      problems.push(`Preview entry does not load ${appScriptPath}.`);
      return problems;
    }

    if (plan.builderMode === "notes" || plan.builderMode === "crud" || plan.builderMode === "dashboard" || plan.builderMode === "kanban") {
      try {
        const appScript = (await this.readWorkspaceFile(appScriptPath)).content;
        if (!this.hasPreviewBootstrapSignals(appScript, "static")) {
          problems.push(`Preview script ${appScriptPath} does not include obvious DOM bootstrap markers.`);
        }
      } catch {
        problems.push(`Unreadable preview script: ${appScriptPath}.`);
      }
    }

    return problems;
  }

  private hasPreviewBootstrapSignals(source: string, mode: "static" | "react"): boolean {
    const normalized = (source ?? "").toLowerCase();
    if (!normalized.trim()) return false;
    if (mode === "react") {
      return /createroot|root\.render|reactdom\.createroot/.test(normalized);
    }
    return /document\.queryselector|document\.getelementbyid|addeventlistener\("domcontentloaded"|addeventlistener\('domcontentloaded'|replacechildren|appendchild|insertadjacenthtml|innerhtml|classlist\./.test(normalized);
  }

  private async tryAutoFixPreviewHealth(
    task: AgentTask,
    check: AgentVerificationCheck,
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    buildLabel: string
  ): Promise<boolean> {
    const fix = await this.tryHeuristicPreviewHealthFix(plan, check.details);
    if (!fix || fix.edits.length === 0) return false;

    this.appendLog(task.id, `Using heuristic preview fallback: ${fix.summary}`);
    const scopedEdits = this.filterValidEdits(fix.edits, plan);
    const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 3, scopedEdits);
    if (applied.length === 0) return false;

    if (scripts.build) {
      const build = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
      if (!build.ok) {
        throw new Error(this.buildCommandFailureMessage(buildLabel, build, "failed after preview-health repair"));
      }
    }

    return true;
  }

  private async tryHeuristicPreviewHealthFix(
    plan: TaskExecutionPlan,
    details: string
  ): Promise<HeuristicFixResult | null> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (plan.workspaceKind === "react" && /missing a #root container|does not load the main application entry/i.test(details)) {
      return {
        summary: "Restored the React preview entry so Vite loads the main application script.",
        edits: [{
          path: this.joinWorkspacePath(workingDirectory, "index.html"),
          content: this.buildReactBootstrapHtml(this.toDisplayNameFromDirectory(workingDirectory))
        }]
      };
    }

    const missingJsAssets = [...details.matchAll(new RegExp(`${this.escapeRegExp(`${workingDirectory}/dist/`)}([^\\s]+\\.js)`, "gi"))]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value));
    if (missingJsAssets.length === 0) return null;

    const indexPath = this.joinWorkspacePath(workingDirectory, "index.html");
    const indexFile = await this.safeReadContextFile(indexPath);
    if (!indexFile) return null;

    const updated = this.normalizeLocalHtmlScriptsForVite(indexFile.content, missingJsAssets);
    if (!updated || updated === indexFile.content) return null;

    return {
      summary: "Updated local script tags to module scripts so Vite preview assets build correctly.",
      edits: [{ path: indexPath, content: updated }]
    };
  }

  private normalizeLocalHtmlScriptsForVite(content: string, expectedScripts: string[]): string | null {
    let updated = content;
    let changed = false;

    for (const scriptName of expectedScripts) {
      const pattern = new RegExp(
        `<script((?:(?!type=)[^>])*)\\s+src=(["'](?:\\./)?${this.escapeRegExp(scriptName)}["'])((?:(?!type=)[^>])*)></script>`,
        "gi"
      );
      updated = updated.replace(pattern, (_match, before, src, after) => {
        changed = true;
        return `<script${before} type="module" src=${src}${after}></script>`;
      });
    }

    return changed ? updated : null;
  }

  private async resolvePreviewRoot(plan: TaskExecutionPlan, scripts: PackageScripts): Promise<string> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    const isStatic = Boolean(scripts.start && /http\.server/i.test(scripts.start));
    if (isStatic) return workingDirectory;

    const distRoot = this.joinWorkspacePath(workingDirectory, "dist");
    if (await this.pathExists(this.resolveWorkspacePath(distRoot))) {
      return distRoot;
    }

    return workingDirectory;
  }

  private resolvePreviewAssetPath(previewRoot: string, ref: string): string | null {
    const cleaned = (ref ?? "").trim();
    if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("data:") || cleaned.startsWith("mailto:")) {
      return null;
    }

    const withoutQuery = cleaned.split("?")[0]?.split("#")[0] ?? "";
    if (!withoutQuery) return null;
    if (withoutQuery.startsWith("/")) {
      return this.joinWorkspacePath(previewRoot, withoutQuery.replace(/^\/+/, ""));
    }
    return this.joinWorkspacePath(previewRoot, withoutQuery);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private isLikelyValidStylesheet(content: string): boolean {
    const normalized = (content ?? "").trim();
    if (normalized.length < 12) return false;
    const openBraces = (normalized.match(/\{/g) ?? []).length;
    const closeBraces = (normalized.match(/\}/g) ?? []).length;
    if (openBraces === 0 || closeBraces === 0 || openBraces !== closeBraces) return false;
    const hasSelector = /(^|}|,)\s*(?:[.#:]?[a-z][a-z0-9_-]*|\*|html|body)(?:[\s>+~:#.[\]-][^{}]*)?\s*\{/im.test(normalized);
    const hasDeclaration = /[a-z-]+\s*:\s*[^;{}]+;?/i.test(normalized);
    return hasSelector && hasDeclaration;
  }

  private async collectRequirementVerificationContent(plan: TaskExecutionPlan): Promise<string> {
    const preferredPaths = [
      this.joinWorkspacePath(plan.workingDirectory, "index.html"),
      this.joinWorkspacePath(plan.workingDirectory, "styles.css"),
      this.joinWorkspacePath(plan.workingDirectory, "app.js"),
      this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx"),
      this.joinWorkspacePath(plan.workingDirectory, "src/main.tsx"),
      this.joinWorkspacePath(plan.workingDirectory, "src/App.css"),
      this.joinWorkspacePath(plan.workingDirectory, "src/index.css")
    ];

    const parts: string[] = [];
    for (const relPath of preferredPaths) {
      try {
        const file = await this.readWorkspaceFile(relPath);
        parts.push(file.content.toLowerCase());
      } catch {
        // ignore missing files
      }
    }
    return parts.join("\n");
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async runStep<T>(
    task: AgentTask,
    title: string,
    work: () => Promise<{ summary: string } & T>
  ): Promise<{ summary: string } & T> {
    this.throwIfTaskStopped(task);
    this.markTaskStage(task, title);
    const step: AgentTaskStep = {
      id: `step_${randomUUID()}`,
      title,
      status: "running",
      startedAt: new Date().toISOString(),
      summary: ""
    };
    task.steps.push(step);
    task.updatedAt = new Date().toISOString();
    this.appendLog(task.id, `${title}...`);
    this.persistTaskState(task.id);

    try {
      const result = await work();
      this.throwIfTaskStopped(task);
      step.status = "completed";
      step.finishedAt = new Date().toISOString();
      step.summary = result.summary;
      task.updatedAt = step.finishedAt;
      this.appendLog(task.id, result.summary);
      this.persistTaskState(task.id);
      return result;
    } catch (err) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.summary = err instanceof Error ? err.message : `${title} failed.`;
      task.updatedAt = step.finishedAt;
      this.markTaskFailureStage(task, title, step.summary);
      this.appendLog(task.id, `${title} failed: ${step.summary}`);
      this.persistTaskState(task.id);
      throw err;
    }
  }

  private async runDeferredStep<T>(
    task: AgentTask,
    title: string,
    work: () => Promise<{ summary: string } & T>
  ): Promise<{ summary: string } & T> {
    this.throwIfTaskStopped(task);
    this.markTaskStage(task, title);
    const startedAt = new Date().toISOString();
    task.updatedAt = startedAt;
    this.appendLog(task.id, `${title}...`);
    this.persistTaskState(task.id);

    try {
      const result = await work();
      this.throwIfTaskStopped(task);
      const finishedAt = new Date().toISOString();
      const step: AgentTaskStep = {
        id: `step_${randomUUID()}`,
        title,
        status: "completed",
        startedAt,
        finishedAt,
        summary: result.summary
      };
      task.steps.push(step);
      task.updatedAt = finishedAt;
      this.appendLog(task.id, result.summary);
      this.persistTaskState(task.id);
      return result;
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const step: AgentTaskStep = {
        id: `step_${randomUUID()}`,
        title,
        status: "failed",
        startedAt,
        finishedAt,
        summary: err instanceof Error ? err.message : `${title} failed.`
      };
      task.steps.push(step);
      task.updatedAt = finishedAt;
      this.markTaskFailureStage(task, title, step.summary);
      this.appendLog(task.id, `${title} failed: ${step.summary}`);
      this.persistTaskState(task.id);
      throw err;
    }
  }

  private throwIfTaskStopped(task: AgentTask): void {
    if (task.status === "stopped") {
      throw new Error("Agent task stopped by user.");
    }
  }

  private async executeCommand(taskId: string, request: TerminalCommandRequest): Promise<TerminalCommandResult> {
    const startedAt = Date.now();
    const command = request.command.trim();
    if (!command) {
      throw new Error("Command is required.");
    }

    const cwd = request.cwd ? this.resolveWorkspacePath(request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 60_000, 300_000));
    const commandLine = [command, ...args].join(" ");

    this.appendLog(taskId, `$ ${commandLine}`);

    return await new Promise<TerminalCommandResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const proc = this.spawnTaskProcess(command, args, cwd);

      if (taskId !== "manual") {
        this.activeProcesses.set(taskId, proc);
      }

      const finish = (result: TerminalCommandResult) => {
        if (settled) return;
        settled = true;
        if (taskId !== "manual") {
          this.activeProcesses.delete(taskId);
          const task = this.tasks.get(taskId);
          if (task?.status === "running" && result.signal === "SIGTERM" && !result.timedOut) {
            task.status = "stopped";
          }
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        void this.terminateProcessTree(proc);
      }, timeoutMs);

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.appendOutput(taskId, text);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.appendOutput(taskId, text);
      });

      proc.once("error", (err) => {
        clearTimeout(timer);
        if (taskId !== "manual") {
          this.activeProcesses.delete(taskId);
        }
        if (settled) return;
        settled = true;
        reject(err);
      });

      proc.once("exit", (code, signal) => {
        clearTimeout(timer);
        finish({
          ok: !timedOut && code === 0,
          code,
          signal,
          stdout,
          stderr,
          combinedOutput: `${stdout}${stderr}`.trim(),
          durationMs: Date.now() - startedAt,
          timedOut,
          commandLine,
          cwd
        });
      });
    });
  }

  private async executeDetachedCommand(
    taskId: string,
    request: TerminalCommandRequest,
    useShell: boolean
  ): Promise<TerminalCommandResult> {
    const startedAt = Date.now();
    const command = request.command.trim();
    if (!command) {
      throw new Error("Command is required.");
    }

    const cwd = request.cwd ? this.resolveWorkspacePath(request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 60_000, 300_000));
    const commandLine = [command, ...args].join(" ");

    this.appendLog(taskId, `$ ${commandLine}`);

    return await new Promise<TerminalCommandResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const childEnv = useShell ? process.env : { ...process.env };
      if (!useShell) {
        delete childEnv.ELECTRON_RUN_AS_NODE;
      }

      const proc = this.spawnTaskProcess(command, args, cwd, {
        env: childEnv,
        useShell
      });

      const finish = (result: TerminalCommandResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        void this.terminateProcessTree(proc);
      }, timeoutMs);

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.appendOutput(taskId, text);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.appendOutput(taskId, text);
      });

      proc.once("error", (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(err);
      });

      proc.once("exit", (code, signal) => {
        clearTimeout(timer);
        finish({
          ok: !timedOut && code === 0,
          code,
          signal,
          stdout,
          stderr,
          combinedOutput: `${stdout}${stderr}`.trim(),
          durationMs: Date.now() - startedAt,
          timedOut,
          commandLine,
          cwd
        });
      });
    });
  }

  private async executeStartupVerification(
    taskId: string,
    request: TerminalCommandRequest,
    verifyMs: number,
    probe?: StartupVerificationProbe
  ): Promise<TerminalCommandResult> {
    const startedAt = Date.now();
    const command = request.command.trim();
    if (!command) throw new Error("Command is required.");

    const cwd = request.cwd ? this.resolveWorkspacePath(request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const commandLine = [command, ...args].join(" ");

    this.appendLog(taskId, `$ ${commandLine} [startup verify]`);

    return await new Promise<TerminalCommandResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let successTimer: NodeJS.Timeout | null = null;
      let verificationResult: TerminalCommandResult | null = null;
      let cleanupPromise: Promise<void> | null = null;
      let awaitingCleanupExit = false;

      const proc = this.spawnTaskProcess(command, args, cwd);

      this.activeProcesses.set(taskId, proc);

      const finish = async (result: TerminalCommandResult) => {
        if (settled) return;
        settled = true;
        if (successTimer) clearTimeout(successTimer);
        this.activeProcesses.delete(taskId);
        resolve(result);
      };

      const collect = (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.appendOutput(taskId, text);
      };

      const collectErr = (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.appendOutput(taskId, text);
      };

      proc.stdout.on("data", collect);
      proc.stderr.on("data", collectErr);

      proc.once("error", (err) => {
        if (successTimer) clearTimeout(successTimer);
        this.activeProcesses.delete(taskId);
        if (settled) return;
        settled = true;
        reject(err);
      });

      proc.once("exit", async (code, signal) => {
        if (successTimer) clearTimeout(successTimer);
        if (awaitingCleanupExit && verificationResult) {
          if (cleanupPromise) await cleanupPromise;
          await finish(verificationResult);
          return;
        }

        const combinedOutput = `${stdout}${stderr}`.trim();
        await finish({
          ok: code === 0 && !this.hasStartupFailureSignal(combinedOutput),
          code,
          signal,
          stdout,
          stderr,
          combinedOutput,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          commandLine,
          cwd
        });
      });

      successTimer = setTimeout(async () => {
        const combinedOutput = `${stdout}${stderr}`.trim();
        const hasFailure = this.hasStartupFailureSignal(combinedOutput);
        verificationResult = {
          ok: !hasFailure,
          code: null,
          signal: "VERIFIED",
          stdout,
          stderr,
          combinedOutput,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          commandLine,
          cwd
        };
        if (!hasFailure && probe) {
          const probeResult = await probe.run(verificationResult);
          const marker = `[${probe.label}] ${probeResult.status} | ${probeResult.details}`;
          verificationResult.combinedOutput = [verificationResult.combinedOutput, marker].filter(Boolean).join("\n");
          verificationResult.stderr = [verificationResult.stderr, marker].filter(Boolean).join("\n");
          if (probeResult.status === "failed") {
            verificationResult.ok = false;
          }
        }
        awaitingCleanupExit = true;
        cleanupPromise = this.terminateProcessTree(proc).catch(() => {});
        await cleanupPromise;
        await finish(verificationResult);
      }, verifyMs);
    });
  }

  private async tryAutoFixBuild(
    task: AgentTask,
    buildResult: TerminalCommandResult,
    plan: TaskExecutionPlan
  ): Promise<TerminalCommandResult> {
    let currentResult = buildResult;

    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt += 1) {
      const attemptResult = await this.runStep(task, `Fix build attempt ${attempt}`, async () => {
        const contextFiles = await this.collectFixContextFiles(currentResult.combinedOutput, plan);
        if (contextFiles.length === 0) {
          throw new Error("Build recovery could not continue because no useful context files were found.");
        }

        if (this.isBuilderRecoveryPrimaryPlan(plan)) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Build recovery builder fallback produced no usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          const scopedEdits = this.filterValidEdits(builderFix.edits, plan);
          const applied = await this.applyStructuredEdits(task.id, attempt, scopedEdits);
          await this.prepareGeneratedWorkspace(task.id, plan);
          currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
          return {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. Build ${currentResult.ok ? "passed" : "still failing"}.`
          };
        }

        const bootstrapRepair = await this.tryGeneratedReactBootstrapRepair(task.id, currentResult, plan);
        if (bootstrapRepair) {
          currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
          return {
            summary: `${bootstrapRepair} Build ${currentResult.ok ? "passed" : "still failing"}.`
          };
        }

        this.appendLog(task.id, `Preparing ${contextFiles.length} context file(s) for model fix.`);
        let fix: FixResponse;
        let usedModelFix = false;
        try {
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, "Build", plan);
          usedModelFix = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown model fix failure.";
          this.appendLog(task.id, `Model-based fix failed: ${message}`);
          const heuristicFix = await this.tryHeuristicFix(task.id, currentResult, contextFiles);
          if (heuristicFix && heuristicFix.edits.length > 0) {
            this.appendLog(task.id, `Using heuristic fallback: ${heuristicFix.summary}`);
            fix = {
              summary: heuristicFix.summary,
              edits: heuristicFix.edits
            };
          } else {
            const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
            if (!builderFix || builderFix.edits.length === 0) {
              throw err;
            }
            const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
            this.appendLog(task.id, `Using builder recovery fallback: ${builderFix.summary}`);
            fix = {
              summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
              edits: builderFix.edits
            };
          }
        }
        fix.edits = this.filterValidEdits(fix.edits, plan);
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Build recovery did not produce any usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.filterValidEdits(builderFix.edits, plan)
          };
          if (fix.edits.length === 0) {
            throw new Error("Build recovery did not produce any usable edits.");
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
        if (usedModelFix && !currentResult.ok) {
          this.recordFailedRepairVerification(task.id, "Build", currentResult.combinedOutput);
        }

        return {
          summary: `${fix.summary || "Applied model edits."} Files changed: ${applied.join(", ") || "none"}. Build ${currentResult.ok ? "passed" : "still failing"}.`
        };
      });

      if (currentResult.ok) return currentResult;
      if (!attemptResult.summary.toLowerCase().includes("still failing")) return currentResult;
    }

    const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
    if (builderFix && builderFix.edits.length > 0) {
      await this.runStep(task, "Final builder recovery", async () => {
        const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
        const scopedEdits = this.filterValidEdits(builderFix.edits, plan);
        if (scopedEdits.length === 0) {
          return { summary: "Builder recovery produced no scoped edits." };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.workingDirectory));
        return {
          summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. Build ${currentResult.ok ? "passed" : "still failing"}.`
        };
      });
    }

    return currentResult;
  }

  private async tryGeneratedReactBootstrapRepair(
    taskId: string,
    buildResult: TerminalCommandResult,
    plan: TaskExecutionPlan
  ): Promise<string | null> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return null;
    if (plan.workspaceKind !== "react") return null;

    const combined = buildResult.combinedOutput || "";
    const looksLikeBootstrapTsConfigFailure =
      /tsconfig\.node\.json/i.test(combined) ||
      /TS18003/i.test(combined) ||
      /No inputs were found in config file/i.test(combined) ||
      /Cannot find module ['"]@vitejs\/plugin-react['"]/i.test(combined) ||
      /Cannot find name ['"]?defineConfig['"]?/i.test(combined);

    if (!looksLikeBootstrapTsConfigFailure) return null;

    this.appendLog(taskId, `Applying generated React bootstrap repair in ${workingDirectory}.`);
    await this.prepareGeneratedWorkspace(taskId, plan);
    return `Restored expected React/Vite project files in ${workingDirectory}.`;
  }

  private isVerificationOnlyPrompt(prompt: string): boolean {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (!normalized) return true;
    const verificationSignals = [
      "verify", "check", "inspect", "launch cleanly", "build passed", "run available verification scripts"
    ];
    const changeSignals = [
      "implement", "add", "change", "update", "modify", "create", "remove", "rename", "refactor", "fix ui", "feature"
    ];
    const hasVerification = verificationSignals.some((term) => normalized.includes(term));
    const hasChange = changeSignals.some((term) => normalized.includes(term));
    return hasVerification && !hasChange;
  }

  private async tryAutoFixLaunch(
    task: AgentTask,
    launchResult: TerminalCommandResult,
    plan: TaskExecutionPlan,
    artifactType: AgentArtifactType,
    runtimeLabel: string
  ): Promise<TerminalCommandResult> {
    let currentResult = launchResult;
    const runtimeNoun = runtimeLabel.toLowerCase();
    const originalPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
    const originalScripts = this.extractScripts(originalPackageJson);
    const preservedLaunchScript = this.resolveRuntimeVerificationScript(originalScripts);
    const preservedLaunchCommand = preservedLaunchScript ? originalScripts[preservedLaunchScript] : undefined;

    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt += 1) {
      const attemptResult = await this.runStep(task, `Fix ${runtimeNoun} attempt ${attempt}`, async () => {
        const contextFiles = await this.collectFixContextFiles(currentResult.combinedOutput, plan);
        if (contextFiles.length === 0) {
          throw new Error(`${runtimeLabel} recovery could not continue because no useful context files were found.`);
        }

        this.appendLog(task.id, `Preparing ${contextFiles.length} context file(s) for ${runtimeNoun} fix.`);
        let fix: FixResponse;
        let usedModelFix = false;
        try {
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, runtimeLabel, plan);
          usedModelFix = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : `Unknown model ${runtimeNoun}-fix failure.`;
          this.appendLog(task.id, `Model-based ${runtimeNoun} fix failed: ${message}`);
          const heuristicFix = await this.tryHeuristicFix(task.id, currentResult, contextFiles);
          if (heuristicFix && heuristicFix.edits.length > 0) {
            this.appendLog(task.id, `Using heuristic ${runtimeNoun} fallback: ${heuristicFix.summary}`);
            fix = {
              summary: heuristicFix.summary,
              edits: heuristicFix.edits
            };
          } else {
            const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
            if (!builderFix || builderFix.edits.length === 0) {
              throw err;
            }
            const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
            this.appendLog(task.id, `Using builder ${runtimeNoun} fallback: ${builderFix.summary}`);
            fix = {
              summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
              edits: builderFix.edits
            };
          }
        }
        fix.edits = this.filterValidEdits(fix.edits, plan);
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error(`${runtimeLabel} recovery did not produce any usable edits.`);
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered ${runtimeNoun}-fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.filterValidEdits(builderFix.edits, plan)
          };
          if (fix.edits.length === 0) {
            throw new Error(`${runtimeLabel} recovery did not produce any usable edits.`);
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        let packageJson = await this.tryReadPackageJson(plan.workingDirectory);
        let scripts = this.extractScripts(packageJson);
        let launchScript = this.resolveRuntimeVerificationScript(scripts);
        if (!launchScript && preservedLaunchScript && preservedLaunchCommand) {
          const restored = await this.restoreMissingRuntimeScript(plan.workingDirectory, preservedLaunchScript, preservedLaunchCommand);
          if (restored) {
            packageJson = await this.tryReadPackageJson(plan.workingDirectory);
            scripts = this.extractScripts(packageJson);
            launchScript = this.resolveRuntimeVerificationScript(scripts);
            this.appendLog(task.id, `Restored missing ${preservedLaunchScript} script after ${runtimeNoun} repair.`);
          }
        }
        if (!launchScript) {
          throw new Error(`${runtimeLabel} recovery could not continue because no start or dev script was available.`);
        }
        currentResult = await this.executeArtifactRuntimeVerification(task.id, launchScript, artifactType, plan, scripts);
        if (usedModelFix && !currentResult.ok) {
          this.recordFailedRepairVerification(task.id, runtimeLabel, currentResult.combinedOutput);
        }
        return {
          summary: `${fix.summary || "Applied model edits."} Files changed: ${applied.join(", ") || "none"}. ${runtimeLabel} ${currentResult.ok ? "verified" : "still failing"}.`
        };
      });

      if (currentResult.ok) return currentResult;
      if (!attemptResult.summary.toLowerCase().includes("still failing")) return currentResult;
    }

    const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
    if (builderFix && builderFix.edits.length > 0) {
      await this.runStep(task, `Final ${runtimeNoun} recovery`, async () => {
        const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
        const scopedEdits = this.filterValidEdits(builderFix.edits, plan);
        if (scopedEdits.length === 0) {
          return { summary: `${runtimeLabel} builder recovery produced no scoped edits.` };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        const packageJson = await this.tryReadPackageJson(plan.workingDirectory);
        const scripts = this.extractScripts(packageJson);
        const launchScript = this.resolveRuntimeVerificationScript(scripts);
        if (!launchScript) {
          return { summary: `${runtimeLabel} builder recovery could not find a start or dev script.` };
        }
        currentResult = await this.executeArtifactRuntimeVerification(task.id, launchScript, artifactType, plan, scripts);
        return {
          summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. ${runtimeLabel} ${currentResult.ok ? "verified" : "still failing"}.`
        };
      });
    }

    return currentResult;
  }

  private async restoreMissingRuntimeScript(
    workingDirectory: string,
    scriptName: "start" | "dev",
    command: string
  ): Promise<boolean> {
    const packageJson = await this.tryReadPackageJson(workingDirectory);
    if (!packageJson) return false;
    const nextScripts = {
      ...(packageJson.scripts ?? {})
    };
    if (typeof nextScripts[scriptName] === "string" && nextScripts[scriptName]?.trim()) {
      return false;
    }
    nextScripts[scriptName] = command;

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "package.json"),
      `${JSON.stringify({
        ...packageJson,
        scripts: nextScripts
      }, null, 2)}\n`
    );
    return true;
  }

  private async tryAutoFixLint(
    task: AgentTask,
    lintResult: TerminalCommandResult,
    plan: TaskExecutionPlan
  ): Promise<TerminalCommandResult> {
    let currentResult = lintResult;

    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt += 1) {
      const attemptResult = await this.runStep(task, `Fix lint attempt ${attempt}`, async () => {
        const contextFiles = await this.collectFixContextFiles(currentResult.combinedOutput, plan);
        if (contextFiles.length === 0) {
          throw new Error("Lint recovery could not continue because no useful context files were found.");
        }

        if (this.isBuilderRecoveryPrimaryPlan(plan)) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Lint recovery builder fallback produced no usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          const scopedEdits = this.filterValidEdits(builderFix.edits, plan);
          const applied = await this.applyStructuredEdits(task.id, attempt, scopedEdits);
          await this.prepareGeneratedWorkspace(task.id, plan);
          currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.workingDirectory));
          return {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. Lint ${currentResult.ok ? "passed" : "still failing"}.`
          };
        }

        this.appendLog(task.id, `Preparing ${contextFiles.length} context file(s) for lint fix.`);
        let fix: FixResponse;
        let usedModelFix = false;
        try {
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, "Lint", plan);
          usedModelFix = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown model lint-fix failure.";
          this.appendLog(task.id, `Model-based lint fix failed: ${message}`);
          const heuristicFix = await this.tryHeuristicFix(task.id, currentResult, contextFiles);
          if (heuristicFix && heuristicFix.edits.length > 0) {
            this.appendLog(task.id, `Using heuristic lint fallback: ${heuristicFix.summary}`);
            fix = {
              summary: heuristicFix.summary,
              edits: heuristicFix.edits
            };
          } else {
            const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
            if (!builderFix || builderFix.edits.length === 0) {
              throw err;
            }
            const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
            this.appendLog(task.id, `Using builder lint fallback: ${builderFix.summary}`);
            fix = {
              summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
              edits: builderFix.edits
            };
          }
        }

        fix.edits = this.filterValidEdits(fix.edits, plan);
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Lint recovery did not produce any usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered lint-fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.filterValidEdits(builderFix.edits, plan)
          };
          if (fix.edits.length === 0) {
            throw new Error("Lint recovery did not produce any usable edits.");
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.workingDirectory));
        if (usedModelFix && !currentResult.ok) {
          this.recordFailedRepairVerification(task.id, "Lint", currentResult.combinedOutput);
        }

        return {
          summary: `${fix.summary || "Applied lint fixes."} Files changed: ${applied.join(", ") || "none"}. Lint ${currentResult.ok ? "passed" : "still failing"}.`
        };
      });

      if (currentResult.ok) return currentResult;
      if (!attemptResult.summary.toLowerCase().includes("still failing")) return currentResult;
    }

    const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
    if (builderFix && builderFix.edits.length > 0) {
      await this.runStep(task, "Final lint recovery", async () => {
        const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
        const scopedEdits = this.filterValidEdits(builderFix.edits, plan);
        if (scopedEdits.length === 0) {
          return { summary: "Lint builder recovery produced no scoped edits." };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.workingDirectory));
        return {
          summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. Lint ${currentResult.ok ? "passed" : "still failing"}.`
        };
      });
    }

    return currentResult;
  }

  private getWorkspaceAttachmentPaths(attachments: AttachmentPayload[]): string[] {
    const paths: string[] = [];
    for (const attachment of attachments) {
      const sourcePath = (attachment.sourcePath ?? "").trim();
      if (!sourcePath) continue;
      const fullPath = isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(this.workspaceRoot, sourcePath);
      const relativePath = relative(this.workspaceRoot, fullPath);
      if (!relativePath || relativePath.startsWith("..") || normalize(relativePath) === "..") continue;
      paths.push(relativePath.split("\\").join("/"));
    }
    return [...new Set(paths)];
  }

  private async buildExecutionPlan(
    prompt: string,
    workingDirectory = ".",
    attachments: AttachmentPayload[] = []
  ): Promise<TaskExecutionPlan> {
    const attachmentTerms = attachments
      .flatMap((attachment) => [(attachment.name ?? "").trim(), (attachment.sourcePath ?? "").trim()])
      .flatMap((value) => this.extractPromptTerms(value))
      .slice(0, 6);
    const promptTerms = [...new Set([...this.extractPromptTerms(prompt), ...attachmentTerms])].slice(0, 10);
    const candidateFiles = new Set<string>();
    const detectedWorkspaceKind = await this.detectWorkspaceKind(workingDirectory);
    const requestedPaths = [
      ...this.extractExplicitPromptFilePaths(prompt, workingDirectory),
      ...this.getWorkspaceAttachmentPaths(attachments)
    ];
    const workspaceKind = this.resolveWorkspaceKindForPrompt(prompt, detectedWorkspaceKind, requestedPaths);
    const builderMode = this.detectBuilderMode(prompt);
    const promptArtifact = this.inferArtifactTypeFromPrompt((prompt ?? "").trim().toLowerCase());
    const packageManifest = await this.tryReadPackageJson(workingDirectory);
    const spec = this.buildTaskExecutionSpec(prompt, workingDirectory, workspaceKind, builderMode, promptArtifact, requestedPaths);
    const directCandidates = workspaceKind === "static"
      ? [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "index.html"),
        this.joinWorkspacePath(workingDirectory, "styles.css"),
        this.joinWorkspacePath(workingDirectory, "app.js")
      ]
      : workspaceKind === "react"
      ? [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/App.css"),
        this.joinWorkspacePath(workingDirectory, "src/index.css"),
        this.joinWorkspacePath(workingDirectory, "index.html")
      ]
      : promptArtifact === "script-tool"
      ? [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "src/index.js"),
        this.joinWorkspacePath(workingDirectory, "src/index.ts"),
        this.joinWorkspacePath(workingDirectory, "bin/cli.js"),
        this.joinWorkspacePath(workingDirectory, "bin/cli.mjs"),
        this.joinWorkspacePath(workingDirectory, "README.md")
      ]
      : promptArtifact === "library"
      ? [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "src/index.ts"),
        this.joinWorkspacePath(workingDirectory, "src/index.js"),
        this.joinWorkspacePath(workingDirectory, "README.md")
      ]
      : promptArtifact === "api-service"
      ? [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "src/server.js"),
        this.joinWorkspacePath(workingDirectory, "src/server.ts"),
        this.joinWorkspacePath(workingDirectory, "src/index.js"),
        this.joinWorkspacePath(workingDirectory, "src/index.ts"),
        this.joinWorkspacePath(workingDirectory, "README.md")
      ]
      : [
        this.joinWorkspacePath(workingDirectory, "package.json"),
        this.joinWorkspacePath(workingDirectory, "src/main/main.ts"),
        this.joinWorkspacePath(workingDirectory, "src/main/ipc.ts"),
        this.joinWorkspacePath(workingDirectory, "src/renderer/app.ts"),
        this.joinWorkspacePath(workingDirectory, "src/shared/types.ts"),
        this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/app/page.tsx"),
        this.joinWorkspacePath(workingDirectory, "index.html"),
        this.joinWorkspacePath(workingDirectory, "styles.css"),
        this.joinWorkspacePath(workingDirectory, "app.js")
      ];

    for (const file of directCandidates) {
      try {
        await stat(join(this.workspaceRoot, file));
        candidateFiles.add(file);
      } catch {
        // skip missing
      }
    }

    for (const term of promptTerms.slice(0, 6)) {
      const hits = await this.searchWorkspace(term, workingDirectory);
      for (const hit of hits.slice(0, 4)) {
        if (!this.isCandidatePathRelevant(hit.path, workspaceKind, workingDirectory)) continue;
        candidateFiles.add(hit.path);
        if (candidateFiles.size >= MAX_CONTEXT_FILES) break;
      }
      if (candidateFiles.size >= MAX_CONTEXT_FILES) break;
    }

    for (const requestedPath of requestedPaths) {
      candidateFiles.add(requestedPath);
    }

    const initialFiles = [...candidateFiles];
    const workspaceManifest = await this.buildWorkspaceManifest(workingDirectory);
    const repositoryContext = await this.buildRepositoryContext(workingDirectory, workspaceKind, packageManifest);
    const workItems = this.buildTaskWorkItems(prompt, workingDirectory, workspaceKind, requestedPaths, spec, repositoryContext);
    const scopedPaths = new Set(workItems.flatMap((item) => item.allowedPaths ?? []));
    const files = (scopedPaths.size > 0
      ? initialFiles.filter((file) => scopedPaths.has(file))
      : initialFiles).slice(0, MAX_CONTEXT_FILES);
    return {
      summary: files.length > 0
        ? `Planned ${spec.starterProfile} execution around ${files.length} likely file(s): ${files.join(", ")}. Work items: ${workItems.map((item) => item.title).join(", ")}.`
        : `No prompt-specific files identified; using the ${spec.starterProfile} starter profile.`,
      candidateFiles: files,
      requestedPaths,
      promptTerms,
      workingDirectory,
      workspaceManifest,
      repositoryContext,
      workItems,
      spec,
      promptRequirements: this.extractPromptRequirements(prompt),
      workspaceKind,
      builderMode
    };
  }

  private buildTaskExecutionSpec(
    prompt: string,
    workingDirectory: string,
    workspaceKind: "static" | "react" | "generic",
    builderMode: TaskExecutionPlan["builderMode"],
    promptArtifact: AgentArtifactType | null,
    requestedPaths: string[]
  ): TaskExecutionSpec {
    const starterProfile = this.inferStarterProfile(promptArtifact, builderMode, workspaceKind);
    const domainFocus = this.inferDomainFocus(prompt, starterProfile, promptArtifact);
    const expectsReadme = this.looksLikeNewProjectPrompt((prompt ?? "").trim().toLowerCase())
      || requestedPaths.length > 0
      || this.joinWorkspacePath(workingDirectory).startsWith("generated-apps/");
    const requiredFiles = this.buildSpecRequiredFiles(workingDirectory, workspaceKind, starterProfile, expectsReadme, requestedPaths);
    const requiredScriptGroups = this.buildSpecRequiredScriptGroups(starterProfile, workspaceKind);
    const deliverables = this.buildSpecDeliverables(starterProfile, workspaceKind, expectsReadme);
    const acceptanceCriteria = this.buildSpecAcceptanceCriteria(starterProfile, builderMode, promptArtifact, domainFocus);
    const qualityGates = this.buildSpecQualityGates(starterProfile, workspaceKind, expectsReadme);
    return {
      summary: `${this.describeStarterProfile(starterProfile)} for ${this.describeDomainFocus(domainFocus)} workflows with ${acceptanceCriteria.length} acceptance gate(s).`,
      starterProfile,
      domainFocus,
      deliverables,
      acceptanceCriteria,
      qualityGates,
      requiredFiles,
      requiredScriptGroups,
      expectsReadme
    };
  }

  private async buildRepositoryContext(
    workingDirectory: string,
    workspaceKind: "static" | "react" | "generic",
    packageManifest: PackageManifest | null
  ): Promise<TaskRepositoryContext> {
    const packageManager = await this.detectPackageManager(workingDirectory);
    const workspaceShape = await this.detectWorkspaceShape(workingDirectory, workspaceKind);
    const languageStyle = await this.detectLanguageStyle(workingDirectory);
    const moduleFormat = this.detectModuleFormat(packageManifest);
    const uiFramework = this.detectUiFramework(packageManifest, workspaceKind);
    const styling = this.detectStylingApproach(packageManifest, workspaceKind);
    const testing = this.detectTestingTool(packageManifest);
    const linting = this.detectLintingTool(packageManifest);
    const conventions = [
      packageManager !== "unknown" ? `Use ${packageManager} commands and lockfile conventions.` : "",
      languageStyle === "typescript" ? "Prefer TypeScript files and typed interfaces." : "",
      languageStyle === "javascript" ? "Prefer JavaScript files unless the repo already mixes TS." : "",
      moduleFormat === "esm" ? "Keep Node-facing code in ESM format unless a file already uses CommonJS." : "",
      moduleFormat === "commonjs" ? "Keep Node-facing code in CommonJS unless there is a strong reason to migrate." : "",
      uiFramework === "react" ? "Preserve the existing React app structure and entrypoint style." : "",
      uiFramework === "nextjs" ? "Preserve Next.js app conventions instead of adding parallel entrypoints." : "",
      styling === "tailwind" ? "Prefer existing utility-class styling over introducing parallel CSS systems." : "",
      styling === "css" ? "Prefer the existing CSS file approach over introducing a new styling stack." : "",
      testing !== "none" && testing !== "unknown" ? `Keep ${testing} as the primary test style.` : "",
      linting !== "none" && linting !== "unknown" ? `Keep ${linting} as the linting convention.` : "",
      workspaceShape === "monorepo" ? "Respect the current multi-package workspace layout and avoid flattening packages." : ""
    ].filter(Boolean);

    const summaryParts = [
      workspaceShape !== "unknown" ? workspaceShape.replace(/-/g, " ") : "",
      packageManager !== "unknown" ? packageManager : "",
      languageStyle !== "unknown" ? languageStyle : "",
      uiFramework !== "unknown" && uiFramework !== "none" ? uiFramework : "",
      styling !== "unknown" ? styling : "",
      testing !== "unknown" && testing !== "none" ? `tests: ${testing}` : "",
      linting !== "unknown" && linting !== "none" ? `lint: ${linting}` : ""
    ].filter(Boolean);

    return {
      summary: summaryParts.length > 0 ? `Repo conventions: ${summaryParts.join(", ")}.` : "Repo conventions are mostly unknown; prefer the current file layout.",
      workspaceShape,
      packageManager,
      languageStyle,
      moduleFormat,
      uiFramework,
      styling,
      testing,
      linting,
      conventions
    };
  }

  private async detectPackageManager(workingDirectory: string): Promise<TaskRepositoryContext["packageManager"]> {
    const checks: Array<{ path: string; label: TaskRepositoryContext["packageManager"] }> = [
      { path: this.joinWorkspacePath(workingDirectory, "pnpm-lock.yaml"), label: "pnpm" },
      { path: this.joinWorkspacePath(workingDirectory, "yarn.lock"), label: "yarn" },
      { path: this.joinWorkspacePath(workingDirectory, "package-lock.json"), label: "npm" },
      { path: "pnpm-lock.yaml", label: "pnpm" },
      { path: "yarn.lock", label: "yarn" },
      { path: "package-lock.json", label: "npm" }
    ];
    for (const check of checks) {
      if (await this.pathExists(this.resolveWorkspacePath(check.path))) {
        return check.label;
      }
    }
    return "unknown";
  }

  private async detectWorkspaceShape(
    workingDirectory: string,
    workspaceKind: "static" | "react" | "generic"
  ): Promise<TaskRepositoryContext["workspaceShape"]> {
    if (workspaceKind === "static") return "static-site";
    const packageJson = this.joinWorkspacePath(workingDirectory, "package.json");
    const rootPackageJson = "package.json";
    const hasNestedPackagesDir = await this.pathExists(this.resolveWorkspacePath("packages"));
    const hasAppsDir = await this.pathExists(this.resolveWorkspacePath("apps"));
    const isRoot = (workingDirectory ?? ".").trim() === ".";
    if ((hasNestedPackagesDir || hasAppsDir) && isRoot) {
      return "monorepo";
    }
    if (await this.pathExists(this.resolveWorkspacePath(packageJson)) || await this.pathExists(this.resolveWorkspacePath(rootPackageJson))) {
      return "single-package";
    }
    return "unknown";
  }

  private async detectLanguageStyle(workingDirectory: string): Promise<TaskRepositoryContext["languageStyle"]> {
    const candidates = [
      this.joinWorkspacePath(workingDirectory, "tsconfig.json"),
      this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/index.ts"),
      this.joinWorkspacePath(workingDirectory, "src/server.ts"),
      this.joinWorkspacePath(workingDirectory, "src/main.js"),
      this.joinWorkspacePath(workingDirectory, "src/App.jsx"),
      this.joinWorkspacePath(workingDirectory, "src/index.js"),
      this.joinWorkspacePath(workingDirectory, "src/server.js")
    ];
    let hasTs = false;
    let hasJs = false;
    for (const candidate of candidates) {
      if (/\.(ts|tsx)$/.test(candidate) && await this.pathExists(this.resolveWorkspacePath(candidate))) {
        hasTs = true;
      }
      if (/\.(js|jsx)$/.test(candidate) && await this.pathExists(this.resolveWorkspacePath(candidate))) {
        hasJs = true;
      }
    }
    if (await this.pathExists(this.resolveWorkspacePath(this.joinWorkspacePath(workingDirectory, "tsconfig.json")))) {
      hasTs = true;
    }
    if (hasTs && hasJs) return "mixed";
    if (hasTs) return "typescript";
    if (hasJs) return "javascript";
    return "unknown";
  }

  private detectModuleFormat(packageManifest: PackageManifest | null): TaskRepositoryContext["moduleFormat"] {
    const type = (packageManifest?.type ?? "").trim().toLowerCase();
    if (type === "module") return "esm";
    if (type === "commonjs") return "commonjs";
    const main = (packageManifest?.main ?? "").trim().toLowerCase();
    if (main.endsWith(".mjs")) return "esm";
    if (main.endsWith(".cjs")) return "commonjs";
    return "unknown";
  }

  private detectUiFramework(
    packageManifest: PackageManifest | null,
    workspaceKind: "static" | "react" | "generic"
  ): TaskRepositoryContext["uiFramework"] {
    const deps = new Set([
      ...Object.keys(packageManifest?.dependencies ?? {}),
      ...Object.keys(packageManifest?.devDependencies ?? {})
    ].map((item) => item.toLowerCase()));
    if (deps.has("next")) return "nextjs";
    if (deps.has("react") || deps.has("react-dom") || workspaceKind === "react") return "react";
    if (workspaceKind === "static") return "none";
    return "unknown";
  }

  private detectStylingApproach(
    packageManifest: PackageManifest | null,
    workspaceKind: "static" | "react" | "generic"
  ): TaskRepositoryContext["styling"] {
    const deps = new Set([
      ...Object.keys(packageManifest?.dependencies ?? {}),
      ...Object.keys(packageManifest?.devDependencies ?? {})
    ].map((item) => item.toLowerCase()));
    const hasTailwind = deps.has("tailwindcss") || deps.has("@tailwindcss/vite");
    const hasCss = workspaceKind === "static" || deps.has("react") || deps.has("vite") || deps.has("next");
    if (hasTailwind && hasCss) return "mixed";
    if (hasTailwind) return "tailwind";
    if (hasCss) return "css";
    return "unknown";
  }

  private detectTestingTool(packageManifest: PackageManifest | null): TaskRepositoryContext["testing"] {
    const deps = new Set([
      ...Object.keys(packageManifest?.dependencies ?? {}),
      ...Object.keys(packageManifest?.devDependencies ?? {})
    ].map((item) => item.toLowerCase()));
    if (deps.has("vitest")) return "vitest";
    if (deps.has("jest")) return "jest";
    const scripts = Object.values(packageManifest?.scripts ?? {}).join(" ").toLowerCase();
    if (/\bnode\b.*--test|\bnode:test\b/.test(scripts)) return "node:test";
    return Object.keys(packageManifest?.scripts ?? {}).includes("test") ? "unknown" : "none";
  }

  private detectLintingTool(packageManifest: PackageManifest | null): TaskRepositoryContext["linting"] {
    const deps = new Set([
      ...Object.keys(packageManifest?.dependencies ?? {}),
      ...Object.keys(packageManifest?.devDependencies ?? {})
    ].map((item) => item.toLowerCase()));
    if (deps.has("eslint")) return "eslint";
    if (deps.has("@biomejs/biome")) return "biome";
    return Object.keys(packageManifest?.scripts ?? {}).includes("lint") ? "unknown" : "none";
  }

  private inferStarterProfile(
    promptArtifact: AgentArtifactType | null,
    builderMode: TaskExecutionPlan["builderMode"],
    workspaceKind: "static" | "react" | "generic"
  ): StarterProfile {
    if (promptArtifact === "desktop-app") return "electron-desktop";
    if (promptArtifact === "api-service") return "node-api-service";
    if (promptArtifact === "script-tool") return "node-cli";
    if (promptArtifact === "library") return "node-library";
    if (builderMode === "dashboard") return "react-dashboard";
    if (builderMode === "crud") return "react-crud";
    if (builderMode === "kanban") return "react-kanban";
    if (builderMode === "notes") return "react-notes";
    if (builderMode === "landing" || workspaceKind === "static") return "static-marketing";
    if (workspaceKind === "react") return "react-web-app";
    return "workspace-change";
  }

  private describeStarterProfile(profile: StarterProfile): string {
    switch (profile) {
      case "react-dashboard":
        return "React dashboard starter";
      case "react-crud":
        return "React CRUD starter";
      case "react-kanban":
        return "React kanban starter";
      case "react-notes":
        return "React notes starter";
      case "static-marketing":
        return "Static marketing starter";
      case "electron-desktop":
        return "Electron desktop starter";
      case "node-api-service":
        return "Node API starter";
      case "node-cli":
        return "Node CLI starter";
      case "node-library":
        return "Node library starter";
      case "react-web-app":
        return "React app starter";
      default:
        return "Workspace change plan";
    }
  }

  private inferDomainFocus(
    prompt: string,
    starterProfile: StarterProfile,
    promptArtifact: AgentArtifactType | null
  ): DomainFocus {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (!normalized) return "generic";
    if (/\b(crm|lead|customer|client|sales pipeline|opportunit(?:y|ies)|account manager)\b/.test(normalized)) {
      return "crm";
    }
    if (/\b(inventory|stock|warehouse|sku|purchase order|supplier|suppliers|catalog)\b/.test(normalized)) {
      return "inventory";
    }
    if (/\b(schedule|scheduling|calendar|appointment|booking|roster|technician visit|dispatch)\b/.test(normalized)) {
      return "scheduling";
    }
    if (/\b(finance|financial|revenue|expense|budget|cash flow|invoice|billing|payments?)\b/.test(normalized)) {
      return "finance";
    }
    if (/\b(operations|incident|escalation|wallboard|service desk|support queue|sla|uptime)\b/.test(normalized)) {
      return "operations";
    }
    if (/\b(admin|internal tool|back office|moderation|approval|permissions?)\b/.test(normalized)) {
      return "admin";
    }
    if (starterProfile === "node-api-service" && /\b(ticket|support|queue)\b/.test(normalized)) {
      return "operations";
    }
    if (promptArtifact === "desktop-app" && /\b(shop|store|retail)\b/.test(normalized)) {
      return "inventory";
    }
    return "generic";
  }

  private describeDomainFocus(domainFocus: DomainFocus): string {
    switch (domainFocus) {
      case "operations":
        return "operations";
      case "crm":
        return "CRM";
      case "inventory":
        return "inventory";
      case "scheduling":
        return "scheduling";
      case "finance":
        return "finance";
      case "admin":
        return "internal admin";
      default:
        return "general";
    }
  }

  private buildDashboardDomainContent(domainFocus: DomainFocus): {
    sidebarEyebrow: string;
    headerEyebrow: string;
    headerTitle: string;
    headerCopy: string;
    buttonLabel: string;
    chartTitle: string;
    chartRange: string;
    activityTitle: string;
    activityBadge: string;
    teamTitle: string;
    teamBadge: string;
    signalTitle: string;
    signalBadge: string;
    signalCopy: string;
    filterLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    dealsTitle: string;
    dealsBadge: string;
    dealsSummary: string;
    nav: string[];
    regions: string[];
    metrics: Array<{ label: string; value: string; change: string; tone: "up" | "down" }>;
    activities: string[];
    team: Array<{ name: string; role: string; status: string }>;
    deals: Array<{ name: string; region: string; stage: string; value: string }>;
    chartHeights: string[];
    staticLede: string;
    staticButtonLabel: string;
    staticTrendTitle: string;
    staticTrendBadge: string;
    staticActivityTitle: string;
    staticActivityBadge: string;
    staticStats: Array<{ label: string; value: string | number; delta: string }>;
    staticTrend: number[];
    staticActivity: string[];
  } {
    switch (domainFocus) {
      case "finance":
        return {
          sidebarEyebrow: "Finance cockpit",
          headerEyebrow: "Finance snapshot",
          headerTitle: "Cash, collections, and burn at a glance.",
          headerCopy: "Track revenue health, overdue invoices, and budget drift without flipping between spreadsheets.",
          buttonLabel: "Export forecast",
          chartTitle: "Collections trend",
          chartRange: "Last 6 weeks",
          activityTitle: "Recent finance activity",
          activityBadge: "Ledger sync",
          teamTitle: "Finance owners",
          teamBadge: "This week",
          signalTitle: "Financial signal",
          signalBadge: "Top movement",
          signalCopy: "Collections improved after the latest invoice reminder run, while discretionary spend stayed inside the monthly target.",
          filterLabel: "Region filter",
          searchLabel: "Find a deal",
          searchPlaceholder: "Search account, stage, or region",
          dealsTitle: "Recent deals",
          dealsBadge: "7-day view",
          dealsSummary: "The latest wins skew toward EMEA renewals, while North America still carries the largest open enterprise expansion.",
          nav: ["Overview", "Collections", "Activity", "Owners"],
          regions: ["All regions", "North America", "EMEA", "APAC"],
          metrics: [
            { label: "Revenue", value: "$428k", change: "+8.2%", tone: "up" },
            { label: "Overdue invoices", value: "19", change: "-5", tone: "up" },
            { label: "Budget variance", value: "2.1%", change: "-0.6%", tone: "up" }
          ],
          activities: [
            "Collections team cleared six overdue accounts before noon.",
            "The budget review flagged one campaign above forecasted spend.",
            "Finance approved the updated vendor payment run.",
            "Quarter-close checklist is ready for final sign-off."
          ],
          team: [
            { name: "Aisha", role: "Controller", status: "On track" },
            { name: "Mina", role: "Collections lead", status: "Following up" },
            { name: "Zayd", role: "FP&A", status: "Forecasting" }
          ],
          deals: [
            { name: "Northstar Renewal", region: "EMEA", stage: "Verbal commit", value: "$86k" },
            { name: "Helio Expansion", region: "North America", stage: "Procurement", value: "$54k" },
            { name: "Atlas Rollout", region: "APAC", stage: "Forecast", value: "$41k" },
            { name: "Luma Recovery", region: "EMEA", stage: "Collections", value: "$19k" }
          ],
          chartHeights: ["48%", "58%", "68%", "64%", "80%", "72%"],
          staticLede: "A responsive static finance dashboard with cash, collections, and budget visibility.",
          staticButtonLabel: "Refresh finance view",
          staticTrendTitle: "Collections trend",
          staticTrendBadge: "Stable",
          staticActivityTitle: "Finance activity",
          staticActivityBadge: "Live",
          staticStats: [
            { label: "Revenue run-rate", value: "$428k", delta: "+8%" },
            { label: "Invoices due", value: 19, delta: "-5" },
            { label: "Budget variance", value: "2.1%", delta: "-0.6%" },
            { label: "Payment runs", value: 3, delta: "+1" }
          ],
          staticTrend: [60, 74, 69, 88, 92, 86],
          staticActivity: [
            "Collections sent the second reminder batch to overdue accounts.",
            "AP scheduled the next vendor payment release for tomorrow morning.",
            "Finance leadership approved the revised operating budget.",
            "Month-close exceptions dropped below the escalation threshold."
          ]
        };
      case "operations":
        return {
          sidebarEyebrow: "Operations hub",
          headerEyebrow: "Ops snapshot",
          headerTitle: "Clarity for the queue, fast.",
          headerCopy: "Scan incidents, SLA risk, and escalation load without digging through tabs or chat threads.",
          buttonLabel: "Export handoff",
          chartTitle: "Incident load",
          chartRange: "Last 24 hours",
          activityTitle: "Recent incidents",
          activityBadge: "Live feed",
          teamTitle: "Shift owners",
          teamBadge: "Current rotation",
          signalTitle: "Top escalation",
          signalBadge: "Right now",
          signalCopy: "Escalations dropped after the latest queue rebalance, but one regional incident still needs senior review before handoff.",
          filterLabel: "Region filter",
          searchLabel: "Search queue",
          searchPlaceholder: "Search incident, queue, or region",
          dealsTitle: "Priority queue",
          dealsBadge: "Needs review",
          dealsSummary: "Use the queue filters to narrow regional load before the next dispatch handoff.",
          nav: ["Overview", "Queue", "Activity", "Shift"],
          regions: ["All regions", "North", "Central", "South"],
          metrics: [
            { label: "Open incidents", value: "14", change: "-3", tone: "up" },
            { label: "SLA at risk", value: "4", change: "-1", tone: "up" },
            { label: "Resolved today", value: "29", change: "+7", tone: "up" }
          ],
          activities: [
            "Priority queue dropped below the morning escalation threshold.",
            "Incident INC-482 moved to vendor investigation with notes attached.",
            "The overnight shift cleared the oldest backlog batch.",
            "Customer comms went out for the payment gateway disruption."
          ],
          team: [
            { name: "Aisha", role: "Ops lead", status: "Coordinating" },
            { name: "Mina", role: "Service desk", status: "Reviewing" },
            { name: "Zayd", role: "Escalation manager", status: "Escalated" }
          ],
          deals: [
            { name: "Gateway incident", region: "North", stage: "Escalated", value: "P1" },
            { name: "Dispatch backlog", region: "Central", stage: "Queued", value: "18 jobs" },
            { name: "Vendor outage", region: "South", stage: "Investigating", value: "P2" },
            { name: "SLA breach watch", region: "North", stage: "Monitoring", value: "4 at risk" }
          ],
          chartHeights: ["42%", "56%", "74%", "61%", "88%", "70%"],
          staticLede: "A responsive static dashboard with incidents, service health, and a compact operational summary.",
          staticButtonLabel: "Refresh queue",
          staticTrendTitle: "Incident trend",
          staticTrendBadge: "Stable",
          staticActivityTitle: "Operational activity",
          staticActivityBadge: "Live",
          staticStats: [
            { label: "Open incidents", value: 14, delta: "-3" },
            { label: "Escalations", value: 5, delta: "-1" },
            { label: "SLA risk", value: "3.2%", delta: "-0.4%" },
            { label: "Resolved today", value: 29, delta: "+7" }
          ],
          staticTrend: [58, 78, 66, 92, 81, 108],
          staticActivity: [
            "Ops flagged two stale incidents and resolved one automatically.",
            "Dispatch handed a regional outage to the network team.",
            "The service desk cleared the overnight inbox triage queue.",
            "The latest smoke run passed before the release handoff."
          ]
        };
      default:
        return {
          sidebarEyebrow: "Operations hub",
          headerEyebrow: "Operations snapshot",
          headerTitle: "Clarity for the team, fast.",
          headerCopy: "One place to scan performance, momentum, and the next actions without digging through tabs.",
          buttonLabel: "Export report",
          chartTitle: "Pipeline",
          chartRange: "Last 30 days",
          activityTitle: "Recent activity",
          activityBadge: "Live feed",
          teamTitle: "Team focus",
          teamBadge: "This week",
          signalTitle: "What changed",
          signalBadge: "Top signal",
          signalCopy: "Conversion improved after the latest onboarding update, while support load stayed flat. The current setup is stable enough to scale spend.",
          filterLabel: "Region filter",
          searchLabel: "Search pipeline",
          searchPlaceholder: "Search account, owner, or stage",
          dealsTitle: "Recent deals",
          dealsBadge: "Fresh activity",
          dealsSummary: "The recent pipeline view keeps open expansion, renewals, and at-risk deals in one scan-friendly list.",
          nav: ["Overview", "Pipeline", "Activity", "Team"],
          regions: ["All regions", "North America", "EMEA", "APAC"],
          metrics: [
            { label: "Revenue", value: "$128k", change: "+12.4%", tone: "up" },
            { label: "Active users", value: "8,421", change: "+6.8%", tone: "up" },
            { label: "Conversion", value: "4.7%", change: "+0.9%", tone: "up" }
          ],
          activities: [
            "Enterprise lead upgraded to annual plan",
            "Marketing campaign reached target CPA",
            "Customer success cleared 18 open tickets",
            "New release health checks passed"
          ],
          team: [
            { name: "Aisha", role: "Ops lead", status: "On track" },
            { name: "Mina", role: "Customer success", status: "Reviewing" },
            { name: "Zayd", role: "Growth", status: "Shipping" }
          ],
          deals: [
            { name: "Bluebird expansion", region: "North America", stage: "Proposal", value: "$38k" },
            { name: "Meridian renewal", region: "EMEA", stage: "Commit", value: "$22k" },
            { name: "Sunline pilot", region: "APAC", stage: "Discovery", value: "$16k" },
            { name: "Oakridge upsell", region: "North America", stage: "Negotiation", value: "$29k" }
          ],
          chartHeights: ["42%", "56%", "74%", "61%", "88%", "70%"],
          staticLede: "A responsive static dashboard with metrics, activity, and a compact operational summary.",
          staticButtonLabel: "Refresh metrics",
          staticTrendTitle: "Pipeline trend",
          staticTrendBadge: "Stable",
          staticActivityTitle: "Recent activity",
          staticActivityBadge: "Live",
          staticStats: [
            { label: "Qualified leads", value: 128, delta: "+14%" },
            { label: "Active projects", value: 18, delta: "+3" },
            { label: "Conversion", value: "6.4%", delta: "+0.8%" },
            { label: "Open issues", value: 7, delta: "-2" }
          ],
          staticTrend: [58, 78, 66, 92, 81, 108],
          staticActivity: [
            "Design review cleared for the next release candidate.",
            "Ops flagged two stale incidents and resolved one automatically.",
            "Product accepted the new onboarding sequence.",
            "Support queue dropped below the daily target."
          ]
        };
    }
  }

  private buildCrudDomainContent(domainFocus: DomainFocus): {
    eyebrow: string;
    lede: string;
    singularLabel: string;
    pluralLabel: string;
    nameLabel: string;
    categoryLabel: string;
    ownerLabel: string;
    searchLabel: string;
    namePlaceholder: string;
    categoryPlaceholder: string;
    ownerPlaceholder: string;
    initialRecords: Array<{ id: string; name: string; category: string; owner: string; status: "Active" | "Review" | "Archived" }>;
  } {
    switch (domainFocus) {
      case "crm":
        return {
          eyebrow: "CRM workspace",
          lede: "Track accounts, pipeline stage, and ownership in one compact team workspace.",
          singularLabel: "account",
          pluralLabel: "accounts",
          nameLabel: "Account name",
          categoryLabel: "Pipeline stage",
          ownerLabel: "Account owner",
          searchLabel: "Search accounts",
          namePlaceholder: "Apex Holdings",
          categoryPlaceholder: "Discovery, proposal, renewal...",
          ownerPlaceholder: "Who owns the account?",
          initialRecords: [
            { id: "1", name: "Northwind Holdings", category: "Proposal", owner: "Aisha", status: "Active" },
            { id: "2", name: "Blue Mesa Retail", category: "Renewal", owner: "Zayd", status: "Review" },
            { id: "3", name: "Harbor Logistics", category: "Closed lost", owner: "Mina", status: "Archived" }
          ]
        };
      case "inventory":
        return {
          eyebrow: "Inventory workspace",
          lede: "Manage stock items, supplier ownership, and review queues without leaving the list view.",
          singularLabel: "item",
          pluralLabel: "items",
          nameLabel: "Item name",
          categoryLabel: "SKU or category",
          ownerLabel: "Supplier or owner",
          searchLabel: "Search items",
          namePlaceholder: "Warehouse scanner",
          categoryPlaceholder: "Peripheral, shelf B2, SKU-4421...",
          ownerPlaceholder: "Supplier or stock owner",
          initialRecords: [
            { id: "1", name: "Portable scanner", category: "SKU-4421", owner: "Northwind Supply", status: "Active" },
            { id: "2", name: "Packing labels", category: "Consumables", owner: "Mina", status: "Review" },
            { id: "3", name: "Returns bin", category: "Backroom", owner: "Zayd", status: "Archived" }
          ]
        };
      default:
        return {
          eyebrow: "Cipher Workspace",
          lede: "A focused CRUD workspace for managing records, reviewing ownership, and keeping the list organized.",
          singularLabel: "record",
          pluralLabel: "records",
          nameLabel: "Name",
          categoryLabel: "Category",
          ownerLabel: "Owner",
          searchLabel: "Search",
          namePlaceholder: "Project, client, asset...",
          categoryPlaceholder: "Sales, Ops, Finance...",
          ownerPlaceholder: "Who is responsible?",
          initialRecords: [
            { id: "1", name: "Northwind Pipeline", category: "Sales", owner: "Aisha", status: "Active" },
            { id: "2", name: "Q2 Hiring Plan", category: "People", owner: "Zayd", status: "Review" },
            { id: "3", name: "Support Audit", category: "Operations", owner: "Mina", status: "Archived" }
          ]
        };
    }
  }

  private buildDesktopDomainContent(domainFocus: DomainFocus): {
    kicker: string;
    copy: string;
    modeValue: string;
    modeCopy: string;
    checklistTitle: string;
    checklistItems: string[];
    actionTitle: string;
    shortcuts: string[];
    activityTitle: string;
    activity: Array<{ label: string; detail: string }>;
  } {
    switch (domainFocus) {
      case "inventory":
        return {
          kicker: "Desktop inventory shell",
          copy: "A local-first workspace for stock reviews, receiving tasks, and store-floor inventory coordination.",
          modeValue: "Ready for item and supplier workflows",
          modeCopy: "Use this shell for purchase orders, stock counts, and replenishment views backed by local data or IPC.",
          checklistTitle: "Launch checklist",
          checklistItems: [
            "Map receiving, cycle-count, and reorder workflows",
            "Wire inventory persistence or barcode-connected data",
            "Keep packaging healthy for store-floor deployment"
          ],
          actionTitle: "Quick actions",
          shortcuts: ["Open stock board", "Review suppliers", "Prepare reorder"],
          activityTitle: "Recent activity",
          activity: [
            { label: "Receiving", detail: "12 inbound line items are ready for verification" },
            { label: "Shelf counts", detail: "Backroom count variance dropped below 2 percent" },
            { label: "Reorder prep", detail: "Three SKUs crossed the replenishment threshold" }
          ]
        };
      case "scheduling":
        return {
          kicker: "Desktop scheduling shell",
          copy: "A focused desktop shell for dispatch boards, technician appointments, and day-of schedule adjustments.",
          modeValue: "Ready for dispatch and booking flows",
          modeCopy: "Replace this shell with route planning, appointment details, and schedule conflict handling.",
          checklistTitle: "Launch checklist",
          checklistItems: [
            "Map booking, dispatch, and reschedule flows",
            "Wire appointments to local persistence or synced APIs",
            "Keep packaging healthy for dispatcher workstations"
          ],
          actionTitle: "Quick actions",
          shortcuts: ["Open dispatch board", "Review bookings", "Resolve conflicts"],
          activityTitle: "Recent activity",
          activity: [
            { label: "Dispatch", detail: "Seven technician visits are ready for route balancing" },
            { label: "Conflicts", detail: "Two overlapping bookings were flagged for reassignment" },
            { label: "Field updates", detail: "Morning appointment confirmations synced locally" }
          ]
        };
      default:
        return {
          kicker: "Desktop starter app",
          copy: "A focused local-first shell for operational workflows, offline review, and release-ready task handling.",
          modeValue: "Ready for domain-specific screens",
          modeCopy: "Replace this starter shell with the real product workflow, navigation, and data bindings.",
          checklistTitle: "Launch checklist",
          checklistItems: [
            "Map the main desktop workflow",
            "Wire real persistence or IPC data sources",
            "Keep packaging scripts healthy for Windows delivery"
          ],
          actionTitle: "Quick actions",
          shortcuts: ["Open workspace", "Review logs", "Prepare release"],
          activityTitle: "Recent activity",
          activity: [
            { label: "Inbox triage", detail: "7 local tasks ready for review" },
            { label: "Build status", detail: "Latest smoke run passed with preview ready" },
            { label: "Release prep", detail: "Installer, notes, and changelog still open" }
          ]
        };
    }
  }

  private buildApiEntityForDomain(domainFocus: DomainFocus): {
    singular: string;
    plural: string;
    collectionPath: string;
    primaryField: string;
    defaultPrimaryValue: string;
  } {
    switch (domainFocus) {
      case "finance":
        return {
          singular: "invoice",
          plural: "invoices",
          collectionPath: "/invoices",
          primaryField: "customer",
          defaultPrimaryValue: "Acme Corp"
        };
      case "operations":
        return {
          singular: "ticket",
          plural: "tickets",
          collectionPath: "/tickets",
          primaryField: "subject",
          defaultPrimaryValue: "Login issue"
        };
      case "scheduling":
        return {
          singular: "booking",
          plural: "bookings",
          collectionPath: "/bookings",
          primaryField: "guest",
          defaultPrimaryValue: "Jordan Lee"
        };
      case "inventory":
        return {
          singular: "item",
          plural: "items",
          collectionPath: "/items",
          primaryField: "title",
          defaultPrimaryValue: "Portable scanner"
        };
      default:
        return {
          singular: "record",
          plural: "records",
          collectionPath: "/records",
          primaryField: "title",
          defaultPrimaryValue: "Sample item"
        };
    }
  }

  private buildSpecRequiredFiles(
    workingDirectory: string,
    workspaceKind: "static" | "react" | "generic",
    starterProfile: StarterProfile,
    expectsReadme: boolean,
    requestedPaths: string[]
  ): string[] {
    const required = new Set<string>();
    const add = (path: string): void => {
      if (this.isPathInsideWorkingDirectory(path, workingDirectory)) {
        required.add(path);
      }
    };

    if (workspaceKind === "static") {
      add(this.joinWorkspacePath(workingDirectory, "index.html"));
      add(this.joinWorkspacePath(workingDirectory, "styles.css"));
      add(this.joinWorkspacePath(workingDirectory, "app.js"));
    } else if (workspaceKind === "react") {
      add(this.joinWorkspacePath(workingDirectory, "package.json"));
      add(this.joinWorkspacePath(workingDirectory, "index.html"));
      add(this.joinWorkspacePath(workingDirectory, "src/main.tsx"));
      add(this.joinWorkspacePath(workingDirectory, "src/App.tsx"));
    } else if (starterProfile !== "workspace-change") {
      add(this.joinWorkspacePath(workingDirectory, "package.json"));
    }

    if (starterProfile === "electron-desktop") {
      add(this.joinWorkspacePath(workingDirectory, "electron/main.mjs"));
      add(this.joinWorkspacePath(workingDirectory, "electron/preload.mjs"));
      add(this.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
    }
    if (starterProfile === "node-api-service") {
      add(this.joinWorkspacePath(workingDirectory, "src/server.js"));
    }
    if (starterProfile === "node-cli" || starterProfile === "node-library") {
      add(this.joinWorkspacePath(workingDirectory, "src/index.js"));
    }
    if (expectsReadme) {
      add(this.joinWorkspacePath(workingDirectory, "README.md"));
    }
    for (const path of requestedPaths) {
      add(path);
    }
    return [...required];
  }

  private buildSpecRequiredScriptGroups(
    starterProfile: StarterProfile,
    workspaceKind: "static" | "react" | "generic"
  ): TaskExecutionSpecScriptGroup[] {
    if (workspaceKind === "static") {
      return [
        { label: "build", options: ["build"] },
        { label: "serve", options: ["start"] }
      ];
    }
    if (starterProfile === "workspace-change") return [];
    if (starterProfile === "node-library") {
      return [{ label: "build", options: ["build"] }];
    }
    if (starterProfile === "electron-desktop") {
      return [
        { label: "build", options: ["build"] },
        { label: "run", options: ["start"] },
        { label: "package", options: ["package:win"] }
      ];
    }
    return [
      { label: "build", options: ["build"] },
      { label: "run", options: ["start", "dev"] }
    ];
  }

  private buildSpecDeliverables(
    starterProfile: StarterProfile,
    workspaceKind: "static" | "react" | "generic",
    expectsReadme: boolean
  ): string[] {
    const deliverables = new Set<string>();
    if (workspaceKind === "static") {
      deliverables.add("Browser entry page");
      deliverables.add("Stylesheet");
      deliverables.add("Client-side interaction script");
    }
    if (workspaceKind === "react") {
      deliverables.add("React application shell");
      deliverables.add("Typed entrypoint and UI component");
    }
    if (starterProfile === "electron-desktop") {
      deliverables.add("Desktop main process and launch script");
      deliverables.add("Installer-ready package configuration");
    } else if (starterProfile === "node-api-service") {
      deliverables.add("HTTP service entrypoint");
      deliverables.add("Runnable package manifest");
    } else if (starterProfile === "node-cli") {
      deliverables.add("Runnable CLI entrypoint");
      deliverables.add("Runnable package manifest");
    } else if (starterProfile === "node-library") {
      deliverables.add("Library entrypoint");
      deliverables.add("Buildable package manifest");
    }
    if (expectsReadme) {
      deliverables.add("Project README");
    }
    if (deliverables.size === 0) {
      deliverables.add("Scoped workspace changes");
    }
    return [...deliverables];
  }

  private buildSpecAcceptanceCriteria(
    starterProfile: StarterProfile,
    builderMode: TaskExecutionPlan["builderMode"],
    promptArtifact: AgentArtifactType | null,
    domainFocus: DomainFocus
  ): string[] {
    const criteria: string[] = [];
    if (starterProfile === "static-marketing") {
      criteria.push("The page has complete sections and a visible call to action.");
      criteria.push("The generated page remains responsive without depending on external assets.");
    }
    if (builderMode === "dashboard") {
      criteria.push("The UI shows metrics, recent activity, and a scan-friendly summary view.");
    }
    if (builderMode === "crud" || builderMode === "notes" || builderMode === "kanban") {
      criteria.push("Users can create and update visible records without placeholder-only UI.");
      criteria.push("State changes are reflected in the rendered collection view.");
    }
    if (starterProfile === "electron-desktop") {
      criteria.push("The desktop project boots locally and is suitable for Windows packaging.");
    }
    if (promptArtifact === "web-app" || promptArtifact === "desktop-app") {
      criteria.push("The app implements the prompt's primary user workflow instead of a generic starter shell.");
    }
    if (starterProfile === "node-api-service") {
      criteria.push("The service boots cleanly and responds from a server entrypoint.");
    }
    if (starterProfile === "node-cli") {
      criteria.push("The CLI runs from the package scripts without extra manual wiring.");
    }
    if (starterProfile === "node-library") {
      criteria.push("The package exposes a usable library entrypoint.");
    }
    if (domainFocus === "crm") {
      criteria.push("The starter reflects customer, pipeline, or account management language instead of generic filler.");
    }
    if (domainFocus === "inventory") {
      criteria.push("The starter reflects stock, supplier, or item management workflows instead of generic filler.");
    }
    if (domainFocus === "scheduling") {
      criteria.push("The starter reflects appointments, calendars, or dispatch workflows instead of generic filler.");
    }
    if (domainFocus === "finance") {
      criteria.push("The starter reflects budgets, invoices, revenue, or payment workflows instead of generic filler.");
    }
    if (domainFocus === "operations") {
      criteria.push("The starter reflects incidents, service health, or operational queue workflows instead of generic filler.");
    }
    if (domainFocus === "admin") {
      criteria.push("The starter reflects approvals, moderation, or internal admin workflows instead of generic filler.");
    }
    if (promptArtifact === "web-app" && criteria.length === 0) {
      criteria.push("The app presents a coherent user-facing experience instead of starter filler.");
    }
    if (criteria.length === 0) {
      criteria.push("The requested changes are implemented inside the scoped workspace.");
    }
    return criteria;
  }

  private buildSpecQualityGates(
    starterProfile: StarterProfile,
    workspaceKind: "static" | "react" | "generic",
    expectsReadme: boolean
  ): string[] {
    const gates = [
      "Required entry files exist in the target workspace.",
      "Package manifest and scripts are internally consistent for the project type."
    ];
    if (workspaceKind === "react" || workspaceKind === "static") {
      gates.push("The UI includes a real bootstrap flow instead of disconnected assets.");
      gates.push("Starter shells and placeholder-only labels are removed from the shipped UI.");
    }
    if (starterProfile === "electron-desktop") {
      gates.push("Desktop packaging remains available for generated Windows apps.");
    }
    if (expectsReadme) {
      gates.push("The project includes a README with run instructions.");
    }
    return gates;
  }

  private detectBuilderMode(prompt: string): "notes" | "landing" | "dashboard" | "crud" | "kanban" | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (!normalized) return null;
    const landingSignals = ["landing page", "website", "site", "homepage", "pricing page", "microsite", "showcase page", "marketing page"];
    const dashboardSignals = ["dashboard", "admin panel", "analytics", "wallboard", "kpi", "incident", "escalation"];
    if (["kanban", "task board"].some((term) => normalized.includes(term))) {
      return "kanban";
    }
    if (this.looksLikeCrudAppPrompt(normalized)) {
      return "crud";
    }
    if (["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term))) {
      return "notes";
    }
    if (landingSignals.some((term) => normalized.includes(term))) {
      return "landing";
    }
    if (dashboardSignals.some((term) => normalized.includes(term))) {
      return "dashboard";
    }
    return null;
  }

  private hasProductSummaryRequirement(normalizedPrompt: string): boolean {
    const normalized = (normalizedPrompt ?? "").trim().toLowerCase();
    if (!normalized) return false;

    if (/\bsummary output\b/.test(normalized) || /\bsummarizer\b/.test(normalized)) {
      return true;
    }

    if (/\b(takeaways?|chapters?|action items?|key points?|insights?)\b/.test(normalized)) {
      return true;
    }

    return /\b(summarize|summarise)\b/.test(normalized)
      && /\b(video|youtube|article|document|text|transcript|meeting|call|audio|pdf|captions?|subtitles?)\b/.test(normalized);
  }

  private hasAuthenticationRequirement(normalizedPrompt: string): boolean {
    const normalized = (normalizedPrompt ?? "").trim().toLowerCase();
    if (!normalized) return false;

    return /\b(login|log in|sign in|signin|sign-in|auth|authentication|password|passcode|credentials?)\b/.test(normalized);
  }

  private extractPromptRequirements(prompt: string): PromptRequirement[] {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const requirements: PromptRequirement[] = [];
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    const supportsVisualRequirements = promptArtifact === null || promptArtifact === "web-app" || promptArtifact === "desktop-app";
    const addRequirement = (requirement: PromptRequirement): void => {
      if (!requirements.some((entry) => entry.id === requirement.id)) {
        requirements.push(requirement);
      }
    };

    if (normalized.includes("hero")) {
      addRequirement({
        id: "req-hero",
        label: "Hero section",
        terms: ["hero"],
        mode: "any"
      });
    }

    if (normalized.includes("feature cards") || normalized.includes("features")) {
      addRequirement({
        id: "req-features",
        label: "Feature section",
        terms: ["features", "feature", "card"],
        mode: "all"
      });
    }

    if (
      normalized.includes("contact cta")
      || normalized.includes("call to action")
      || /\b(contact us|get in touch|talk to sales|book now|book appointment)\b/.test(normalized)
    ) {
      addRequirement({
        id: "req-contact",
        label: "Contact CTA",
        terms: ["contact", "cta"],
        mode: "all"
      });
    }

    if (supportsVisualRequirements && normalized.includes("dashboard")) {
      addRequirement({
        id: "req-dashboard",
        label: "Dashboard content",
        terms: ["dashboard", "metric", "activity"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && normalized.includes("notes")) {
      addRequirement({
        id: "req-notes",
        label: "Notes experience",
        terms: ["note", "notes"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && this.isDesktopBusinessReportingPrompt(normalized)) {
      addRequirement({
        id: "req-record-entry",
        label: "Daily entry workflow",
        terms: ["daily entry", "saved records"],
        mode: "all"
      });
      addRequirement({
        id: "req-reporting",
        label: "Reporting views",
        terms: ["daily summary", "weekly report", "monthly report", "quarterly report", "yearly report"],
        mode: "all"
      });
    }

    if (supportsVisualRequirements && this.hasProductSummaryRequirement(normalized)) {
      addRequirement({
        id: "req-summary",
        label: "Summary output",
        terms: ["summary", "takeaways", "chapters", "action items"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(transcript|subtitles?|captions?)\b/.test(normalized)) {
      addRequirement({
        id: "req-transcript",
        label: "Transcript workflow",
        terms: ["transcript", "caption", "subtitle"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(youtube|video url|youtube url|youtu\.be|youtube\.com|video link)\b/.test(normalized)) {
      addRequirement({
        id: "req-video-source",
        label: "Video source input",
        terms: ["youtube", "video", "url", "link"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(search|filter|find)\b/.test(normalized)) {
      addRequirement({
        id: "req-search-filter",
        label: "Search or filter flow",
        terms: ["search", "filter"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(save|saved|persist|history|recent|library)\b/.test(normalized)) {
      addRequirement({
        id: "req-persistence",
        label: "Persistence flow",
        terms: ["save", "saved", "localstorage", "history", "recent", "library"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(copy|export|download|share)\b/.test(normalized)) {
      addRequirement({
        id: "req-export",
        label: "Export or copy flow",
        terms: ["copy", "export", "download", "share"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(import|upload|paste|drag and drop|dropzone|drop zone|file picker)\b/.test(normalized)) {
      addRequirement({
        id: "req-ingest",
        label: "Input ingest flow",
        terms: ["import", "upload", "paste", "drop", "file"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && this.hasAuthenticationRequirement(normalized)) {
      addRequirement({
        id: "req-auth",
        label: "Authentication flow",
        terms: ["login", "sign in", "auth", "password", "account"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && /\b(settings|preferences|configuration|config)\b/.test(normalized)) {
      addRequirement({
        id: "req-settings",
        label: "Settings flow",
        terms: ["settings", "preferences", "configuration"],
        mode: "any"
      });
    }

    return requirements;
  }

  private extractExplicitPromptFilePaths(prompt: string, workingDirectory: string): string[] {
    const normalized = (prompt ?? "")
      .replace(/\[SOAK:[^\]]+\]/gi, " ")
      .replace(/\\/g, "/");
    if (!normalized.trim()) return [];

    const matches = normalized.match(/\b(?:[\w.-]+\/)*[\w.-]+\.(?:html|css|js|jsx|ts|tsx|json|md)\b/gi) ?? [];
    const requested = new Set<string>();

    for (const rawMatch of matches) {
      const cleaned = rawMatch.trim().replace(/^\.?\//, "");
      if (/^node\.js$/i.test(cleaned)) continue;
      if (!cleaned || cleaned.startsWith("../")) continue;
      const normalizedPath = cleaned.includes("/")
        ? cleaned
        : this.joinWorkspacePath(workingDirectory, cleaned);
      if (!this.isPathInsideWorkingDirectory(normalizedPath, workingDirectory)) continue;
      requested.add(normalizedPath);
    }

    return [...requested];
  }

  private isLockedBuilderPlan(plan: TaskExecutionPlan): boolean {
    return plan.builderMode === "crud" || plan.builderMode === "landing" || plan.builderMode === "dashboard" || plan.builderMode === "kanban";
  }

  private shouldPreferHeuristicImplementation(prompt: string, plan: TaskExecutionPlan): boolean {
    return this.isLockedBuilderPlan(plan)
      || this.isSimpleDesktopShellPrompt(prompt, plan)
      || this.isSimpleNotesAppPrompt(prompt, plan)
      || this.isSimpleGeneratedPackagePrompt(prompt, plan);
  }

  private isSimpleDesktopShellPrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (plan.workspaceKind !== "react") return false;
    if (!/\b(electron|desktop|tauri)\b/.test(normalized)) return false;
    if (this.isDesktopBusinessReportingPrompt(normalized)) return true;
    if (this.isSimpleDesktopUtilityPrompt(normalized)) return true;
    if (/\bsnippet\b/.test(normalized)) return true;
    if ((/\bvoice\b/.test(normalized) || /\brecording\b/.test(normalized)) && /\b(start recording|recording list|sidebar)\b/.test(normalized)) {
      return true;
    }
    return false;
  }

  private detectStarterPlaceholderSignals(content: string): string[] {
    const normalized = (content ?? "").toLowerCase();
    const markers = [
      { label: "open primary action", pattern: /open primary action/ },
      { label: "focused desktop shell", pattern: /focused desktop shell/ },
      { label: "shell guidance", pattern: /shell guidance/ },
      { label: "desktop starter app", pattern: /desktop starter app/ },
      { label: "react starter", pattern: /react starter/ },
      { label: "replace this starter shell", pattern: /replace this starter shell/ },
      { label: "replace starter content", pattern: /replace starter content/ },
      { label: "replace this with the product workflow", pattern: /replace this with the product workflow/ },
      { label: "ready for domain-specific screens", pattern: /ready for domain-specific screens/ },
      { label: "inspect sections", pattern: /inspect sections/ }
    ];
    return markers.filter((marker) => marker.pattern.test(normalized)).map((marker) => marker.label);
  }

  private isDesktopBusinessReportingPrompt(normalizedPrompt: string): boolean {
    const hasEntrySignals = /\b(daily entries?|daily records?|daily entry form|saved records?)\b/.test(normalizedPrompt);
    const hasBusinessContext = /\b(shop|store|retail|sales|performance|summary views?|reports?|record software)\b/.test(normalizedPrompt);
    const periods = ["daily", "weekly", "monthly", "quarterly", "yearly"].filter((term) => normalizedPrompt.includes(term));
    return hasEntrySignals && hasBusinessContext && periods.length >= 4;
  }

  private isSimpleDesktopUtilityPrompt(normalizedPrompt: string): boolean {
    const isFileRenamer = (
      /\b(file renamer|rename files?|rename action)\b/.test(normalizedPrompt)
      || (/\brename\b/.test(normalizedPrompt) && /\bfiles?\b/.test(normalizedPrompt))
    ) && /\b(folder picker|preview list|replace-text|replace text|filename preview)\b/.test(normalizedPrompt);

    const isPdfCombiner = /\bpdf\b/.test(normalizedPrompt)
      && /\b(combiner|merge|merge button|move-up|move-down|output path)\b/.test(normalizedPrompt);

    return isFileRenamer || isPdfCombiner;
  }

  private isSimpleNotesAppPrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    if (plan.builderMode !== "notes" || plan.workspaceKind !== "react") return false;
    const workingDirectory = (plan.workingDirectory ?? "").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return false;

    const normalized = (prompt ?? "").trim().toLowerCase();
    return /\b(notes?|journal|entries?)\b/.test(normalized)
      && /\b(add|create|edit|save|saved state|visible saved state)\b/.test(normalized);
  }

  private isSimpleGeneratedPackagePrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    if (plan.workspaceKind !== "generic") return false;
    const workingDirectory = (plan.workingDirectory ?? "").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return false;

    const normalized = (prompt ?? "").trim().toLowerCase();
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    if (promptArtifact === "api-service") {
      return /\bendpoints?\b/.test(normalized)
        && /\b(list|create|add|mark|assign|approve|pause|resume|ship|resolve|pack)\b/.test(normalized);
    }
    if (promptArtifact === "script-tool") {
      return /\b(command line|command-line|cli|tool)\b/.test(normalized)
        && /\b(reads?|parse|prints?|summary|grouped?|group|counts?|headers?|priority|json|csv|markdown|handoff|audit)\b/.test(normalized);
    }
    if (promptArtifact === "library") {
      return /\b(reusable|library|package|helpers?)\b/.test(normalized)
        && /\b(validation|validator|email|required|min[- ]?length|string guard|format|formatting|money|currency|refund|fees|tax|percent|percentage|compact counts?|compact numbers?|delta)\b/.test(normalized);
    }
    return false;
  }

  private isBuilderRecoveryPrimaryPlan(plan: TaskExecutionPlan): boolean {
    return plan.builderMode === "crud" || plan.builderMode === "dashboard" || plan.builderMode === "landing" || plan.builderMode === "kanban";
  }

  private async pruneUnexpectedGeneratedAppFiles(taskId: string, plan: TaskExecutionPlan): Promise<string[]> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return [];

    const allowed = new Set(this.getImplicitPlanAllowedPaths(plan).map((value) => value.replace(/\\/g, "/")));
    const entries = await this.listWorkspaceFiles(workingDirectory, 4);
    const conflicting = new Set(this.getConflictingScaffoldPaths(plan));
    const removable = entries
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path.replace(/\\/g, "/"))
      .filter((path) => conflicting.has(path) || this.isUnexpectedGeneratedAppFile(path, workingDirectory, allowed));

    const removed: string[] = [];
    for (const relPath of removable) {
      try {
        await rm(this.resolveWorkspacePath(relPath), { force: true });
        removed.push(relPath);
      } catch {
        // ignore cleanup failures; verification will expose remaining issues
      }
    }

    if (removed.length > 0) {
      this.appendLog(taskId, `Pruned unexpected generated app files: ${removed.join(", ")}`);
    }
    return removed;
  }

  private getConflictingScaffoldPaths(plan: Pick<TaskExecutionPlan, "workingDirectory" | "workspaceKind">): string[] {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (plan.workspaceKind === "static") {
      return [
        this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
        this.joinWorkspacePath(workingDirectory, "src/App.css"),
        this.joinWorkspacePath(workingDirectory, "src/index.css"),
        this.joinWorkspacePath(workingDirectory, "vite.config.ts"),
        this.joinWorkspacePath(workingDirectory, "eslint.config.js"),
        this.joinWorkspacePath(workingDirectory, "tsconfig.json"),
        this.joinWorkspacePath(workingDirectory, "tsconfig.app.json"),
        this.joinWorkspacePath(workingDirectory, "tsconfig.node.json")
      ];
    }

    if (plan.workspaceKind === "react") {
      return [
        this.joinWorkspacePath(workingDirectory, "styles.css"),
        this.joinWorkspacePath(workingDirectory, "app.js")
      ];
    }

    return [];
  }

  private async collectConflictingWorkspaceFiles(plan: Pick<TaskExecutionPlan, "workingDirectory" | "workspaceKind">): Promise<string[]> {
    const present: string[] = [];
    for (const targetPath of this.getConflictingScaffoldPaths(plan)) {
      try {
        await stat(this.resolveWorkspacePath(targetPath));
        present.push(targetPath);
      } catch {
        // ignore missing conflicting files
      }
    }
    return present;
  }

  private isUnexpectedGeneratedAppFile(path: string, workingDirectory: string, allowed: Set<string>): boolean {
    if (allowed.has(path)) return false;

    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith(`${workingDirectory}/`)) return false;
    if (
      normalized === `${workingDirectory}/vite.config.ts` ||
      normalized === `${workingDirectory}/eslint.config.js` ||
      normalized === `${workingDirectory}/tsconfig.json` ||
      normalized === `${workingDirectory}/tsconfig.app.json` ||
      normalized === `${workingDirectory}/tsconfig.node.json`
    ) return false;

    if (/\/node_modules\//i.test(normalized) || /\/dist\//i.test(normalized) || /\/public\//i.test(normalized)) return false;
    if (/\/src\/assets\//i.test(normalized)) return false;
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|lock|md|json)$/i.test(normalized)) return false;

    return (
      /\.(ts|tsx|js|jsx|css|scss|html)$/i.test(normalized) &&
      (
        normalized.startsWith(`${workingDirectory}/src/`) ||
        /^[^/]+\.(ts|tsx|js|jsx)$/i.test(normalized.slice(workingDirectory.length + 1))
      )
    );
  }

  private async detectWorkspaceKind(workingDirectory: string): Promise<"static" | "react" | "generic"> {
    const staticFiles = [
      this.joinWorkspacePath(workingDirectory, "index.html"),
      this.joinWorkspacePath(workingDirectory, "styles.css"),
      this.joinWorkspacePath(workingDirectory, "app.js")
    ];
    const reactFiles = [
      this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/App.tsx")
    ];

    const hasStatic = await this.allFilesExist(staticFiles);
    if (hasStatic) return "static";
    const hasReact = await this.allFilesExist(reactFiles);
    if (hasReact) return "react";
    return "generic";
  }

  private resolveWorkspaceKindForPrompt(
    prompt: string,
    detectedKind: "static" | "react" | "generic",
    requestedPaths: string[]
  ): "static" | "react" | "generic" {
    const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalizedPrompt);
    const requestedNames = new Set(
      requestedPaths
        .map((path) => path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "")
        .filter(Boolean)
    );
    const requestsDesktopFiles = requestedNames.has("main.js")
      || requestedNames.has("preload.js")
      || requestedNames.has("renderer.js");

    if (
      promptArtifact === "desktop-app"
      || requestsDesktopFiles
      || /\b(electron|desktop app|desktop application)\b/.test(normalizedPrompt)
    ) {
      return "react";
    }

    const requestsStaticFiles = requestedNames.has("index.html")
      && (requestedNames.has("styles.css") || requestedNames.has("app.js"));
    if (
      requestsStaticFiles
      || /\bstatic (?:site|page|demo|landing page|website)\b/.test(normalizedPrompt)
      || /\bpricing page\b/.test(normalizedPrompt)
      || /\bmicrosite\b/.test(normalizedPrompt)
      || /\bshowcase page\b/.test(normalizedPrompt)
      || /\bmarketing page\b/.test(normalizedPrompt)
      || /\bhtml\s+css\b/.test(normalizedPrompt)
      || /\bvanilla (?:js|javascript)\b/.test(normalizedPrompt)
    ) {
      return "static";
    }

    const requestsReactFiles = requestedNames.has("src/main.tsx")
      || requestedNames.has("main.tsx")
      || requestedNames.has("src/app.tsx")
      || requestedNames.has("app.tsx");
    if (
      requestsReactFiles
      || /\breact app|vite app|kanban|task board\b/.test(normalizedPrompt)
      || /\breact\b/.test(normalizedPrompt)
      || /\btsx\b/.test(normalizedPrompt)
    ) {
      return "react";
    }

    return detectedKind;
  }

  private async allFilesExist(paths: string[]): Promise<boolean> {
    for (const targetPath of paths) {
      try {
        await stat(this.resolveWorkspacePath(targetPath));
      } catch {
        return false;
      }
    }
    return true;
  }

  private buildTaskWorkItems(
    prompt: string,
    workingDirectory: string,
    workspaceKind: "static" | "react" | "generic",
    requestedPaths: string[] = [],
    spec?: TaskExecutionSpec,
    repositoryContext?: TaskRepositoryContext
  ): TaskWorkItem[] {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    const targetHint = workingDirectory && workingDirectory !== "." ? ` inside ${workingDirectory}` : "";
    const sharedPaths = [this.joinWorkspacePath(workingDirectory, "package.json")];
    const staticPaths = [
      ...sharedPaths,
      this.joinWorkspacePath(workingDirectory, "index.html"),
      this.joinWorkspacePath(workingDirectory, "styles.css"),
      this.joinWorkspacePath(workingDirectory, "app.js")
    ];
    const reactPaths = [
      ...sharedPaths,
      this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/App.css"),
      this.joinWorkspacePath(workingDirectory, "src/index.css"),
      this.joinWorkspacePath(workingDirectory, "index.html")
    ];
    const scriptToolPaths = [
      ...sharedPaths,
      this.joinWorkspacePath(workingDirectory, "src/index.js"),
      this.joinWorkspacePath(workingDirectory, "src/index.ts"),
      this.joinWorkspacePath(workingDirectory, "bin/cli.js"),
      this.joinWorkspacePath(workingDirectory, "bin/cli.mjs"),
      this.joinWorkspacePath(workingDirectory, "README.md")
    ];
    const libraryPaths = [
      ...sharedPaths,
      this.joinWorkspacePath(workingDirectory, "src/index.ts"),
      this.joinWorkspacePath(workingDirectory, "src/index.js"),
      this.joinWorkspacePath(workingDirectory, "README.md")
    ];
    const servicePaths = [
      ...sharedPaths,
      this.joinWorkspacePath(workingDirectory, "src/server.js"),
      this.joinWorkspacePath(workingDirectory, "src/server.ts"),
      this.joinWorkspacePath(workingDirectory, "src/index.js"),
      this.joinWorkspacePath(workingDirectory, "src/index.ts"),
      this.joinWorkspacePath(workingDirectory, "README.md")
    ];
    const requested = requestedPaths.filter((path) => this.isPathInsideWorkingDirectory(path, workingDirectory));
    const staticAllowedPaths = [...new Set([...staticPaths, ...requested])];
    const reactAllowedPaths = [...new Set([...reactPaths, ...requested])];
    const scriptToolAllowedPaths = [...new Set([...scriptToolPaths, ...requested])];
    const libraryAllowedPaths = [...new Set([...libraryPaths, ...requested])];
    const serviceAllowedPaths = [...new Set([...servicePaths, ...requested])];
    const preferredPaths = workspaceKind === "static"
      ? staticAllowedPaths
      : workspaceKind === "react"
        ? reactAllowedPaths
        : promptArtifact === "script-tool"
          ? scriptToolAllowedPaths
          : promptArtifact === "library"
            ? libraryAllowedPaths
            : promptArtifact === "api-service"
              ? serviceAllowedPaths
            : reactAllowedPaths;
    const executionBrief = spec
      ? ` Domain focus: ${this.describeDomainFocus(spec.domainFocus)}. Deliverables: ${spec.deliverables.join("; ")}. Acceptance: ${spec.acceptanceCriteria.join(" ")}.`
      : "";
    const repoBrief = repositoryContext?.conventions.length
      ? ` Repository conventions: ${repositoryContext.conventions.join(" ")}`
      : repositoryContext?.summary
        ? ` ${repositoryContext.summary}`
        : "";

    if (["kanban", "task board"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build kanban layout",
          instruction: `Create the main kanban board layout${targetHint} with todo, in progress, and done columns plus clear task cards.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add task creation and status flow",
          instruction: `Implement add-task and status-change interactions${targetHint}. Users should be able to create a task and move it between visible columns.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish board design",
          instruction: `Improve the kanban board styling${targetHint} so it feels intentional, readable, and responsive.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term))) {
      const items: TaskWorkItem[] = [
        {
          title: "Build notes interface",
          instruction: `Create or improve the main notes app interface${targetHint}. Replace starter content with a real notes experience.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        }
      ];
      if (normalized.includes("add") || normalized.includes("create")) {
        items.push({
          title: "Add note creation flow",
          instruction: `Implement a reliable add-note flow${targetHint}. Users should be able to enter a note title and body and save it into the visible notes list.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("search")) {
        items.push({
          title: "Add search and filtering",
          instruction: `Implement note search/filtering${targetHint}. Searching should reduce the visible notes list based on title or body matches.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("delete") || normalized.includes("remove")) {
        items.push({
          title: "Add note deletion",
          instruction: `Add note deletion controls${targetHint}. Users should be able to remove notes from the list cleanly.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("ui") || normalized.includes("design") || normalized.includes("improve")) {
        items.push({
          title: "Polish visual design",
          instruction: `Improve layout and styling${targetHint}. Make the notes UI feel intentional, clean, and responsive.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        });
      }
      return items;
    }

    if (
      promptArtifact === "script-tool"
      || promptArtifact === "library"
      || promptArtifact === "api-service"
      || promptArtifact === "desktop-app"
    ) {
      return [{
        title: "Implement requested changes",
        instruction: `Implement the requested ${promptArtifact.replace(/-/g, " ")} updates${targetHint}. Keep the solution inside the planned package files and avoid unrelated UI scaffolding.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }];
    }

    if (["landing page", "website", "site"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build page structure",
          instruction: `Create the main page layout${targetHint} with complete sections and usable content.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish visual design",
          instruction: `Improve styling and hierarchy${targetHint} so the interface looks intentional and responsive.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["dashboard", "admin panel", "analytics"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build dashboard structure",
          instruction: `Create the main dashboard layout${targetHint} with stats, activity, and clear navigation areas.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add data cards and tables",
          instruction: `Add dashboard content blocks${targetHint} including metric cards, a simple chart area, and recent activity or table rows.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish dashboard design",
          instruction: `Improve dashboard styling${targetHint} so it feels clear, intentional, and responsive.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["crud", "inventory app", "contacts app", "admin tool", "record manager"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build CRUD layout",
          instruction: `Create the main CRUD app layout${targetHint} with a clear form area, records list, and useful summary section.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add create, edit, and delete flows",
          instruction: `Implement create, edit, and delete interactions${targetHint}. Users should be able to manage visible records cleanly from the interface.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish CRUD experience",
          instruction: `Improve the CRUD app styling${targetHint} so it feels intentional, responsive, and easy to scan.${executionBrief}${repoBrief}`,
          allowedPaths: preferredPaths
        }
      ];
    }

    return [
      {
        title: "Implement requested changes",
        instruction: `${prompt}${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
  }

  private extractPromptTerms(prompt: string): string[] {
    const stopWords = new Set([
      "the", "and", "for", "with", "this", "that", "then", "build", "fix", "current", "workspace", "apply",
      "minimal", "safe", "changes", "confirm", "result", "verify", "launch", "cleanly", "app"
    ]);
    return (prompt.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [])
      .filter((term) => !stopWords.has(term))
      .filter((term, index, arr) => arr.indexOf(term) === index)
      .slice(0, 10);
  }

  private async requestTaskImplementation(
    taskId: string,
    userPrompt: string,
    plan: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): Promise<FixResponse> {
    const taskAttachments = this.getTaskAttachments(taskId);
    const routes = this.resolveModelRoutes("Implementation", {
      requiresVision: this.taskRequiresVisionRoute(taskId)
    });
    const contextFiles = await this.collectImplementationContextFiles(plan, workItem);
    const repositoryContext = plan.repositoryContext ?? {
      summary: "Preserve the current workspace layout and conventions.",
      workspaceShape: "unknown" as const,
      packageManager: "unknown" as const,
      languageStyle: "unknown" as const,
      moduleFormat: "unknown" as const,
      uiFramework: "unknown" as const,
      styling: "unknown" as const,
      testing: "unknown" as const,
      linting: "unknown" as const,
      conventions: []
    };
    if (contextFiles.length === 0) {
      return { summary: "No planned files were available for implementation.", edits: [] };
    }

    this.appendLog(taskId, `Implementation model candidates: ${routes.map((route) => route.model).join(", ")}`);
    this.appendLog(taskId, `Implementation context files: ${contextFiles.map((file) => file.path).join(", ")}`);

    const messages = this.buildTaskPromptMessages(
      [
        `Task: ${userPrompt}`,
        `Working directory: ${plan.workingDirectory}`,
        `Repository context: ${repositoryContext.summary}`,
        ...(repositoryContext.conventions.length > 0
          ? ["Repository conventions:", ...repositoryContext.conventions.map((item) => `- ${item}`), ""]
          : []),
        ...(plan.spec
          ? [
            `Starter profile: ${plan.spec.starterProfile}`,
            `Required files: ${plan.spec.requiredFiles.join(", ") || "(none)"}`,
            `Required scripts: ${plan.spec.requiredScriptGroups.map((group) => `${group.label} => ${group.options.join(" | ")}`).join("; ") || "(none)"}`,
            `Acceptance: ${plan.spec.acceptanceCriteria.join(" ") || "(none)"}`,
            `Quality gates: ${plan.spec.qualityGates.join(" ") || "(none)"}`,
            ""
          ]
          : []),
        taskAttachments.length > 0 ? `Task attachments: ${taskAttachments.map((attachment) => attachment.name).join(", ")}` : "",
        "",
        `Allowed edit paths: ${this.getScopedCandidateFiles(plan, workItem).join(", ") || "(none)"}`,
        "",
        "Workspace manifest:",
        ...(plan.workspaceManifest.length > 0 ? plan.workspaceManifest : ["(manifest unavailable)"]),
        "",
        "Workspace file context:",
        ...contextFiles.flatMap((file) => [
          `--- FILE: ${file.path} ---`,
          file.content
        ])
      ].filter(Boolean).join("\n"),
      taskAttachments,
      "You are a precise coding agent. Implement the user's request using the provided workspace files and manifest. " +
        `You may create new files only inside the working directory "${plan.workingDirectory}". ` +
        `Follow these repository conventions when possible: ${repositoryContext.conventions.join(" ") || repositoryContext.summary}. ` +
        `${plan.spec?.starterProfile === "electron-desktop"
          ? "This is a strict Electron desktop task. Do not return a static site, landing page, or python http.server scaffold. The output must remain desktop-first and packaging-ready, including package:win when Windows packaging is required. "
          : ""}` +
        "Return only strict JSON with shape {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
        "Do not include markdown fences or prose outside JSON. Do not emit edits for files that do not need changes. " +
        "Every edit path must stay inside the allowed planned files for this work item."
    );

    const exhaustedImplementationRoutes = new Set<string>();
    const getAvailableRoutes = (): ModelRoute[] => routes.filter(
      (route) => !exhaustedImplementationRoutes.has(route.model) && !this.isTaskModelBlacklisted(taskId, route.model)
    );
    const markCurrentImplementationRouteExhausted = (): void => {
      const currentRoute = this.taskStageRoutes.get(taskId)?.get("Implementation");
      if (currentRoute?.route.model) {
        exhaustedImplementationRoutes.add(currentRoute.route.model);
      }
    };
    const hasRemainingRoutes = (): boolean => getAvailableRoutes().length > 0;
    let lastFailure = "Implementation model did not produce valid structured edits.";

    for (let semanticRouteAttempt = 1; semanticRouteAttempt <= routes.length; semanticRouteAttempt += 1) {
      const initialResponse = await this.sendFixModelRequest(taskId, getAvailableRoutes(), messages, "initial", "Implementation");
      let initialParsed: ParsedFixResponse | null;
      try {
        initialParsed = this.tryParseFixResponse(initialResponse, "Implementation", { strictSchema: true });
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : "Implementation model returned an empty response.";
        this.recordSemanticModelFailure(taskId, "Implementation", lastFailure);
        markCurrentImplementationRouteExhausted();
        if (!hasRemainingRoutes()) {
          break;
        }
        this.appendLog(taskId, `${lastFailure} Trying next implementation model route...`);
        continue;
      }
      if (initialParsed?.fix) {
        this.appendLog(taskId, `Implementation JSON extracted (${initialParsed.extractedJson.length} chars).`);
        const validation = this.validateImplementationEdits(initialParsed.fix, plan, workItem);
        if (validation.fix) {
          return validation.fix;
        }
        this.recordSemanticModelFailure(taskId, "Implementation", validation.message);
        this.appendLog(taskId, `${validation.message} Retrying with strict-schema implementation prompt...`);
      }
      else if (initialParsed?.issue === "schema-mismatch") {
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response did not match the strict schema contract.");
        this.appendLog(taskId, "Initial implementation response did not match the strict schema contract. Retrying with strict-schema implementation prompt...");
      }
      else if (initialParsed?.issue === "no-usable-edits") {
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response contained valid JSON but no usable edits.");
        this.appendLog(taskId, "Initial implementation response contained valid JSON but no usable edits. Retrying with strict-schema implementation prompt...");
      } else {
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response was not valid strict structured JSON.");
        this.appendLog(taskId, "Initial implementation response was not valid strict structured JSON. Retrying with strict-schema implementation prompt...");
      }

      const retryMessages = [
        ...messages,
        {
          role: "user",
          content:
            "Your last reply did not satisfy the strict implementation contract. Reply again with only one raw JSON object and no explanation. " +
            "Do not wrap the JSON in markdown fences, commentary, labels, or surrounding prose. " +
            "Use exactly this shape: {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
            "Do not rename fields and do not use alternate keys such as files, changes, file, filename, text, value, lines, or contentLines. " +
            `Every edit path must be one of: ${this.getScopedCandidateFiles(plan, workItem).join(", ") || "(none)"}. ` +
            `Last reply to repair:\n${initialResponse}`
        }
      ];
      const retryResponse = await this.sendFixModelRequest(taskId, getAvailableRoutes(), retryMessages, "json-retry", "Implementation");
      let retryParsed: ParsedFixResponse | null;
      try {
        retryParsed = this.tryParseFixResponse(retryResponse, "Implementation", { strictSchema: true });
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : "Implementation model returned an empty response after retry.";
        this.recordSemanticModelFailure(taskId, "Implementation", lastFailure);
        markCurrentImplementationRouteExhausted();
        if (!hasRemainingRoutes()) {
          break;
        }
        this.appendLog(taskId, `${lastFailure} Trying next implementation model route...`);
        continue;
      }
      if (retryParsed?.fix) {
        this.appendLog(taskId, `Implementation JSON extracted after retry (${retryParsed.extractedJson.length} chars).`);
        const validation = this.validateImplementationEdits(retryParsed.fix, plan, workItem);
        if (validation.fix) {
          return validation.fix;
        }
        lastFailure = "Implementation model returned invalid scoped edits after retry.";
        this.recordSemanticModelFailure(taskId, "Implementation", `${validation.message} after retry.`);
      } else if (retryParsed?.issue === "no-usable-edits") {
        lastFailure = "Implementation model returned JSON without usable edits after retry.";
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response contained valid JSON but no usable edits after retry.");
      } else if (retryParsed?.issue === "schema-mismatch") {
        lastFailure = "Implementation model returned JSON that did not match the strict schema after retry.";
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response did not match the strict schema contract after retry.");
      } else {
        lastFailure = "Implementation model returned malformed JSON after retry.";
        this.recordSemanticModelFailure(taskId, "Implementation", "Implementation response was malformed JSON after retry.");
      }

      markCurrentImplementationRouteExhausted();
      if (!hasRemainingRoutes()) {
        break;
      }

      this.appendLog(taskId, `${lastFailure} Trying next implementation model route...`);
    }

    throw new Error(lastFailure);
  }

  private validateImplementationEdits(
    fix: FixResponse,
    plan: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): { fix?: FixResponse; message: string } {
    const validation = this.inspectStructuredEdits(fix.edits, plan, workItem);
    if (validation.acceptedEdits.length === 0) {
      return {
        message: `Implementation response contained no usable scoped edits. ${this.describeRejectedEdits(validation.rejectedEdits)}`
      };
    }
    if (validation.rejectedEdits.length > 0) {
      return {
        message: `Implementation response included invalid edit payloads. ${this.describeRejectedEdits(validation.rejectedEdits)}`
      };
    }
    return {
      fix: {
        summary: fix.summary,
        edits: validation.acceptedEdits
      },
      message: ""
    };
  }

  private async collectImplementationContextFiles(
    plan: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): Promise<Array<{ path: string; content: string }>> {
    const contextFiles: Array<{ path: string; content: string }> = [];
    const candidatePaths = new Set<string>(this.getScopedCandidateFiles(plan, workItem));

    for (const relPath of candidatePaths) {
      if (contextFiles.length >= MAX_CONTEXT_FILES) break;
      try {
        const result = await this.readWorkspaceFile(relPath);
        contextFiles.push({ path: result.path, content: result.content });
      } catch {
        // skip unreadable files
      }
    }

    return contextFiles;
  }

  private getScopedCandidateFiles(plan: TaskExecutionPlan, workItem?: TaskWorkItem): string[] {
    const scoped = (workItem?.allowedPaths ?? []).filter(Boolean);
    if (scoped.length > 0) {
      return [...new Set(scoped)];
    }

    return this.getImplicitPlanAllowedPaths(plan);
  }

  private getImplicitPlanAllowedPaths(plan: TaskExecutionPlan): string[] {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    const allowed = new Set<string>((plan.candidateFiles ?? []).map((value) => value.trim()).filter(Boolean));
    const requested = (plan.requestedPaths ?? []).map((value) => value.trim()).filter(Boolean);
    const required = (plan.spec?.requiredFiles ?? []).map((value) => value.trim()).filter(Boolean);

    allowed.add(this.joinWorkspacePath(workingDirectory, "package.json"));

    for (const path of [...requested, ...required]) {
      if (path) allowed.add(path);
    }

    if (plan.workspaceKind === "react") {
      allowed.add(this.joinWorkspacePath(workingDirectory, "index.html"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "src/main.tsx"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "src/App.tsx"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "src/App.css"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "src/index.css"));
      if (plan.spec?.starterProfile === "electron-desktop") {
        allowed.add(this.joinWorkspacePath(workingDirectory, "electron/main.mjs"));
        allowed.add(this.joinWorkspacePath(workingDirectory, "electron/preload.mjs"));
        allowed.add(this.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
      }
    } else if (plan.workspaceKind === "static") {
      allowed.add(this.joinWorkspacePath(workingDirectory, "index.html"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "styles.css"));
      allowed.add(this.joinWorkspacePath(workingDirectory, "app.js"));
    }

    return [...allowed];
  }

  private filterValidEdits(
    edits: StructuredEdit[],
    plan?: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): StructuredEdit[] {
    return this.inspectStructuredEdits(edits, plan, workItem).acceptedEdits;
  }

  private inspectStructuredEdits(
    edits: StructuredEdit[],
    plan?: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): StructuredEditValidationResult {
    const allowed = new Set(plan ? this.getImplicitPlanAllowedPaths(plan).map((value) => value.trim()).filter(Boolean) : []);
    const workItemAllowed = new Set((workItem?.allowedPaths ?? []).map((value) => value.trim()).filter(Boolean));
    const workingDirectory = (plan?.workingDirectory ?? ".").trim() || ".";
    const acceptedEdits: StructuredEdit[] = [];
    const rejectedEdits: Array<{ path: string; reason: string }> = [];

    for (const edit of edits) {
      const path = this.normalizeEditPathForPlan(edit.path, plan);
      const content = edit.content.trim();
      if (!path) {
        rejectedEdits.push({ path: edit.path ?? "(empty path)", reason: "missing path" });
        continue;
      }
      if (!content) {
        rejectedEdits.push({ path, reason: "empty content" });
        continue;
      }
      if (/^relative\/path$/i.test(path) || /^path\/to\/file/i.test(path)) {
        rejectedEdits.push({ path, reason: "placeholder path" });
        continue;
      }
      if (/^full file content$/i.test(content) || /^replace with actual/i.test(content)) {
        rejectedEdits.push({ path, reason: "placeholder content" });
        continue;
      }
      if (
        workItemAllowed.size > 0
        && !workItemAllowed.has(path)
        && !this.isImplicitlyAllowedGeneratedPackagePath(path, plan)
      ) {
        rejectedEdits.push({ path, reason: "outside allowed work item files" });
        continue;
      }
      if (plan && workItemAllowed.size === 0 && !allowed.has(path)) {
        rejectedEdits.push({ path, reason: "outside planned files" });
        continue;
      }
      if (!plan && !allowed.has(path) && !this.isPathInsideWorkingDirectory(path, workingDirectory)) {
        rejectedEdits.push({ path, reason: "outside working directory" });
        continue;
      }

      acceptedEdits.push({
        path,
        content: edit.content
      });
    }

    return { acceptedEdits, rejectedEdits };
  }

  private isImplicitlyAllowedGeneratedPackagePath(path: string, plan?: TaskExecutionPlan): boolean {
    if (!plan || plan.workspaceKind !== "generic") return false;
    const workingDirectory = (plan.workingDirectory ?? ".").trim().replace(/\\/g, "/");
    if (!workingDirectory || workingDirectory === ".") return false;
    if (!this.isPathInsideWorkingDirectory(path, workingDirectory)) return false;

    const relativePath = path
      .replace(/\\/g, "/")
      .replace(new RegExp(`^${this.escapeRegExp(workingDirectory.replace(/^\.?\//, ""))}/?`), "")
      .replace(/^\.?\//, "");

    return /^(src|bin|scripts)\/[A-Za-z0-9._/-]+\.(?:[cm]?[jt]sx?|json)$/i.test(relativePath)
      || /^(README|readme)(?:\.[A-Za-z0-9._-]+)?$/i.test(relativePath)
      || /^package\.json$/i.test(relativePath);
  }

  private describeRejectedEdits(rejectedEdits: Array<{ path: string; reason: string }>): string {
    if (rejectedEdits.length === 0) {
      return "No accepted edits matched the allowed files.";
    }
    const preview = rejectedEdits
      .slice(0, 3)
      .map((edit) => `${edit.path} (${edit.reason})`)
      .join(", ");
    return rejectedEdits.length > 3
      ? `Rejected edits: ${preview}, and ${rejectedEdits.length - 3} more.`
      : `Rejected edits: ${preview}.`;
  }

  private normalizeEditPathForPlan(rawPath: string, plan?: TaskExecutionPlan): string {
    const normalized = (rawPath ?? "").trim().replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!normalized) return "";
    const workingDirectory = (plan?.workingDirectory ?? ".").trim().replace(/\\/g, "/").replace(/^\.?\//, "") || ".";
    if (!plan || workingDirectory === "." || normalized.startsWith(`${workingDirectory}/`) || normalized === workingDirectory) {
      return normalized;
    }

    const directCandidate = plan.candidateFiles.find((candidate) => candidate.replace(/\\/g, "/").endsWith(`/${normalized}`) || candidate.replace(/\\/g, "/") === normalized);
    if (directCandidate) return directCandidate.replace(/\\/g, "/");

    return this.joinWorkspacePath(workingDirectory, normalized);
  }

  private hasUsefulImplementation(implementation: FixResponse, workItem: TaskWorkItem): boolean {
    void workItem;
    return implementation.edits.length > 0;
  }

  private isPathInsideWorkingDirectory(path: string, workingDirectory: string): boolean {
    const normalizedPath = path.replace(/\\/g, "/").replace(/^\.?\//, "");
    const normalizedWorkingDirectory = workingDirectory.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!normalizedPath) return false;
    if (!normalizedWorkingDirectory || normalizedWorkingDirectory === ".") return true;
    return normalizedPath === normalizedWorkingDirectory || normalizedPath.startsWith(`${normalizedWorkingDirectory}/`);
  }

  private isCandidatePathRelevant(
    path: string,
    workspaceKind: "static" | "react" | "generic",
    workingDirectory: string
  ): boolean {
    if (!this.isPathInsideWorkingDirectory(path, workingDirectory)) return false;

    const normalizedPath = path.replace(/\\/g, "/");
    if (workspaceKind === "static") {
      return !/\/src\//i.test(normalizedPath);
    }
    if (workspaceKind === "react") {
      return !/(^|\/)(styles\.css|app\.js)$/i.test(normalizedPath);
    }
    return true;
  }

  private async buildWorkspaceManifest(targetPath = "."): Promise<string[]> {
    try {
      const entries = await this.listWorkspaceFiles(targetPath, 3);
      return entries
        .slice(0, 120)
        .map((entry) => `${entry.type === "directory" ? "dir" : "file"}: ${entry.path}`);
    } catch {
      return [];
    }
  }

  private async tryHeuristicImplementation(
    taskId: string,
    prompt: string,
    plan: TaskExecutionPlan
  ): Promise<HeuristicImplementationResult | null> {
    const kanbanBoard = this.buildHeuristicKanbanBoard(prompt, plan);
    if (kanbanBoard) {
      this.appendLog(taskId, `Using heuristic kanban implementation for ${plan.workingDirectory}.`);
      return kanbanBoard;
    }

    const desktopWorkspace = this.buildHeuristicDesktopWorkspace(prompt, plan);
    if (desktopWorkspace) {
      this.appendLog(taskId, `Using heuristic desktop workspace implementation for ${plan.workingDirectory}.`);
      return desktopWorkspace;
    }

    const notesApp = this.buildHeuristicNotesApp(prompt, plan);
    if (notesApp) {
      this.appendLog(taskId, `Using heuristic notes app implementation for ${plan.workingDirectory}.`);
      return notesApp;
    }

    const scriptTool = this.buildHeuristicScriptTool(prompt, plan);
    if (scriptTool) {
      this.appendLog(taskId, `Using heuristic script-tool implementation for ${plan.workingDirectory}.`);
      return scriptTool;
    }

    const library = this.buildHeuristicLibrary(prompt, plan);
    if (library) {
      this.appendLog(taskId, `Using heuristic library implementation for ${plan.workingDirectory}.`);
      return library;
    }

    const apiService = this.buildHeuristicApiService(prompt, plan);
    if (apiService) {
      this.appendLog(taskId, `Using heuristic API service implementation for ${plan.workingDirectory}.`);
      return apiService;
    }

    const landingPage = this.buildHeuristicLandingPage(prompt, plan);
    if (landingPage) {
      this.appendLog(taskId, `Using heuristic landing page implementation for ${plan.workingDirectory}.`);
      return landingPage;
    }

    const pricingPage = this.buildHeuristicPricingPage(prompt, plan);
    if (pricingPage) {
      this.appendLog(taskId, `Using heuristic pricing page implementation for ${plan.workingDirectory}.`);
      return pricingPage;
    }

    const announcementPage = this.buildHeuristicAnnouncementPage(prompt, plan);
    if (announcementPage) {
      this.appendLog(taskId, `Using heuristic announcement page implementation for ${plan.workingDirectory}.`);
      return announcementPage;
    }

    const dashboard = this.buildHeuristicDashboard(prompt, plan);
    if (dashboard) {
      this.appendLog(taskId, `Using heuristic dashboard implementation for ${plan.workingDirectory}.`);
      return dashboard;
    }

    const crudApp = this.buildHeuristicCrudApp(prompt, plan);
    if (crudApp) {
      this.appendLog(taskId, `Using heuristic CRUD app implementation for ${plan.workingDirectory}.`);
      return crudApp;
    }

    const renameMatch = this.extractSimpleRenameInstruction(prompt);
    if (!renameMatch) {
      this.appendLog(taskId, "No heuristic implementation fallback matched this prompt.");
      return null;
    }

    const contextFiles = await this.collectImplementationContextFiles(plan);
    const edits: StructuredEdit[] = [];

    for (const file of contextFiles) {
      if (!file.content.includes(renameMatch.from)) continue;
      const updated = file.content.split(renameMatch.from).join(renameMatch.to);
      if (updated === file.content) continue;
      edits.push({ path: file.path, content: updated });
    }

    if (edits.length === 0) {
      this.appendLog(taskId, `Heuristic rename fallback found no matches for "${renameMatch.from}".`);
      return null;
    }

    return {
      summary: `Replaced "${renameMatch.from}" with "${renameMatch.to}" in ${edits.length} planned file(s).`,
      edits
    };
  }

  private buildHeuristicDesktopWorkspace(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsDesktop = /\b(electron|desktop|tauri)\b/.test(normalized);
    if (!wantsDesktop || plan.workspaceKind !== "react") return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const isSnippetManager = normalized.includes("snippet");
    const isVoiceWorkspace = normalized.includes("voice") || normalized.includes("recording");
    const isBusinessReportingWorkspace = this.isDesktopBusinessReportingPrompt(normalized);
    const isFileRenamer = this.isSimpleDesktopUtilityPrompt(normalized)
      && (/\b(file renamer|rename files?|rename action)\b/.test(normalized)
        || (/\brename\b/.test(normalized) && /\bfiles?\b/.test(normalized)));
    const isPdfCombiner = this.isSimpleDesktopUtilityPrompt(normalized)
      && /\bpdf\b/.test(normalized)
      && /\b(combiner|merge)\b/.test(normalized);
    if (plan.builderMode === "notes" && !isVoiceWorkspace) return null;

    const appContent = isBusinessReportingWorkspace
      ? `import { useMemo, useState } from "react";
import "./App.css";

type DailyRecord = {
  id: number;
  date: string;
  sales: number;
  expenses: number;
  orders: number;
  note: string;
};

type RecordDraft = {
  date: string;
  sales: string;
  expenses: string;
  orders: string;
  note: string;
};

const initialRecords: DailyRecord[] = [
  { id: 1, date: "2026-04-01", sales: 1680, expenses: 540, orders: 21, note: "Promo bundle moved quickly." },
  { id: 2, date: "2026-04-03", sales: 1540, expenses: 510, orders: 18, note: "Weekend stock refill." },
  { id: 3, date: "2026-04-05", sales: 1920, expenses: 640, orders: 25, note: "Higher walk-in traffic after noon." },
  { id: 4, date: "2026-04-06", sales: 1760, expenses: 590, orders: 22, note: "Strong repeat-customer sales." }
];

const defaultDraft: RecordDraft = {
  date: "2026-04-07",
  sales: "1840",
  expenses: "620",
  orders: "24",
  note: "Daily close captured for the evening shift."
};

function startOfQuarter(date: Date): Date {
  const month = date.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export default function App() {
  const [records, setRecords] = useState<DailyRecord[]>(initialRecords);
  const [draft, setDraft] = useState<RecordDraft>(defaultDraft);

  const latestDate = useMemo(() => {
    const dates = records.map((record) => new Date(record.date));
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }, [records]);

  const summary = useMemo(() => {
    const latestWeekStart = new Date(latestDate);
    latestWeekStart.setDate(latestDate.getDate() - 6);
    const latestMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const latestQuarterStart = startOfQuarter(latestDate);
    const latestYearStart = new Date(latestDate.getFullYear(), 0, 1);

    const filterRange = (start: Date, end: Date) => records.filter((record) => {
      const date = new Date(record.date);
      return date >= start && date <= end;
    });

    const buildTotals = (items: DailyRecord[]) => {
      const sales = items.reduce((sum, item) => sum + item.sales, 0);
      const expenses = items.reduce((sum, item) => sum + item.expenses, 0);
      const orders = items.reduce((sum, item) => sum + item.orders, 0);
      return { sales, expenses, orders, profit: sales - expenses };
    };

    const latestDayRecords = records.filter((record) => sameDay(new Date(record.date), latestDate));

    return {
      daily: buildTotals(latestDayRecords),
      weekly: buildTotals(filterRange(latestWeekStart, latestDate)),
      monthly: buildTotals(filterRange(latestMonthStart, latestDate)),
      quarterly: buildTotals(filterRange(latestQuarterStart, latestDate)),
      yearly: buildTotals(filterRange(latestYearStart, latestDate))
    };
  }, [latestDate, records]);

  const handleDraftChange = (field: keyof RecordDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleAddRecord = () => {
    setRecords((current) => [
      {
        id: Date.now(),
        date: draft.date,
        sales: Number(draft.sales) || 0,
        expenses: Number(draft.expenses) || 0,
        orders: Number(draft.orders) || 0,
        note: draft.note.trim() || "Daily entry captured."
      },
      ...current
    ]);
    setDraft(defaultDraft);
  };

  const reportCards = [
    { title: "Daily summary", totals: summary.daily },
    { title: "Weekly report", totals: summary.weekly },
    { title: "Monthly report", totals: summary.monthly },
    { title: "Quarterly report", totals: summary.quarterly },
    { title: "Yearly report", totals: summary.yearly }
  ];

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handleAddRecord}>Add daily entry</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#daily-entry">Daily entry</a>
          <a href="#saved-records">Saved records</a>
          <a href="#reports">Reporting views</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header className="desktop-header">
          <div>
            <p className="desktop-kicker">Shop record software</p>
            <h2>Enter daily records and auto-generate reporting views</h2>
            <p>Capture one daily entry at a time, keep a saved records list, and let the app roll totals into weekly, monthly, quarterly, and yearly performance.</p>
          </div>
          <div className="desktop-meta">
            <span>{records.length} saved records</span>
            <span>Latest close: {latestDate.toLocaleDateString()}</span>
          </div>
        </header>

        <section className="desktop-columns">
          <section id="daily-entry" className="desktop-panel">
            <p className="desktop-kicker">Daily entry</p>
            <h3>Record the day</h3>
            <div className="desktop-form-grid">
              <label className="desktop-field">
                Date
                <input value={draft.date} onChange={(event) => handleDraftChange("date", event.target.value)} />
              </label>
              <label className="desktop-field">
                Sales
                <input value={draft.sales} onChange={(event) => handleDraftChange("sales", event.target.value)} />
              </label>
              <label className="desktop-field">
                Expenses
                <input value={draft.expenses} onChange={(event) => handleDraftChange("expenses", event.target.value)} />
              </label>
              <label className="desktop-field">
                Orders
                <input value={draft.orders} onChange={(event) => handleDraftChange("orders", event.target.value)} />
              </label>
            </div>
            <label className="desktop-field">
              Daily note
              <textarea value={draft.note} onChange={(event) => handleDraftChange("note", event.target.value)} rows={4} />
            </label>
            <div className="desktop-stack">
              <button type="button" className="desktop-primary" onClick={handleAddRecord}>Save daily entry</button>
              <small>Daily entries feed the summary views below without asking for separate weekly or monthly inputs.</small>
            </div>
          </section>

          <section id="saved-records" className="desktop-list" aria-label="Saved records">
            <div className="snippet-card">
              <div className="snippet-card-top">
                <strong>Saved records</strong>
                <span>{records.length} rows</span>
              </div>
              <div className="desktop-record-table">
                {records.map((record) => (
                  <article key={record.id} className="desktop-record-row">
                    <div>
                      <strong>{new Date(record.date).toLocaleDateString()}</strong>
                      <p className="desktop-note">{record.note}</p>
                    </div>
                    <div className="desktop-stat-line">
                      <span>{formatCurrency(record.sales)} sales</span>
                      <span>{formatCurrency(record.expenses)} expenses</span>
                      <span>{record.orders} orders</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </section>

        <section id="reports" className="desktop-panel">
          <p className="desktop-kicker">Reporting views</p>
          <h3>Performance rolls up from daily records</h3>
          <div className="desktop-report-grid">
            {reportCards.map((card) => (
              <article key={card.title} className="desktop-report-card">
                <h4>{card.title}</h4>
                <div className="desktop-metrics">
                  <div className="desktop-metric">
                    <span>Sales</span>
                    <strong>{formatCurrency(card.totals.sales)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Expenses</span>
                    <strong>{formatCurrency(card.totals.expenses)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Profit</span>
                    <strong>{formatCurrency(card.totals.profit)}</strong>
                  </div>
                  <div className="desktop-metric">
                    <span>Orders</span>
                    <strong>{card.totals.orders}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
`
      : isFileRenamer
      ? `import { useMemo, useState } from "react";
import "./App.css";

type FileItem = {
  id: number;
  originalName: string;
  previewName: string;
  folder: string;
};

const initialFiles: FileItem[] = [
  { id: 1, originalName: "invoice-final.pdf", previewName: "invoice-approved.pdf", folder: "D:/Work/Billing" },
  { id: 2, originalName: "march-notes.txt", previewName: "march-summary.txt", folder: "D:/Work/Notes" },
  { id: 3, originalName: "client-photo.png", previewName: "client-photo-archive.png", folder: "D:/Work/Assets" }
];

export default function App() {
  const [findText, setFindText] = useState("final");
  const [replaceText, setReplaceText] = useState("approved");
  const [selectedFolder, setSelectedFolder] = useState("D:/Work");

  const handlePickFolder = () => {
    setSelectedFolder((current) => current === "D:/Work" ? "D:/Archive" : "D:/Work");
  };

  const previewFiles = useMemo(() => {
    const needle = findText.trim().toLowerCase();
    return initialFiles.map((file) => {
      if (!needle) return { ...file, previewName: file.originalName };
      const previewName = file.originalName.toLowerCase().includes(needle)
        ? file.originalName.replace(new RegExp(findText, "ig"), replaceText || "")
        : file.originalName;
      return { ...file, previewName };
    });
  }, [findText, replaceText]);

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handlePickFolder}>Pick folder</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#preview">Filename preview</a>
          <a href="#rules">Rename rules</a>
          <a href="#details">Output details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="preview" className="desktop-header">
          <div>
            <p className="desktop-kicker">Filename preview</p>
            <h2>Rename files before applying changes</h2>
            <p>Pick a folder, review renamed filenames, and only then run the batch rename action.</p>
          </div>
          <div className="desktop-meta">
            <span>{previewFiles.length} files</span>
            <span>{selectedFolder}</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Filename preview list">
            {previewFiles.map((file) => (
              <article key={file.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{file.originalName}</strong>
                  <span>{file.folder}</span>
                </div>
                <p>Preview: {file.previewName}</p>
              </article>
            ))}
          </section>

          <aside id="rules" className="desktop-panel">
            <p className="desktop-kicker">Rename rules</p>
            <h3>Replace text</h3>
            <label className="desktop-field">
              Find
              <input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Text to replace" />
            </label>
            <label className="desktop-field">
              Replace with
              <input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replacement text" />
            </label>
            <div className="desktop-stack">
              <button type="button" className="desktop-primary">Rename files</button>
              <small>Preview updates before you apply the rename action.</small>
            </div>
          </aside>
        </section>

        <section id="details" className="desktop-panel">
          <p className="desktop-kicker">Output details</p>
          <h3>Folder picker</h3>
          <p>Current folder: {selectedFolder}</p>
        </section>
      </section>
    </main>
  );
}
`
      : isPdfCombiner
        ? `import { useState } from "react";
import "./App.css";

type PdfItem = {
  id: number;
  name: string;
  pages: number;
};

const initialFiles: PdfItem[] = [
  { id: 1, name: "invoice-summary.pdf", pages: 3 },
  { id: 2, name: "receipts-batch.pdf", pages: 9 },
  { id: 3, name: "approval-sheet.pdf", pages: 2 }
];

export default function App() {
  const [files, setFiles] = useState<PdfItem[]>(initialFiles);
  const [outputPath] = useState("D:/Merged/combined-output.pdf");

  const move = (index: number, direction: -1 | 1) => {
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary">Add PDFs</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#merge-list">PDF list</a>
          <a href="#output">Output path</a>
          <a href="#actions">Merge actions</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="merge-list" className="desktop-header">
          <div>
            <p className="desktop-kicker">PDF list</p>
            <h2>Arrange files before merging</h2>
            <p>Review order, move files up or down, and merge into a single output path when ready.</p>
          </div>
          <div className="desktop-meta">
            <span>{files.length} files</span>
            <span>{files.reduce((sum, file) => sum + file.pages, 0)} pages</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="PDF file list">
            {files.map((file, index) => (
              <article key={file.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{file.name}</strong>
                  <span>{file.pages} pages</span>
                </div>
                <div className="desktop-inline-actions">
                  <button type="button" onClick={() => move(index, -1)}>Move up</button>
                  <button type="button" onClick={() => move(index, 1)}>Move down</button>
                </div>
              </article>
            ))}
          </section>

          <aside id="output" className="desktop-panel">
            <p className="desktop-kicker">Output path</p>
            <h3>Merged PDF destination</h3>
            <label className="desktop-field">
              Output file
              <input value={outputPath} readOnly />
            </label>
            <div id="actions" className="desktop-stack">
              <button type="button" className="desktop-primary">Merge PDFs</button>
              <small>Reorder files before you run the merge button.</small>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
      : isSnippetManager
      ? `import { useState } from "react";
import "./App.css";

type Snippet = {
  id: number;
  title: string;
  language: string;
  tags: string[];
  summary: string;
};

const initialSnippets: Snippet[] = [
  { id: 1, title: "Auth guard", language: "TypeScript", tags: ["auth", "frontend"], summary: "Wraps protected routes with role-aware redirect logic." },
  { id: 2, title: "Retry fetch", language: "Node", tags: ["api", "ops"], summary: "Retries transient upstream failures with capped backoff." },
  { id: 3, title: "Theme tokens", language: "CSS", tags: ["design"], summary: "Defines surface, accent, and spacing tokens for app shells." }
];

const filterTags = ["All", "auth", "frontend", "api", "ops", "design"] as const;

export default function App() {
  const [selectedTag, setSelectedTag] = useState<(typeof filterTags)[number]>("All");
  const [snippets, setSnippets] = useState<Snippet[]>(initialSnippets);

  const visibleSnippets = selectedTag === "All"
    ? snippets
    : snippets.filter((snippet) => snippet.tags.includes(selectedTag));

  const handleCreateSnippet = () => {
    setSnippets((current) => [
      {
        id: Date.now(),
        title: "New snippet draft",
        language: "Markdown",
        tags: ["design"],
        summary: "Fresh draft ready for notes, code, or handoff snippets."
      },
      ...current
    ]);
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handleCreateSnippet}>Create snippet</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#library">Snippet library</a>
          <a href="#filters">Tag filters</a>
          <a href="#details">Inspector</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="library" className="desktop-header">
          <div>
            <p className="desktop-kicker">Snippet list</p>
            <h2>Quick access workspace</h2>
            <p>Browse reusable snippets, filter by tag, and keep the next draft one click away.</p>
          </div>
          <div className="desktop-meta">
            <span>{visibleSnippets.length} visible</span>
            <span>{snippets.length} total</span>
          </div>
        </header>

        <section id="filters" className="desktop-filters" aria-label="Tag filters">
          {filterTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tag === selectedTag ? "is-active" : ""}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          ))}
        </section>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Snippet list">
            {visibleSnippets.map((snippet) => (
              <article key={snippet.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{snippet.title}</strong>
                  <span>{snippet.language}</span>
                </div>
                <p>{snippet.summary}</p>
                <div className="snippet-tags">
                  {snippet.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </section>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Inspector</p>
            <h3>Create-snippet action</h3>
            <ul>
              <li>Sidebar keeps the primary action visible.</li>
              <li>Tag filters update the visible snippet list.</li>
              <li>Fresh drafts appear at the top after creation.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
      : isVoiceWorkspace
        ? `import { useState } from "react";
import "./App.css";

type Recording = {
  id: number;
  title: string;
  length: string;
  state: "ready" | "processing" | "archived";
};

const initialRecordings: Recording[] = [
  { id: 1, title: "Standup recap", length: "03:42", state: "ready" },
  { id: 2, title: "Customer follow-up", length: "07:15", state: "processing" },
  { id: 3, title: "Ideas inbox", length: "01:58", state: "archived" }
];

export default function App() {
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings);

  const handleStartRecording = () => {
    setRecordings((current) => [
      { id: Date.now(), title: "New recording", length: "00:12", state: "ready" },
      ...current
    ]);
  };

  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary" onClick={handleStartRecording}>Start recording</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#recordings">Recording list</a>
          <a href="#details">Session details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="recordings" className="desktop-header">
          <div>
            <p className="desktop-kicker">Recording list</p>
            <h2>Capture and review voice notes</h2>
            <p>Keep fresh recordings visible, track status, and make the primary recording action obvious.</p>
          </div>
          <div className="desktop-meta">
            <span>{recordings.length} notes</span>
            <span>Mic ready</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section className="desktop-list" aria-label="Recording list">
            {recordings.map((item) => (
              <article key={item.id} className="snippet-card">
                <div className="snippet-card-top">
                  <strong>{item.title}</strong>
                  <span>{item.length}</span>
                </div>
                <p>Status: {item.state}</p>
              </article>
            ))}
          </section>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Session details</p>
            <h3>Voice note workflow</h3>
            <ul>
              <li>One-click recording starts new capture sessions.</li>
              <li>Recent notes stay pinned near the top.</li>
              <li>Status labels make processing visible.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`
        : `import "./App.css";

export default function App() {
  return (
    <main className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-eyebrow">Desktop workspace</p>
        <h1>${title}</h1>
        <button type="button" className="desktop-primary">Open primary action</button>
        <nav className="desktop-nav" aria-label="Workspace sections">
          <a href="#overview">Overview</a>
          <a href="#queue">Queue</a>
          <a href="#details">Details</a>
        </nav>
      </aside>

      <section className="desktop-main">
        <header id="overview" className="desktop-header">
          <div>
            <p className="desktop-kicker">Overview</p>
            <h2>Focused desktop shell</h2>
            <p>A stable desktop workspace layout with sidebar navigation and a clear primary action.</p>
          </div>
          <div className="desktop-meta">
            <span>Ready</span>
            <span>3 views</span>
          </div>
        </header>

        <section className="desktop-grid">
          <section id="queue" className="desktop-list" aria-label="Workspace queue">
            <article className="snippet-card"><strong>Primary workspace</strong><p>Keep the main workflow in focus.</p></article>
            <article className="snippet-card"><strong>Recent items</strong><p>Surface recent work without modal friction.</p></article>
          </section>

          <aside id="details" className="desktop-panel">
            <p className="desktop-kicker">Details</p>
            <h3>Shell guidance</h3>
            <ul>
              <li>Sidebar anchors keep navigation obvious.</li>
              <li>Primary action stays pinned in the header.</li>
              <li>Main content uses card groupings for clarity.</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}
`;

    const cssContent = `.desktop-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  background:
    radial-gradient(circle at top right, rgba(92, 122, 255, 0.18), transparent 28%),
    linear-gradient(145deg, #0f172a 0%, #172554 48%, #e2e8f0 48%, #f8fafc 100%);
  color: #0f172a;
}

.desktop-sidebar {
  padding: 32px 24px;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.desktop-sidebar h1 {
  margin: 0;
  font-size: 2rem;
}

.desktop-eyebrow,
.desktop-kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.74rem;
  color: #93c5fd;
}

.desktop-primary,
.desktop-filters button {
  border: 0;
  border-radius: 999px;
  padding: 0.8rem 1rem;
  font: inherit;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.desktop-primary {
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: white;
  font-weight: 700;
  box-shadow: 0 18px 36px rgba(56, 189, 248, 0.25);
}

.desktop-primary:hover,
.desktop-filters button:hover {
  transform: translateY(-1px);
}

.desktop-nav {
  display: grid;
  gap: 0.65rem;
}

.desktop-nav a {
  color: inherit;
  text-decoration: none;
  opacity: 0.88;
}

.desktop-main {
  padding: 32px;
  display: grid;
  gap: 24px;
}

.desktop-header,
.desktop-list,
.desktop-panel,
.desktop-filters {
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.desktop-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.desktop-header h2,
.desktop-panel h3 {
  margin: 0.4rem 0 0.6rem;
}

.desktop-header p,
.desktop-panel p,
.snippet-card p {
  margin: 0;
  color: #334155;
}

.desktop-meta {
  display: grid;
  gap: 0.5rem;
  align-content: start;
  color: #475569;
}

.desktop-filters {
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.desktop-filters button {
  background: #e2e8f0;
  color: #0f172a;
}

.desktop-filters button.is-active {
  background: #0f172a;
  color: white;
}

.desktop-grid {
  display: grid;
  grid-template-columns: 1.35fr 0.85fr;
  gap: 24px;
}

.desktop-list,
.desktop-panel {
  padding: 24px;
}

.desktop-list {
  display: grid;
  gap: 16px;
}

.snippet-card {
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, #ffffff, #eff6ff);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.snippet-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.snippet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 14px;
}

.snippet-tags span {
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #4338ca;
  font-size: 0.82rem;
}

.desktop-panel ul {
  margin: 1rem 0 0;
  padding-left: 1.2rem;
  color: #334155;
}

.desktop-field {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.9rem;
  color: #334155;
  font-size: 0.95rem;
}

.desktop-field input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
}

.desktop-field textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  resize: vertical;
}

.desktop-columns {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
}

.desktop-form-grid,
.desktop-report-grid,
.desktop-metrics {
  display: grid;
  gap: 16px;
}

.desktop-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-report-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-top: 1rem;
}

.desktop-report-card {
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, #ffffff, #ecfeff);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.desktop-report-card h4 {
  margin: 0 0 0.9rem;
}

.desktop-metric {
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  background: rgba(15, 23, 42, 0.04);
}

.desktop-metric span {
  display: block;
  color: #475569;
  font-size: 0.85rem;
}

.desktop-metric strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 1rem;
}

.desktop-record-table {
  display: grid;
  gap: 12px;
}

.desktop-record-row {
  display: grid;
  gap: 0.75rem;
  padding: 14px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.desktop-record-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.desktop-stat-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: #334155;
  font-size: 0.92rem;
}

.desktop-note {
  margin-top: 0.35rem;
}

.desktop-stack {
  display: grid;
  gap: 0.7rem;
  margin-top: 1rem;
}

.desktop-stack small {
  color: #64748b;
  line-height: 1.5;
}

.desktop-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.8rem;
}

.desktop-inline-actions button {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  cursor: pointer;
}

@media (max-width: 920px) {
  .desktop-shell {
    grid-template-columns: 1fr;
  }

  .desktop-grid {
    grid-template-columns: 1fr;
  }

  .desktop-columns,
  .desktop-form-grid {
    grid-template-columns: 1fr;
  }

  .desktop-header {
    flex-direction: column;
  }
}
`;

    const indexCssContent = `:root {
  color-scheme: light;
  font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}

button,
input,
select,
textarea {
  font: inherit;
}
`;

    return {
      summary: `Created a heuristic ${title} desktop workspace with sidebar navigation and a clear primary action.`,
      edits: [
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx"), content: appContent },
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/App.css"), content: `${cssContent}\n` },
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/index.css"), content: `${indexCssContent}\n` }
      ]
    };
  }

  private buildHeuristicApiService(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (this.inferArtifactTypeFromPrompt(normalized) !== "api-service") return null;
    if (plan.workspaceKind !== "generic") return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "node-api-service", "api-service");
    const entity = normalized.includes("invoice")
      ? { singular: "invoice", plural: "invoices", collectionPath: "/invoices", primaryField: "customer", defaultPrimaryValue: "Acme Corp" }
      : normalized.includes("booking")
        ? { singular: "booking", plural: "bookings", collectionPath: "/bookings", primaryField: "guest", defaultPrimaryValue: "Jordan Lee" }
        : normalized.includes("ticket")
          ? { singular: "ticket", plural: "tickets", collectionPath: "/tickets", primaryField: "subject", defaultPrimaryValue: "Login issue" }
          : normalized.includes("expense")
            ? { singular: "request", plural: "requests", collectionPath: "/requests", primaryField: "requester", defaultPrimaryValue: "Morgan Chen" }
            : this.buildApiEntityForDomain(domainFocus);

    const actions: Array<{ path: string; status?: string; assign?: boolean }> = [];
    if (normalized.includes("approve")) actions.push({ path: "approve", status: "approved" });
    if (normalized.includes("reject")) actions.push({ path: "reject", status: "rejected" });
    if (normalized.includes("cancel")) actions.push({ path: "cancel", status: "canceled" });
    if (normalized.includes("confirm")) actions.push({ path: "confirm", status: "confirmed" });
    if (normalized.includes("close")) actions.push({ path: "close", status: "closed" });
    if (normalized.includes("assign")) actions.push({ path: "assign", assign: true });
    if (normalized.includes("paid")) actions.push({ path: "pay", status: "paid" });
    if (actions.length === 0) {
      actions.push({ path: "update", status: "updated" });
    }

    const collectionPattern = entity.collectionPath.replace(/\//g, "\\/");
    const actionHandlers = actions.map((action) => {
      const routeVar = `${action.path}Match`;
      const matcher = `pathname.match(/^${collectionPattern}\\/([^/]+)\\/${action.path}$/)`;
      if (action.assign) {
        return [
          `  const ${routeVar} = ${matcher};`,
          `  if (req.method === "POST" && ${routeVar}) {`,
          `    const item = ${entity.plural}.find((entry) => entry.id === ${routeVar}[1]);`,
          "    if (!item) {",
          `      return sendJson(res, 404, { error: "${entity.singular} not found" });`,
          "    }",
          "    const body = await readJsonBody(req);",
          '    item.owner = String(body.owner ?? item.owner ?? "unassigned");',
          '    item.status = String(body.status ?? item.status ?? "assigned");',
          "    item.updatedAt = new Date().toISOString();",
          "    return sendJson(res, 200, item);",
          "  }"
        ].join("\n");
      }

      return [
        `  const ${routeVar} = ${matcher};`,
        `  if (req.method === "POST" && ${routeVar}) {`,
        `    const item = ${entity.plural}.find((entry) => entry.id === ${routeVar}[1]);`,
        "    if (!item) {",
        `      return sendJson(res, 404, { error: "${entity.singular} not found" });`,
        "    }",
        `    item.status = "${action.status ?? "updated"}";`,
        "    item.updatedAt = new Date().toISOString();",
        "    return sendJson(res, 200, item);",
        "  }"
      ].join("\n");
    }).join("\n\n");

    const serverContent = [
      "import http from 'node:http';",
      "import { URL } from 'node:url';",
      "",
      `const ${entity.plural} = [`,
      "  {",
      "    id: 'seed-1',",
      `    ${entity.primaryField}: "${entity.defaultPrimaryValue}",`,
      "    amount: 1200,",
      "    status: 'pending',",
      "    owner: 'ops-desk',",
      "    createdAt: new Date().toISOString()",
      "  }",
      "];",
      "",
      "function sendJson(res, statusCode, payload) {",
      "  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });",
      "  res.end(JSON.stringify(payload));",
      "}",
      "",
      "async function readJsonBody(req) {",
      "  const chunks = [];",
      "  for await (const chunk of req) chunks.push(Buffer.from(chunk));",
      "  if (chunks.length === 0) return {};",
      "  try {",
      "    return JSON.parse(Buffer.concat(chunks).toString('utf8'));",
      "  } catch {",
      "    return {};",
      "  }",
      "}",
      "",
      "const server = http.createServer(async (req, res) => {",
      "  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);",
      "  const pathname = url.pathname.replace(/\\/+$/, '') || '/';",
      "",
      "  if (req.method === 'GET' && pathname === '/health') {",
      `    return sendJson(res, 200, { service: '${title}', status: 'ok', resource: '${entity.plural}' });`,
      "  }",
      "",
      `  if (req.method === 'GET' && pathname === '${entity.collectionPath}') {`,
      `    return sendJson(res, 200, { ${entity.plural} });`,
      "  }",
      "",
      `  if (req.method === 'POST' && pathname === '${entity.collectionPath}') {`,
      "    const body = await readJsonBody(req);",
      "    const next = {",
      "      id: String(Date.now()),",
      `      ${entity.primaryField}: String(body.${entity.primaryField} ?? "${entity.defaultPrimaryValue}"),`,
      "      amount: Number(body.amount ?? 500),",
      '      owner: String(body.owner ?? "ops-desk"),',
      '      status: String(body.status ?? "pending"),',
      "      createdAt: new Date().toISOString()",
      "    };",
      `    ${entity.plural}.unshift(next);`,
      "    return sendJson(res, 201, next);",
      "  }",
      "",
      actionHandlers,
      "",
      `  return sendJson(res, 404, { error: 'Unknown ${entity.singular} route' });`,
      "});",
      "",
      "const port = Number(process.env.PORT || 3000);",
      "server.listen(port, () => {",
      `  console.log('${title} API listening on ' + port);`,
      "});",
      ""
    ].join("\n");

    return {
      summary: `Created a heuristic ${title} API service with ${entity.plural} listing, creation, and lifecycle endpoints.`,
      edits: [
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "package.json"),
          content: `${JSON.stringify({
            name: this.extractProjectName(prompt),
            private: true,
            version: "0.1.0",
            type: "module",
            scripts: {
              build: "node -e \"console.log('Service ready')\"",
              start: "node src/server.js"
            }
          }, null, 2)}\n`
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "src/server.js"),
          content: serverContent
        }
      ]
    };
  }

  private buildHeuristicScriptTool(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (plan.workspaceKind !== "generic") return null;
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    const wantsCli = /\b(cli|command[- ]line|script|utility|tool|automation)\b/.test(normalized);
    const wantsJson = normalized.includes("json");
    const wantsCsv = normalized.includes("csv");
    const wantsMarkdown = normalized.includes("markdown");
    const wantsFileAudit = /\b(audit|summary|summarize|report|analy[sz]e|inspect|validate|lint)\b/.test(normalized)
      && (wantsJson || wantsCsv || wantsMarkdown);
    if (promptArtifact !== "script-tool" && !wantsCli && !wantsFileAudit) return null;

    const projectName = this.extractProjectName(prompt);

    const packageJson = {
      name: projectName,
      private: true,
      version: "0.1.0",
      type: "module",
      bin: {
        [projectName]: "./bin/cli.mjs"
      },
      scripts: {
        build: "node -e \"console.log('Tool ready')\"",
        start: "node src/index.js"
      }
    };

    const source = wantsJson
      ? [
        "import { readFileSync } from 'node:fs';",
        "",
        "function measureDepth(value) {",
        "  if (!value || typeof value !== 'object') return 0;",
        "  if (Array.isArray(value)) {",
        "    return value.length === 0 ? 1 : 1 + Math.max(...value.map((entry) => measureDepth(entry)));",
        "  }",
        "  const children = Object.values(value);",
        "  return children.length === 0 ? 1 : 1 + Math.max(...children.map((entry) => measureDepth(entry)));",
        "}",
        "",
        "const target = process.argv[2];",
        "if (!target) {",
        "  console.error('Usage: json-audit-cli <json-file>');",
        "  process.exit(1);",
        "}",
        "",
        "const raw = readFileSync(target, 'utf8');",
        "const parsed = JSON.parse(raw);",
        "const topLevelKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : [];",
        "const missingFields = ['id', 'name', 'status'].filter((field) => !(parsed && typeof parsed === 'object' && field in parsed));",
        "console.log([",
        "  `top-level keys: ${topLevelKeys.length}`,",
        "  `nested depth: ${measureDepth(parsed)}`,",
        "  `missing fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'none'}`",
        "].join('\\n'));"
      ].join("\n")
      : wantsCsv
        ? [
          "import { readFileSync } from 'node:fs';",
          "",
          "const target = process.argv[2];",
          "if (!target) {",
          "  console.error('Usage: csv-report-cli <csv-file>');",
          "  process.exit(1);",
          "}",
          "",
          "const raw = readFileSync(target, 'utf8').trim();",
          "const rows = raw.split(/\\r?\\n/).filter(Boolean);",
          "const headers = (rows[0] ?? '').split(',').map((value) => value.trim()).filter(Boolean);",
          "const dataRows = rows.slice(1);",
          "console.log([",
          "  `rows: ${dataRows.length}`,",
          "  `columns: ${headers.length}`,",
          "  `headers: ${headers.join(', ') || 'none'}`",
          "].join('\\n'));"
        ].join("\n")
        : [
          "import { readFileSync } from 'node:fs';",
          "",
          "const target = process.argv[2];",
          "if (!target) {",
          "  console.error('Usage: markdown-summary-cli <markdown-file>');",
          "  process.exit(1);",
          "}",
          "",
          "const raw = readFileSync(target, 'utf8');",
          "const headings = raw.match(/^#{1,6}\\s+.+$/gm) ?? [];",
          "console.log([",
          "  `sections: ${headings.length}`,",
          "  ...headings.slice(0, 5).map((heading) => `- ${heading.replace(/^#+\\s*/, '')}`)",
          "].join('\\n'));"
        ].join("\n");

    return {
      summary: `Created a heuristic ${projectName} CLI for ${wantsJson ? "JSON audit" : wantsCsv ? "CSV summary" : wantsMarkdown ? "markdown summary" : "file summary"} workflows.`,
      edits: [
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "package.json"),
          content: `${JSON.stringify(packageJson, null, 2)}\n`
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "src/index.js"),
          content: `${source}\n`
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "bin/cli.mjs"),
          content: "#!/usr/bin/env node\nimport '../src/index.js'\n"
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "README.md"),
          content: `# ${projectName}\n\nGenerated by Cipher Workspace as a small ${wantsJson ? "JSON audit" : wantsCsv ? "CSV summary" : "file summary"} CLI.\n`
        }
      ]
    };
  }

  private buildHeuristicLibrary(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (this.inferArtifactTypeFromPrompt(normalized) !== "library") return null;
    if (plan.workspaceKind !== "generic") return null;

    const projectName = this.extractProjectName(prompt);
    const wantsValidation = /\b(valid|validation|validator|email|required|min[- ]?length|string guard)\b/.test(normalized);
    const wantsFormatting = /\b(format|formatting|money|currency|percent|percentage|compact counts?|compact numbers?|delta)\b/.test(normalized);
    if (!wantsValidation && !wantsFormatting) return null;

    const packageJson = {
      name: projectName,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        build: "node -e \"import('./src/index.js').then(() => console.log('Package ready'))\""
      }
    };

    const source = wantsValidation
      ? [
        "const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;",
        "",
        "export function isEmail(value) {",
        "  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());",
        "}",
        "",
        "export function requireString(value, label = 'Value') {",
        "  if (typeof value !== 'string' || value.trim().length === 0) {",
        "    return `${label} is required.`;",
        "  }",
        "  return null;",
        "}",
        "",
        "export function minLength(value, minimum, label = 'Value') {",
        "  if (typeof value !== 'string' || value.trim().length < minimum) {",
        "    return `${label} must be at least ${minimum} characters.`;",
        "  }",
        "  return null;",
        "}",
        "",
        "export function validateEmail(value, label = 'Email') {",
        "  if (!isEmail(value)) {",
        "    return `${label} must be a valid email address.`;",
        "  }",
        "  return null;",
        "}",
        "",
        "export function formatErrors(errors) {",
        "  return (errors ?? [])",
        "    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)",
        "    .map((entry) => `- ${entry.trim()}`)",
        "    .join('\\n');",
        "}",
        "",
        "export function validateRequiredMinEmail(value, minimum, label = 'Value') {",
        "  const issues = [",
        "    requireString(value, label),",
        "    minLength(value, minimum, label),",
        "    validateEmail(value, label)",
        "  ].filter(Boolean);",
        "  return {",
        "    ok: issues.length === 0,",
        "    errors: issues,",
        "    message: formatErrors(issues)",
        "  };",
        "}"
      ].join("\n")
      : [
        "function toNumber(value) {",
        "  const normalized = typeof value === 'string' ? Number(value) : value;",
        "  return Number.isFinite(normalized) ? Number(normalized) : 0;",
        "}",
        "",
        "export function formatMoney(value, currency = 'USD', locale = 'en-US') {",
        "  return new Intl.NumberFormat(locale, {",
        "    style: 'currency',",
        "    currency,",
        "    maximumFractionDigits: 2",
        "  }).format(toNumber(value));",
        "}",
        "",
        "export function formatPercentDelta(value, digits = 1) {",
        "  const amount = toNumber(value);",
        "  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';",
        "  return `${sign}${Math.abs(amount).toFixed(digits)}%`;",
        "}",
        "",
        "export function formatCompactCount(value, locale = 'en-US') {",
        "  return new Intl.NumberFormat(locale, {",
        "    notation: 'compact',",
        "    maximumFractionDigits: 1",
        "  }).format(toNumber(value));",
        "}",
        "",
        "export function formatDashboardMetrics(metrics, options = {}) {",
        "  return Object.entries(metrics ?? {}).reduce((acc, [key, metricValue]) => {",
        "    const normalizedKey = key.toLowerCase();",
        "    if (normalizedKey.includes('revenue') || normalizedKey.includes('amount') || normalizedKey.includes('money')) {",
        "      acc[key] = formatMoney(metricValue, options.currency, options.locale);",
        "      return acc;",
        "    }",
        "    if (normalizedKey.includes('delta') || normalizedKey.includes('change') || normalizedKey.includes('percent')) {",
        "      acc[key] = formatPercentDelta(metricValue, options.percentDigits);",
        "      return acc;",
        "    }",
        "    acc[key] = formatCompactCount(metricValue, options.locale);",
        "    return acc;",
        "  }, {});",
        "}"
      ].join("\n");

    return {
      summary: `Created a heuristic ${projectName} ${wantsValidation ? "validation" : "formatting"} library with reusable helpers.`,
      edits: [
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "package.json"),
          content: `${JSON.stringify(packageJson, null, 2)}\n`
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "src/index.js"),
          content: `${source}\n`
        },
        {
          path: this.joinWorkspacePath(plan.workingDirectory, "README.md"),
          content: `# ${projectName}\n\nReusable ${wantsValidation ? "validation" : "formatting"} helpers generated by Cipher Workspace.\n`
        }
      ]
    };
  }

  private buildHeuristicNotesApp(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsNotes = ["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term));
    if (!wantsNotes) return null;

    const wantsSearch = normalized.includes("search");
    const wantsDelete = normalized.includes("delete") || normalized.includes("remove");
    const wantsAdd = normalized.includes("add") || normalized.includes("create");
    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static notes app with ${[
          wantsAdd ? "add" : null,
          wantsDelete ? "delete" : null,
          wantsSearch ? "search" : null
        ].filter(Boolean).join(", ") || "core"} features.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticNotesHtml(title) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticNotesCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticNotesJs(title, { wantsSearch, wantsDelete, wantsAdd }) }
        ]
      };
    }
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} React notes app with ${[
        wantsAdd ? "add" : null,
        wantsDelete ? "delete" : null,
        wantsSearch ? "search" : null
      ].filter(Boolean).join(", ") || "core"} features.`,
      edits: [
        {
          path: appPath,
          content: this.buildNotesAppTsx(title, { wantsSearch, wantsDelete, wantsAdd })
        },
        {
          path: appCssPath,
          content: this.buildNotesAppCss()
        },
        {
          path: indexCssPath,
          content: this.buildNotesIndexCss()
        }
      ]
    };
  }

  private buildHeuristicKanbanBoard(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsKanban = ["kanban", "task board"].some((term) => normalized.includes(term));
    if (!wantsKanban) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static kanban board with add-task and status-flow interactions.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticKanbanHtml(title) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticKanbanCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticKanbanJs() }
        ]
      };
    }

    return {
      summary: `Created a heuristic ${title} React kanban board with add-task and status-flow interactions.`,
      edits: [
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx"), content: this.buildKanbanBoardTsx(title) },
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/App.css"), content: this.buildKanbanBoardCss() },
        { path: this.joinWorkspacePath(plan.workingDirectory, "src/index.css"), content: this.buildKanbanBoardIndexCss() }
      ]
    };
  }

  private buildHeuristicLandingPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsLanding = ["landing page", "website", "site", "homepage"].some((term) => normalized.includes(term));
    if (!wantsLanding) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static landing page with structured sections and polished styling.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticLandingHtml(title) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticLandingCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticLandingJs(title) }
        ]
      };
    }

    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} landing page with structured sections and polished styling.`,
      edits: [
        { path: appPath, content: this.buildLandingPageTsx(title) },
        { path: appCssPath, content: this.buildLandingPageCss() },
        { path: indexCssPath, content: this.buildLandingIndexCss() }
      ]
    };
  }

  private buildHeuristicDashboard(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsDashboard = ["dashboard", "admin panel", "analytics", "wallboard", "kpi", "incident", "escalation"]
      .some((term) => normalized.includes(term));
    if (!wantsDashboard) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "react-dashboard", null);
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static dashboard with metrics, activity, and responsive layout.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticDashboardHtml(title, domainFocus) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticDashboardCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticDashboardJs(domainFocus) }
        ]
      };
    }
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} dashboard with metrics, activity, and responsive layout.`,
      edits: [
        { path: appPath, content: this.buildDashboardTsx(title, domainFocus) },
        { path: appCssPath, content: this.buildDashboardCss() },
        { path: indexCssPath, content: this.buildDashboardIndexCss() }
      ]
    };
  }

  private buildHeuristicPricingPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsPricing = ["pricing page", "pricing", "plans", "plan comparison"].some((term) => normalized.includes(term));
    if (!wantsPricing) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} pricing page with hero, plan cards, comparison, and contact CTA.`,
      edits: [
        { path: appPath, content: this.buildPricingPageTsx(title) },
        { path: appCssPath, content: this.buildPricingPageCss() },
        { path: indexCssPath, content: this.buildLandingIndexCss() }
      ]
    };
  }

  private buildHeuristicAnnouncementPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsAnnouncement = ["announcement page", "feature announcement", "update page", "rollout timeline"].some((term) => normalized.includes(term));
    if (!wantsAnnouncement) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} feature announcement page with hero, update cards, rollout timeline, and contact CTA.`,
      edits: [
        { path: appPath, content: this.buildAnnouncementPageTsx(title) },
        { path: appCssPath, content: this.buildAnnouncementPageCss() },
        { path: indexCssPath, content: this.buildLandingIndexCss() }
      ]
    };
  }

  private buildHeuristicCrudApp(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsCrud = this.looksLikeCrudAppPrompt(normalized)
      || /\b(table|status|due date|due dates|vendor|vendors|payment status|mark (?:one )?paid)\b/.test(normalized);
    if (!wantsCrud) return null;
    const isVendorPayments = /\b(vendor|vendors|payment|payments|mark (?:one )?paid|due date|due dates)\b/.test(normalized);

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "react-crud", null);
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static CRUD app with record management and responsive layout.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticCrudHtml(title, domainFocus) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticCrudCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticCrudJs(title, domainFocus) }
        ]
      };
    }
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} CRUD app with record management, filters, and responsive layout.`,
      edits: [
        { path: appPath, content: isVendorPayments ? this.buildVendorPaymentsCrudAppTsx(title) : this.buildCrudAppTsx(title, domainFocus) },
        { path: appCssPath, content: this.buildCrudAppCss() },
        { path: indexCssPath, content: this.buildCrudIndexCss() }
      ]
    };
  }

  private toDisplayNameFromDirectory(workingDirectory: string): string {
    const source = workingDirectory.split("/").filter(Boolean).pop() ?? "Focus Notes";
    return this.toDisplayLabel(source, "Focus Notes");
  }

  private toDisplayLabel(value: string, fallback = "Generated App"): string {
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

  private buildNotesAppTsx(title: string, options: { wantsSearch: boolean; wantsDelete: boolean; wantsAdd: boolean }): string {
    const deleteHandler = options.wantsDelete
      ? `
  const handleDelete = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };
`
      : "";

    const deleteButton = options.wantsDelete
      ? `<button type="button" className="ghost" onClick={() => handleDelete(note.id)}>Delete</button>`
      : "";

    return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

const initialNotes: Note[] = [
  {
    id: "1",
    title: "Ship the first draft",
    body: "Focus on a reliable add, search, and delete flow before polishing extras.",
    createdAt: "Today"
  },
  {
    id: "2",
    title: "Keep the interface calm",
    body: "Use clear sections, strong spacing, and obvious actions.",
    createdAt: "Today"
  }
];

function App() {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) =>
      note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle)
    );
  }, [notes, query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;

    setNotes((current) => [
      {
        id: crypto.randomUUID(),
        title: trimmedTitle,
        body: trimmedBody,
        createdAt: new Date().toLocaleDateString()
      },
      ...current
    ]);
    setTitle("");
    setBody("");
  };
${deleteHandler}

  return (
    <main className="notes-shell">
      <section className="notes-hero">
        <p className="eyebrow">Notes workspace</p>
        <h1>${title}</h1>
        <p className="lede">A focused notes workspace with quick capture, filtering, and clean review.</p>
      </section>

      <section className="notes-grid">
        <form className="composer-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Capture a note</h2>
            <span>${options.wantsAdd ? "Add enabled" : "Quick draft"}</span>
          </div>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Roadmap, bug, idea..."
            />
          </label>
          <label>
            Details
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              placeholder="Write the details you want to keep..."
            />
          </label>
          <button type="submit">Save note</button>
        </form>

        <section className="list-card">
          <div className="section-heading">
            <div>
              <h2>Notes</h2>
              <span>{filteredNotes.length} visible</span>
            </div>
            <label className="search-field">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="${options.wantsSearch ? "Search notes..." : "Filter notes..."}"
              />
            </label>
          </div>

          <div className="notes-list">
            {filteredNotes.length === 0 ? (
              <article className="note-card empty">
                <h3>No matches</h3>
                <p>Try a different search term or add a fresh note.</p>
              </article>
            ) : (
              filteredNotes.map((note) => (
                <article key={note.id} className="note-card">
                  <div className="note-card-top">
                    <div>
                      <p className="note-date">{note.createdAt}</p>
                      <h3>{note.title}</h3>
                    </div>
                    ${deleteButton}
                  </div>
                  <p>{note.body}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildStaticNotesHtml(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="notes-shell">
      <section class="notes-hero">
        <p class="eyebrow">Notes workspace</p>
        <h1>${title}</h1>
        <p class="lede">A focused static notes workspace with quick capture, filtering, and clean review.</p>
      </section>

      <section class="notes-grid">
        <form class="composer-card" id="note-form">
          <div class="section-heading">
            <h2>Capture a note</h2>
            <span>Quick draft</span>
          </div>
          <label>
            Title
            <input id="note-title" placeholder="Roadmap, bug, idea..." />
          </label>
          <label>
            Details
            <textarea id="note-body" rows="6" placeholder="Write the details you want to keep..."></textarea>
          </label>
          <button type="submit">Save note</button>
        </form>

        <section class="list-card">
          <div class="section-heading notes-head">
            <div>
              <h2>Notes</h2>
              <span id="notes-count">2 visible</span>
            </div>
            <label class="search-field">
              Search
              <input id="notes-search" placeholder="Search notes..." />
            </label>
          </div>
          <div class="notes-list" id="notes-list"></div>
        </section>
      </section>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
  }

  private buildStaticNotesCss(): string {
    return `:root {
  color-scheme: light;
  --ink: #132238;
  --muted: #5f6f82;
  --panel: rgba(255, 255, 255, 0.94);
  --line: rgba(15, 23, 42, 0.08);
  --accent: #0f766e;
  --accent-strong: #115e59;
  --canvas: radial-gradient(circle at top left, #dff7f2 0%, #f5efe4 48%, #f7fafc 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.notes-shell {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.notes-hero,
.composer-card,
.list-card,
.note-card {
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.notes-hero {
  padding: 36px;
  margin-bottom: 22px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

.notes-hero h1,
.section-heading h2,
.note-card h3 {
  margin: 0;
}

.lede {
  margin: 14px 0 0;
  max-width: 56ch;
  line-height: 1.7;
  color: var(--muted);
}

.notes-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 22px;
}

.composer-card,
.list-card {
  padding: 24px;
}

.section-heading,
.notes-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

label {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 600;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 13px 14px;
  background: rgba(248, 250, 252, 0.92);
}

button {
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  background: var(--accent-strong);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.search-field {
  min-width: 220px;
  margin: 0;
}

.notes-list {
  display: grid;
  gap: 14px;
}

.note-card {
  padding: 18px;
}

.note-card-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.note-date {
  margin: 0 0 6px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.note-actions {
  display: flex;
  gap: 10px;
}

.note-actions button {
  padding: 9px 14px;
  background: #e2e8f0;
  color: #132238;
}

.empty {
  text-align: center;
  color: var(--muted);
}

@media (max-width: 840px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }

  .notes-head {
    flex-direction: column;
  }

  .search-field {
    width: 100%;
  }
}
`;
  }

  private buildStaticNotesJs(title: string, options: { wantsSearch: boolean; wantsDelete: boolean; wantsAdd: boolean }): string {
    void title;
    const deleteEnabled = options.wantsDelete ? "true" : "false";
    const searchPlaceholder = options.wantsSearch ? "Search notes..." : "Filter notes...";
    return `const state = {
  allowDelete: ${deleteEnabled},
  notes: [
    {
      id: "1",
      title: "Ship the first draft",
      body: "Focus on a reliable add, search, and delete flow before polishing extras.",
      createdAt: "Today"
    },
    {
      id: "2",
      title: "Keep the interface calm",
      body: "Use clear sections, strong spacing, and obvious actions.",
      createdAt: "Today"
    }
  ]
};

const listEl = document.getElementById("notes-list");
const countEl = document.getElementById("notes-count");
const formEl = document.getElementById("note-form");
const titleEl = document.getElementById("note-title");
const bodyEl = document.getElementById("note-body");
const searchEl = document.getElementById("notes-search");

if (searchEl) {
  searchEl.placeholder = "${searchPlaceholder}";
}

function renderNotes() {
  if (!listEl || !countEl || !searchEl) return;
  const query = String(searchEl.value || "").trim().toLowerCase();
  const visible = state.notes.filter((note) => {
    if (!query) return true;
    return note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query);
  });

  countEl.textContent = visible.length + " visible";
  if (visible.length === 0) {
    listEl.innerHTML = '<article class="note-card empty"><h3>No matches</h3><p>Try a different search term or add a fresh note.</p></article>';
    return;
  }

  listEl.innerHTML = visible.map((note) => {
    const action = state.allowDelete
      ? '<div class="note-actions"><button type="button" data-note-delete="' + note.id + '">Delete</button></div>'
      : "";
    return '<article class="note-card"><div class="note-card-top"><div><p class="note-date">' + note.createdAt + '</p><h3>' + note.title + '</h3></div>' + action + '</div><p>' + note.body + '</p></article>';
  }).join("");

  if (state.allowDelete) {
    listEl.querySelectorAll("[data-note-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-note-delete");
        state.notes = state.notes.filter((note) => note.id !== targetId);
        renderNotes();
      });
    });
  }
}

if (formEl && titleEl && bodyEl) {
  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = String(titleEl.value || "").trim();
    const body = String(bodyEl.value || "").trim();
    if (!title || !body) return;
    state.notes.unshift({
      id: String(Date.now()),
      title,
      body,
      createdAt: new Date().toLocaleDateString()
    });
    titleEl.value = "";
    bodyEl.value = "";
    renderNotes();
  });
}

searchEl?.addEventListener("input", renderNotes);
renderNotes();
`;
  }

  private buildStaticDashboardHtml(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildDashboardDomainContent(domainFocus);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="dashboard-shell">
      <section class="dashboard-hero">
        <div>
          <p class="eyebrow">Generated by Cipher Workspace</p>
          <h1>${title}</h1>
          <p class="lede">${content.staticLede}</p>
        </div>
        <button id="refresh-dashboard" type="button">${content.staticButtonLabel}</button>
      </section>

      <section class="stats-grid" id="stats-grid"></section>

      <section class="dashboard-grid">
        <article class="panel">
          <div class="panel-head">
            <h2>${content.staticTrendTitle}</h2>
            <span id="trend-badge">${content.staticTrendBadge}</span>
          </div>
          <div class="bars" id="trend-bars"></div>
        </article>
        <article class="panel">
          <div class="panel-head">
            <h2>${content.staticActivityTitle}</h2>
            <span>${content.staticActivityBadge}</span>
          </div>
          <div id="activity-list" class="activity-list"></div>
        </article>
      </section>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
  }

  private buildStaticDashboardCss(): string {
    return `:root {
  --ink: #10233a;
  --muted: #5e7089;
  --panel: rgba(255, 255, 255, 0.94);
  --line: rgba(15, 23, 42, 0.08);
  --accent: #1d4ed8;
  --canvas: linear-gradient(180deg, #eef6ff 0%, #f8fafc 56%, #eff4ff 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.dashboard-shell {
  width: min(1140px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.dashboard-hero,
.stat-card,
.panel {
  border: 1px solid var(--line);
  border-radius: 28px;
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.dashboard-hero {
  padding: 32px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

h1, h2, p { margin-top: 0; }
.lede { color: var(--muted); max-width: 56ch; line-height: 1.7; margin-bottom: 0; }

button {
  font: inherit;
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: 22px 0;
}

.stat-card,
.panel {
  padding: 22px;
}

.stat-card strong {
  display: block;
  font-size: 2rem;
  margin: 8px 0;
}

.stat-card span,
.panel-head span {
  color: var(--muted);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.bars {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  min-height: 220px;
}

.bar {
  border-radius: 18px 18px 10px 10px;
  background: linear-gradient(180deg, #2563eb 0%, #7dd3fc 100%);
}

.activity-list {
  display: grid;
  gap: 12px;
}

.activity-item {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

@media (max-width: 860px) {
  .stats-grid,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-hero {
    align-items: start;
    flex-direction: column;
  }
}
`;
  }

  private buildStaticDashboardJs(domainFocus: DomainFocus = "generic"): string {
    const content = this.buildDashboardDomainContent(domainFocus);
    return `const stats = ${JSON.stringify(content.staticStats, null, 2)};

const trend = ${JSON.stringify(content.staticTrend)};
const activity = ${JSON.stringify(content.staticActivity, null, 2)};

function renderDashboard() {
  const statsGrid = document.getElementById("stats-grid");
  const trendBars = document.getElementById("trend-bars");
  const activityList = document.getElementById("activity-list");
  const badge = document.getElementById("trend-badge");
  if (!statsGrid || !trendBars || !activityList || !badge) return;

  statsGrid.innerHTML = stats.map((item) => '<article class="stat-card"><span>' + item.label + '</span><strong>' + item.value + '</strong><span>' + item.delta + ' vs last cycle</span></article>').join("");
  trendBars.innerHTML = trend.map((value) => '<div class="bar" style="height:' + value + 'px"></div>').join("");
  activityList.innerHTML = activity.map((item, index) => '<article class="activity-item"><strong>Update ' + (index + 1) + '</strong><p>' + item + '</p></article>').join("");
  badge.textContent = trend[trend.length - 1] >= trend[0] ? "Upward" : "Watch";
}

document.getElementById("refresh-dashboard")?.addEventListener("click", () => {
  trend.push(trend.shift());
  renderDashboard();
});

renderDashboard();
`;
  }

  private buildStaticCrudHtml(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildCrudDomainContent(domainFocus);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="crud-shell">
      <section class="crud-hero">
        <div>
          <p class="eyebrow">Generated by Cipher Workspace</p>
          <h1>${title}</h1>
          <p class="lede">${content.lede}</p>
        </div>
      </section>

      <section class="crud-grid">
        <form class="panel form-panel" id="record-form">
          <div class="panel-head">
            <h2>${this.toDisplayLabel(content.singularLabel)} details</h2>
            <span id="form-mode">Create</span>
          </div>
          <label>${content.nameLabel}<input id="record-name" placeholder="${content.namePlaceholder}" /></label>
          <label>Status
            <select id="record-status">
              <option>Active</option>
              <option>Paused</option>
              <option>Review</option>
            </select>
          </label>
          <label>${content.ownerLabel}<input id="record-owner" placeholder="${content.ownerPlaceholder}" /></label>
          <button type="submit">Save ${content.singularLabel}</button>
        </form>

        <section class="panel table-panel">
          <div class="panel-head">
            <div>
              <h2>${this.toDisplayLabel(content.pluralLabel)}</h2>
              <span id="records-count">0 ${content.pluralLabel}</span>
            </div>
            <label class="search-field">${content.searchLabel}<input id="record-search" placeholder="Search ${content.pluralLabel}..." /></label>
          </div>
          <div id="records-list" class="records-list"></div>
        </section>
      </section>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
  }

  private buildStaticCrudCss(): string {
    return `:root {
  --ink: #16253b;
  --muted: #627289;
  --panel: rgba(255, 255, 255, 0.95);
  --line: rgba(15, 23, 42, 0.1);
  --accent: #7c2d12;
  --canvas: linear-gradient(180deg, #fff7ed 0%, #fffbf5 48%, #f8fafc 100%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
}

.crud-shell {
  width: min(1140px, calc(100% - 40px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.crud-hero,
.panel,
.record-item {
  border-radius: 28px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.08);
}

.crud-hero,
.panel {
  padding: 24px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--accent);
}

.lede { color: var(--muted); max-width: 56ch; line-height: 1.7; }

.crud-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

label {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 600;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 13px 14px;
  background: rgba(248, 250, 252, 0.92);
}

button {
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  background: #9a3412;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.search-field {
  min-width: 220px;
  margin: 0;
}

.records-list {
  display: grid;
  gap: 12px;
}

.record-item {
  padding: 16px 18px;
}

.record-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.record-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: #ffedd5;
  color: #9a3412;
  font-size: 0.82rem;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.ghost {
  background: #e2e8f0;
  color: #16253b;
}

@media (max-width: 860px) {
  .crud-grid {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
  }

  .search-field {
    width: 100%;
  }
}
`;
  }

  private buildStaticCrudJs(title: string, domainFocus: DomainFocus = "generic"): string {
    void title;
    const content = this.buildCrudDomainContent(domainFocus);
    return `const state = {
  editingId: "",
  records: ${JSON.stringify(content.initialRecords, null, 2)}
};

const formEl = document.getElementById("record-form");
const nameEl = document.getElementById("record-name");
const statusEl = document.getElementById("record-status");
const ownerEl = document.getElementById("record-owner");
const listEl = document.getElementById("records-list");
const countEl = document.getElementById("records-count");
const modeEl = document.getElementById("form-mode");
const searchEl = document.getElementById("record-search");

function resetForm() {
  state.editingId = "";
  if (nameEl) nameEl.value = "";
  if (statusEl) statusEl.value = "Active";
  if (ownerEl) ownerEl.value = "";
  if (modeEl) modeEl.textContent = "Create";
}

function startEdit(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record || !nameEl || !statusEl || !ownerEl || !modeEl) return;
  state.editingId = id;
  nameEl.value = record.name;
  statusEl.value = record.status;
  ownerEl.value = record.owner;
  modeEl.textContent = "Edit";
}

function renderRecords() {
  if (!listEl || !countEl || !searchEl) return;
  const query = String(searchEl.value || "").trim().toLowerCase();
  const visible = state.records.filter((record) => {
    if (!query) return true;
    return [record.name, record.status, record.owner].some((value) => value.toLowerCase().includes(query));
  });

  countEl.textContent = visible.length + (visible.length === 1 ? " record" : " records");
  if (visible.length === 0) {
    listEl.innerHTML = '<article class="record-item"><h3>No matches</h3><p>Try a different search term or save a new ${content.singularLabel}.</p></article>';
    return;
  }

  listEl.innerHTML = visible.map((record) => '<article class="record-item"><div class="record-top"><div><h3>' + record.name + '</h3><div class="record-meta"><span class="badge">' + record.status + '</span><span class="badge">' + record.owner + '</span></div></div></div><div class="actions"><button class="ghost" type="button" data-record-edit="' + record.id + '">Edit</button><button class="ghost" type="button" data-record-delete="' + record.id + '">Delete</button></div></article>').join("");

  listEl.querySelectorAll("[data-record-edit]").forEach((button) => {
    button.addEventListener("click", () => startEdit(button.getAttribute("data-record-edit") || ""));
  });
  listEl.querySelectorAll("[data-record-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-record-delete");
      state.records = state.records.filter((record) => record.id !== id);
      if (state.editingId === id) resetForm();
      renderRecords();
    });
  });
}

formEl?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = String(nameEl?.value || "").trim();
  const status = String(statusEl?.value || "").trim();
  const owner = String(ownerEl?.value || "").trim();
  if (!name || !status || !owner) return;

  if (state.editingId) {
    state.records = state.records.map((record) => record.id === state.editingId ? { ...record, name, status, owner } : record);
  } else {
    state.records.unshift({ id: String(Date.now()), name, status, owner });
  }

  resetForm();
  renderRecords();
});

searchEl?.addEventListener("input", renderRecords);
resetForm();
renderRecords();
`;
  }

  private buildPricingPageTsx(title: string): string {
    return `import "./App.css";

const plans = [
  {
    name: "Starter",
    price: "$19",
    description: "For solo launches that need a clean starting point.",
    features: ["1 project", "Basic analytics", "Email support"]
  },
  {
    name: "Growth",
    price: "$49",
    description: "For teams that want stronger collaboration and faster iteration.",
    features: ["5 projects", "Team seats", "Priority support"],
    featured: true
  },
  {
    name: "Scale",
    price: "$99",
    description: "For product teams shipping multiple launch surfaces.",
    features: ["Unlimited projects", "Advanced controls", "Dedicated onboarding"]
  }
];

const comparisons = [
  { label: "Launch-ready hero", starter: "Included", growth: "Included", scale: "Included" },
  { label: "Plan comparison", starter: "Basic", growth: "Detailed", scale: "Detailed" },
  { label: "Contact CTA", starter: "Email", growth: "Priority", scale: "Dedicated" }
];

function App() {
  return (
    <main className="pricing-shell">
      <section className="pricing-hero">
        <div className="pricing-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A pricing page with a clear hero section, three pricing cards, a comparison table, and a contact CTA.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#plans">See pricing</a>
            <a className="secondary" href="#contact">Contact sales</a>
          </div>
        </div>
        <aside className="pricing-hero-aside">
          <span className="hero-aside-label">Comparison snapshot</span>
          <strong>Pick a plan that fits the stage you are in.</strong>
          <p>Start simple, move fast, and keep an upgrade path visible from the first screen.</p>
        </aside>
      </section>

      <section id="plans" className="pricing-grid">
        {plans.map((plan) => (
          <article key={plan.name} className={\`pricing-card\${plan.featured ? " featured" : ""}\`}>
            <p className="plan-name">{plan.name}</p>
            <h2>{plan.price}<span>/mo</span></h2>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <a href="#contact">{plan.featured ? "Talk to sales" : "Choose plan"}</a>
          </article>
        ))}
      </section>

      <section className="comparison-card">
        <div className="section-heading">
          <p className="eyebrow">Comparison</p>
          <h2>Compare the plans quickly.</h2>
        </div>
        <div className="comparison-table">
          <div className="comparison-head">
            <span>Feature</span>
            <span>Starter</span>
            <span>Growth</span>
            <span>Scale</span>
          </div>
          {comparisons.map((item) => (
            <div key={item.label} className="comparison-row">
              <span>{item.label}</span>
              <span>{item.starter}</span>
              <span>{item.growth}</span>
              <span>{item.scale}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-cta">
        <div>
          <p className="eyebrow">Contact CTA</p>
          <h2>Need a tailored rollout?</h2>
          <p>Contact sales for onboarding, migration help, and pricing guidance for larger teams.</p>
        </div>
        <a href="mailto:sales@cipher.local">Contact sales</a>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildPricingPageCss(): string {
    return `.pricing-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.pricing-hero,
.comparison-card,
.contact-cta,
.pricing-card {
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.08);
}

.pricing-hero {
  display: grid;
  grid-template-columns: 1.5fr 0.9fr;
  gap: 24px;
  padding: 36px;
}

.pricing-copy h1 {
  margin: 0;
  font-size: clamp(3rem, 6vw, 4.75rem);
  line-height: 0.95;
}

.lede {
  margin: 18px 0 0;
  font-size: 1.15rem;
  line-height: 1.8;
  color: #475569;
  max-width: 56ch;
}

.eyebrow,
.hero-aside-label,
.plan-name {
  margin: 0 0 14px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4361ee;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.hero-actions a,
.pricing-card a,
.contact-cta a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border-radius: 999px;
  padding: 14px 20px;
  font-weight: 700;
}

.hero-actions .primary,
.contact-cta a,
.pricing-card.featured a {
  background: #1f3a8a;
  color: #fff;
}

.hero-actions .secondary,
.pricing-card a {
  background: #e2e8f0;
  color: #1e293b;
}

.pricing-hero-aside {
  background: #1e2f55;
  color: #e2e8f0;
  border-radius: 24px;
  padding: 24px;
}

.pricing-hero-aside strong {
  display: block;
  margin-bottom: 16px;
  font-size: 2rem;
  line-height: 1.1;
  color: #fff;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.pricing-card {
  padding: 28px;
}

.pricing-card.featured {
  border-color: rgba(67, 97, 238, 0.45);
  transform: translateY(-6px);
}

.pricing-card h2 {
  margin: 0 0 12px;
  font-size: 2.5rem;
}

.pricing-card h2 span {
  font-size: 1rem;
  color: #64748b;
}

.pricing-card ul {
  margin: 20px 0;
  padding-left: 18px;
  color: #475569;
  line-height: 1.8;
}

.comparison-card,
.contact-cta {
  padding: 30px 32px;
}

.comparison-table {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.comparison-head,
.comparison-row {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  gap: 16px;
  padding: 14px 0;
}

.comparison-head {
  font-weight: 700;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.comparison-row {
  color: #475569;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.contact-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.contact-cta h2 {
  margin: 0 0 10px;
  font-size: clamp(2rem, 4vw, 2.8rem);
}

@media (max-width: 980px) {
  .pricing-shell {
    width: min(100% - 32px, 1120px);
    padding: 28px 0 56px;
  }

  .pricing-hero,
  .pricing-grid,
  .contact-cta,
  .comparison-head,
  .comparison-row {
    grid-template-columns: 1fr;
  }

  .pricing-hero {
    padding: 24px;
  }

  .comparison-head {
    display: none;
  }

  .comparison-row {
    padding: 16px;
    border-radius: 18px;
    background: rgba(241, 245, 249, 0.85);
  }
}
`;
  }

  private buildNotesAppCss(): string {
    return `.notes-shell {
  min-height: 100vh;
  padding: 48px 24px 64px;
  background:
    radial-gradient(circle at top left, rgba(253, 214, 146, 0.55), transparent 28%),
    radial-gradient(circle at top right, rgba(121, 172, 255, 0.35), transparent 24%),
    linear-gradient(180deg, #fffdf7 0%, #f2f5ff 100%);
  color: #162033;
}

.notes-hero,
.notes-grid {
  width: min(1100px, 100%);
  margin: 0 auto;
}

.notes-hero {
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #4162d8;
}

.lede {
  max-width: 640px;
  font-size: 18px;
  line-height: 1.7;
  color: #51607c;
}

.notes-grid {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.composer-card,
.list-card,
.note-card {
  border: 1px solid rgba(22, 32, 51, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 80px rgba(19, 29, 47, 0.08);
}

.composer-card,
.list-card {
  padding: 24px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.section-heading span,
.note-date {
  font-size: 13px;
  font-weight: 600;
  color: #6d7a92;
}

.composer-card label,
.search-field {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #26334d;
}

.composer-card label + label {
  margin-top: 16px;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  margin-top: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(35, 49, 77, 0.12);
  border-radius: 18px;
  background: rgba(248, 250, 255, 0.96);
  color: #162033;
  box-sizing: border-box;
}

textarea {
  resize: vertical;
  min-height: 140px;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  margin-top: 18px;
  font-weight: 700;
  background: #162033;
  color: #fff;
  cursor: pointer;
}

button.ghost {
  margin-top: 0;
  padding: 10px 14px;
  background: rgba(22, 32, 51, 0.08);
  color: #162033;
}

.notes-list {
  display: grid;
  gap: 16px;
}

.note-card {
  padding: 18px;
}

.note-card h3,
.section-heading h2 {
  margin: 0;
}

.note-card-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.note-card p {
  margin: 0;
  line-height: 1.7;
  color: #4f5d78;
}

.note-card.empty {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.64);
}

@media (max-width: 860px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }

  .notes-shell {
    padding-inline: 16px;
  }
}
`;
  }

  private buildNotesIndexCss(): string {
    return `:root {
  font-family: "Segoe UI", "SF Pro Display", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #fffdf7;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}

a {
  color: inherit;
}
`;
  }

  private buildAnnouncementPageTsx(title: string): string {
    return `import "./App.css";

const updates = [
  {
    title: "Faster rollout checks",
    detail: "Review launch readiness with clearer signals before shipping changes."
  },
  {
    title: "Sharper team visibility",
    detail: "Highlight major updates in a format that product, design, and engineering can all scan quickly."
  },
  {
    title: "Safer follow-through",
    detail: "Keep a visible path from announcement to adoption with a direct contact CTA."
  }
];

const timeline = [
  { phase: "Internal preview", date: "Week 1", detail: "Validate messaging, QA the experience, and collect team feedback." },
  { phase: "Limited rollout", date: "Week 2", detail: "Release to a smaller audience and confirm adoption signals." },
  { phase: "Full launch", date: "Week 4", detail: "Publish broadly with support, docs, and follow-up communication ready." }
];

function App() {
  return (
    <main className="announce-shell">
      <section className="announce-hero">
        <div className="announce-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A feature announcement page with a strong hero section, three update cards, a rollout timeline, and a contact CTA.
          </p>
          <div className="announce-actions">
            <a className="primary" href="#updates">See updates</a>
            <a className="secondary" href="#contact">Contact the team</a>
          </div>
        </div>
        <aside className="announce-aside">
          <span className="hero-aside-label">Release snapshot</span>
          <strong>Ship a cleaner announcement with a visible rollout plan.</strong>
          <p>Make the value clear first, then show what changes, when it rolls out, and who to contact.</p>
        </aside>
      </section>

      <section id="updates" className="announce-cards">
        {updates.map((update) => (
          <article key={update.title} className="announce-card">
            <h2>{update.title}</h2>
            <p>{update.detail}</p>
          </article>
        ))}
      </section>

      <section className="timeline-card">
        <div className="section-heading">
          <p className="eyebrow">Rollout timeline</p>
          <h2>How this update rolls out.</h2>
        </div>
        <div className="timeline-list">
          {timeline.map((item) => (
            <article key={item.phase} className="timeline-item">
              <span>{item.date}</span>
              <strong>{item.phase}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-cta">
        <div>
          <p className="eyebrow">Contact CTA</p>
          <h2>Need rollout support?</h2>
          <p>Contact the product team for launch planning, messaging alignment, and stakeholder updates.</p>
        </div>
        <a href="mailto:launch@cipher.local">Contact the team</a>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildAnnouncementPageCss(): string {
    return `.announce-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.announce-hero,
.announce-card,
.timeline-card,
.contact-cta {
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.08);
}

.announce-hero {
  display: grid;
  grid-template-columns: 1.45fr 0.85fr;
  gap: 24px;
  padding: 36px;
}

.announce-copy h1 {
  margin: 0;
  font-size: clamp(3rem, 6vw, 4.6rem);
  line-height: 0.95;
}

.lede {
  margin: 18px 0 0;
  font-size: 1.1rem;
  line-height: 1.8;
  color: #475569;
  max-width: 58ch;
}

.eyebrow,
.hero-aside-label {
  margin: 0 0 14px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4361ee;
}

.announce-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.announce-actions a,
.contact-cta a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border-radius: 999px;
  padding: 14px 20px;
  font-weight: 700;
}

.announce-actions .primary,
.contact-cta a {
  background: #1f3a8a;
  color: #fff;
}

.announce-actions .secondary {
  background: #e2e8f0;
  color: #1e293b;
}

.announce-aside {
  background: #1e2f55;
  color: #e2e8f0;
  border-radius: 24px;
  padding: 24px;
}

.announce-aside strong {
  display: block;
  margin-bottom: 16px;
  font-size: 2rem;
  line-height: 1.1;
  color: #fff;
}

.announce-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.announce-card,
.timeline-card,
.contact-cta {
  padding: 28px;
}

.announce-card h2,
.timeline-card h2,
.contact-cta h2 {
  margin: 0 0 12px;
}

.announce-card p,
.timeline-item p,
.contact-cta p {
  color: #475569;
  line-height: 1.75;
}

.timeline-list {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.timeline-item {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(241, 245, 249, 0.78);
}

.timeline-item span {
  font-size: 0.82rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4361ee;
}

.timeline-item strong {
  font-size: 1.15rem;
  color: #1e293b;
}

.contact-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

@media (max-width: 980px) {
  .announce-shell {
    width: min(100% - 32px, 1120px);
    padding: 28px 0 56px;
  }

  .announce-hero,
  .announce-cards,
  .contact-cta {
    grid-template-columns: 1fr;
  }

  .announce-hero {
    padding: 24px;
  }
}
`;
  }

  private buildLandingPageTsx(title: string): string {
    return `import "./App.css";

const highlights = [
  { value: "3 days", label: "to launch campaign-ready copy" },
  { value: "12 sections", label: "that already tell a clean story" },
  { value: "94%", label: "preview-ready polish out of the box" }
];

const features = [
  { title: "Message with momentum", text: "Hero, proof, and CTA blocks are composed to feel intentional instead of placeholder-heavy." },
  { title: "Designed to scan", text: "Big typography, clean spacing, and soft surfaces make the page feel presentable in preview immediately." },
  { title: "Structured for iteration", text: "Each section is ready for product-specific copy, brand color tuning, and launch edits." }
];

function App() {
  return (
    <main className="landing-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">
            A sharper landing page starter with stronger hierarchy, richer surfaces, and a preview that feels closer to a real launch draft.
          </p>
          <div className="hero-actions">
            <button type="button">Start free</button>
            <a href="#details">See the features</a>
            <a href="#contact">Contact sales</a>
          </div>
        </div>

        <aside className="hero-aside">
          <span className="hero-aside-label">Launch snapshot</span>
          <strong>Ready to position</strong>
          <p>Use this shell for product launches, studio pages, founder announcements, or campaign microsites.</p>
          <div className="hero-pulse">
            <span></span>
            Preview-friendly
          </div>
        </aside>
      </section>

      <section className="stats-strip">
        {highlights.map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="section-head">
        <p className="eyebrow">Features</p>
        <h2>Feature cards that explain the value fast.</h2>
      </section>

      <section id="details" className="feature-grid">
        {features.map((item) => (
          <article key={item.title} className="feature-card">
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="story">
        <div>
          <p className="eyebrow">Why it lands better</p>
          <h2>Intentional launch framing beats a blank starter.</h2>
        </div>
        <p>
          The page opens with a strong frame, reinforces trust with clean metrics, and uses benefit cards that feel like a real draft instead of generic filler text.
        </p>
      </section>

      <section id="contact" className="contact-card">
        <div>
          <p className="eyebrow">Contact</p>
          <h2>Ready to turn this into a launch-ready contact CTA?</h2>
          <p className="contact-copy">Talk to the team, request a walkthrough, or line up the next revision directly from this contact section.</p>
        </div>
        <div className="contact-actions">
          <button type="button">Contact sales</button>
          <a href="mailto:hello@${title.toLowerCase().replace(/\s+/g, "")}.com">hello@${title.toLowerCase().replace(/\s+/g, "")}.com</a>
        </div>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildStaticLandingHtml(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="landing-shell">
      <section class="hero-card">
        <div class="hero-copy">
          <p class="eyebrow">Built with Cipher Workspace</p>
          <h1>${title}</h1>
          <p class="lede">A stronger static landing page starter with better hierarchy, richer cards, and a more presentable preview state.</p>
          <div class="hero-actions">
            <button id="cta" type="button">Start free</button>
            <a href="#details">See the features</a>
            <a href="#contact">Contact sales</a>
          </div>
        </div>

        <aside class="hero-aside">
          <span class="hero-aside-label">Launch snapshot</span>
          <strong>Ready to position</strong>
          <p>Use this shell for campaigns, product announcements, studio sites, or early launch drafts.</p>
          <div class="hero-pulse"><span></span>Preview-friendly</div>
        </aside>
      </section>

      <section class="stats-strip">
        <div><strong>3 days</strong><span>to campaign-ready copy</span></div>
        <div><strong>12 sections</strong><span>that already tell a clear story</span></div>
        <div><strong>94%</strong><span>preview polish from the first run</span></div>
      </section>

      <section class="section-head">
        <p class="eyebrow">Features</p>
        <h2>Feature cards that explain the value fast.</h2>
      </section>

      <section id="details" class="feature-grid">
        <article class="feature-card"><h2>Message with momentum</h2><p>Hero, proof, and CTA blocks are composed to feel intentional instead of placeholder-heavy.</p></article>
        <article class="feature-card"><h2>Designed to scan</h2><p>Large typography, balanced spacing, and soft surfaces make the page feel presentation-ready.</p></article>
        <article class="feature-card"><h2>Structured for iteration</h2><p>Each section is ready for product-specific copy, brand tuning, and launch refinement.</p></article>
      </section>

      <section class="story">
        <div>
          <p class="eyebrow">Why it lands better</p>
          <h2>Intentional launch framing beats a blank starter.</h2>
        </div>
        <p id="status">This starter opens with a strong frame, reinforces trust quickly, and gives you a cleaner preview before product-specific edits.</p>
      </section>

      <section id="contact" class="contact-card">
        <div>
          <p class="eyebrow">Contact</p>
          <h2>Ready to turn this into a launch-ready contact CTA?</h2>
          <p class="contact-copy">Talk to the team, request a walkthrough, or line up the next revision directly from this contact section.</p>
        </div>
        <div class="contact-actions">
          <button type="button">Contact sales</button>
          <a href="mailto:hello@${title.toLowerCase().replace(/\s+/g, "")}.com">hello@${title.toLowerCase().replace(/\s+/g, "")}.com</a>
        </div>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
  }

  private buildStaticLandingCss(): string {
    return `.landing-shell {
  min-height: 100vh;
  padding: 34px 20px 72px;
  background:
    radial-gradient(circle at top left, rgba(100, 173, 255, 0.2), transparent 26%),
    radial-gradient(circle at top right, rgba(255, 196, 119, 0.28), transparent 22%),
    linear-gradient(180deg, #f7f8fc 0%, #edf3ff 100%);
  color: #132238;
}

.hero-card,
.section-head,
.stats-strip,
.feature-grid,
.story,
.contact-card {
  width: min(1140px, 100%);
  margin: 0 auto;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 320px;
  gap: 18px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 80px rgba(17, 30, 48, 0.08);
  backdrop-filter: blur(14px);
}

.hero-copy {
  padding: 34px 18px 24px;
}

.hero-aside {
  padding: 24px;
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(20, 34, 56, 0.94), rgba(36, 57, 92, 0.9)),
    #132238;
  color: #ecf4ff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.hero-aside-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(236, 244, 255, 0.64);
}

.hero-aside strong {
  font-size: 28px;
  line-height: 1.05;
}

.hero-aside p {
  margin: 0;
  line-height: 1.7;
  color: rgba(236, 244, 255, 0.78);
}

.hero-pulse {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
}

.hero-pulse span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #7be0c3;
  box-shadow: 0 0 0 6px rgba(123, 224, 195, 0.18);
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #4a67db;
}

.hero-card h1,
.story h2,
.feature-card h2 {
  margin: 0;
}

.hero-card h1 {
  max-width: 720px;
  font-size: clamp(52px, 8vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.04em;
}

.lede {
  max-width: 700px;
  margin: 22px 0 0;
  font-size: 20px;
  line-height: 1.75;
  color: #4e5f7c;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 26px;
  align-items: center;
}

.hero-actions button,
.hero-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.hero-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.hero-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.section-head {
  margin-top: 26px;
}

.stats-strip div,
.feature-card,
.story,
.contact-card {
  padding: 24px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 22px 72px rgba(20, 32, 51, 0.08);
  backdrop-filter: blur(12px);
}

.stats-strip strong {
  display: block;
  font-size: 36px;
}

.stats-strip span {
  color: #60708d;
  line-height: 1.6;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.feature-card p,
.story p {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.story {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-copy {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.contact-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
}

.contact-actions button,
.contact-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.contact-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.contact-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

@media (max-width: 860px) {
  .hero-card,
  .section-head,
  .stats-strip,
  .feature-grid,
  .story,
  .contact-card {
    grid-template-columns: 1fr;
  }

  .hero-copy {
    padding: 28px 8px 16px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
  }

  private buildStaticLandingJs(title: string): string {
    return `const ctaButton = document.getElementById("cta");
const statusEl = document.getElementById("status");

if (ctaButton && statusEl) {
  ctaButton.addEventListener("click", () => {
    statusEl.textContent = "${title} is now framed as a sharper launch-ready draft with stronger hierarchy and clearer proof blocks.";
  });
}
`;
  }

  private buildLandingPageCss(): string {
    return `.landing-shell {
  min-height: 100vh;
  padding: 34px 20px 72px;
  background:
    radial-gradient(circle at top left, rgba(100, 173, 255, 0.2), transparent 26%),
    radial-gradient(circle at top right, rgba(255, 196, 119, 0.28), transparent 22%),
    linear-gradient(180deg, #f7f8fc 0%, #edf3ff 100%);
  color: #132238;
}

.hero-card,
.section-head,
.stats-strip,
.feature-grid,
.story,
.contact-card {
  width: min(1140px, 100%);
  margin: 0 auto;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 320px;
  gap: 18px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 24px 80px rgba(17, 30, 48, 0.08);
  backdrop-filter: blur(14px);
}

.hero-copy {
  padding: 34px 18px 24px;
}

.hero-aside {
  padding: 24px;
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(20, 34, 56, 0.94), rgba(36, 57, 92, 0.9)),
    #132238;
  color: #ecf4ff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.hero-aside-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(236, 244, 255, 0.64);
}

.hero-aside strong {
  font-size: 28px;
  line-height: 1.05;
}

.hero-aside p {
  margin: 0;
  line-height: 1.7;
  color: rgba(236, 244, 255, 0.78);
}

.hero-pulse {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
}

.hero-pulse span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #7be0c3;
  box-shadow: 0 0 0 6px rgba(123, 224, 195, 0.18);
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #4a67db;
}

.hero-card h1,
.story h2,
.feature-card h2 {
  margin: 0;
}

.hero-card h1 {
  max-width: 720px;
  font-size: clamp(52px, 8vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.04em;
}

.lede {
  max-width: 700px;
  margin: 22px 0 0;
  font-size: 20px;
  line-height: 1.75;
  color: #4e5f7c;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 26px;
  align-items: center;
}

.hero-actions button,
.hero-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.hero-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.hero-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.section-head {
  margin-top: 26px;
}

.stats-strip div,
.feature-card,
.story,
.contact-card {
  padding: 24px;
  border: 1px solid rgba(19, 34, 56, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 22px 72px rgba(20, 32, 51, 0.08);
  backdrop-filter: blur(12px);
}

.stats-strip strong {
  display: block;
  font-size: 36px;
}

.stats-strip span {
  color: #60708d;
  line-height: 1.6;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.feature-card p,
.story p {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.story {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  margin-top: 24px;
}

.contact-copy {
  margin: 14px 0 0;
  line-height: 1.7;
  color: #51607c;
}

.contact-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
}

.contact-actions button,
.contact-actions a {
  border-radius: 999px;
  padding: 14px 24px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.contact-actions button {
  border: 0;
  background: linear-gradient(135deg, #132238 0%, #3558d6 100%);
  color: #fff;
  box-shadow: 0 18px 42px rgba(53, 88, 214, 0.26);
}

.contact-actions a {
  color: #132238;
  background: rgba(19, 34, 56, 0.08);
}

@media (max-width: 860px) {
  .hero-card,
  .section-head,
  .stats-strip,
  .feature-grid,
  .story,
  .contact-card {
    grid-template-columns: 1fr;
  }

  .hero-copy {
    padding: 28px 8px 16px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
  }

  private buildLandingIndexCss(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #142033;
  background: #fff8ef;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}
`;
  }

  private buildDashboardTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildDashboardDomainContent(domainFocus);
    return `import { useState } from "react";
import "./App.css";

const metrics = ${JSON.stringify(content.metrics, null, 2)} as const;

const activities = ${JSON.stringify(content.activities, null, 2)};

const team = ${JSON.stringify(content.team, null, 2)} as const;

const deals = ${JSON.stringify(content.deals, null, 2)} as const;

const regions = ${JSON.stringify(content.regions, null, 2)} as const;

const chartHeights = ${JSON.stringify(content.chartHeights)};

function App() {
  const [regionFilter, setRegionFilter] = useState<string>(regions[0] ?? "All regions");
  const [query, setQuery] = useState("");
  const visibleDeals = deals.filter((deal) => {
    const matchesRegion = regionFilter === (regions[0] ?? "All regions") || deal.region === regionFilter;
    const needle = query.trim().toLowerCase();
    if (!needle) return matchesRegion;
    return matchesRegion && [deal.name, deal.region, deal.stage, deal.value].some((value) =>
      value.toLowerCase().includes(needle)
    );
  });

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="eyebrow">${content.sidebarEyebrow}</p>
        <h1>${title}</h1>
        <nav>
          <a href="#overview">${content.nav[0] ?? "Overview"}</a>
          <a href="#pipeline">${content.nav[1] ?? "Pipeline"}</a>
          <a href="#activity">${content.nav[2] ?? "Activity"}</a>
          <a href="#team">${content.nav[3] ?? "Team"}</a>
        </nav>
      </aside>

      <section className="dashboard-main">
        <header id="overview" className="dashboard-header">
          <div>
            <p className="eyebrow">${content.headerEyebrow}</p>
            <h2>${content.headerTitle}</h2>
            <p>${content.headerCopy}</p>
          </div>
          <button type="button">${content.buttonLabel}</button>
        </header>

        <section className="filter-bar">
          <label className="filter-field">
            <span>${content.filterLabel}</span>
            <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
          <label className="filter-field search-field">
            <span>${content.searchLabel}</span>
            <input
              type="search"
              value={query}
              placeholder="${content.searchPlaceholder}"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="metric-grid">
          {metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p className={metric.tone === "up" ? "metric-up" : "metric-down"}>{metric.change} vs last period</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article id="pipeline" className="panel chart-panel">
            <div className="panel-header">
              <h3>${content.chartTitle}</h3>
              <span>${content.chartRange}</span>
            </div>
            <div className="chart-bars">
              {chartHeights.map((height, index) => (
                <div key={index} style={{ height }}></div>
              ))}
            </div>
          </article>

          <article id="activity" className="panel activity-panel">
            <div className="panel-header">
              <h3>${content.activityTitle}</h3>
              <span>${content.activityBadge}</span>
            </div>
            <ul>
              {activities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="content-grid content-grid-secondary">
          <article id="team" className="panel team-panel">
            <div className="panel-header">
              <h3>${content.teamTitle}</h3>
              <span>${content.teamBadge}</span>
            </div>
            <div className="team-list">
              {team.map((person) => (
                <article key={person.name} className="team-row">
                  <div>
                    <strong>{person.name}</strong>
                    <p>{person.role}</p>
                  </div>
                  <span>{person.status}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="panel deals-panel">
            <div className="panel-header">
              <h3>${content.dealsTitle}</h3>
              <span>${content.dealsBadge}</span>
            </div>
            <ul className="deals-list">
              {visibleDeals.length === 0 ? (
                <li className="deals-empty">No deals match the current filter.</li>
              ) : (
                visibleDeals.map((deal) => (
                  <li key={deal.name} className="deal-row">
                    <div>
                      <strong>{deal.name}</strong>
                      <p>{deal.region} · {deal.stage}</p>
                    </div>
                    <span>{deal.value}</span>
                  </li>
                ))
              )}
            </ul>
            <p className="signal-copy">${content.dealsSummary}</p>
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildDashboardCss(): string {
    return `.dashboard-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, rgba(95, 140, 255, 0.24), transparent 22%),
    radial-gradient(circle at top right, rgba(88, 208, 180, 0.14), transparent 20%),
    linear-gradient(180deg, #f4f7fd 0%, #eef2f8 100%);
  color: #162033;
}

.dashboard-sidebar {
  padding: 30px 26px;
  border-right: 1px solid rgba(22, 32, 51, 0.08);
  background: rgba(16, 26, 44, 0.95);
  color: #edf2ff;
}

.dashboard-sidebar h1 {
  margin: 0 0 22px;
  font-size: 32px;
}

.dashboard-sidebar nav {
  display: grid;
  gap: 12px;
}

.dashboard-sidebar a {
  color: inherit;
  text-decoration: none;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}

.dashboard-main {
  padding: 30px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #6f86c9;
}

.dashboard-header,
.metric-card,
.panel {
  border: 1px solid rgba(20, 32, 51, 0.08);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 22px 72px rgba(17, 25, 39, 0.08);
  backdrop-filter: blur(12px);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 24px;
}

.dashboard-header h2,
.panel-header h3 {
  margin: 0;
}

.dashboard-header p {
  margin: 10px 0 0;
  max-width: 620px;
  color: #617089;
  line-height: 1.7;
}

.dashboard-header button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  font: inherit;
  font-weight: 700;
  background: #162033;
  color: #fff;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.filter-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.filter-field {
  display: grid;
  gap: 8px;
  color: #4f5d78;
}

.filter-field span {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-field select,
.filter-field input {
  width: 100%;
  border: 1px solid rgba(20, 32, 51, 0.12);
  border-radius: 16px;
  padding: 13px 14px;
  font: inherit;
  color: #162033;
  background: rgba(255, 255, 255, 0.92);
}

.metric-card {
  padding: 20px;
}

.metric-card span,
.panel-header span {
  color: #6b7a94;
}

.metric-card strong {
  display: block;
  margin-top: 12px;
  font-size: 34px;
}

.metric-card p {
  margin: 10px 0 0;
  font-weight: 700;
}

.metric-up {
  color: #18875f;
}

.metric-down {
  color: #b42318;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  margin-top: 18px;
}

.content-grid-secondary {
  grid-template-columns: 1fr 0.9fr;
}

.panel {
  padding: 22px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.chart-bars {
  height: 280px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  align-items: end;
}

.chart-bars div {
  border-radius: 18px 18px 8px 8px;
  background: linear-gradient(180deg, #3b64e6 0%, #8db8ff 100%);
}

.activity-panel ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 14px;
  color: #4f5d78;
}

.team-list {
  display: grid;
  gap: 12px;
}

.team-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(244, 247, 253, 0.95);
  border: 1px solid rgba(20, 32, 51, 0.06);
}

.team-row strong,
.signal-copy {
  color: #162033;
}

.deals-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.deal-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(244, 247, 253, 0.95);
  border: 1px solid rgba(20, 32, 51, 0.06);
}

.deal-row p,
.deals-empty {
  margin: 4px 0 0;
  color: #60708d;
}

.deal-row span {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(24, 135, 95, 0.1);
  color: #18875f;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.team-row p {
  margin: 4px 0 0;
  color: #60708d;
}

.team-row span {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(59, 100, 230, 0.1);
  color: #3154cf;
  font-size: 12px;
  font-weight: 700;
}

.signal-copy {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
}

@media (max-width: 920px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .metric-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    grid-template-columns: 1fr;
  }

  .dashboard-header {
    flex-direction: column;
    align-items: start;
  }
}
`;
  }

  private buildDashboardIndexCss(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #eef2f8;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}
`;
  }

  private buildKanbanBoardTsx(title: string): string {
    return `import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type LaneId = "todo" | "in-progress" | "done";

type Card = {
  id: number;
  title: string;
  lane: LaneId;
};

const initialCards: Card[] = [
  { id: 1, title: "Draft launch checklist", lane: "todo" },
  { id: 2, title: "Review release notes", lane: "in-progress" },
  { id: 3, title: "Ship onboarding copy", lane: "done" }
];

const lanes: Array<{ id: LaneId; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" }
];

function App() {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [draft, setDraft] = useState("");

  function addTask(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setCards((current) => [...current, { id: Date.now(), title, lane: "todo" }]);
    setDraft("");
  }

  function moveCard(cardId: number, lane: LaneId) {
    setCards((current) => current.map((card) => card.id === cardId ? { ...card, lane } : card));
  }

  return (
    <main className="kanban-shell">
      <section className="kanban-header">
        <div>
          <p className="eyebrow">Workflow board</p>
          <h1>${title}</h1>
          <p className="lede">Track incoming work, shift priorities, and move tasks cleanly between lanes.</p>
        </div>
        <form className="task-form" onSubmit={addTask}>
          <label htmlFor="task-title">Add task</label>
          <div className="task-form-row">
            <input
              id="task-title"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Prepare launch assets"
            />
            <button type="submit">Add task</button>
          </div>
        </form>
      </section>

      <section className="kanban-grid">
        {lanes.map((lane) => (
          <article key={lane.id} className="kanban-lane">
            <header>
              <h2>{lane.label}</h2>
              <span>{cards.filter((card) => card.lane === lane.id).length}</span>
            </header>
            <div className="kanban-cards">
              {cards.filter((card) => card.lane === lane.id).map((card) => (
                <div key={card.id} className="kanban-card">
                  <strong>{card.title}</strong>
                  <div className="kanban-actions">
                    {lanes.filter((target) => target.id !== card.lane).map((target) => (
                      <button key={target.id} type="button" onClick={() => moveCard(card.id, target.id)}>
                        Move to {target.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildKanbanBoardCss(): string {
    return `.kanban-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(255, 196, 94, 0.18), transparent 28%),
    linear-gradient(180deg, #f5f1e8 0%, #e7edf3 100%);
  color: #162033;
}

.kanban-header {
  display: grid;
  grid-template-columns: 1.3fr minmax(280px, 360px);
  gap: 24px;
  align-items: start;
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.8rem;
  color: #a04d24;
}

.kanban-header h1,
.kanban-lane h2 {
  margin: 0;
}

.lede {
  margin: 12px 0 0;
  max-width: 56ch;
  line-height: 1.7;
  color: #465467;
}

.task-form,
.kanban-lane {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(22, 32, 51, 0.08);
  border-radius: 28px;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(22, 32, 51, 0.08);
}

.task-form label {
  display: block;
  margin-bottom: 10px;
  font-weight: 700;
}

.task-form-row {
  display: flex;
  gap: 12px;
}

.task-form input {
  flex: 1;
  border: 1px solid rgba(22, 32, 51, 0.15);
  border-radius: 16px;
  padding: 14px 16px;
  font: inherit;
}

.task-form button,
.kanban-actions button {
  border: none;
  border-radius: 999px;
  padding: 12px 16px;
  font: inherit;
  font-weight: 700;
  background: #162033;
  color: #fff;
  cursor: pointer;
}

.kanban-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.kanban-lane header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.kanban-lane header span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #f0ede6;
  font-weight: 700;
}

.kanban-cards {
  display: grid;
  gap: 14px;
}

.kanban-card {
  border-radius: 20px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid rgba(22, 32, 51, 0.08);
}

.kanban-card strong {
  display: block;
  margin-bottom: 14px;
}

.kanban-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.kanban-actions button {
  background: #e8eef5;
  color: #162033;
}

@media (max-width: 980px) {
  .kanban-header,
  .kanban-grid {
    grid-template-columns: 1fr;
  }

  .kanban-shell {
    padding: 24px;
  }

  .task-form-row {
    flex-direction: column;
  }
}
`;
  }

  private buildKanbanBoardIndexCss(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #162033;
  background: #edf2f7;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}
`;
  }

  private buildStaticKanbanHtml(title: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="kanban-shell">
      <section class="kanban-header">
        <div>
          <p class="eyebrow">Workflow board</p>
          <h1>${title}</h1>
          <p class="lede">Track tasks and move them between todo, in progress, and done.</p>
        </div>
        <form id="task-form" class="task-form">
          <label for="task-title">Add task</label>
          <div class="task-form-row">
            <input id="task-title" placeholder="Prepare launch assets" />
            <button type="submit">Add task</button>
          </div>
        </form>
      </section>
      <section class="kanban-grid">
        <article class="kanban-lane"><header><h2>Todo</h2><span id="todo-count">1</span></header><div id="todo-list" class="kanban-cards"></div></article>
        <article class="kanban-lane"><header><h2>In Progress</h2><span id="progress-count">1</span></header><div id="progress-list" class="kanban-cards"></div></article>
        <article class="kanban-lane"><header><h2>Done</h2><span id="done-count">1</span></header><div id="done-list" class="kanban-cards"></div></article>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
  }

  private buildStaticKanbanCss(): string {
    return this.buildKanbanBoardCss();
  }

  private buildStaticKanbanJs(): string {
    return `const state = [
  { id: 1, title: "Draft checklist", lane: "todo" },
  { id: 2, title: "Review blockers", lane: "progress" },
  { id: 3, title: "Publish recap", lane: "done" }
];

const lanes = {
  todo: document.getElementById("todo-list"),
  progress: document.getElementById("progress-list"),
  done: document.getElementById("done-list")
};

function moveCard(id, lane) {
  const card = state.find((entry) => entry.id === id);
  if (!card) return;
  card.lane = lane;
  renderBoard();
}

function renderBoard() {
  Object.values(lanes).forEach((lane) => {
    if (lane) lane.replaceChildren();
  });

  state.forEach((card) => {
    const wrapper = document.createElement("div");
    wrapper.className = "kanban-card";

    const title = document.createElement("strong");
    title.textContent = card.title;
    wrapper.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "kanban-actions";
    [["todo", "Todo"], ["progress", "In Progress"], ["done", "Done"]]
      .filter(([lane]) => lane !== card.lane)
      .forEach(([lane, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Move to " + label;
        button.addEventListener("click", () => moveCard(card.id, lane));
        actions.appendChild(button);
      });

    wrapper.appendChild(actions);
    lanes[card.lane]?.appendChild(wrapper);
  });

  document.getElementById("todo-count").textContent = String(state.filter((card) => card.lane === "todo").length);
  document.getElementById("progress-count").textContent = String(state.filter((card) => card.lane === "progress").length);
  document.getElementById("done-count").textContent = String(state.filter((card) => card.lane === "done").length);
}

document.getElementById("task-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("task-title");
  const title = input?.value?.trim();
  if (!title) return;
  state.push({ id: Date.now(), title, lane: "todo" });
  input.value = "";
  renderBoard();
});

renderBoard();
`;
  }

  private buildCrudAppTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildCrudDomainContent(domainFocus);
    return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type RecordItem = {
  id: string;
  name: string;
  category: string;
  owner: string;
  status: "Active" | "Review" | "Archived";
};

type RecordDraft = Omit<RecordItem, "id">;

const initialRecords: RecordItem[] = ${JSON.stringify(content.initialRecords, null, 2)};

const emptyDraft: RecordDraft = { name: "", category: "", owner: "", status: "Active" };

function App() {
  const [records, setRecords] = useState<RecordItem[]>(initialRecords);
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [record.name, record.category, record.owner, record.status].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [records, query]);

  const activeCount = records.filter((record) => record.status === "Active").length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft.name.trim();
    const nextCategory = draft.category.trim();
    const nextOwner = draft.owner.trim();
    if (!nextName || !nextCategory || !nextOwner) return;

    if (editingId) {
      setRecords((current) =>
        current.map((record) =>
          record.id === editingId
            ? { ...record, name: nextName, category: nextCategory, owner: nextOwner, status: draft.status }
            : record
        )
      );
    } else {
      setRecords((current) => [
        {
          id: crypto.randomUUID(),
          name: nextName,
          category: nextCategory,
          owner: nextOwner,
          status: draft.status
        },
        ...current
      ]);
    }

    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleEdit = (record: RecordItem) => {
    setDraft({
      name: record.name,
      category: record.category,
      owner: record.owner,
      status: record.status
    });
    setEditingId(record.id);
  };

  const handleDelete = (recordId: string) => {
    setRecords((current) => current.filter((record) => record.id !== recordId));
    if (editingId === recordId) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  };

  return (
    <main className="crud-shell">
      <section className="crud-hero">
        <div>
          <p className="eyebrow">${content.eyebrow}</p>
          <h1>${title}</h1>
          <p className="lede">${content.lede}</p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Total records</span>
            <strong>{records.length}</strong>
          </article>
          <article>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </article>
        </div>
      </section>

      <section className="crud-grid">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <h2>{editingId ? "Edit ${content.singularLabel}" : "Create ${content.singularLabel}"}</h2>
              <span>{editingId ? "Update the selected item" : "Capture a new item quickly"}</span>
            </div>
            {editingId ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>

          <label>
            ${content.nameLabel}
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="${content.namePlaceholder}"
            />
          </label>

          <label>
            ${content.categoryLabel}
            <input
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              placeholder="${content.categoryPlaceholder}"
            />
          </label>

          <label>
            ${content.ownerLabel}
            <input
              value={draft.owner}
              onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
              placeholder="${content.ownerPlaceholder}"
            />
          </label>

          <label>
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({ ...current, status: event.target.value as RecordItem["status"] }))
              }
            >
              <option value="Active">Active</option>
              <option value="Review">Review</option>
              <option value="Archived">Archived</option>
            </select>
          </label>

          <button type="submit">{editingId ? "Save changes" : "Add ${content.singularLabel}"}</button>
        </form>

        <section className="records-card">
          <div className="section-heading records-heading">
            <div>
              <h2>${this.toDisplayLabel(content.pluralLabel)}</h2>
              <span>{visibleRecords.length} visible</span>
            </div>
            <label className="search-field">
              ${content.searchLabel}
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by ${content.nameLabel.toLowerCase()}, ${content.ownerLabel.toLowerCase()}, or status"
              />
            </label>
          </div>

          <div className="records-table">
            <div className="records-table-head">
              <span>${content.nameLabel}</span>
              <span>${content.categoryLabel}</span>
              <span>${content.ownerLabel}</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {visibleRecords.length === 0 ? (
              <div className="records-empty">No ${content.pluralLabel} match the current filter.</div>
            ) : (
              visibleRecords.map((record) => (
                <article key={record.id} className="record-row">
                  <strong>{record.name}</strong>
                  <span>{record.category}</span>
                  <span>{record.owner}</span>
                  <span className={\`status-badge status-\${record.status.toLowerCase()}\`}>{record.status}</span>
                  <div className="row-actions">
                    <button type="button" className="ghost" onClick={() => handleEdit(record)}>
                      Edit
                    </button>
                    <button type="button" className="ghost danger" onClick={() => handleDelete(record.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildVendorPaymentsCrudAppTsx(title: string): string {
    return `import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type PaymentStatus = "Pending" | "Due soon" | "Paid";

type VendorPayment = {
  id: string;
  vendor: string;
  amount: string;
  dueDate: string;
  status: PaymentStatus;
};

type VendorDraft = Omit<VendorPayment, "id">;

const initialPayments: VendorPayment[] = [
  { id: "1", vendor: "Northwind Supply", amount: "$2,400", dueDate: "2026-04-09", status: "Pending" },
  { id: "2", vendor: "Harbor Freight Co.", amount: "$860", dueDate: "2026-04-07", status: "Due soon" },
  { id: "3", vendor: "Blue Mesa Logistics", amount: "$1,120", dueDate: "2026-04-03", status: "Paid" }
];

const emptyDraft: VendorDraft = { vendor: "", amount: "", dueDate: "", status: "Pending" };

function App() {
  const [payments, setPayments] = useState<VendorPayment[]>(initialPayments);
  const [draft, setDraft] = useState<VendorDraft>(emptyDraft);
  const [query, setQuery] = useState("");

  const visiblePayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter((payment) =>
      [payment.vendor, payment.amount, payment.dueDate, payment.status].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [payments, query]);

  const paidCount = payments.filter((payment) => payment.status === "Paid").length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const vendor = draft.vendor.trim();
    const amount = draft.amount.trim();
    const dueDate = draft.dueDate.trim();
    if (!vendor || !amount || !dueDate) return;

    setPayments((current) => [
      {
        id: crypto.randomUUID(),
        vendor,
        amount,
        dueDate,
        status: draft.status
      },
      ...current
    ]);
    setDraft(emptyDraft);
  };

  const handleMarkPaid = (paymentId: string) => {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId ? { ...payment, status: "Paid" } : payment
      )
    );
  };

  return (
    <main className="crud-shell">
      <section className="crud-hero">
        <div>
          <p className="eyebrow">Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">Track vendor payouts, spot what is due next, and mark invoices paid from one compact workspace.</p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Total vendors</span>
            <strong>{payments.length}</strong>
          </article>
          <article>
            <span>Paid</span>
            <strong>{paidCount}</strong>
          </article>
        </div>
      </section>

      <section className="crud-grid">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <h2>Add vendor payment</h2>
              <span>Capture the next due payment and keep the table current.</span>
            </div>
          </div>

          <label>
            Vendor
            <input
              value={draft.vendor}
              onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))}
              placeholder="Vendor name"
            />
          </label>

          <label>
            Amount
            <input
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="$1,250"
            />
          </label>

          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>

          <label>
            Payment status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({ ...current, status: event.target.value as PaymentStatus }))
              }
            >
              <option value="Pending">Pending</option>
              <option value="Due soon">Due soon</option>
              <option value="Paid">Paid</option>
            </select>
          </label>

          <button type="submit">Add payment</button>
        </form>

        <section className="records-card">
          <div className="section-heading records-heading">
            <div>
              <h2>Vendor payments</h2>
              <span>{visiblePayments.length} visible</span>
            </div>
            <label className="search-field">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by vendor, amount, due date, or status"
              />
            </label>
          </div>

          <div className="records-table">
            <div className="records-table-head">
              <span>Vendor</span>
              <span>Amount</span>
              <span>Due date</span>
              <span>Payment status</span>
              <span>Actions</span>
            </div>
            {visiblePayments.length === 0 ? (
              <div className="records-empty">No vendor payments match the current filter.</div>
            ) : (
              visiblePayments.map((payment) => (
                <article key={payment.id} className="record-row">
                  <strong>{payment.vendor}</strong>
                  <span>{payment.amount}</span>
                  <span>{payment.dueDate}</span>
                  <span className={\`status-badge status-\${payment.status.toLowerCase().replace(/\\s+/g, "-")}\`}>
                    {payment.status}
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleMarkPaid(payment.id)}
                      disabled={payment.status === "Paid"}
                    >
                      Mark paid
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
`;
  }

  private buildCrudAppCss(): string {
    return `.crud-shell {
  min-height: 100vh;
  padding: 44px 24px 64px;
  background:
    radial-gradient(circle at top left, rgba(87, 132, 255, 0.18), transparent 24%),
    radial-gradient(circle at top right, rgba(81, 212, 191, 0.18), transparent 20%),
    linear-gradient(180deg, #f5f8ff 0%, #eef3fb 100%);
  color: #152033;
}

.crud-hero,
.crud-grid {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.crud-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 26px;
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #4866df;
}

.crud-hero h1 {
  margin: 0 0 12px;
  font-size: clamp(2.3rem, 5vw, 3.8rem);
}

.lede {
  max-width: 680px;
  margin: 0;
  font-size: 18px;
  line-height: 1.7;
  color: #5b6983;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 14px;
}

.hero-stats article,
.editor-card,
.records-card {
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 80px rgba(20, 29, 44, 0.08);
}

.hero-stats article {
  padding: 18px 20px;
}

.hero-stats span {
  display: block;
  font-size: 13px;
  color: #6c7a93;
}

.hero-stats strong {
  display: block;
  margin-top: 8px;
  font-size: 28px;
}

.crud-grid {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.editor-card,
.records-card {
  padding: 24px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 18px;
}

.section-heading h2 {
  margin: 0 0 6px;
  font-size: 24px;
}

.section-heading span {
  font-size: 13px;
  color: #6d7a92;
}

.editor-card label,
.search-field {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #26334d;
}

.editor-card label + label {
  margin-top: 16px;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  width: 100%;
  margin-top: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(35, 49, 77, 0.12);
  border-radius: 18px;
  background: rgba(248, 250, 255, 0.96);
  color: #152033;
  box-sizing: border-box;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  margin-top: 18px;
  font-weight: 700;
  background: #152033;
  color: #fff;
  cursor: pointer;
}

button.ghost {
  margin-top: 0;
  padding: 10px 14px;
  background: rgba(21, 32, 51, 0.08);
  color: #152033;
}

button.ghost.danger {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

.records-heading {
  align-items: center;
}

.records-table {
  display: grid;
  gap: 12px;
}

.records-table-head,
.record-row {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 0.9fr 0.8fr 1fr;
  gap: 12px;
  align-items: center;
}

.records-table-head {
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #71809b;
}

.record-row {
  padding: 16px;
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 22px;
  background: rgba(249, 251, 255, 0.95);
}

.record-row strong {
  font-size: 15px;
}

.record-row span {
  color: #596884;
}

.row-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  color: #0f8a57;
  background: rgba(15, 138, 87, 0.12);
}

.status-review {
  color: #9a6700;
  background: rgba(154, 103, 0, 0.12);
}

.status-archived {
  color: #5b6983;
  background: rgba(91, 105, 131, 0.12);
}

.records-empty {
  padding: 24px;
  border: 1px dashed rgba(21, 32, 51, 0.14);
  border-radius: 22px;
  color: #6c7a93;
  text-align: center;
}

@media (max-width: 980px) {
  .crud-hero,
  .crud-grid {
    grid-template-columns: 1fr;
  }

  .crud-hero {
    flex-direction: column;
    align-items: start;
  }

  .records-table-head {
    display: none;
  }

  .record-row {
    grid-template-columns: 1fr;
  }

  .row-actions {
    justify-content: flex-start;
  }
}
`;
  }

  private buildCrudIndexCss(): string {
    return `:root {
  font-family: "Segoe UI", "Aptos", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #152033;
  background: #eef3fb;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}
`;
  }

  private extractSimpleRenameInstruction(prompt: string): { from: string; to: string } | null {
    const normalized = (prompt ?? "").trim();
    if (!normalized) return null;

    const explicitFromTo = /from\s+["']([^"']+)["']\s+to\s+["']([^"']+)["']/i.exec(normalized);
    if (explicitFromTo) {
      return {
        from: explicitFromTo[1],
        to: explicitFromTo[2]
      };
    }

    const plainRename = /change\s+.+?\s+from\s+([A-Za-z0-9 _-]+?)\s+to\s+([A-Za-z0-9 _-]+?)(?:\s+wherever|\s+then|\s*$)/i.exec(normalized);
    if (plainRename) {
      return {
        from: plainRename[1].trim(),
        to: plainRename[2].trim()
      };
    }

    return null;
  }

  private async tryHeuristicFix(
    taskId: string,
    buildResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>
  ): Promise<HeuristicFixResult | null> {
    const invalidCssCommentFix = this.tryInvalidCssCommentFix(buildResult, contextFiles);
    if (invalidCssCommentFix) {
      return invalidCssCommentFix;
    }

    const typeOnlyImportFix = this.tryTypeOnlyImportFix(buildResult, contextFiles);
    if (typeOnlyImportFix) {
      return typeOnlyImportFix;
    }

    const unusedHandlerFix = this.tryUnusedHandlerFix(buildResult, contextFiles);
    if (unusedHandlerFix) {
      return unusedHandlerFix;
    }

    const impureRenderFix = this.tryImpureRenderFix(buildResult, contextFiles);
    if (impureRenderFix) {
      return impureRenderFix;
    }

    const expectedBraceError = /error TS1005:\s*'\}' expected/i.test(buildResult.combinedOutput);
    if (!expectedBraceError) {
      this.appendLog(taskId, "No heuristic fallback matched this build error.");
      return null;
    }

    const fileMatch = buildResult.combinedOutput.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\): error TS1005: '\}' expected\./i);
    if (!fileMatch) {
      this.appendLog(taskId, "Heuristic fallback could not identify the target file.");
      return null;
    }

    const targetPath = fileMatch[1].replace(/\\/g, "/");
    const targetFile = contextFiles.find((file) => file.path === targetPath) ?? await this.safeReadContextFile(targetPath);
    if (!targetFile) {
      this.appendLog(taskId, `Heuristic fallback could not read target file: ${targetPath}`);
      return null;
    }

    const fixedContent = this.appendMissingClosingBrace(targetFile.content);
    if (!fixedContent || fixedContent === targetFile.content) {
      this.appendLog(taskId, `Heuristic fallback found no safe brace repair for ${targetPath}.`);
      return null;
    }

    return {
      summary: `Added a missing closing brace to ${targetPath}.`,
      edits: [{ path: targetPath, content: fixedContent }]
    };
  }

  private tryInvalidCssCommentFix(
    buildResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>
  ): HeuristicFixResult | null {
    const combined = buildResult.combinedOutput;
    if (!/invalid selector|css/i.test(combined) && !/Unknown word/i.test(combined)) return null;
    const cssFiles = contextFiles.filter((file) => file.path.toLowerCase().endsWith(".css"));
    if (cssFiles.length === 0) return null;

    const edits: StructuredEdit[] = [];
    for (const file of cssFiles) {
      if (!file.content.includes("//")) continue;
      const updated = file.content.replace(/^\s*\/\/.*$/gm, "").replace(/\n{3,}/g, "\n\n");
      if (updated === file.content) continue;
      edits.push({ path: file.path, content: updated });
    }
    if (edits.length === 0) return null;

    return {
      summary: `Removed JavaScript-style comment lines from ${edits.map((edit) => edit.path).join(", ")} so CSS can parse cleanly.`,
      edits
    };
  }

  private tryTypeOnlyImportFix(
    buildResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>
  ): HeuristicFixResult | null {
    const match = buildResult.combinedOutput.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx))\((\d+),(\d+)\): error TS1484: '([A-Za-z0-9_]+)' is a type and must be imported using a type-only import/i);
    if (!match) return null;
    const targetPath = match[1].replace(/\\/g, "/");
    const importName = match[4];
    const targetFile = contextFiles.find((file) => file.path === targetPath);
    if (!targetFile) return null;

    let updated = targetFile.content.replace(
      new RegExp(`import\\s*\\{\\s*${importName}\\s*,\\s*([^}]+)\\}\\s*from\\s*["']react["'];?`),
      `import { $1 } from "react";\nimport type { ${importName} } from "react";`
    );
    updated = updated.replace(
      new RegExp(`import\\s*\\{\\s*([^}]+)\\s*,\\s*${importName}\\s*\\}\\s*from\\s*["']react["'];?`),
      `import { $1 } from "react";\nimport type { ${importName} } from "react";`
    );
    updated = updated.replace(
      new RegExp(`import\\s*\\{\\s*${importName}\\s*\\}\\s*from\\s*["']react["'];?`),
      `import type { ${importName} } from "react";`
    );

    if (updated === targetFile.content) return null;
    return {
      summary: `Converted ${importName} to a type-only React import in ${targetPath}.`,
      edits: [{ path: targetPath, content: updated }]
    };
  }

  private tryUnusedHandlerFix(
    buildResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>
  ): HeuristicFixResult | null {
    const match = buildResult.combinedOutput.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx))\((\d+),(\d+)\): error TS6133: '([A-Za-z0-9_]+)' is declared but its value is never read/i);
    if (!match) return null;
    const targetPath = match[1].replace(/\\/g, "/");
    const symbolName = match[4];
    const targetFile = contextFiles.find((file) => file.path === targetPath);
    if (!targetFile) return null;

    const wireActionFix = this.tryWireUnusedActionHandler(targetFile.path, targetFile.content, symbolName);
    if (wireActionFix) {
      return wireActionFix;
    }

    let updated = targetFile.content;
    const arrowBlockPattern = new RegExp(`\\n\\s*(?:const|let|var)\\s+${symbolName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\s*\\};?\\n`, "m");
    updated = updated.replace(arrowBlockPattern, "\n");

    if (updated === targetFile.content) {
      const functionPattern = new RegExp(`\\n\\s*function\\s+${symbolName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}\\n`, "m");
      updated = updated.replace(functionPattern, "\n");
    }

    if (updated === targetFile.content) {
      const constValuePattern = new RegExp(`\\n\\s*(?:const|let|var)\\s+${symbolName}\\s*=.*?;\\n`, "m");
      updated = updated.replace(constValuePattern, "\n");
    }

    if (updated === targetFile.content) return null;
    return {
      summary: `Removed unused symbol ${symbolName} from ${targetPath}.`,
      edits: [{ path: targetPath, content: updated }]
    };
  }

  private tryWireUnusedActionHandler(
    targetPath: string,
    content: string,
    symbolName: string
  ): HeuristicFixResult | null {
    if (!/^handle[A-Z]/.test(symbolName)) return null;
    if (!/<table[\s>]/i.test(content) || !/<tbody>/i.test(content)) return null;
    if (new RegExp(`${symbolName}\\(`).test(content.replace(new RegExp(`const\\s+${symbolName}\\s*=|function\\s+${symbolName}\\s*\\(`), ""))) {
      return null;
    }

    const rowMatch = content.match(/\{([A-Za-z0-9_]+)\.map\(\(\s*([A-Za-z0-9_]+)\s*\)\s*=>\s*\(\s*<tr\b/);
    if (!rowMatch) return null;
    const rowVar = rowMatch[2];
    const actionLabel = symbolName.replace(/^handle/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || "Act";

    let updated = content;
    if (!/<th>\s*Action\s*<\/th>/i.test(updated)) {
      updated = updated.replace(
        /(<thead>[\s\S]*?<tr>)([\s\S]*?)(\s*<\/tr>\s*<\/thead>)/i,
        (_match, open, inner, close) => `${open}${inner}\n            <th>Action</th>${close}`
      );
    }

    if (updated === content && !/<th>\s*Action\s*<\/th>/i.test(updated)) {
      return null;
    }

    const rowPattern = new RegExp(
      `(\\{[A-Za-z0-9_]+\\.map\\(\\(\\s*${rowVar}\\s*\\)\\s*=>\\s*\\([\\s\\S]*?<tr[^>]*>[\\s\\S]*?)(\\s*</tr>\\s*\\)\\)\\s*\\})`,
      "m"
    );
    updated = updated.replace(
      rowPattern,
      (_match, start, end) => `${start}\n              <td><button type="button" onClick={() => ${symbolName}(${rowVar}.id)}>${actionLabel}</button></td>${end}`
    );

    if (updated === content) return null;
    return {
      summary: `Wired the unused action handler ${symbolName} into the table row actions in ${targetPath}.`,
      edits: [{ path: targetPath, content: updated }]
    };
  }

  private tryImpureRenderFix(
    buildResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>
  ): HeuristicFixResult | null {
    const match = buildResult.combinedOutput.match(/([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx))[:(]\d+/i);
    if (!/Cannot call impure function during render/i.test(buildResult.combinedOutput) || !match) return null;
    const targetPath = match[1].replace(/\\/g, "/");
    const targetFile = contextFiles.find((file) => file.path === targetPath);
    if (!targetFile) return null;
    if (!targetFile.content.includes("Math.random")) return null;

    let updated = targetFile.content;
    if (!updated.includes("const chartBars = [")) {
      updated = updated.replace(
        /import\s+.*?;\s*\n/,
        (value) => `${value}\nconst chartBars = [42, 56, 74, 61, 88, 70];\n`
      );
    }
    updated = updated.replace(
      /\{Array\.from\(\{ length: 6 \}, \(_,\s*i\) => \(\s*<div key=\{i\} style=\{\{ height: `\$\{Math\.floor\(Math\.random\(\) \* 80\) \+ 20\}%`\s*\}\}><\/div>\s*\)\)\}/m,
      `{chartBars.map((height, index) => (\n          <div key={index} style={{ height: \`\${height}%\` }}></div>\n        ))}`
    );
    if (updated === targetFile.content) return null;

    return {
      summary: `Replaced impure render-time random chart data in ${targetPath} with deterministic values.`,
      edits: [{ path: targetPath, content: updated }]
    };
  }

  private async safeReadContextFile(targetPath: string): Promise<{ path: string; content: string } | null> {
    try {
      const result = await this.readWorkspaceFile(targetPath);
      return { path: result.path, content: result.content };
    } catch {
      return null;
    }
  }

  private appendMissingClosingBrace(content: string): string | null {
    const source = content.replace(/\r\n/g, "\n");
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") depth = Math.max(0, depth - 1);
    }

    if (depth <= 0) return null;
    const suffix = `${source.endsWith("\n") ? "" : "\n"}${"}\n".repeat(depth)}`;
    return `${source}${suffix}`;
  }

  private async collectFixContextFiles(
    buildOutput: string,
    plan?: TaskExecutionPlan
  ): Promise<Array<{ path: string; content: string }>> {
    const workingDirectory = plan?.workingDirectory ?? ".";
    const scopedCandidates = new Set<string>((plan?.candidateFiles ?? []).map((value) => value.trim()).filter(Boolean));
    const candidatePaths = new Set<string>(
      scopedCandidates.size > 0
        ? scopedCandidates
        : [this.joinWorkspacePath(workingDirectory, "package.json")]
    );
    const staticCandidates = [
      this.joinWorkspacePath(workingDirectory, "package.json"),
      this.joinWorkspacePath(workingDirectory, "tsconfig.json"),
      this.joinWorkspacePath(workingDirectory, "vite.config.ts"),
      this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/App.tsx"),
      this.joinWorkspacePath(workingDirectory, "src/index.css"),
      this.joinWorkspacePath(workingDirectory, "src/App.css"),
      this.joinWorkspacePath(workingDirectory, "src/app/page.tsx"),
      this.joinWorkspacePath(workingDirectory, "index.html"),
      this.joinWorkspacePath(workingDirectory, "styles.css"),
      this.joinWorkspacePath(workingDirectory, "app.js")
    ];
    const genericCandidates = [
      this.joinWorkspacePath(workingDirectory, "package.json"),
      this.joinWorkspacePath(workingDirectory, "src/index.js"),
      this.joinWorkspacePath(workingDirectory, "src/index.ts"),
      this.joinWorkspacePath(workingDirectory, "src/server.js"),
      this.joinWorkspacePath(workingDirectory, "src/server.ts"),
      this.joinWorkspacePath(workingDirectory, "bin/cli.js"),
      this.joinWorkspacePath(workingDirectory, "bin/cli.mjs"),
      this.joinWorkspacePath(workingDirectory, "README.md")
    ];

    for (const file of [...staticCandidates, ...genericCandidates]) {
      if (scopedCandidates.size > 0 && !scopedCandidates.has(file)) continue;
      try {
        await stat(join(this.workspaceRoot, file));
        candidatePaths.add(file);
      } catch {
        // skip missing files
      }
    }

    for (const hintedPath of this.extractFileHints(buildOutput)) {
      if (scopedCandidates.size > 0 && !scopedCandidates.has(hintedPath)) continue;
      candidatePaths.add(hintedPath);
      if (candidatePaths.size >= MAX_CONTEXT_FILES) break;
    }

    const contextFiles: Array<{ path: string; content: string }> = [];
    for (const relPath of candidatePaths) {
      if (contextFiles.length >= MAX_CONTEXT_FILES) break;
      try {
        const result = await this.readWorkspaceFile(relPath);
        contextFiles.push({ path: result.path, content: result.content });
      } catch {
        // skip unreadable files
      }
    }
    return contextFiles;
  }

  private extractFileHints(output: string): string[] {
    const matches = output.match(/[A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|css|html|md)/g) ?? [];
    const normalized = matches
      .map((value) => value.replace(/\\/g, "/"))
      .map((value) => value.replace(/^\.\//, ""))
      .filter((value) => !value.startsWith("../"));
    return [...new Set(normalized)].slice(0, MAX_CONTEXT_FILES);
  }

  private async requestStructuredFix(
    taskId: string,
    userPrompt: string,
    commandResult: TerminalCommandResult,
    contextFiles: Array<{ path: string; content: string }>,
    attempt: number,
    stageLabel = "Fix",
    plan?: TaskExecutionPlan
  ): Promise<FixResponse> {
    const taskAttachments = this.getTaskAttachments(taskId);
    const routes = this.resolveModelRoutes(stageLabel, {
      requiresVision: this.taskRequiresVisionRoute(taskId)
    });
    const repositoryContext = plan?.repositoryContext ?? {
      summary: "Preserve the current workspace layout and conventions.",
      workspaceShape: "unknown" as const,
      packageManager: "unknown" as const,
      languageStyle: "unknown" as const,
      moduleFormat: "unknown" as const,
      uiFramework: "unknown" as const,
      styling: "unknown" as const,
      testing: "unknown" as const,
      linting: "unknown" as const,
      conventions: []
    };
    const repositoryConventions = repositoryContext.conventions ?? [];
    const failureLabel = `${stageLabel.toLowerCase()} failure`;
    const failureCategory = this.classifyFailureCategory(stageLabel, commandResult.combinedOutput || "");
    const failureGuidance = this.buildFailureCategoryGuidance(failureCategory);
    const failureMemory = this.getRelevantFailureMemory(taskId, stageLabel, failureCategory, plan);
    const specRequiredFiles = plan?.spec?.requiredFiles ?? [];
    const specRequiredScriptGroups = plan?.spec?.requiredScriptGroups ?? [];
    const specAcceptanceCriteria = plan?.spec?.acceptanceCriteria ?? [];
    const specQualityGates = plan?.spec?.qualityGates ?? [];
    const task = this.tasks.get(taskId);
    if (task) {
      const telemetry = this.ensureTaskTelemetry(task);
      telemetry.failureMemoryHints = failureMemory.map((entry) => `${entry.category}/${entry.signature}: ${entry.guidance}`);
      this.persistTaskState(task.id);
    }
    const recoveryStageLabel = `${stageLabel} recovery`;
    const exhaustedRepairRoutes = new Set<string>();
    const getAvailableRoutes = (): ModelRoute[] => routes.filter(
      (route) => !exhaustedRepairRoutes.has(route.model) && !this.isTaskModelBlacklisted(taskId, route.model)
    );
    const markCurrentRepairRouteExhausted = (): void => {
      const currentRoute = this.taskStageRoutes.get(taskId)?.get(recoveryStageLabel);
      if (currentRoute?.route.model) {
        exhaustedRepairRoutes.add(currentRoute.route.model);
      }
    };
    const hasRemainingRoutes = (): boolean => getAvailableRoutes().length > 0;
    let lastFailure = `${stageLabel} recovery model did not produce valid structured edits.`;
    this.appendLog(taskId, `Fix model candidates: ${routes.map((route) => route.model).join(", ")}`);
    const baseMessages = this.buildTaskPromptMessages(
      [
        `Task: ${userPrompt}`,
        `Attempt: ${attempt}`,
        `Failure category: ${failureCategory}`,
        `Repair guidance: ${failureGuidance}`,
        ...(plan ? [`Repository context: ${repositoryContext.summary}`] : []),
        ...(plan?.spec
          ? [
            `Starter profile: ${plan.spec.starterProfile}`,
            `Required files: ${specRequiredFiles.join(", ") || "(none)"}`,
            `Required scripts: ${specRequiredScriptGroups.map((group) => `${group.label} => ${group.options.join(" | ")}`).join("; ") || "(none)"}`,
            `Acceptance: ${specAcceptanceCriteria.join(" ") || "(none)"}`,
            `Quality gates: ${specQualityGates.join(" ") || "(none)"}`
          ]
          : []),
        ...(plan && repositoryConventions.length > 0
          ? ["Repository conventions:", ...repositoryConventions.map((item) => `- ${item}`)]
          : []),
        ...this.formatFailureMemoryForPrompt(failureMemory),
        taskAttachments.length > 0 ? `Task attachments: ${taskAttachments.map((attachment) => attachment.name).join(", ")}` : "",
        "",
        `${stageLabel} failure output:`,
        commandResult.combinedOutput || "(no output)",
        "",
        "Workspace file context:",
        ...contextFiles.flatMap((file) => [
          `--- FILE: ${file.path} ---`,
          file.content
        ])
      ].filter(Boolean).join("\n"),
      taskAttachments,
      `You are a precise coding agent. Fix the ${failureLabel} using the provided workspace files only. ` +
        `${plan ? `Follow these repository conventions when possible: ${repositoryConventions.join(" ") || repositoryContext.summary}. ` : ""}` +
        `${plan?.spec?.starterProfile === "electron-desktop"
          ? "This is a strict Electron desktop task. Do not convert it into a static site, landing page, or python http.server scaffold. Preserve or restore desktop packaging support and package:win when required. "
          : ""}` +
        "Return only strict JSON with shape {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
        "Do not include markdown fences. Do not omit unchanged surrounding code in edited files."
    );

    for (let semanticRouteAttempt = 1; semanticRouteAttempt <= routes.length; semanticRouteAttempt += 1) {
      const initialResponse = await this.sendFixModelRequest(taskId, getAvailableRoutes(), baseMessages, "initial", recoveryStageLabel);
      let initialParsed: ParsedFixResponse | null;
      try {
        initialParsed = this.tryParseFixResponse(initialResponse, recoveryStageLabel, { strictSchema: true });
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : `${stageLabel} recovery model returned an empty response.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, lastFailure);
        markCurrentRepairRouteExhausted();
        if (!hasRemainingRoutes()) break;
        this.appendLog(taskId, `${lastFailure} Trying next ${stageLabel.toLowerCase()} recovery model route...`);
        continue;
      }
      if (initialParsed?.fix) {
        this.appendLog(taskId, `Structured JSON extracted (${initialParsed.extractedJson.length} chars).`);
        return initialParsed.fix;
      }
      if (initialParsed?.issue === "no-usable-edits") {
        lastFailure = `${stageLabel} recovery model returned JSON without usable edits.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response contained valid JSON but no usable edits.`);
        this.appendLog(taskId, `Initial ${stageLabel.toLowerCase()} recovery response contained valid JSON but no usable edits. Retrying with strict-schema repair prompt...`);
      } else if (initialParsed?.issue === "schema-mismatch") {
        lastFailure = `${stageLabel} recovery model returned JSON that did not match the strict schema contract.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response did not match the strict schema contract.`);
        this.appendLog(taskId, `Initial ${stageLabel.toLowerCase()} recovery response did not match the strict schema contract. Retrying with strict-schema repair prompt...`);
      } else {
        lastFailure = `${stageLabel} recovery model returned malformed JSON.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response was not valid strict structured JSON.`);
        this.appendLog(taskId, "Initial fix response was not valid strict structured JSON. Retrying with strict-schema repair prompt...");
      }

      const retryMessages = [
        ...baseMessages,
        {
          role: "user",
          content:
            "Your last reply did not satisfy the structured repair contract. Reply again with only strict JSON and no explanation, no markdown, no prose. " +
            "Use exactly this shape: {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
            "Do not rename fields and do not use alternate keys such as files, changes, file, filename, text, value, lines, or contentLines. " +
            `Keep the repair focused on this failure category: ${failureCategory}. ` +
            `Last reply to repair:\n${initialResponse}`
        }
      ];
      const retryResponse = await this.sendFixModelRequest(taskId, getAvailableRoutes(), retryMessages, "json-retry", recoveryStageLabel);
      let retryParsed: ParsedFixResponse | null;
      try {
        retryParsed = this.tryParseFixResponse(retryResponse, recoveryStageLabel, { strictSchema: true });
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : `${stageLabel} recovery model returned an empty response after retry.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, lastFailure);
        markCurrentRepairRouteExhausted();
        if (!hasRemainingRoutes()) break;
        this.appendLog(taskId, `${lastFailure} Trying next ${stageLabel.toLowerCase()} recovery model route...`);
        continue;
      }
      if (retryParsed?.fix) {
        this.appendLog(taskId, `Structured JSON extracted after retry (${retryParsed.extractedJson.length} chars).`);
        return retryParsed.fix;
      }
      if (retryParsed?.issue === "no-usable-edits") {
        lastFailure = `${stageLabel} recovery model returned JSON without usable edits after retry.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response contained valid JSON but no usable edits after retry.`);
      } else if (retryParsed?.issue === "schema-mismatch") {
        lastFailure = `${stageLabel} recovery model returned JSON that did not match the strict schema after retry.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response did not match the strict schema contract after retry.`);
      } else {
        lastFailure = `${stageLabel} recovery model returned malformed JSON after retry.`;
        this.recordSemanticModelFailure(taskId, recoveryStageLabel, `${stageLabel} recovery response was malformed JSON after retry.`);
      }

      markCurrentRepairRouteExhausted();
      if (!hasRemainingRoutes()) break;
      this.appendLog(taskId, `${lastFailure} Trying next ${stageLabel.toLowerCase()} recovery model route...`);
    }

    throw new Error(lastFailure);
  }

  private buildFailureCategoryGuidance(category: AgentTaskFailureCategory): string {
    switch (category) {
      case "missing-file":
        return "Restore or create the missing entry file and update references only where required.";
      case "malformed-json":
        return "Return strict schema-shaped JSON only and remove any prose, markdown, or malformed fields.";
      case "unsupported-path":
        return "Keep all edits inside the provided workspace files and avoid unsupported or escaping paths.";
      case "wrong-scaffold":
        return "Preserve the expected scaffold and remove conflicting files from the wrong project shape.";
      case "asset-missing":
        return "Repair broken asset references or restore the missing linked assets.";
      case "build-error":
        return "Focus on compile-time or bundling fixes in the failing files before changing working behavior.";
      case "runtime-error":
        return "Fix startup/runtime exceptions and keep the launch path intact.";
      case "preview-error":
        return "Repair preview entry wiring, linked assets, and bootstrap flow without changing unrelated files.";
      case "lint-error":
        return "Fix lint violations with the smallest code changes that preserve runtime behavior.";
      case "test-error":
        return "Fix the failing test path or implementation mismatch without broad unrelated rewrites.";
      case "verification-error":
        return "Address the exact verification failure and keep the rest of the project unchanged.";
      default:
        return "Use the failure output to produce the smallest valid repair for the provided files.";
    }
  }

  private getRelevantFailureMemory(
    taskId: string,
    stageLabel: string,
    failureCategory: AgentTaskFailureCategory,
    plan?: TaskExecutionPlan
  ): FailureMemoryEntry[] {
    const task = this.tasks.get(taskId);
    const currentArtifact = task?.artifactType
      ?? (task?.prompt ? this.inferArtifactTypeFromPrompt(task.prompt) : null)
      ?? (plan?.spec?.starterProfile === "electron-desktop"
        ? "desktop-app"
        : plan?.spec?.starterProfile === "node-api-service"
          ? "api-service"
          : plan?.spec?.starterProfile === "node-cli"
            ? "script-tool"
            : plan?.spec?.starterProfile === "node-library"
              ? "library"
              : "unknown");
    const normalizedStage = (stageLabel ?? "").trim().toLowerCase();

    return [...this.failureMemory.values()]
      .filter((entry) => entry.count >= 2 || entry.category === failureCategory)
      .filter((entry) => entry.category === failureCategory || normalizedStage.includes(entry.stage.toLowerCase().split(" ")[0] ?? ""))
      .filter((entry) => entry.artifactType === "unknown" || currentArtifact === "unknown" || entry.artifactType === currentArtifact)
      .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, 3);
  }

  private formatFailureMemoryForPrompt(entries: FailureMemoryEntry[]): string[] {
    if (entries.length === 0) return [];
    return [
      "Recurring failure memory:",
      ...entries.map((entry) => `- ${entry.count}x ${entry.category}/${entry.signature}: ${entry.guidance}`)
    ];
  }

  private tryParseFixResponse(raw: string, responseLabel = "Fix", options: ParseFixResponseOptions = {}): ParsedFixResponse | null {
    const normalized = (raw ?? "").trim();
    if (!normalized) {
      throw new Error(`${responseLabel} model returned an empty response.`);
    }

    if (options.strictSchema && !(normalized.startsWith("{") && normalized.endsWith("}"))) {
      const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fencedMatch) {
        const fencedJson = fencedMatch[1]?.trim() ?? "";
        if (fencedJson.startsWith("{") && fencedJson.endsWith("}")) {
          const parsed = this.parseLooseFixResponse(fencedJson);
          if (!parsed) {
            return null;
          }
          const strictFix = this.extractStrictFixResponse(parsed);
          if (!strictFix) {
            return {
              extractedJson: fencedJson,
              issue: "schema-mismatch"
            };
          }
          if (strictFix.edits.length === 0) {
            return {
              extractedJson: fencedJson,
              issue: "no-usable-edits"
            };
          }
          return {
            fix: strictFix,
            extractedJson: fencedJson
          };
        }
      }
      if (normalized.includes("{") || normalized.includes("```")) {
        return {
          extractedJson: normalized,
          issue: "schema-mismatch"
        };
      }
      return null;
    }

    const jsonText = this.extractLikelyJson(normalized, options);
    if (!jsonText) {
      return null;
    }

    const parsed = this.parseLooseFixResponse(jsonText);
    if (!parsed) {
      return null;
    }
    const strictFix = options.strictSchema ? this.extractStrictFixResponse(parsed) : null;
    const edits = options.strictSchema
      ? (strictFix?.edits ?? [])
      : this.normalizeStructuredEdits(parsed);

    if (options.strictSchema && !strictFix) {
      return {
        extractedJson: jsonText,
        issue: "schema-mismatch"
      };
    }

    if (edits.length === 0) {
      return {
        extractedJson: jsonText,
        issue: "no-usable-edits"
      };
    }

    return {
      fix: {
        summary: strictFix?.summary ?? (typeof parsed.summary === "string" ? parsed.summary.trim() : ""),
        edits
      },
      extractedJson: jsonText
    };
  }

  private parseLooseFixResponse(jsonText: string): Partial<FixResponse> | null {
    const candidates = [
      jsonText,
      this.normalizeLooseJson(jsonText)
    ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as Partial<FixResponse>;
      } catch {
        // try next candidate
      }
    }

    return null;
  }

  private normalizeLooseJson(raw: string): string {
    return raw
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1");
  }

  private normalizeStructuredEdits(parsed: Partial<FixResponse>): StructuredEdit[] {
    const rawEdits = parsed.edits
      ?? (parsed as { files?: unknown }).files
      ?? (parsed as { changes?: unknown }).changes;

    if (Array.isArray(rawEdits)) {
      return rawEdits
        .map((edit) => this.normalizeStructuredEdit(edit))
        .filter((edit): edit is StructuredEdit => Boolean(edit));
    }

    if (rawEdits && typeof rawEdits === "object") {
      return Object.entries(rawEdits)
        .map(([path, content]) => this.normalizeStructuredEdit({ path, content }))
        .filter((edit): edit is StructuredEdit => Boolean(edit));
    }

    return [];
  }

  private normalizeStrictStructuredEdits(parsed: Partial<FixResponse>): StructuredEdit[] {
    if (!Array.isArray(parsed.edits)) return [];
    return parsed.edits
      .map((edit) => {
        if (!edit || typeof edit !== "object") return null;
        const candidate = edit as { path?: unknown; content?: unknown };
        if (typeof candidate.path !== "string") return null;
        const path = candidate.path.trim().replace(/\\/g, "/");
        if (!path) return null;
        const content = this.normalizeStructuredEditContent(path, candidate.content);
        if (content === null) return null;
        return {
          path,
          content
        } satisfies StructuredEdit;
      })
      .filter((edit): edit is StructuredEdit => Boolean(edit));
  }

  private extractStrictFixResponse(parsed: Partial<FixResponse>): FixResponse | null {
    if (this.matchesStrictFixResponseSchema(parsed)) {
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
        edits: this.normalizeStrictStructuredEdits(parsed)
      };
    }

    const fallbackSummary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const nestedCandidates = [
      typeof (parsed as { fix?: unknown }).fix === "object" ? (parsed as { fix?: Partial<FixResponse> }).fix : null,
      typeof (parsed as { result?: unknown }).result === "object" ? (parsed as { result?: Partial<FixResponse> }).result : null,
      typeof (parsed as { response?: unknown }).response === "object" ? (parsed as { response?: Partial<FixResponse> }).response : null,
      typeof (parsed as { data?: unknown }).data === "object" ? (parsed as { data?: Partial<FixResponse> }).data : null,
      typeof (parsed as { payload?: unknown }).payload === "object" ? (parsed as { payload?: Partial<FixResponse> }).payload : null,
      typeof parsed.summary === "object" && parsed.summary ? parsed.summary as Partial<FixResponse> : null
    ].filter((candidate): candidate is Partial<FixResponse> => Boolean(candidate));

    for (const candidate of nestedCandidates) {
      if (!this.matchesNestedStrictFixResponseSchema(candidate)) continue;
      const edits = this.normalizeStrictStructuredEdits(candidate);
      if (edits.length === 0) continue;
      return {
        summary: typeof candidate.summary === "string" ? candidate.summary.trim() : (fallbackSummary || "Recovered strict structured edits."),
        edits
      };
    }

    return null;
  }

  private matchesStrictFixResponseSchema(parsed: Partial<FixResponse>): boolean {
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.edits)) {
      return false;
    }

    return parsed.edits.every((edit) => {
      if (!edit || typeof edit !== "object" || Array.isArray(edit)) return false;
      const record = edit as unknown as Record<string, unknown>;
      const keys = Object.keys(record);
      const path = typeof record.path === "string" ? record.path.trim().replace(/\\/g, "/") : "";
      return keys.length === 2
        && keys.includes("path")
        && keys.includes("content")
        && Boolean(path)
        && this.normalizeStructuredEditContent(path, record.content) !== null;
    });
  }

  private matchesNestedStrictFixResponseSchema(parsed: Partial<FixResponse>): boolean {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0 || keys.length > 2) return false;
    if (!keys.includes("edits")) return false;
    if (keys.some((key) => key !== "summary" && key !== "edits")) return false;
    if ("summary" in record && typeof record.summary !== "string") return false;
    return Array.isArray(record.edits) && this.normalizeStrictStructuredEdits(parsed).length > 0;
  }

  private normalizeStructuredEdit(edit: unknown): StructuredEdit | null {
    if (!edit || typeof edit !== "object") return null;

    const candidate = edit as {
      path?: unknown;
      file?: unknown;
      target?: unknown;
      filename?: unknown;
      content?: unknown;
      text?: unknown;
      value?: unknown;
      contents?: unknown;
      lines?: unknown;
      contentLines?: unknown;
    };

    const rawPath = [candidate.path, candidate.file, candidate.target, candidate.filename]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (!rawPath) return null;

    const path = rawPath.trim().replace(/\\/g, "/");
    if (!path) return null;
    const rawContent = [
      this.normalizeStructuredEditContent(path, candidate.content),
      this.normalizeStructuredEditContent(path, candidate.text),
      this.normalizeStructuredEditContent(path, candidate.value),
      this.normalizeStructuredEditContent(path, candidate.contents),
      this.normalizeStructuredEditLines(candidate.lines),
      this.normalizeStructuredEditLines(candidate.contentLines)
    ].find((value): value is string => typeof value === "string");
    if (rawContent === undefined) return null;

    return {
      path,
      content: rawContent
    };
  }

  private normalizeStructuredEditContent(path: string, value: unknown): string | null {
    if (typeof value === "string") return value;
    if (!this.isJsonLikeEditPath(path)) return null;
    if (!value || typeof value !== "object") return null;
    try {
      const serialized = JSON.stringify(value, null, 2);
      return typeof serialized === "string" ? `${serialized}\n` : null;
    } catch {
      return null;
    }
  }

  private isJsonLikeEditPath(path: string): boolean {
    const normalized = (path ?? "").trim().toLowerCase().replace(/\\/g, "/");
    return normalized.endsWith(".json")
      || normalized.endsWith(".jsonc")
      || normalized.endsWith(".webmanifest");
  }

  private normalizeStructuredEditLines(value: unknown): string | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    if (!value.every((entry) => typeof entry === "string")) return null;
    return value.join("\n");
  }

  private extractLikelyJson(raw: string, options: ParseFixResponseOptions = {}): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (options.strictSchema) {
      return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : null;
    }

    const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (const match of fencedMatches) {
      const candidate = match[1]?.trim() ?? "";
      if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
    }

    const firstBrace = trimmed.indexOf("{");
    if (firstBrace < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = firstBrace; i < trimmed.length; i += 1) {
      const char = trimmed[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return trimmed.slice(firstBrace, i + 1);
        }
      }
    }

    return null;
  }

  private async sendFixModelRequest(
    taskId: string,
    routes: ModelRoute[],
    messages: ChatHistoryEntry[],
    label: "initial" | "json-retry",
    stageLabel = "Agent model request"
  ): Promise<string> {
    const waitingMessage = label === "initial" ? "Waiting for model fix response..." : "Waiting for JSON-only retry response...";
    this.appendLog(taskId, waitingMessage);

    let lastError: unknown = null;
    const routeFailures: Array<{ model: string; messages: string[] }> = [];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const route = routes[routeIndex];
      if (this.isTaskModelBlacklisted(taskId, route.model)) {
        this.appendLog(taskId, `Skipping blacklisted model route: ${route.model}`);
        continue;
      }
      const routeFailure = { model: route.model, messages: [] as string[] };
      routeFailures.push(routeFailure);
      for (let attempt = 1; attempt <= AGENT_MODEL_TRANSIENT_RETRY_LIMIT; attempt += 1) {
        let responseText = "";
        this.appendLog(taskId, `Using model route ${routeIndex + 1}/${routes.length}: ${route.model} (${route.skipAuth ? "local/no-auth" : "remote/auth"})`);
        try {
          await this.ccrService.sendMessageAdvanced(
            messages,
            route.model,
            (chunk) => {
              responseText += chunk;
            },
            undefined,
            {
              baseUrl: route.baseUrl,
              apiKey: route.apiKey,
              skipAuth: route.skipAuth,
              timeoutMs: AGENT_MODEL_REQUEST_TIMEOUT_MS
            }
          );

          this.appendLog(taskId, `${label === "initial" ? "Model" : "Retry model"} response chars: ${responseText.length}`);
          if (responseText.trim()) {
            this.appendLog(
              taskId,
              `${label === "initial" ? "Model" : "Retry model"} response preview: ${responseText.slice(0, 200).replace(/\r?\n/g, " ")}`
            );
          }
          this.rememberTaskStageRoute(taskId, stageLabel, route, routeIndex, attempt);
          this.recordModelAttempt(taskId, stageLabel, route.model, routeIndex, attempt, "success");
          this.recordModelRouteStat(route, "success");
          return responseText;
        } catch (err) {
          lastError = err;
          const message = err instanceof Error ? err.message : "Unknown model transport failure.";
          routeFailure.messages.push(message);
          this.appendLog(taskId, `Model request failed on ${route.model}: ${message}`);
          const transient = this.isTransientModelFailure(message);
          this.recordModelAttempt(taskId, stageLabel, route.model, routeIndex, attempt, transient ? "transient-error" : "error", message);
          this.recordModelRouteStat(route, transient ? "transient-error" : "error");
          const blacklisted = this.recordTaskModelFailure(taskId, route.model, transient ? "transient-error" : "error");
          if (blacklisted) {
            this.appendLog(
              taskId,
              `Blacklisting ${route.model} for the rest of task ${taskId} after repeated ${transient ? "transient" : "hard"} failures.`
            );
            if (transient) {
              this.appendLog(taskId, `Stopping retries for ${route.model} because it is now blacklisted. Falling back to the next route...`);
              break;
            }
          }

          if (!transient) {
            throw err;
          }

          const hasRetryOnSameRoute = attempt < AGENT_MODEL_TRANSIENT_RETRY_LIMIT;
          const hasFallbackRoute = routeIndex < routes.length - 1;
          if (!hasRetryOnSameRoute && !hasFallbackRoute) break;

          if (hasRetryOnSameRoute) {
            this.appendLog(taskId, `Transient model failure on ${route.model}. Retrying request (${attempt + 1}/${AGENT_MODEL_TRANSIENT_RETRY_LIMIT})...`);
            continue;
          }

          this.appendLog(taskId, `Transient model failure on ${route.model}. Falling back to next model route...`);
          break;
        }
      }
    }

    if (routeFailures.some((failure) => failure.messages.length > 0)) {
      throw new Error(this.buildExhaustedModelRouteMessage(stageLabel, routeFailures));
    }

    throw lastError instanceof Error ? lastError : new Error("Model request failed.");
  }

  private isTransientModelFailure(message: string): boolean {
    const normalized = (message ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return [
      "timed out",
      "aborted",
      "timeout",
      "api error 429",
      "api error 502",
      "api error 503",
      "api error 504",
      "api error 500",
      "rate limit",
      "overloaded",
      "temporarily unavailable",
      "requires more system memory",
      "not enough memory",
      "insufficient memory",
      "out of memory",
      "econnreset",
      "socket hang up",
      "fetch failed"
    ].some((term) => normalized.includes(term));
  }

  private buildModelRouteKey(route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">): string {
    return `${route.skipAuth ? "local" : "remote"}|${route.baseUrl}|${route.model}`;
  }

  private getModelRouteScore(route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">): number {
    const stats = this.modelRouteStats.get(this.buildModelRouteKey(route));
    if (!stats) return 0;
    return (stats.successes * 3) - (stats.failures * 4) - (stats.semanticFailures * 5) - (stats.transientFailures * 2);
  }

  private buildModelRouteScoreFactors(
    route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">
  ): AgentModelRouteScoreFactor[] {
    const stats = this.modelRouteStats.get(this.buildModelRouteKey(route));
    if (!stats) {
      return [{ label: "No reliability history", delta: 0 }];
    }

    const factors: AgentModelRouteScoreFactor[] = [];
    if (stats.successes > 0) {
      factors.push({ label: `${stats.successes} success${stats.successes === 1 ? "" : "es"}`, delta: stats.successes * 3 });
    }
    if (stats.failures > 0) {
      factors.push({ label: `${stats.failures} hard fail${stats.failures === 1 ? "" : "s"}`, delta: stats.failures * -4 });
    }
    if (stats.transientFailures > 0) {
      factors.push({
        label: `${stats.transientFailures} transient fail${stats.transientFailures === 1 ? "ure" : "ures"}`,
        delta: stats.transientFailures * -2
      });
    }
    if (stats.semanticFailures > 0) {
      factors.push({
        label: `${stats.semanticFailures} semantic fail${stats.semanticFailures === 1 ? "ure" : "ures"}`,
        delta: stats.semanticFailures * -5
      });
    }
    return factors.length > 0 ? factors : [{ label: "No reliability history", delta: 0 }];
  }

  private inferRoutingStage(stageLabel: string): AgentRoutingStage {
    const normalized = (stageLabel ?? "").trim().toLowerCase();
    if (normalized.includes("plan")) return "planner";
    if (normalized.includes("repair") || normalized.includes("fix") || normalized.includes("recovery")) return "repair";
    return "generator";
  }

  private buildTaskModelFailureStatus(taskId: string, model: string): {
    count: number;
    blacklisted: boolean;
    hardFailuresUntilBlacklist: number;
    transientFailuresUntilBlacklist: number;
  } {
    const normalizedModel = (model ?? "").trim();
    const count = this.taskModelFailureCounts.get(taskId)?.get(normalizedModel) ?? 0;
    return {
      count,
      blacklisted: this.isTaskModelBlacklisted(taskId, normalizedModel),
      hardFailuresUntilBlacklist: Math.max(0, AGENT_MODEL_BLACKLIST_THRESHOLD - count),
      transientFailuresUntilBlacklist: Math.max(0, AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD - count)
    };
  }

  private getTaskAttachments(taskId: string): AttachmentPayload[] {
    return (this.tasks.get(taskId)?.attachments ?? []).map((attachment) => ({ ...attachment }));
  }

  private taskRequiresVisionRoute(taskId: string): boolean {
    return this.getTaskAttachments(taskId).some((attachment) => attachment.type === "image");
  }

  private buildTaskPromptMessages(
    prompt: string,
    attachments: AttachmentPayload[],
    systemPreamble: string
  ): ChatHistoryEntry[] {
    return [
      { role: "system", content: systemPreamble },
      ...buildAttachmentAwarePromptMessages(prompt, attachments)
    ];
  }

  private buildTaskStageSelectionReason(taskId: string, stage: string, route: ModelRoute, routeIndex: number): string {
    const routingStage = this.inferRoutingStage(stage);
    const providerLabel = route.skipAuth ? "local" : "cloud";
    const hints = getModelCapabilityHints(route.model);
    const capabilityHints: string[] = [];
    if (hints.coding > 0) capabilityHints.push("coder");
    if (hints.reasoning >= 6) capabilityHints.push("reasoning");
    if (hints.longContext >= 8) capabilityHints.push("long-context");
    if (hints.vision) capabilityHints.push("vision");

    const stageBias = routingStage === "planner"
      ? "Planner stages favor long-context and reasoning models."
      : routingStage === "repair"
        ? "Repair stages favor coder and reasoning models."
        : "Implementation stages favor coder-first routes.";
    const capabilityDetail = capabilityHints.length > 0
      ? `Matched ${capabilityHints.join(", ")} capability hints on this ${providerLabel} route.`
      : `No strong capability hints were detected, so this ${providerLabel} route stayed available as a fallback.`;
    const visionBias = this.taskRequiresVisionRoute(taskId)
      ? (hints.vision
        ? " This task includes image attachments, so vision-capable routes are preferred."
        : " This task includes image attachments, but no vision signal was detected on this fallback route.")
      : "";
    const routePosition = routeIndex > 0
      ? ` It is currently using route ${routeIndex + 1}, so earlier candidates already failed, were blacklisted, or ranked lower.`
      : " It is currently the top remaining route for this stage.";
    return `${stageBias} ${capabilityDetail}${visionBias}${routePosition}`;
  }

  private recordModelRouteStat(
    route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">,
    outcome: AgentTaskModelAttempt["outcome"]
  ): void {
    const key = this.buildModelRouteKey(route);
    const current = this.modelRouteStats.get(key) ?? {
      successes: 0,
      failures: 0,
      transientFailures: 0,
      semanticFailures: 0
    };
    const next: ModelRouteStats = {
      ...current,
      lastUsedAt: new Date().toISOString()
    };
    if (outcome === "success") {
      next.successes += 1;
    } else if (outcome === "transient-error") {
      next.transientFailures += 1;
    } else if (outcome === "semantic-error") {
      next.semanticFailures += 1;
    } else {
      next.failures += 1;
    }
    this.modelRouteStats.set(key, next);
    this.persistTaskState(this.activeTaskId ?? undefined);
  }

  private recordTaskModelFailure(
    taskId: string,
    model: string,
    outcome: Extract<AgentTaskModelAttempt["outcome"], "transient-error" | "error" | "semantic-error">
  ): boolean {
    const normalizedModel = (model ?? "").trim();
    if (!taskId || !normalizedModel) return false;
    const taskFailures = this.taskModelFailureCounts.get(taskId) ?? new Map<string, number>();
    const nextCount = (taskFailures.get(normalizedModel) ?? 0) + 1;
    taskFailures.set(normalizedModel, nextCount);
    this.taskModelFailureCounts.set(taskId, taskFailures);
    this.syncTaskRouteTelemetry(taskId);

    const threshold = outcome === "transient-error"
      ? AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD
      : AGENT_MODEL_BLACKLIST_THRESHOLD;
    if (nextCount < threshold) return false;
    const blacklist = this.taskModelBlacklist.get(taskId) ?? new Set<string>();
    blacklist.add(normalizedModel);
    this.taskModelBlacklist.set(taskId, blacklist);
    this.syncTaskRouteTelemetry(taskId);
    return true;
  }

  private isTaskModelBlacklisted(taskId: string, model: string): boolean {
    return this.taskModelBlacklist.get(taskId)?.has((model ?? "").trim()) ?? false;
  }

  private rememberTaskStageRoute(
    taskId: string,
    stage: string,
    route: ModelRoute,
    routeIndex: number,
    attempt: number
  ): void {
    const normalizedStage = (stage ?? "").trim();
    if (!taskId || !normalizedStage) return;
    const taskRoutes = this.taskStageRoutes.get(taskId) ?? new Map<string, TaskStageRouteState>();
    taskRoutes.set(normalizedStage, {
      route: { ...route },
      routeIndex,
      attempt
    });
    this.taskStageRoutes.set(taskId, taskRoutes);
    this.syncTaskRouteTelemetry(taskId);
  }

  private recordSemanticModelFailure(taskId: string, stage: string, message: string): void {
    const normalizedStage = (stage ?? "").trim();
    if (!taskId || !normalizedStage) return;
    const taskRoutes = this.taskStageRoutes.get(taskId);
    const state = taskRoutes?.get(normalizedStage);
    this.rememberFailureMemory(taskId, normalizedStage, message);
    if (!state) return;

    this.recordModelAttempt(taskId, normalizedStage, state.route.model, state.routeIndex, state.attempt, "semantic-error", message);
    this.recordModelRouteStat(state.route, "semantic-error");
    const blacklisted = this.recordTaskModelFailure(taskId, state.route.model, "semantic-error");
    if (blacklisted) {
      this.appendLog(taskId, `Blacklisting ${state.route.model} for the rest of task ${taskId} after repeated semantic failures.`);
    }
  }

  private recordFailedRepairVerification(taskId: string, stageLabel: string, failureOutput: string): void {
    const normalizedStage = (stageLabel ?? "").trim();
    if (!taskId || !normalizedStage) return;
    const detail = this.compactFailureMessage(failureOutput || `${normalizedStage} verification still failed after applying model edits.`);
    this.recordSemanticModelFailure(
      taskId,
      `${normalizedStage} recovery`,
      `${normalizedStage} verification still failed after applying model edits. ${detail}`
    );
  }

  private buildExhaustedModelRouteMessage(
    stageLabel: string,
    failures: Array<{ model: string; messages: string[] }>
  ): string {
    const detail = failures
      .filter((failure) => failure.messages.length > 0)
      .map((failure) => {
        const uniqueMessages = [...new Set(failure.messages.map((message) => this.compactFailureMessage(message)))];
        return `${failure.model} (${failure.messages.length} attempt${failure.messages.length === 1 ? "" : "s"}: ${uniqueMessages.join(" | ")})`;
      })
      .join("; ");

    return `${stageLabel} exhausted all configured model routes. Tried: ${detail || "no model routes"}.`;
  }

  private compactFailureMessage(message: string): string {
    const normalized = (message ?? "").replace(/\s+/g, " ").trim();
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
  }

  private rememberFailureMemory(taskId: string, stage: string, message: string): void {
    const normalizedStage = (stage ?? "").trim();
    const compact = this.compactFailureMessage(message ?? "");
    if (!taskId || !normalizedStage || !compact) return;

    const task = this.tasks.get(taskId);
    const category = this.classifyFailureCategory(normalizedStage, compact);
    const artifactType = task?.artifactType
      ?? (task?.prompt ? this.inferArtifactTypeFromPrompt(task.prompt) : null)
      ?? "unknown";
    const signature = this.buildFailureMemorySignature(category, compact);
    const key = `${artifactType}|${category}|${signature}`;
    const now = new Date().toISOString();
    const guidance = this.buildFailureMemoryGuidance(category, signature, compact);
    const current = this.failureMemory.get(key);
    if (current) {
      current.count += 1;
      current.lastSeenAt = now;
      current.example = compact;
      current.guidance = guidance;
      current.stage = normalizedStage;
    } else {
      this.failureMemory.set(key, {
        key,
        artifactType,
        category,
        stage: normalizedStage,
        signature,
        guidance,
        example: compact,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now
      });
      this.trimFailureMemory();
    }
    this.persistTaskState(taskId);
  }

  private trimFailureMemory(): void {
    const entries = [...this.failureMemory.values()];
    if (entries.length <= MAX_FAILURE_MEMORY_ENTRIES) return;
    entries
      .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(MAX_FAILURE_MEMORY_ENTRIES)
      .forEach((entry) => {
        this.failureMemory.delete(entry.key);
      });
  }

  private buildFailureMemorySignature(category: AgentTaskFailureCategory, message: string): string {
    const normalized = (message ?? "").toLowerCase();
    if (category === "malformed-json") {
      if (normalized.includes("strict schema")) return "strict-schema-contract";
      if (normalized.includes("no usable edits")) return "json-no-usable-edits";
      return "managed-json-shape";
    }
    if (category === "unsupported-path") return "out-of-scope-edits";
    if (category === "wrong-scaffold") return "scaffold-mismatch";
    if (category === "asset-missing") return "missing-linked-assets";
    if (category === "missing-file") {
      if (normalized.includes("readme")) return "missing-readme";
      if (normalized.includes("index.html")) return "missing-index-entry";
      if (normalized.includes("main.tsx")) return "missing-react-entry";
      if (normalized.includes("desktop-launch")) return "missing-desktop-launcher";
      return "missing-required-file";
    }
    if (category === "build-error") {
      if (normalized.includes("package.json")) return "package-manifest-integrity";
      if (normalized.includes("dependency")) return "dependency-install";
      return "build-contract";
    }
    if (category === "runtime-error") {
      if (normalized.includes("usage")) return "cli-usage-output";
      if (normalized.includes("api probe") || normalized.includes("/health")) return "api-runtime-endpoints";
      if (normalized.includes("desktop preview")) return "desktop-preview-runtime";
      return "runtime-launch-path";
    }
    if (category === "preview-error") return "preview-bootstrap";
    if (category === "lint-error") return "lint-cleanup";
    if (category === "test-error") return "test-contract";
    if (category === "verification-error") {
      if (normalized.includes("api probe")) return "api-verification";
      if (normalized.includes("cli runtime")) return "cli-verification";
      if (normalized.includes("desktop interaction")) return "desktop-verification";
      return "verification-contract";
    }
    return normalized
      .replace(/\b\d+\b/g, "#")
      .replace(/[^\w\s-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || "general";
  }

  private buildFailureMemoryGuidance(
    category: AgentTaskFailureCategory,
    signature: string,
    message: string
  ): string {
    const base = this.buildFailureCategoryGuidance(category);
    switch (signature) {
      case "strict-schema-contract":
        return "Return only the strict JSON contract with summary and scoped edits. No prose, no markdown fences, no alternate keys.";
      case "json-no-usable-edits":
        return "Do not stop at a summary. Return at least one concrete scoped file edit when a repair is required.";
      case "out-of-scope-edits":
        return "Keep edits inside the planned workspace files and avoid touching host-workspace or unsupported paths.";
      case "missing-readme":
        return "Restore the missing README and keep it aligned with run/build commands and deliverables.";
      case "missing-index-entry":
        return "Restore the preview entry HTML and ensure scripts/styles still point at real local assets.";
      case "missing-react-entry":
        return "Restore the main React entry and make sure the root render path is intact.";
      case "missing-desktop-launcher":
        return "Restore the desktop launcher script and keep packaged launch scripts pointed at the Electron entry.";
      case "package-manifest-integrity":
        return "Keep package.json valid JSON and preserve the expected build/start/test scripts for the project type.";
      case "dependency-install":
        return "Prefer dependency-safe repairs that keep package names, versions, and scripts consistent with the scaffold.";
      case "cli-usage-output":
        return "A CLI verification run must complete with real output, not just usage text. Accept fixture input when provided.";
      case "api-runtime-endpoints":
        return "Keep the API launch path stable and make sure /health plus the main collection endpoint return JSON.";
      case "desktop-preview-runtime":
        return "Keep the desktop preview interactive and ensure the built index.html remains smoke-testable.";
      case "preview-bootstrap":
        return "Preserve preview bootstrap wiring: entry HTML, linked assets, and root render/bootstrap markers.";
      default:
        return `${base} Recent example: ${this.compactFailureMessage(message)}`;
    }
  }

  private hasStartupFailureSignal(output: string): boolean {
    const normalized = (output ?? "").trim();
    if (!normalized) return false;
    const relevantLines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !this.isBenignStartupWarning(line));

    if (relevantLines.length === 0) return false;

    return relevantLines.some((line) => (
      /bootstrap failed|render-process-gone|\bunhandled\b|\buncaught\b|\bexception\b|\btypeerror\b|\breferenceerror\b|\bsyntaxerror\b|cannot find module|\beaddrinuse\b|failed:/i
        .test(line)
    ));
  }

  private isBenignStartupWarning(line: string): boolean {
    return /unable to move the cache|unable to create cache|gpu cache creation failed|console-message' arguments are deprecated/i
      .test(line);
  }

  private async terminateProcessTree(proc: ChildProcessWithoutNullStreams): Promise<void> {
    const pid = proc.pid;
    if (!pid) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // noop
      }
      return;
    }

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
          stdio: "ignore",
          windowsHide: true
        });
        killer.once("error", () => resolve());
        killer.once("exit", () => resolve());
      });
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // noop
      }
    }
  }

  private spawnTaskProcess(
    command: string,
    args: string[],
    cwd: string,
    options?: {
      env?: NodeJS.ProcessEnv;
      useShell?: boolean;
    }
  ): ChildProcessWithoutNullStreams {
    const env = options?.env ?? process.env;
    const useShell = options?.useShell ?? process.platform === "win32";
    if (process.platform === "win32" && useShell) {
      // Avoid Node's shell+args deprecation while retaining cmd/.bat compatibility on Windows.
      return spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        cwd,
        env,
        stdio: "pipe",
        windowsHide: true
      });
    }
    return spawn(command, args, {
      cwd,
      env,
      stdio: "pipe",
      shell: useShell,
      windowsHide: true
    });
  }

  private async applyStructuredEdits(taskId: string, attempt: number, edits: StructuredEdit[]): Promise<string[]> {
    const changedFiles: string[] = [];
    for (const edit of edits) {
      const normalizedPath = edit.path.trim();
      if (!normalizedPath) continue;

      let currentContent = "";
      try {
        currentContent = (await this.readWorkspaceFile(normalizedPath)).content;
      } catch {
        currentContent = "";
      }

      await this.createBackup(taskId, attempt, normalizedPath, currentContent);
      await this.writeWorkspaceFile(normalizedPath, this.normalizeStructuredEditContentForWrite(normalizedPath, edit.content));
      changedFiles.push(normalizedPath);
      this.appendLog(taskId, `Applied edit: ${normalizedPath}`);
    }
    return changedFiles;
  }

  private normalizeStructuredEditContentForWrite(path: string, content: string): string {
    const normalizedPath = (path ?? "").replace(/\\/g, "/").toLowerCase();
    if (!normalizedPath.endsWith("package.json")) {
      return content;
    }

    const manifest = this.parseLoosePackageManifest(content);
    if (!manifest) {
      return content;
    }

    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  private async createBackup(taskId: string, attempt: number, targetPath: string, content: string): Promise<void> {
    const backupRoot = join(this.workspaceRoot, "tmp", "agent-backups", taskId, `attempt-${attempt}`);
    const backupPath = join(backupRoot, `${targetPath.replace(/[/:]/g, "_")}.bak`);
    await mkdir(backupRoot, { recursive: true });
    await writeFile(backupPath, content, "utf8");
  }

  private appendOutput(taskId: string, output: string): void {
    output
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .forEach((line) => this.appendLog(taskId, line));
  }

  private appendLog(taskId: string, line: string): void {
    const logs = this.taskLogs.get(taskId) ?? [];
    logs.push(`[${new Date().toISOString()}] ${line}`);
    if (logs.length > MAX_LOG_LINES) logs.splice(0, logs.length - MAX_LOG_LINES);
    this.taskLogs.set(taskId, logs);
    if (taskId !== "manual") {
      this.queueTaskStatePersist(taskId);
    }
  }

  private buildNpmScriptRequest(scriptName: string, timeoutMs: number, cwd = ".", extraArgs: string[] = []): TerminalCommandRequest {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const passthrough = extraArgs.length > 0 ? ["--", ...extraArgs] : [];
    if (scriptName === "test" || scriptName === "start") {
      return { command: npmCommand, args: [scriptName, ...passthrough], timeoutMs, cwd };
    }
    return { command: npmCommand, args: ["run", scriptName, ...passthrough], timeoutMs, cwd };
  }

  private async tryReadPackageJson(targetDirectory = "."): Promise<PackageManifest | null> {
    const fullPath = join(this.resolveWorkspacePath(targetDirectory), "package.json");
    try {
      const content = await readFile(fullPath, "utf8");
      return this.parseLoosePackageManifest(content);
    } catch {
      return null;
    }
  }

  private parseLoosePackageManifest(raw: string): PackageManifest | null {
    const candidates = [
      raw,
      this.normalizeLooseJson(raw),
      this.normalizeLooseJson(raw).replace(/\\'/g, "'")
    ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as PackageManifest;
      } catch {
        // try next candidate
      }
    }

    return null;
  }

  private extractScripts(pkg: { scripts?: PackageScripts } | null): PackageScripts {
    const rawScripts = typeof pkg?.scripts === "object" && pkg?.scripts
      ? pkg.scripts
      : {};
    const normalized: PackageScripts = {};
    for (const [key, value] of Object.entries(rawScripts)) {
      if (typeof value === "string" && value.trim()) {
        normalized[key] = value.trim();
      }
    }
    return normalized;
  }

  private resolveVerificationScripts(pkg: { scripts?: PackageScripts } | null, plan: TaskExecutionPlan): PackageScripts {
    const scripts = this.extractScripts(pkg);
    if (plan.workspaceKind !== "static") return scripts;
    return {
      ...scripts,
      build: "python -c \"print('Static site ready')\"",
      start: "python -m http.server 4173"
    };
  }

  private async ensureGeneratedAppPackageJson(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;

    const packageJsonPath = this.joinWorkspacePath(workingDirectory, "package.json");
    const packageLockPath = this.joinWorkspacePath(workingDirectory, "package-lock.json");

    let current: Record<string, unknown> = {};
    try {
      const raw = await readFile(this.resolveWorkspacePath(packageJsonPath), "utf8");
      current = (this.parseLoosePackageManifest(raw) as Record<string, unknown> | null) ?? {};
    } catch {
      current = {};
    }

    let packageName = typeof current.name === "string" && current.name.trim()
      ? current.name.trim()
      : this.toDisplayNameFromDirectory(workingDirectory).toLowerCase().replace(/\s+/g, "-");

    if (!packageName) {
      try {
        const rawLock = await readFile(this.resolveWorkspacePath(packageLockPath), "utf8");
        const parsedLock = JSON.parse(rawLock) as { name?: string };
        if (typeof parsedLock.name === "string" && parsedLock.name.trim()) {
          packageName = parsedLock.name.trim();
        }
      } catch {
        // ignore
      }
    }

    if (plan.workspaceKind === "static") {
      const normalized = {
        name: packageName,
        private: current.private ?? true,
        version: typeof current.version === "string" && current.version.trim() ? current.version : "0.1.0",
        scripts: {
          build: "python -c \"print('Static site ready')\"",
          start: "python -m http.server 4173"
        }
      };

      await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return;
    }

    if (plan.workspaceKind === "generic") {
      const inferredArtifact = this.inferGeneratedGenericArtifactType(plan, current);
      const defaultScripts = this.buildNodePackageScripts(inferredArtifact ?? undefined);
      const normalized: Record<string, unknown> = {
        name: packageName,
        private: current.private ?? true,
        version: typeof current.version === "string" && current.version.trim() ? current.version : "0.1.0"
      };

      if (typeof current.type === "string" && current.type.trim()) {
        normalized.type = current.type.trim();
      }
      if (typeof current.main === "string" && current.main.trim()) {
        normalized.main = current.main.trim();
      }
      if (current.bin && (typeof current.bin === "string" || typeof current.bin === "object")) {
        normalized.bin = current.bin;
      }

      const scripts = typeof current.scripts === "object" && current.scripts
        ? Object.fromEntries(
          Object.entries(current.scripts as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([key, value]) => [key, (value as string).trim()])
        )
        : {};
      if (Object.keys(defaultScripts).length > 0) {
        normalized.scripts = {
          ...scripts,
          build: defaultScripts.build,
          ...(typeof scripts.start === "string" && scripts.start.trim()
            ? { start: scripts.start.trim() }
            : typeof defaultScripts.start === "string"
              ? { start: defaultScripts.start }
              : {})
        };
      } else if (Object.keys(scripts).length > 0) {
        normalized.scripts = scripts;
      }

      const dependencies = typeof current.dependencies === "object" && current.dependencies
        ? Object.fromEntries(
          Object.entries(current.dependencies as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([key, value]) => [key, (value as string).trim()])
        )
        : {};
      if (Object.keys(dependencies).length > 0) {
        normalized.dependencies = dependencies;
      }

      const devDependencies = typeof current.devDependencies === "object" && current.devDependencies
        ? Object.fromEntries(
          Object.entries(current.devDependencies as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([key, value]) => [key, (value as string).trim()])
        )
        : {};
      if (Object.keys(devDependencies).length > 0) {
        normalized.devDependencies = devDependencies;
      }

      await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return;
    }

    if (plan.workspaceKind !== "react") return;

    const isDesktopApp = artifactType === "desktop-app";
    const displayName = this.toDisplayNameFromDirectory(workingDirectory);
    const normalized: Record<string, unknown> = {
      name: packageName,
      private: current.private ?? true,
      version: typeof current.version === "string" && current.version.trim() ? current.version : "0.0.0",
      type: "module",
      ...(isDesktopApp ? { main: "electron/main.mjs" } : {}),
      scripts: isDesktopApp
        ? {
          start: "node scripts/desktop-launch.mjs",
          dev: "vite",
          "dev:web": "vite",
          build: "vite build",
          lint: "eslint .",
          preview: "vite preview",
          "package:win": "electron-builder --win nsis --publish never"
        }
        : {
          dev: "vite",
          build: "tsc -b && vite build",
          lint: "eslint .",
          preview: "vite preview"
        },
      dependencies: {
        react: "^19.2.4",
        "react-dom": "^19.2.4"
      },
      devDependencies: {
        "@eslint/js": "^9.39.4",
        "@types/node": "^24.12.0",
        "@types/react": "^19.2.14",
        "@types/react-dom": "^19.2.3",
        "@vitejs/plugin-react": "^6.0.1",
        eslint: "^9.39.4",
        "eslint-plugin-react-hooks": "^7.0.1",
        "eslint-plugin-react-refresh": "^0.5.2",
        ...(isDesktopApp
          ? {
            electron: "^35.0.0",
            "electron-builder": "^26.8.1"
          }
          : {}),
        globals: "^17.4.0",
        typescript: "~5.9.3",
        "typescript-eslint": "^8.57.0",
        vite: "^8.0.1"
      },
      ...(isDesktopApp
        ? {
          build: {
            appId: this.buildGeneratedDesktopAppId(packageName),
            productName: displayName,
            executableName: displayName,
            directories: {
              output: "release"
            },
            files: [
              "dist/**/*",
              "electron/**/*",
              "package.json"
            ],
            win: {
              signAndEditExecutable: false,
              target: [
                {
                  target: "nsis",
                  arch: ["x64"]
                }
              ]
            },
            nsis: {
              artifactName: "${productName}-Setup-${version}.exe",
              oneClick: false,
              createDesktopShortcut: false,
              allowToChangeInstallationDirectory: true
            }
          }
        }
        : {})
    };

    await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
  }

  private inferGeneratedGenericArtifactType(
    plan: TaskExecutionPlan | { candidateFiles?: string[] } | null | undefined,
    current: Record<string, unknown>
  ): AgentArtifactType | null {
    const candidateFiles = Array.isArray(plan?.candidateFiles) ? plan.candidateFiles : [];
    const scripts = typeof current.scripts === "object" && current.scripts
      ? current.scripts as Record<string, unknown>
      : {};
    const startScript = typeof scripts.start === "string" ? scripts.start.trim().toLowerCase() : "";
    const hasServerCandidate = candidateFiles.some((path) => /\/src\/server\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")));
    const hasBin = typeof current.bin === "string"
      || (typeof current.bin === "object" && current.bin !== null && Object.keys(current.bin as Record<string, unknown>).length > 0)
      || candidateFiles.some((path) => /\/bin\/.+\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")));

    if (hasServerCandidate || /src\/server\.[cm]?[jt]s/.test(startScript)) {
      return "api-service";
    }
    if (hasBin || startScript.length > 0) {
      return "script-tool";
    }
    if (candidateFiles.some((path) => /\/src\/index\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")))) {
      return "library";
    }
    return null;
  }

  private async ensureGeneratedReactProjectFiles(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;
    if (plan.workspaceKind !== "react") return;

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "vite.config.ts"),
      "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "eslint.config.js"),
      "import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\nimport { defineConfig, globalIgnores } from 'eslint/config'\n\nexport default defineConfig([\n  globalIgnores(['dist']),\n  {\n    files: ['**/*.{ts,tsx}'],\n    extends: [\n      js.configs.recommended,\n      tseslint.configs.recommended,\n      reactHooks.configs.flat.recommended,\n      reactRefresh.configs.vite,\n    ],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n    },\n  },\n])\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "tsconfig.json"),
      "{\n  \"files\": [],\n  \"references\": [\n    { \"path\": \"./tsconfig.app.json\" },\n    { \"path\": \"./tsconfig.node.json\" }\n  ]\n}\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "tsconfig.app.json"),
      "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.app.tsbuildinfo\",\n    \"target\": \"ES2023\",\n    \"useDefineForClassFields\": true,\n    \"lib\": [\"ES2023\", \"DOM\", \"DOM.Iterable\"],\n    \"module\": \"ESNext\",\n    \"types\": [\"vite/client\"],\n    \"skipLibCheck\": true,\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"jsx\": \"react-jsx\",\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"src\"]\n}\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "tsconfig.node.json"),
      "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.node.tsbuildinfo\",\n    \"target\": \"ES2023\",\n    \"lib\": [\"ES2023\"],\n    \"module\": \"ESNext\",\n    \"types\": [\"node\"],\n    \"skipLibCheck\": true,\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"vite.config.ts\"]\n}\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "src/main.tsx"),
      "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './index.css'\nimport App from './App.tsx'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n"
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "index.html"),
      this.buildReactBootstrapHtml(this.toDisplayNameFromDirectory(workingDirectory))
    );

    if (artifactType !== "desktop-app") return;

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"),
      [
        "import { spawn } from 'node:child_process';",
        "import { readFileSync } from 'node:fs';",
        "import { createServer } from 'node:net';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        "",
        "const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));",
        "const workspaceRoot = dirname(dirname(rootDir));",
        "const viteScript = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');",
        "const desktopShellScript = join(workspaceRoot, 'scripts', 'generated-desktop-shell.mjs');",
        "const packageJsonPath = join(rootDir, 'package.json');",
        "",
        "function formatTitle(rawValue, fallback = 'Generated Desktop App') {",
        "  const normalized = String(rawValue ?? '')",
        "    .trim()",
        "    .replace(/\\.[^.]+$/, '')",
        "    .replace(/[_-]+/g, ' ')",
        "    .replace(/\\s+/g, ' ');",
        "  if (!normalized) return fallback;",
        "  const parts = normalized.split(' ').filter(Boolean);",
        "  if (parts.length === 0) return fallback;",
        "  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');",
        "}",
        "",
        "function resolveAppTitle() {",
        "  try {",
        "    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));",
        "    if (typeof manifest.name === 'string' && manifest.name.trim()) {",
        "      return formatTitle(manifest.name.trim());",
        "    }",
        "  } catch {",
        "    // Fall back to the directory name when package metadata is unavailable.",
        "  }",
        "  return formatTitle(rootDir.split(/[/\\\\]/).filter(Boolean).pop() ?? 'Generated Desktop App');",
        "}",
        "",
        "const appTitle = resolveAppTitle();",
        "",
        "function findFreePort() {",
        "  return new Promise((resolve, reject) => {",
        "    const server = createServer();",
        "    server.unref();",
        "    server.on('error', reject);",
        "    server.listen(0, '127.0.0.1', () => {",
        "      const address = server.address();",
        "      if (!address || typeof address === 'string') {",
        "        server.close(() => reject(new Error('Unable to resolve a free localhost port.')));",
        "        return;",
        "      }",
        "      const port = address.port;",
        "      server.close((error) => {",
        "        if (error) reject(error);",
        "        else resolve(port);",
        "      });",
        "    });",
        "  });",
        "}",
        "",
        "let rendererReady = false;",
        "let shuttingDown = false;",
        "let desktopProcess = null;",
        "let renderer = null;",
        "",
        "function shutdown(exitCode = 0) {",
        "  if (shuttingDown) return;",
        "  shuttingDown = true;",
        "  if (desktopProcess && !desktopProcess.killed) {",
        "    desktopProcess.kill();",
        "  }",
        "  if (renderer && !renderer.killed) {",
        "    renderer.kill();",
        "  }",
        "  setTimeout(() => process.exit(exitCode), 50);",
        "}",
        "",
        "function handleRendererOutput(chunk, forward) {",
        "  const text = chunk.toString();",
        "  forward.write(text);",
        "  if (!rendererReady && /(?:local:\\s*http:\\/\\/127\\.0\\.0\\.1:\\d+|ready in)/i.test(text)) {",
        "    rendererReady = true;",
        "    desktopProcess = spawn(process.execPath, [desktopShellScript, '--url', desktopUrl, '--title', appTitle], {",
        "      cwd: workspaceRoot,",
        "      stdio: 'inherit',",
        "    });",
        "    desktopProcess.once('exit', (code) => shutdown(code ?? 0));",
        "    desktopProcess.once('error', (error) => {",
        "      console.error(error);",
        "      shutdown(1);",
        "    });",
        "  }",
        "}",
        "",
        "let desktopUrl = '';",
        "",
        "const port = await findFreePort();",
        "desktopUrl = `http://127.0.0.1:${port}`;",
        "renderer = spawn(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {",
        "  cwd: rootDir,",
        "  stdio: ['ignore', 'pipe', 'pipe'],",
        "});",
        "",
        "renderer.stdout.on('data', (chunk) => handleRendererOutput(chunk, process.stdout));",
        "renderer.stderr.on('data', (chunk) => handleRendererOutput(chunk, process.stderr));",
        "renderer.once('exit', (code) => {",
        "  if (!shuttingDown && !rendererReady) {",
        "    process.exit(code ?? 1);",
        "  }",
        "});",
        "renderer.once('error', (error) => {",
        "  console.error(error);",
        "  shutdown(1);",
        "});",
        "",
        "for (const signal of ['SIGINT', 'SIGTERM']) {",
        "  process.on(signal, () => shutdown(0));",
        "}",
        ""
      ].join("\n")
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "electron/main.mjs"),
      this.buildGeneratedDesktopMainProcess(this.toDisplayNameFromDirectory(workingDirectory))
    );

    await this.writeWorkspaceFile(
      this.joinWorkspacePath(workingDirectory, "electron/preload.mjs"),
      this.buildGeneratedDesktopPreloadBridge()
    );
  }

  private detectBootstrapPlan(prompt: string, inspection: WorkspaceInspectionResult): BootstrapPlan | null {
    const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
    if (!normalizedPrompt) return null;

    const wantsNewProject = this.looksLikeNewProjectPrompt(normalizedPrompt);

    if (!wantsNewProject) return null;

    const projectName = this.extractProjectName(prompt);
    const targetDirectory = this.joinWorkspacePath("generated-apps", projectName);
    const normalizedPackageName = (inspection.packageName ?? "").trim().toLowerCase();
    const looksLikeCipherRepo = normalizedPackageName === "cipher-ai" || normalizedPackageName === "cipher-workspace";

    if (!looksLikeCipherRepo && normalizedPackageName) {
      return null;
    }

    const wantsNext = /\bnext(?:\.js|js)\b/.test(normalizedPrompt);
    const wantsStatic = ["landing page", "pricing page", "microsite", "showcase page", "marketing page", "static site", "html css", "vanilla js"].some((term) => normalizedPrompt.includes(term));
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalizedPrompt);
    const starterProfile = this.inferStarterProfile(promptArtifact, this.detectBuilderMode(prompt), wantsStatic ? "static" : "react");
    const domainFocus = this.inferDomainFocus(prompt, starterProfile, promptArtifact);
    const wantsNodePackage = promptArtifact === "script-tool" || promptArtifact === "library" || promptArtifact === "api-service";
    const isDesktopStarter = starterProfile === "electron-desktop" || promptArtifact === "desktop-app";
    const template: BootstrapPlan["template"] = wantsNodePackage
      ? "node-package"
      : isDesktopStarter
        ? "react-vite"
        : (wantsNext ? "nextjs" : (wantsStatic ? "static" : "react-vite"));
    const commands = this.buildBootstrapCommands(template, targetDirectory);

    return {
      targetDirectory,
      template,
      artifactType: promptArtifact ?? undefined,
      starterProfile,
      domainFocus,
      projectName,
      summary: `Bootstrapping a ${template} project in ${targetDirectory} to avoid overwriting the current Cipher workspace.`,
      commands
    };
  }

  private buildBootstrapPlanForTarget(prompt: string, targetDirectory: string): BootstrapPlan {
    const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
    const targetName = targetDirectory.split("/").filter(Boolean).pop() ?? "agent-app";
    const wantsNext = /\bnext(?:\.js|js)\b/.test(normalizedPrompt);
    const wantsStatic = ["landing page", "pricing page", "microsite", "showcase page", "marketing page", "static site", "html css", "vanilla js", "website", "site", "homepage"].some((term) => normalizedPrompt.includes(term));
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalizedPrompt);
    const starterProfile = this.inferStarterProfile(promptArtifact, this.detectBuilderMode(prompt), wantsStatic ? "static" : "react");
    const domainFocus = this.inferDomainFocus(prompt, starterProfile, promptArtifact);
    const wantsNodePackage = promptArtifact === "script-tool" || promptArtifact === "library" || promptArtifact === "api-service";
    const isDesktopStarter = starterProfile === "electron-desktop" || promptArtifact === "desktop-app";
    const template: BootstrapPlan["template"] = wantsNodePackage
      ? "node-package"
      : isDesktopStarter
        ? "react-vite"
        : (wantsNext ? "nextjs" : (wantsStatic ? "static" : "react-vite"));
    return {
      targetDirectory,
      template,
      artifactType: promptArtifact ?? undefined,
      starterProfile,
      domainFocus,
      projectName: targetName,
      summary: `Bootstrapping a ${template} project in ${targetDirectory}.`,
      commands: this.buildBootstrapCommands(template, targetDirectory)
    };
  }

  private looksLikeNewProjectPrompt(normalizedPrompt: string): boolean {
    const actionSignals = ["build", "create", "make", "start", "bootstrap", "give me", "i want", "i need"];
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
      "admin console",
      "analytics",
      "console",
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
      "snippet",
      "tracker",
      "wallboard",
      "follow up",
      "follow-up",
      "outreach"
    ];
    const hasAction = actionSignals.some((term) => normalizedPrompt.includes(term));
    const hasScope = scopeSignals.some((term) => normalizedPrompt.includes(term));
    const explicitlyNew = ["new app", "new project", "from scratch"].some((term) => normalizedPrompt.includes(term));
    return (hasAction && hasScope) || explicitlyNew;
  }

  private extractGeneratedAppDirectoryFromPrompt(prompt: string): string | null {
    const match = /generated-apps[\\/][a-z0-9][a-z0-9-]*/i.exec(prompt ?? "");
    if (!match) return null;
    return match[0].replace(/\\/g, "/");
  }

  private buildBootstrapCommands(template: BootstrapPlan["template"], targetDirectory: string): TerminalCommandRequest[] {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

    if (template === "nextjs") {
      return [{
        command: npxCommand,
        args: ["create-next-app@latest", targetDirectory, "--ts", "--eslint", "--app", "--src-dir", "--use-npm", "--yes"],
        timeoutMs: 300_000
      }];
    }

    if (template === "static") {
      return [];
    }

    if (template === "node-package") {
      return [];
    }

    return [
      {
        command: npmCommand,
        args: ["create", "vite@latest", targetDirectory, "--", "--template", "react-ts"],
        timeoutMs: 180_000
      },
      {
        command: npmCommand,
        args: ["install"],
        cwd: targetDirectory,
        timeoutMs: 180_000
      }
    ];
  }

  private async executeBootstrapPlan(taskId: string, plan: BootstrapPlan): Promise<{ summary: string }> {
    const targetPath = this.resolveWorkspacePath(plan.targetDirectory);
    let targetExistsWithContent = false;
    try {
      const existingEntries = await readdir(targetPath);
      if (existingEntries.length > 0) {
        targetExistsWithContent = true;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }

    if (targetExistsWithContent) {
      const reusable = await this.isReusableBootstrapDirectory(plan);
      if (!reusable) {
        this.appendLog(taskId, `Removing incomplete bootstrap directory before retry: ${plan.targetDirectory}`);
        await rm(targetPath, { recursive: true, force: true });
        await mkdir(targetPath, { recursive: true });
      } else {
        if (plan.template === "static") {
          await this.ensureStaticWorkspaceScripts(plan.targetDirectory);
        }
        await this.ensureBootstrapProjectReadme(plan);
        this.appendLog(taskId, `Reusing existing bootstrap directory: ${plan.targetDirectory}`);
        return {
          summary: `Reusing existing ${plan.template} project in ${plan.targetDirectory}.`
        };
      }
    } else {
      await mkdir(targetPath, { recursive: true });
    }

    if (plan.template === "static") {
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "index.html"), this.buildStaticBootstrapHtml(plan.projectName, plan.starterProfile));
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "styles.css"), this.buildStaticBootstrapCss(plan.starterProfile));
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "app.js"), this.buildStaticBootstrapJs(plan.projectName, plan.starterProfile));
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "package.json"), JSON.stringify({
        name: plan.projectName,
        private: true,
        version: "0.1.0",
        scripts: {
          build: "python -c \"print('Static site ready')\"",
          start: "python -m http.server 4173"
        }
      }, null, 2) + "\n");
      await this.ensureBootstrapProjectReadme(plan);
      this.appendLog(taskId, `Static app scaffold created in ${plan.targetDirectory}`);
      return { summary: plan.summary };
    }

    if (plan.template === "node-package") {
      await this.writeBootstrapNodePackage(plan);
      await this.ensureBootstrapProjectReadme(plan);
      this.appendLog(taskId, `Node package scaffold created in ${plan.targetDirectory}`);
      return { summary: plan.summary };
    }

    try {
      for (const command of plan.commands) {
        const result = await this.executeCommand(taskId, command);
        if (!result.ok) {
          throw new Error(this.buildCommandFailureMessage("Bootstrap", result, `failed while running ${result.commandLine}`));
        }
      }
      await this.applyBootstrapStarterProfile(plan);
      await this.ensureBootstrapProjectReadme(plan);
    } catch (err) {
      this.appendLog(taskId, `Cleaning up failed bootstrap directory: ${plan.targetDirectory}`);
      await rm(targetPath, { recursive: true, force: true });
      throw err;
    }

    return { summary: plan.summary };
  }

  private async isReusableBootstrapDirectory(plan: BootstrapPlan): Promise<boolean> {
    const requiredPaths = plan.template === "static"
      ? [
        this.joinWorkspacePath(plan.targetDirectory, "index.html"),
        this.joinWorkspacePath(plan.targetDirectory, "styles.css"),
        this.joinWorkspacePath(plan.targetDirectory, "app.js"),
        this.joinWorkspacePath(plan.targetDirectory, "package.json")
      ]
      : plan.template === "nextjs"
        ? [
          this.joinWorkspacePath(plan.targetDirectory, "package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "src/app/page.tsx")
        ]
        : plan.template === "node-package"
          ? [
            this.joinWorkspacePath(plan.targetDirectory, "package.json"),
            ...this.getNodePackageBootstrapPaths(plan.targetDirectory, plan.artifactType)
          ]
        : [
          this.joinWorkspacePath(plan.targetDirectory, "package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "index.html"),
          this.joinWorkspacePath(plan.targetDirectory, "src/main.tsx"),
          this.joinWorkspacePath(plan.targetDirectory, "src/App.tsx"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/@vitejs/plugin-react/package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/vite/package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/react/package.json")
        ];

    if (plan.starterProfile === "electron-desktop") {
      requiredPaths.push(this.joinWorkspacePath(plan.targetDirectory, "electron/main.mjs"));
      requiredPaths.push(this.joinWorkspacePath(plan.targetDirectory, "electron/preload.mjs"));
      requiredPaths.push(this.joinWorkspacePath(plan.targetDirectory, "scripts/desktop-launch.mjs"));
    }

    for (const relPath of requiredPaths) {
      try {
        await stat(this.resolveWorkspacePath(relPath));
      } catch {
        return false;
      }
    }

    if (plan.starterProfile === "electron-desktop") {
      try {
        const raw = await readFile(this.resolveWorkspacePath(this.joinWorkspacePath(plan.targetDirectory, "package.json")), "utf8");
        const parsed = this.parseLoosePackageManifest(raw);
        const scripts = parsed?.scripts ?? {};
        if (typeof scripts["package:win"] !== "string" || !scripts["package:win"].trim()) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  private async applyBootstrapStarterProfile(plan: BootstrapPlan): Promise<void> {
    if (plan.template !== "react-vite") return;

    for (const file of this.buildReactBootstrapStarterFiles(plan)) {
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, file.path), file.content);
    }
  }

  private async ensureStaticWorkspaceScripts(targetDirectory: string): Promise<void> {
    const packageJsonPath = this.joinWorkspacePath(targetDirectory, "package.json");
    const indexPath = this.joinWorkspacePath(targetDirectory, "index.html");
    const stylesPath = this.joinWorkspacePath(targetDirectory, "styles.css");
    const scriptPath = this.joinWorkspacePath(targetDirectory, "app.js");

    try {
      await stat(this.resolveWorkspacePath(indexPath));
      await stat(this.resolveWorkspacePath(stylesPath));
      await stat(this.resolveWorkspacePath(scriptPath));
    } catch {
      return;
    }

    try {
      const raw = await readFile(this.resolveWorkspacePath(packageJsonPath), "utf8");
      const parsed = JSON.parse(raw) as {
        name?: string;
        private?: boolean;
        version?: string;
        scripts?: Record<string, string>;
      };
      const nextPackageJson = {
        name: parsed.name || this.toDisplayNameFromDirectory(targetDirectory).toLowerCase().replace(/\s+/g, "-"),
        private: parsed.private ?? true,
        version: parsed.version || "0.1.0",
        scripts: {
          build: "python -c \"print('Static site ready')\"",
          start: "python -m http.server 4173"
        }
      };
      await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(nextPackageJson, null, 2)}\n`);
    } catch {
      // Ignore malformed package.json files here; verification will surface real issues later.
    }
  }

  private getNodePackageBootstrapPaths(targetDirectory: string, artifactType?: AgentArtifactType): string[] {
    if (artifactType === "api-service") {
      return [this.joinWorkspacePath(targetDirectory, "src/server.js")];
    }
    if (artifactType === "library") {
      return [this.joinWorkspacePath(targetDirectory, "src/index.js")];
    }
    return [this.joinWorkspacePath(targetDirectory, "src/index.js")];
  }

  private buildNodePackageScripts(artifactType?: AgentArtifactType): Record<string, string> {
    if (artifactType === "api-service") {
      return {
        build: "node -e \"console.log('Service ready')\"",
        test: "node --test",
        start: "node src/server.js"
      };
    }
    if (artifactType === "library") {
      return {
        build: "node -e \"console.log('Package ready')\"",
        test: "node --test"
      };
    }
    return {
      build: "node -e \"console.log('Tool ready')\"",
      test: "node --test",
      start: "node src/index.js"
    };
  }

  private buildNodePackageManifest(projectName: string, artifactType?: AgentArtifactType): PackageManifest {
    const manifest: PackageManifest = {
      name: projectName,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: this.buildNodePackageScripts(artifactType)
    };

    if (artifactType === "library") {
      manifest.main = "./src/index.js";
      manifest.exports = {
        ".": "./src/index.js"
      };
    } else if (artifactType === "script-tool") {
      manifest.bin = {
        [projectName]: "./bin/cli.mjs"
      };
    } else if (artifactType === "api-service") {
      manifest.main = "./src/server.js";
    }

    return manifest;
  }

  private buildNodePackageStarterContent(
    projectName: string,
    artifactType?: AgentArtifactType,
    domainFocus: DomainFocus = "generic"
  ): Array<{ path: string; content: string }> {
    if (artifactType === "api-service") {
      const entity = this.buildApiEntityForDomain(domainFocus);
      return [
        {
          path: "src/server.js",
          content: [
            "import http from 'node:http';",
            "import { randomUUID } from 'node:crypto';",
            "",
            `const ${entity.plural} = [`,
            `  { id: randomUUID(), ${entity.primaryField}: '${entity.defaultPrimaryValue}', status: 'active' }`,
            "];",
            "",
            "function sendJson(res, statusCode, payload) {",
            "  res.writeHead(statusCode, { 'content-type': 'application/json' });",
            "  res.end(JSON.stringify(payload));",
            "}",
            "",
            "function readJsonBody(req) {",
            "  return new Promise((resolve, reject) => {",
            "    let raw = '';",
            "    req.on('data', (chunk) => { raw += chunk; });",
            "    req.on('end', () => {",
            "      if (!raw.trim()) return resolve({});",
            "      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }",
            "    });",
            "    req.on('error', reject);",
            "  });",
            "}",
            "",
            "const server = http.createServer(async (req, res) => {",
            "  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);",
            "  if (req.method === 'GET' && url.pathname === '/health') {",
            `    return sendJson(res, 200, { service: '${projectName}', status: 'ok', resource: '${entity.plural}' });`,
            "  }",
            `  if (req.method === 'GET' && url.pathname === '${entity.collectionPath}') {`,
            `    return sendJson(res, 200, { ${entity.plural} });`,
            "  }",
            `  if (req.method === 'POST' && url.pathname === '${entity.collectionPath}') {`,
            "    const body = await readJsonBody(req);",
            `    const ${entity.singular} = {`,
            "      id: randomUUID(),",
            `      ${entity.primaryField}: String(body.${entity.primaryField} ?? '${entity.defaultPrimaryValue}'),`,
            "      status: String(body.status ?? 'active')",
            "    };",
            `    ${entity.plural}.unshift(${entity.singular});`,
            `    return sendJson(res, 201, ${entity.singular});`,
            "  }",
            "  return sendJson(res, 404, { error: 'Not found' });",
            "});",
            "",
            "server.listen(process.env.PORT || 3000, () => {",
            `  console.log('${projectName} listening');`,
            "});"
          ].join("\n") + "\n"
        },
        {
          path: "test/server.test.js",
          content: [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "",
            "test('service smoke placeholder', () => {",
            "  assert.equal(typeof process.version, 'string');",
            "});"
          ].join("\n") + "\n"
        }
      ];
    }

    if (artifactType === "library") {
      return [
        {
          path: "src/index.js",
          content: [
            `export function describe${projectName.replace(/(^|[-_\s]+)([a-z])/gi, (_match, _sep, char) => char.toUpperCase())}() {`,
            `  return '${projectName} package ready';`,
            "}",
            "",
            "export function formatCompactCount(value) {",
            "  return new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(value || 0));",
            "}",
            "",
            "export function formatPercentDelta(value) {",
            "  const amount = Number(value || 0);",
            "  const prefix = amount > 0 ? '+' : '';",
            "  return `${prefix}${amount.toFixed(1)}%`;",
            "}"
          ].join("\n") + "\n"
        },
        {
          path: "test/index.test.js",
          content: [
            "import test from 'node:test';",
            "import assert from 'node:assert/strict';",
            "import { formatCompactCount } from '../src/index.js';",
            "",
            "test('formatCompactCount returns a compact number string', () => {",
            "  assert.equal(typeof formatCompactCount(1200), 'string');",
            "});"
          ].join("\n") + "\n"
        }
      ];
    }

    return [
      {
        path: "src/index.js",
        content: [
          "#!/usr/bin/env node",
          "",
          "import { readFile } from 'node:fs/promises';",
          "",
          "const [targetPath, ...rest] = process.argv.slice(2);",
          "const inlineText = rest.join(' ').trim();",
          "",
          "if (targetPath) {",
          "  try {",
          "    const content = await readFile(targetPath, 'utf8');",
          "    const lines = content.split(/\\r?\\n/).filter(Boolean);",
          `    console.log(JSON.stringify({ tool: '${projectName}', file: targetPath, lines: lines.length, preview: lines.slice(0, 3) }, null, 2));`,
          "    process.exit(0);",
          "  } catch (error) {",
          "    console.error(`Unable to read ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);",
          "    process.exit(1);",
          "  }",
          "}",
          "",
          `console.log(inlineText || '${projectName} tool ready');`
        ].join("\n") + "\n"
      },
      {
        path: "bin/cli.mjs",
        content: [
          "#!/usr/bin/env node",
          "import '../src/index.js';"
        ].join("\n") + "\n"
      },
      {
        path: "test/index.test.js",
        content: [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "",
          "test('cli smoke placeholder', () => {",
          "  assert.equal(2 + 2, 4);",
          "});"
        ].join("\n") + "\n"
      }
    ];
  }

  private async writeBootstrapNodePackage(plan: BootstrapPlan): Promise<void> {
    const packageJsonPath = this.joinWorkspacePath(plan.targetDirectory, "package.json");
    await this.writeWorkspaceFile(
      packageJsonPath,
      JSON.stringify(this.buildNodePackageManifest(plan.projectName, plan.artifactType), null, 2) + "\n"
    );

    for (const file of this.buildNodePackageStarterContent(plan.projectName, plan.artifactType, plan.domainFocus)) {
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, file.path), file.content);
    }
  }

  private extractProjectName(prompt: string): string {
    const namedMatch = /(?:called|named)\s+["']?([a-z0-9][a-z0-9 -]{1,40})["']?/i.exec(prompt);
    const rawName = namedMatch?.[1] ?? this.extractPromptTerms(prompt).slice(0, 3).join("-");
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36);
    return slug || "agent-app";
  }

  private joinWorkspacePath(...parts: string[]): string {
    return parts
      .filter(Boolean)
      .join("/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^\.\//, "")
      || ".";
  }

  private buildGeneralReactStarterApp(projectName: string): string {
    return `import "./App.css";

const highlights = [
  { label: "Starter profile", value: "React app" },
  { label: "Surface", value: "Workspace shell" },
  { label: "Next move", value: "Add domain logic" }
];

export default function App() {
  return (
    <main className="starter-shell">
      <section className="starter-hero">
        <p className="starter-eyebrow">React starter</p>
        <h1>${projectName}</h1>
        <p className="starter-copy">
          This starter begins with a real layout, visible actions, and structured sections so the agent can extend the app without rewriting a blank scaffold.
        </p>
        <div className="starter-actions">
          <button type="button">Primary action</button>
          <a href="#details">Inspect sections</a>
        </div>
      </section>

      <section className="starter-grid">
        {highlights.map((item) => (
          <article key={item.label} className="starter-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section id="details" className="starter-panel">
        <p className="starter-eyebrow">Next steps</p>
        <h2>Replace this with the product workflow</h2>
        <ul>
          <li>Preserve the current file structure and project conventions.</li>
          <li>Swap starter sections for the real app surface.</li>
          <li>Keep the primary action visible while new features are added.</li>
        </ul>
      </section>
    </main>
  );
}
`;
  }

  private buildGeneralReactStarterCss(): string {
    return `.starter-shell {
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 24%),
    linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
  color: #0f172a;
}

.starter-hero,
.starter-panel,
.starter-card {
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 22px 50px rgba(15, 23, 42, 0.08);
}

.starter-hero,
.starter-panel {
  padding: 28px;
}

.starter-eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #2563eb;
}

.starter-hero h1,
.starter-panel h2 {
  margin: 0 0 12px;
}

.starter-copy {
  margin: 0;
  max-width: 720px;
  line-height: 1.7;
  color: #334155;
}

.starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

.starter-actions button,
.starter-actions a {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  text-decoration: none;
}

.starter-actions button {
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #fff;
}

.starter-actions a {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.starter-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.starter-card {
  padding: 20px;
  display: grid;
  gap: 8px;
}

.starter-card span {
  color: #475569;
  font-size: 0.9rem;
}

.starter-card strong {
  font-size: 1.1rem;
}

.starter-panel {
  margin-top: 20px;
}

.starter-panel ul {
  margin: 12px 0 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.7;
}

@media (max-width: 820px) {
  .starter-shell {
    padding: 20px;
  }

  .starter-grid {
    grid-template-columns: 1fr;
  }
}
`;
  }

  private buildGeneralReactStarterIndexCss(): string {
    return `:root {
  color-scheme: light;
  font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}

button,
input,
select,
textarea {
  font: inherit;
}
`;
  }

  private buildStaticBootstrapHtml(projectName: string, starterProfile: StarterProfile = "static-marketing"): string {
    if (starterProfile === "static-marketing") {
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="marketing-shell">
      <section class="hero">
        <p class="eyebrow">Starter app</p>
        <h1>${projectName}</h1>
        <p class="lede">A stronger starter app with a hero section, feature grid, proof strip, and CTA so the agent begins from a real landing page shape.</p>
        <div class="hero-actions">
          <button id="cta" type="button">Start trial</button>
          <a href="#features">See features</a>
        </div>
      </section>

      <section class="proof-strip" aria-label="Proof points">
        <span>Teams onboarded in 2 days</span>
        <span>Operational visibility in one workspace</span>
        <span>Built for lean software teams</span>
      </section>

      <section id="features" class="feature-grid">
        <article>
          <h2>Focused workflow</h2>
          <p>Start with a clear content hierarchy instead of a blank shell.</p>
        </article>
        <article>
          <h2>Fast iteration</h2>
          <p>Keep sections and styling easy for the agent to extend in later passes.</p>
        </article>
        <article>
          <h2>Conversion-ready</h2>
          <p>Primary CTA, proof points, and product value cues are already present.</p>
        </article>
      </section>

      <section class="cta-panel">
        <div>
          <p class="eyebrow">Ready to ship</p>
          <h2>Turn this into a full product page</h2>
        </div>
        <p id="status" class="status">Starter ready for feature-specific copy and branding.</p>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
    }

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">Starter app</p>
      <h1>${projectName}</h1>
      <p class="lede">This starter app was bootstrapped in a safe sandbox folder. Continue iterating from the Agent Runner.</p>
      <button id="cta" type="button">Test interaction</button>
      <p id="status" class="status">Ready.</p>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
  }

  private buildReactBootstrapStarterFiles(plan: BootstrapPlan): Array<{ path: string; content: string }> {
    const title = this.toDisplayNameFromDirectory(plan.targetDirectory);
    switch (plan.starterProfile) {
      case "electron-desktop":
        return [
          { path: "src/App.tsx", content: this.buildDesktopBootstrapAppTsx(title, plan.domainFocus) },
          { path: "src/App.css", content: this.buildDesktopBootstrapAppCss() },
          { path: "src/index.css", content: this.buildDesktopBootstrapIndexCss() }
        ];
      case "react-dashboard":
        return [
          { path: "src/App.tsx", content: this.buildDashboardTsx(title, plan.domainFocus) },
          { path: "src/App.css", content: this.buildDashboardCss() },
          { path: "src/index.css", content: this.buildDashboardIndexCss() }
        ];
      case "react-crud":
        return [
          { path: "src/App.tsx", content: this.buildCrudAppTsx(title, plan.domainFocus) },
          { path: "src/App.css", content: this.buildCrudAppCss() },
          { path: "src/index.css", content: this.buildCrudIndexCss() }
        ];
      case "react-kanban":
        return [
          { path: "src/App.tsx", content: this.buildKanbanBoardTsx(title) },
          { path: "src/App.css", content: this.buildDashboardCss() },
          { path: "src/index.css", content: this.buildDashboardIndexCss() }
        ];
      case "react-notes":
        return [
          { path: "src/App.tsx", content: this.buildNotesAppTsx(title, { wantsSearch: true, wantsDelete: true, wantsAdd: true }) },
          { path: "src/App.css", content: this.buildNotesAppCss() },
          { path: "src/index.css", content: this.buildNotesIndexCss() }
        ];
      default:
        return [
          { path: "src/App.tsx", content: this.buildGeneralReactStarterApp(title) },
          { path: "src/App.css", content: this.buildGeneralReactStarterCss() },
          { path: "src/index.css", content: this.buildGeneralReactStarterIndexCss() }
        ];
    }
  }

  private buildReactBootstrapHtml(projectName: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
  }

  private buildDesktopBootstrapAppTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildDesktopDomainContent(domainFocus);
    return `const activity = ${JSON.stringify(content.activity, null, 2)};

const shortcuts = ${JSON.stringify(content.shortcuts, null, 2)};

export default function App() {
  return (
    <main className="desktop-starter-shell">
      <section className="desktop-starter-hero">
        <div>
          <p className="desktop-starter-kicker">${content.kicker}</p>
          <h1>${title}</h1>
          <p className="desktop-starter-copy">
            ${content.copy}
          </p>
        </div>
        <div className="desktop-starter-card">
          <span>Current mode</span>
          <strong>${content.modeValue}</strong>
          <p>${content.modeCopy}</p>
        </div>
      </section>

      <section className="desktop-starter-grid">
        <article className="desktop-starter-panel">
          <h2>${content.checklistTitle}</h2>
          <ul>
            ${content.checklistItems.map((item) => `<li>${item}</li>`).join("\n            ")}
          </ul>
        </article>
        <article className="desktop-starter-panel">
          <h2>${content.actionTitle}</h2>
          <div className="desktop-starter-actions">
            {shortcuts.map((shortcut) => (
              <button key={shortcut} type="button">{shortcut}</button>
            ))}
          </div>
        </article>
      </section>

      <section className="desktop-starter-panel">
        <h2>${content.activityTitle}</h2>
        <div className="desktop-starter-activity">
          {activity.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
`;
  }

  private buildDesktopBootstrapAppCss(): string {
    return `.desktop-starter-shell {
  min-height: 100vh;
  padding: 32px;
  display: grid;
  gap: 24px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.2), transparent 28%),
    linear-gradient(180deg, #08111f 0%, #0f172a 100%);
  color: #e2e8f0;
}

.desktop-starter-hero,
.desktop-starter-grid {
  display: grid;
  gap: 20px;
}

.desktop-starter-hero {
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  align-items: stretch;
}

.desktop-starter-kicker {
  margin: 0 0 10px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7dd3fc;
}

.desktop-starter-hero h1,
.desktop-starter-panel h2 {
  margin: 0;
}

.desktop-starter-copy,
.desktop-starter-card p,
.desktop-starter-activity p {
  color: #cbd5e1;
}

.desktop-starter-card,
.desktop-starter-panel,
.desktop-starter-activity article {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.28);
}

.desktop-starter-card,
.desktop-starter-panel {
  padding: 22px;
}

.desktop-starter-card span {
  display: block;
  font-size: 0.82rem;
  color: #7dd3fc;
  margin-bottom: 8px;
}

.desktop-starter-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-starter-panel ul {
  margin: 14px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.desktop-starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.desktop-starter-actions button {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #38bdf8, #2563eb);
  color: #eff6ff;
  font: inherit;
  cursor: pointer;
}

.desktop-starter-activity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 14px;
}

.desktop-starter-activity article {
  padding: 18px;
}

@media (max-width: 880px) {
  .desktop-starter-shell {
    padding: 20px;
  }

  .desktop-starter-hero,
  .desktop-starter-grid,
  .desktop-starter-activity {
    grid-template-columns: 1fr;
  }
}
`;
  }

  private buildDesktopBootstrapIndexCss(): string {
    return `:root {
  color-scheme: dark;
  font-family: "Segoe UI", sans-serif;
  background: #08111f;
  color: #e2e8f0;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-height: 100vh;
}

button {
  font: inherit;
}
`;
  }

  private buildGeneratedDesktopAppId(packageName: string): string {
    const normalized = (packageName ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    return `com.cipher.generated.${normalized || "desktop.app"}`;
  }

  private buildGeneratedDesktopMainProcess(projectName: string): string {
    return `import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const windowTitle = ${JSON.stringify(projectName)}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6fb',
    title: windowTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.mjs'),
    },
  })

  window.removeMenu()
  window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
`;
  }

  private buildGeneratedDesktopPreloadBridge(): string {
    return `import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('desktopRuntime', {
  platform: process.platform,
})
`;
  }

  private buildStaticBootstrapCss(starterProfile: StarterProfile = "static-marketing"): string {
    if (starterProfile === "static-marketing") {
      return `:root {
  color-scheme: light;
  font-family: "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);
  color: #0f172a;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.28), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);
}

.marketing-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.hero,
.feature-grid article,
.cta-panel,
.proof-strip {
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.hero {
  padding: 48px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #0ea5e9;
}

.hero h1,
.cta-panel h2,
.feature-grid h2 {
  margin: 0 0 12px;
}

.hero h1 {
  font-size: clamp(2.8rem, 6vw, 4.8rem);
}

.lede,
.status,
.feature-grid p,
.cta-panel p {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.7;
  color: #334155;
}

.hero-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}

button,
.hero-actions a {
  border: 0;
  border-radius: 999px;
  padding: 14px 22px;
  font: inherit;
  text-decoration: none;
}

button {
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #fff;
  cursor: pointer;
}

.hero-actions a {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.proof-strip {
  padding: 18px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  justify-content: space-between;
  color: #1e3a8a;
  font-weight: 600;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.feature-grid article {
  padding: 24px;
}

.cta-panel {
  padding: 32px 36px;
  display: grid;
  gap: 10px;
}

@media (max-width: 820px) {
  .marketing-shell {
    width: min(100% - 28px, 1120px);
    padding-top: 24px;
  }

  .hero,
  .cta-panel {
    padding: 28px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }
}
`;
    }

    return `:root {
  color-scheme: light;
  font-family: "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #f6f7fb 0%, #e5ecff 100%);
  color: #14213d;
}

body {
  margin: 0;
  min-height: 100vh;
}

.shell {
  max-width: 720px;
  margin: 10vh auto;
  padding: 40px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 80px rgba(20, 33, 61, 0.12);
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 12px;
  color: #4666d5;
}

h1 {
  margin: 0 0 12px;
  font-size: 48px;
}

.lede,
.status {
  font-size: 18px;
  line-height: 1.6;
}

button {
  margin-top: 24px;
  padding: 14px 22px;
  border: 0;
  border-radius: 999px;
  background: #14213d;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}
`;
  }

  private buildStaticBootstrapJs(projectName: string, starterProfile: StarterProfile = "static-marketing"): string {
    if (starterProfile === "static-marketing") {
      return `const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("cta");

if (statusEl && buttonEl) {
  buttonEl.addEventListener("click", () => {
    statusEl.textContent = "Continue building in this workspace. ${projectName} is ready for product-specific copy, pricing, and proof blocks.";
  });
}
`;
    }

    return `const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("cta");

if (statusEl && buttonEl) {
  buttonEl.addEventListener("click", () => {
    statusEl.textContent = "${projectName} is responding. Continue building in this workspace.";
  });
}
`;
  }

  private normalizeRoutingStage(stageLabel?: string): AgentRoutingStage {
    const normalized = (stageLabel ?? "").trim().toLowerCase();
    if (!normalized) return "generator";
    if (normalized.includes("plan")) return "planner";
    if (
      normalized.includes("recovery")
      || normalized.includes("repair")
      || normalized.includes("fix")
      || normalized.includes("build")
      || normalized.includes("lint")
      || normalized.includes("launch")
      || normalized.includes("runtime")
    ) {
      return "repair";
    }
    return "generator";
  }

  private buildStageModelOrder(
    settings: ReturnType<SettingsStore["get"]>,
    stage: AgentRoutingStage,
    options: { requiresVision?: boolean } = {}
  ): string[] {
    const localPool = [
      (settings.defaultModel ?? "").trim(),
      (settings.routing?.default ?? "").trim(),
      (settings.routing?.think ?? "").trim(),
      (settings.routing?.longContext ?? "").trim(),
      ...(settings.models ?? []).map((model) => (model ?? "").trim())
    ]
      .filter((model) => model.startsWith("ollama/"));
    const localPreferred = stage === "planner"
      ? [
        (settings.routing?.longContext ?? "").trim(),
        (settings.routing?.think ?? "").trim(),
        (settings.defaultModel ?? "").trim(),
        (settings.routing?.default ?? "").trim()
      ]
      : stage === "repair"
        ? [
          (settings.defaultModel ?? "").trim(),
          (settings.routing?.default ?? "").trim(),
          (settings.routing?.think ?? "").trim(),
          (settings.routing?.longContext ?? "").trim()
        ]
        : [
          (settings.defaultModel ?? "").trim(),
          (settings.routing?.default ?? "").trim(),
          (settings.routing?.think ?? "").trim(),
          (settings.routing?.longContext ?? "").trim()
        ];
    const cloudStage = stage === "planner" ? "planner" : stage === "repair" ? "repair" : "generator";
    const cloudOrder = buildStagePreferredCloudModelList(settings, cloudStage, {
      requiresVision: options.requiresVision
    });

    return [...new Set([
      ...cloudOrder,
      ...localPreferred.filter((model) => model.startsWith("ollama/")),
      ...localPool
    ].filter(Boolean))];
  }

  private parseModelScaleBillions(model: string): number | null {
    const match = String(model ?? "").trim().toLowerCase().match(/(\d+(?:\.\d+)?)b\b/);
    return match ? Number.parseFloat(match[1]) : null;
  }

  private isInteractiveFriendlyLocalModel(model: string, options: { requiresVision?: boolean } = {}): boolean {
    const normalized = String(model ?? "").trim().toLowerCase();
    if (!normalized) return false;
    const hints = getModelCapabilityHints(normalized);
    if (options.requiresVision) {
      return hints.vision;
    }
    if (/(^|[-_/])vl([:-]|$)|vision/.test(normalized)) {
      return false;
    }
    const scale = this.parseModelScaleBillions(normalized);
    if (scale !== null && scale > 20) {
      return false;
    }
    return true;
  }

  private getInteractiveLocalStageScore(
    model: string,
    stage: AgentRoutingStage,
    options: { requiresVision?: boolean } = {}
  ): number {
    const normalized = String(model ?? "").trim().toLowerCase();
    if (!normalized) return 0;
    const hints = getModelCapabilityHints(normalized);
    const stageScore = stage === "planner"
      ? (hints.longContext * 3) + (hints.reasoning * 2) + hints.coding
      : stage === "repair"
        ? (hints.coding * 3) + (hints.reasoning * 2) + hints.longContext
        : (hints.coding * 3) + hints.reasoning + hints.longContext;
    if (options.requiresVision) {
      return hints.vision ? stageScore + 18 : stageScore - 24;
    }
    return this.isInteractiveFriendlyLocalModel(normalized, options)
      ? stageScore
      : stage === "planner"
        ? stageScore - 2
        : stageScore - 8;
  }

  private rankInteractiveLocalModels(
    models: string[],
    stage: AgentRoutingStage,
    options: { requiresVision?: boolean } = {}
  ): string[] {
    return [...models].sort((left, right) => {
      const biasDelta = this.getInteractiveLocalStageScore(right, stage, options) - this.getInteractiveLocalStageScore(left, stage, options);
      if (biasDelta !== 0) return biasDelta;
      const leftScale = this.parseModelScaleBillions(left);
      const rightScale = this.parseModelScaleBillions(right);
      if (leftScale !== null && rightScale !== null && leftScale !== rightScale) {
        return leftScale - rightScale;
      }
      if (leftScale === null && rightScale !== null) return 1;
      if (leftScale !== null && rightScale === null) return -1;
      return left.localeCompare(right);
    });
  }

  private selectLocalRoutesForStage(
    localModels: string[],
    stage: AgentRoutingStage,
    options: { requiresVision?: boolean } = {}
  ): string[] {
    if (localModels.length === 0) {
      return [];
    }
    const friendlyLocalModels = localModels.filter((model) => this.isInteractiveFriendlyLocalModel(model, options));
    const rankedFriendlyLocalModels = this.rankInteractiveLocalModels(friendlyLocalModels, stage, options);
    const codeFocusedLocalModels = rankedFriendlyLocalModels.filter(
      (model) => getModelCapabilityHints(model).coding > 0
    );
    const selectedLocalModels = options.requiresVision
      ? (friendlyLocalModels.length > 0 ? rankedFriendlyLocalModels : this.rankInteractiveLocalModels(localModels, stage, options))
      : stage === "planner"
        ? (friendlyLocalModels.length > 0 ? rankedFriendlyLocalModels : this.rankInteractiveLocalModels(localModels, stage, options))
      : this.rankInteractiveLocalModels(
        codeFocusedLocalModels.length > 0
          ? codeFocusedLocalModels
          : friendlyLocalModels.length > 0
            ? friendlyLocalModels
            : localModels,
        stage,
        options
      );
    return [...new Set(selectedLocalModels.filter(Boolean))];
  }

  private resolveModelRoutes(stageLabel?: string, options: { requiresVision?: boolean } = {}): ModelRoute[] {
    const settings = this.settingsStore.get();
    const stage = this.normalizeRoutingStage(stageLabel);
    const defaultModel = (settings.defaultModel ?? "").trim();
    const apiKey = (settings.apiKey ?? "").trim();
    const routes: ModelRoute[] = [];
    const seen = new Set<string>();
    const stageOrder = this.buildStageModelOrder(settings, stage, options);
    const stageRank = new Map<string, number>(stageOrder.map((model, index) => [model, index]));
    const pushRoute = (route: ModelRoute | null): void => {
      if (!route) return;
      const key = `${route.skipAuth ? "local" : "remote"}|${route.baseUrl}|${route.model}`;
      if (seen.has(key)) return;
      seen.add(key);
      routes.push(route);
    };

    if (apiKey) {
      const cloudCandidates = stageOrder
        .map((model) => model.trim())
        .filter((model) => model && !model.startsWith("ollama/"));
      if (cloudCandidates.length === 0) {
        throw new Error("Cloud API key is set, but no cloud model is configured for agent fixes.");
      }
      for (const model of cloudCandidates) {
        pushRoute({
          model,
          baseUrl: (settings.baseUrl ?? "").trim()
            || getDefaultBaseUrlForCloudProvider(inferCloudProvider(settings.baseUrl, settings.cloudProvider)),
          apiKey,
          skipAuth: false
        });
      }
    }

    const ollamaStageCandidates = [
      ...stageOrder
        .filter((model) => model.startsWith("ollama/"))
        .map((model) => model.slice("ollama/".length).trim()),
      ...(settings.ollamaModels ?? []).map((model) => (model ?? "").trim())
    ].filter(Boolean);

    const selectedLocalModels = this.selectLocalRoutesForStage([...new Set(ollamaStageCandidates)], stage, options);

    if (settings.ollamaEnabled && selectedLocalModels.length > 0) {
      for (const model of selectedLocalModels) {
        pushRoute({
          model,
          baseUrl: (settings.ollamaBaseUrl ?? "").trim() || "http://localhost:11434/v1",
          apiKey: "",
          skipAuth: true
        });
      }
    }

    if (routes.length === 0) {
      throw new Error("No model route available for agent fixes. Configure a cloud provider or Ollama first.");
    }

    return routes
      .map((route, index) => ({
        route,
        index,
        score: this.getModelRouteScore(route),
        stageRank: stageRank.get(route.skipAuth ? `ollama/${route.model}` : route.model) ?? (stageOrder.length + index)
      }))
      .sort((a, b) => {
        const aPriority = a.score - a.stageRank;
        const bPriority = b.score - b.stageRank;
        if (bPriority !== aPriority) return bPriority - aPriority;
        if (a.stageRank !== b.stageRank) return a.stageRank - b.stageRank;
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map((entry) => entry.route);
  }

  private async scanEntries(root: string, depth: number): Promise<WorkspaceFileEntry[]> {
    const entries: WorkspaceFileEntry[] = [];
    await this.walkEntries(root, depth, entries);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async walkEntries(current: string, depth: number, acc: WorkspaceFileEntry[]): Promise<void> {
    const dirEntries = await readdir(current, { withFileTypes: true });
    for (const entry of dirEntries) {
      const fullPath = join(current, entry.name);
      const relPath = this.toWorkspaceRelative(fullPath);
      if (entry.isDirectory()) {
        if (isIgnoredWorkspaceFolder(entry.name)) continue;
        acc.push({ path: relPath, type: "directory" });
        if (depth > 0) {
          await this.walkEntries(fullPath, depth - 1, acc);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(fullPath);
      acc.push({ path: relPath, type: "file", size: info.size });
    }
  }

  private resolveWorkspacePath(targetPath: string): string {
    const rawTarget = (targetPath ?? ".").trim() || ".";
    const fullPath = isAbsolute(rawTarget) ? resolve(rawTarget) : resolve(this.workspaceRoot, rawTarget);
    const relativePath = relative(this.workspaceRoot, fullPath);
    if (relativePath.startsWith("..") || normalize(relativePath) === "..") {
      throw new Error("Path escapes the workspace root.");
    }
    return fullPath;
  }

  private normalizeTaskTargetPath(targetPath?: string): string | undefined {
    const normalizedTarget = (targetPath ?? "").trim();
    if (!normalizedTarget) return undefined;
    return this.toWorkspaceRelative(this.resolveWorkspacePath(normalizedTarget));
  }

  private toWorkspaceRelative(fullPath: string): string {
    const relPath = relative(this.workspaceRoot, fullPath) || ".";
    return relPath.split("\\").join("/");
  }

  private ensureTaskTelemetry(task: AgentTask): AgentTaskTelemetry {
    if (!task.telemetry) {
      task.telemetry = {
        fallbackUsed: false,
        modelAttempts: []
      };
    }
    if (!Array.isArray(task.telemetry.modelAttempts)) {
      task.telemetry.modelAttempts = [];
    }
    if (!Array.isArray(task.telemetry.failureMemoryHints)) {
      task.telemetry.failureMemoryHints = [];
    }
    return task.telemetry;
  }

  private buildTaskRouteTelemetrySummary(taskId: string): AgentTaskRouteTelemetrySummary {
    const visionRequested = this.taskRequiresVisionRoute(taskId);
    const blacklistedModels = [...(this.taskModelBlacklist.get(taskId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
    const failureCounts = [...(this.taskModelFailureCounts.get(taskId)?.entries() ?? [])]
      .map(([model, count]) => {
        const status = this.buildTaskModelFailureStatus(taskId, model);
        return {
          model,
          count,
          blacklisted: status.blacklisted,
          hardFailuresUntilBlacklist: status.hardFailuresUntilBlacklist,
          transientFailuresUntilBlacklist: status.transientFailuresUntilBlacklist
        };
      })
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
    const activeStageRoutes = [...(this.taskStageRoutes.get(taskId)?.entries() ?? [])]
      .map(([stage, state]) => {
        const failureStatus = this.buildTaskModelFailureStatus(taskId, state.route.model);
        return {
          stage,
          model: state.route.model,
          baseUrl: state.route.baseUrl,
          provider: state.route.skipAuth ? "local" as const : "remote" as const,
          routeIndex: state.routeIndex,
          attempt: state.attempt,
          score: this.getModelRouteScore(state.route),
          scoreFactors: this.buildModelRouteScoreFactors(state.route),
          failureCount: failureStatus.count,
          blacklisted: failureStatus.blacklisted,
          hardFailuresUntilBlacklist: failureStatus.hardFailuresUntilBlacklist,
          transientFailuresUntilBlacklist: failureStatus.transientFailuresUntilBlacklist,
          visionRequested,
          visionCapable: getModelCapabilityHints(state.route.model).vision,
          selectionReason: this.buildTaskStageSelectionReason(taskId, stage, state.route, state.routeIndex)
        };
      })
      .sort((a, b) => a.stage.localeCompare(b.stage));

    return {
      blacklistedModels,
      failureCounts,
      visionRequested,
      activeStageRoutes
    };
  }

  private syncTaskRouteTelemetry(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const telemetry = this.ensureTaskTelemetry(task);
    telemetry.routeDiagnostics = this.buildTaskRouteTelemetrySummary(taskId);
  }

  private markTaskStage(task: AgentTask, stage: string): void {
    const telemetry = this.ensureTaskTelemetry(task);
    telemetry.lastStage = stage;
  }

  private markTaskFailureStage(task: AgentTask, stage: string, message = ""): void {
    const telemetry = this.ensureTaskTelemetry(task);
    telemetry.lastStage = stage;
    telemetry.failureStage = stage;
    telemetry.failureCategory = this.classifyFailureCategory(stage, message);
  }

  private classifyFailureCategory(stage: string, message: string): AgentTaskFailureCategory {
    const normalized = `${stage} ${message}`.trim().toLowerCase();
    if (!normalized) return "unknown";
    if (normalized.includes("malformed json") || normalized.includes("valid structured json") || normalized.includes("json without usable edits")) {
      return "malformed-json";
    }
    if (normalized.includes("path escapes") || normalized.includes("outside allowed") || normalized.includes("outside planned") || normalized.includes("unsupported path")) {
      return "unsupported-path";
    }
    if (normalized.includes("wrong scaffold") || normalized.includes("scaffold") || normalized.includes("react leftovers") || normalized.includes("conflicting static scaffold")) {
      return "wrong-scaffold";
    }
    if ((normalized.includes("missing") || normalized.includes("not found")) && normalized.includes("asset")) {
      return "asset-missing";
    }
    if ((normalized.includes("missing") || normalized.includes("not found")) && (normalized.includes("file") || normalized.includes("entry"))) {
      return "missing-file";
    }
    if (
      normalized.includes("dependency install")
      || normalized.includes("npm install")
      || normalized.includes("dependency")
      || normalized.includes("package.json")
      || normalized.includes("node_modules")
    ) {
      return "build-error";
    }
    if (normalized.includes("preview")) return "preview-error";
    if (normalized.includes("lint")) return "lint-error";
    if (normalized.includes("test")) return "test-error";
    if (normalized.includes("launch") || normalized.includes("runtime") || normalized.includes("startup") || normalized.includes("boot")) {
      return "runtime-error";
    }
    if (normalized.includes("build")) return "build-error";
    if (normalized.includes("verify") || normalized.includes("verification")) return "verification-error";
    return "unknown";
  }

  private getMostRelevantFailureStage(task: AgentTask): string {
    const latestFailedStep = [...task.steps].reverse().find((step) => step.status === "failed");
    if (latestFailedStep?.title) return latestFailedStep.title;
    const telemetry = this.ensureTaskTelemetry(task);
    return telemetry.lastStage || "Task execution";
  }

  private deriveFinalVerificationResult(report: AgentVerificationReport): AgentTaskFinalVerificationResult | undefined {
    const checks = report.checks ?? [];
    if (checks.length === 0) return undefined;
    if (checks.some((check) => check.status === "failed")) return "failed";
    const passedCount = checks.filter((check) => check.status === "passed").length;
    const skippedCount = checks.filter((check) => check.status === "skipped").length;
    if (passedCount > 0) return "passed";
    if (skippedCount > 0) return "skipped";
    return undefined;
  }

  private updateTaskVerificationTelemetry(task: AgentTask, report: AgentVerificationReport): void {
    const telemetry = this.ensureTaskTelemetry(task);
    telemetry.finalVerificationResult = this.deriveFinalVerificationResult(report);
    telemetry.verificationSummary = report.summary;
  }

  private recordModelAttempt(
    taskId: string,
    stage: string,
    model: string,
    routeIndex: number,
    attempt: number,
    outcome: AgentTaskModelAttempt["outcome"],
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const telemetry = this.ensureTaskTelemetry(task);
    if (!telemetry.selectedModel) {
      telemetry.selectedModel = model;
    }

    const entry: AgentTaskModelAttempt = {
      stage,
      model,
      routeIndex: routeIndex + 1,
      attempt,
      outcome,
      usedFallback: routeIndex > 0,
      timestamp: new Date().toISOString(),
      ...(error ? { error } : {})
    };
    telemetry.modelAttempts.push(entry);
    if (telemetry.modelAttempts.length > MAX_MODEL_ATTEMPTS) {
      telemetry.modelAttempts = telemetry.modelAttempts.slice(-MAX_MODEL_ATTEMPTS);
    }

    if (outcome === "success" && telemetry.selectedModel && telemetry.selectedModel !== model) {
      telemetry.fallbackUsed = true;
      telemetry.fallbackModel = model;
    }

    task.updatedAt = new Date().toISOString();
    this.persistTaskState(task.id);
  }

  private cloneTask(task: AgentTask): AgentTask {
    return {
      ...task,
      attachments: (task.attachments ?? []).map((attachment) => ({ ...attachment })),
      steps: task.steps.map((step) => ({ ...step })),
      output: task.output ? { ...task.output } : undefined,
      executionSpec: this.cloneExecutionSpec(task.executionSpec),
      telemetry: task.telemetry
        ? {
          ...task.telemetry,
          fallbackUsed: task.telemetry.fallbackUsed ?? false,
          failureMemoryHints: [...(task.telemetry.failureMemoryHints ?? [])],
          modelAttempts: (task.telemetry.modelAttempts ?? []).map((attempt) => ({ ...attempt })),
          routeDiagnostics: task.telemetry.routeDiagnostics
            ? {
              blacklistedModels: [...task.telemetry.routeDiagnostics.blacklistedModels],
              failureCounts: task.telemetry.routeDiagnostics.failureCounts.map((entry) => ({
                ...entry,
                blacklisted: entry.blacklisted ?? false,
                hardFailuresUntilBlacklist: entry.hardFailuresUntilBlacklist ?? Math.max(0, AGENT_MODEL_BLACKLIST_THRESHOLD - entry.count),
                transientFailuresUntilBlacklist: entry.transientFailuresUntilBlacklist ?? Math.max(0, AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD - entry.count)
              })),
              visionRequested: task.telemetry.routeDiagnostics.visionRequested ?? false,
              activeStageRoutes: task.telemetry.routeDiagnostics.activeStageRoutes.map((entry) => ({
                ...entry,
                score: entry.score ?? 0,
                scoreFactors: (entry.scoreFactors ?? [{ label: "No reliability history", delta: 0 }]).map((factor) => ({ ...factor })),
                failureCount: entry.failureCount ?? 0,
                blacklisted: entry.blacklisted ?? false,
                hardFailuresUntilBlacklist: entry.hardFailuresUntilBlacklist ?? AGENT_MODEL_BLACKLIST_THRESHOLD,
                transientFailuresUntilBlacklist: entry.transientFailuresUntilBlacklist ?? AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD,
                visionRequested: entry.visionRequested ?? false,
                visionCapable: entry.visionCapable ?? false,
                selectionReason: entry.selectionReason ?? "Saved route diagnostics do not include a selection explanation yet."
              }))
            }
            : undefined
        }
        : undefined,
      verification: task.verification
        ? {
          ...task.verification,
          checks: task.verification.checks.map((check) => ({ ...check }))
        }
        : undefined
    };
  }

  private cloneExecutionSpec(spec?: AgentExecutionSpec): AgentExecutionSpec | undefined {
    if (!spec) return undefined;
    return {
      ...spec,
      deliverables: [...spec.deliverables],
      acceptanceCriteria: [...spec.acceptanceCriteria],
      qualityGates: [...spec.qualityGates],
      requiredFiles: [...spec.requiredFiles],
      requiredScriptGroups: spec.requiredScriptGroups.map((group) => ({ label: group.label, options: [...group.options] }))
    };
  }

  private async createSnapshot(
    label: string,
    taskId?: string,
    options?: { kind?: WorkspaceSnapshot["kind"]; targetPathHint?: string }
  ): Promise<WorkspaceSnapshot> {
    await this.pruneStoredSnapshots();

    const id = `snapshot_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const snapshotPath = join(this.snapshotRoot, id);
    const filesPath = join(snapshotPath, "files");
    const buildSnapshot = async (): Promise<WorkspaceSnapshot> => {
      await mkdir(filesPath, { recursive: true });
      const fileCount = await this.copyWorkspaceSnapshot(this.workspaceRoot, filesPath);
      const topLevelEntries = (await readdir(filesPath, { withFileTypes: true }))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
      const targetEntries = await this.collectSnapshotTargetEntries(filesPath, options?.targetPathHint);
      const snapshot: WorkspaceSnapshot = {
        id,
        createdAt,
        label: label.trim() || "Workspace snapshot",
        workspaceRoot: this.workspaceRoot,
        fileCount,
        taskId,
        kind: options?.kind ?? "manual",
        targetPathHint: options?.targetPathHint,
        topLevelEntries,
        targetEntries
      };
      await writeFile(join(snapshotPath, "meta.json"), JSON.stringify(snapshot, null, 2), "utf8");
      return snapshot;
    };

    try {
      return await buildSnapshot();
    } catch (error) {
      await this.removeSnapshotDirectory(snapshotPath);
      if (!this.isNoSpaceLeftError(error)) {
        throw error;
      }

      const removed = await this.pruneStoredSnapshots({ aggressive: true });
      if (removed > 0) {
        try {
          return await buildSnapshot();
        } catch (retryError) {
          await this.removeSnapshotDirectory(snapshotPath);
          if (!this.isNoSpaceLeftError(retryError)) {
            throw retryError;
          }
        }
      }

      throw new Error(
        `No space left while creating a workspace snapshot. Cleared ${removed} stale snapshot(s), but more disk space is still required under ${this.snapshotRoot}.`
      );
    }
  }

  private resolveSnapshotScopedRestoreTarget(snapshot: WorkspaceSnapshot | null | undefined): string | null {
    const normalizedTarget = (snapshot?.targetPathHint ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!normalizedTarget || normalizedTarget === ".") return null;
    if (snapshot?.kind !== "before-task" && snapshot?.kind !== "after-task") return null;
    return this.toWorkspaceRelative(this.resolveWorkspacePath(normalizedTarget));
  }

  private async restoreSnapshotTarget(snapshotFilesRoot: string, targetPath: string): Promise<void> {
    const workspaceTargetPath = this.resolveWorkspacePath(targetPath);
    const snapshotTargetPath = join(snapshotFilesRoot, targetPath.replace(/\//g, sep));

    try {
      await this.withWorkspaceFsRetry(
        () => rm(workspaceTargetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
      );
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code !== "ENOENT") {
        throw error;
      }
    }

    let snapshotTargetStat;
    try {
      snapshotTargetStat = await stat(snapshotTargetPath);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "ENOENT") {
        return;
      }
      throw error;
    }

    await mkdir(dirname(workspaceTargetPath), { recursive: true });
    await this.withWorkspaceFsRetry(
      () => cp(snapshotTargetPath, workspaceTargetPath, { recursive: snapshotTargetStat.isDirectory(), force: true })
    );
  }

  private async collectSnapshotTargetEntries(snapshotFilesRoot: string, targetPathHint?: string): Promise<string[]> {
    const normalizedTarget = (targetPathHint ?? "").trim().replace(/\\/g, "/");
    if (!normalizedTarget) return [];

    const targetRoot = join(snapshotFilesRoot, normalizedTarget.replace(/\//g, sep));
    try {
      const targetStat = await stat(targetRoot);
      if (!targetStat.isDirectory()) return [];
    } catch {
      return [];
    }

    const entries: string[] = [];
    const stack: Array<{ absolute: string; relative: string }> = [{ absolute: targetRoot, relative: "" }];

    while (stack.length > 0 && entries.length < 24) {
      const current = stack.shift();
      if (!current) break;
      let children;
      try {
        children = await readdir(current.absolute, { withFileTypes: true });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
        if (code === "ENOENT") {
          continue;
        }
        throw error;
      }
      const sortedChildren = children.sort((a, b) => a.name.localeCompare(b.name));
      for (const child of sortedChildren) {
        const nextRelative = current.relative ? `${current.relative}/${child.name}` : child.name;
        if (child.isDirectory()) {
          stack.push({ absolute: join(current.absolute, child.name), relative: nextRelative });
          continue;
        }
        if (!child.isFile()) continue;
        entries.push(nextRelative);
        if (entries.length >= 24) break;
      }
    }

    return entries;
  }

  private async copyWorkspaceSnapshot(sourceDir: string, destinationDir: string): Promise<number> {
    let fileCount = 0;
    let entries;
    try {
      entries = await readdir(sourceDir, { withFileTypes: true });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "ENOENT") {
        return 0;
      }
      throw error;
    }
    for (const entry of entries) {
      if (isIgnoredWorkspaceFolder(entry.name)) continue;
      const sourcePath = join(sourceDir, entry.name);
      const destinationPath = join(destinationDir, entry.name);
      if (entry.isDirectory()) {
        await mkdir(destinationPath, { recursive: true });
        fileCount += await this.copyWorkspaceSnapshot(sourcePath, destinationPath);
        continue;
      }
      if (!entry.isFile()) continue;
      await mkdir(dirname(destinationPath), { recursive: true });
      try {
        await cp(sourcePath, destinationPath, { force: true });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
        if (code === "ENOENT") {
          continue;
        }
        throw error;
      }
      fileCount += 1;
    }
    return fileCount;
  }
}
