import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CcrService } from "./ccrService";
import type { SettingsStore } from "./settingsStore";
import type {
  AgentArtifactType,
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

const MAX_LOG_LINES = 400;
const MAX_MODEL_ATTEMPTS = 60;
const MAX_FILE_READ_BYTES = 256_000;
const MAX_FILE_WRITE_BYTES = MAX_FILE_READ_BYTES;
const MAX_SEARCH_RESULTS = 200;
const MAX_FIX_ATTEMPTS = 2;
const MAX_CONTEXT_FILES = 8;
const STARTUP_VERIFY_MS = 12_000;
const AGENT_MODEL_REQUEST_TIMEOUT_MS = 120_000;
const AGENT_MODEL_TRANSIENT_RETRY_LIMIT = 2;
const TEXT_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".html", ".css", ".scss", ".mjs", ".cjs", ".yml", ".yaml"
]);
const IGNORED_FOLDERS = new Set([".git", "node_modules", "dist", "release", "build", "coverage", ".next", ".cache", "tmp", ".cipher-snapshots"]);
const SNAPSHOT_PRESERVE_FOLDERS = new Set([".git", "node_modules", ".cipher-snapshots"]);

interface PackageScripts {
  build?: string;
  lint?: string;
  test?: string;
  start?: string;
  dev?: string;
}

interface PackageManifest {
  name?: string;
  description?: string;
  main?: string;
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

interface TaskExecutionPlan {
  summary: string;
  candidateFiles: string[];
  requestedPaths: string[];
  promptTerms: string[];
  workingDirectory: string;
  workspaceManifest: string[];
  workItems: TaskWorkItem[];
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

interface TaskStageRouteState {
  route: ModelRoute;
  routeIndex: number;
  attempt: number;
}

type AgentRoutingStage = "planner" | "generator" | "repair";

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
  private readonly taskModelFailureCounts = new Map<string, Map<string, number>>();
  private readonly taskModelBlacklist = new Map<string, Set<string>>();
  private readonly taskStageRoutes = new Map<string, Map<string, TaskStageRouteState>>();
  private lastRestoreState: AgentSnapshotRestoreResult | null = null;
  private activeTaskId: string | null = null;

  constructor(workspaceRoot: string, settingsStore: SettingsStore, ccrService: CcrService) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.settingsStore = settingsStore;
    this.ccrService = ccrService;
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

    const failureCounts = [...(this.taskModelFailureCounts.get(normalizedTaskId)?.entries() ?? [])]
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
    const blacklistedModels = [...(this.taskModelBlacklist.get(normalizedTaskId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
    const activeStageRoutes = [...(this.taskStageRoutes.get(normalizedTaskId)?.entries() ?? [])]
      .map(([stage, state]) => ({
        stage,
        model: state.route.model,
        baseUrl: state.route.baseUrl,
        provider: state.route.skipAuth ? "local" as const : "remote" as const,
        routeIndex: state.routeIndex,
        attempt: state.attempt
      }))
      .sort((a, b) => a.stage.localeCompare(b.stage));

    return {
      routes,
      task: {
        taskId: normalizedTaskId,
        blacklistedModels,
        failureCounts,
        activeStageRoutes
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

  private persistTaskState(): void {
    try {
      if (!existsSync(this.snapshotRoot)) {
        mkdirSync(this.snapshotRoot, { recursive: true });
      }

      const payload = {
        tasks: [...this.tasks.values()].map((task) => this.cloneTask(task)),
        logs: Object.fromEntries([...this.taskLogs.entries()].map(([taskId, logs]) => [taskId, [...logs]])),
        lastRestoreState: this.lastRestoreState ? { ...this.lastRestoreState } : null,
        modelRouteStats: Object.fromEntries([...this.modelRouteStats.entries()].map(([key, value]) => [key, { ...value }]))
      };
      writeFileSync(this.taskStatePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // Ignore persistence failures; runtime state remains authoritative.
    }
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
      this.persistTaskState();
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
      const rootEntries = await readdir(this.workspaceRoot, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (SNAPSHOT_PRESERVE_FOLDERS.has(entry.name) || IGNORED_FOLDERS.has(entry.name)) continue;
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
    this.persistTaskState();
    return result;
  }

  async startTask(prompt: string): Promise<AgentTask> {
    if (this.activeTaskId) {
      const active = this.tasks.get(this.activeTaskId);
      if (active && active.status === "running") {
        throw new Error("Another agent task is already running.");
      }
    }

    const taskId = `agent_${randomUUID()}`;
    const now = new Date().toISOString();
    const initialArtifactType = this.classifyArtifactType((prompt ?? "").trim());
    const task: AgentTask = {
      id: taskId,
      prompt: (prompt ?? "").trim(),
      status: "running",
      createdAt: now,
      updatedAt: now,
      summary: "",
      steps: [],
      artifactType: initialArtifactType,
      output: this.buildTaskOutput(initialArtifactType, undefined, (prompt ?? "").trim()),
      telemetry: {
        fallbackUsed: false,
        modelAttempts: []
      }
    };

    const snapshot = await this.createSnapshot(`Before agent task: ${task.prompt.slice(0, 80)}`, taskId, {
      kind: "before-task",
      targetPathHint: this.extractGeneratedAppDirectoryFromPrompt(task.prompt) ?? undefined
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
    this.persistTaskState();

    void this.runTask(taskId);
    return this.cloneTask(task);
  }

  async stopTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    const proc = this.activeProcesses.get(taskId);
    if (!task && !proc) return false;

    if (task && task.status === "running") {
      task.status = "stopped";
      task.summary = "Stop requested.";
      task.updatedAt = new Date().toISOString();
      this.persistTaskState();
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
      const generatedAppContext = this.extractGeneratedAppDirectoryFromPrompt(task.prompt);
      if (generatedAppContext) {
        workingDirectory = generatedAppContext;
        task.targetPath = generatedAppContext;
        this.appendLog(task.id, `Using generated app context from prompt: ${workingDirectory}`);
        await this.ensureExplicitGeneratedAppWorkspace(task, workingDirectory);
      }
      const bootstrapPlan = generatedAppContext ? null : this.detectBootstrapPlan(task.prompt, inspection);
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
        const executionPlan = await this.buildExecutionPlan(task.prompt, workingDirectory);
        const packageManifest = await this.tryReadPackageJson(executionPlan.workingDirectory);
        const scripts = this.resolveVerificationScripts(packageManifest, executionPlan);
        task.artifactType = this.classifyArtifactType(task.prompt, executionPlan, undefined, packageManifest ?? inspection.packageManifest);
        task.output = this.buildTaskOutput(task.artifactType, {
          packageName: packageManifest?.name ?? inspection.packageName,
          scripts,
          workingDirectory: executionPlan.workingDirectory
        }, task.prompt);
        this.appendLog(task.id, `Planned files: ${executionPlan.candidateFiles.join(", ") || "(none)"}`);
        this.appendLog(task.id, `Planned work items: ${executionPlan.workItems.map((item) => item.title).join(", ") || "(none)"}`);
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

        let requirementChecks = await this.verifyPromptRequirements(plan.plan);
        checks.push(...requirementChecks);
        this.updateTaskVerification(task, checks);
        if (requirementChecks.some((check) => check.status === "failed")) {
          const repaired = await this.tryAutoFixPromptRequirements(task, plan.plan, requirementChecks);
          if (repaired) {
            if (scripts.build) {
              const build = await this.executeCommand(task.id, this.buildNpmScriptRequest("build", 120_000, plan.plan.workingDirectory));
              this.upsertVerificationCheck(checks, {
                id: "build",
                label: buildLabel,
                status: build.ok ? "passed" : "failed",
                details: build.ok ? `${buildLabel} completed successfully after requirement repair.` : `${buildLabel} failed after requirement repair.`
              });
              if (!build.ok) {
                this.updateTaskVerification(task, checks);
                throw new Error(this.buildCommandFailureMessage(buildLabel, build, "failed after prompt-repair attempt"));
              }
            }

            if (scripts.lint) {
              const lint = await this.executeCommand(task.id, this.buildNpmScriptRequest("lint", 120_000, plan.plan.workingDirectory));
              this.upsertVerificationCheck(checks, {
                id: "lint",
                label: lintLabel,
                status: lint.ok ? "passed" : "failed",
                details: lint.ok ? `${lintLabel} completed successfully after requirement repair.` : `${lintLabel} failed after requirement repair.`
              });
              if (!lint.ok) {
                this.updateTaskVerification(task, checks);
                throw new Error(this.buildCommandFailureMessage(lintLabel, lint, "failed after prompt-repair attempt"));
              }
            }

            if (scripts.test && !/no test specified/i.test(scripts.test)) {
              const test = await this.executeCommand(task.id, this.buildNpmScriptRequest("test", 120_000, plan.plan.workingDirectory));
              this.upsertVerificationCheck(checks, {
                id: "test",
                label: testLabel,
                status: test.ok ? "passed" : "failed",
                details: test.ok ? `${testLabel} completed successfully after requirement repair.` : `${testLabel} failed after requirement repair.`
              });
              if (!test.ok) {
                this.updateTaskVerification(task, checks);
                throw new Error(this.buildCommandFailureMessage(testLabel, test, "failed after prompt-repair attempt"));
              }
            }

            if (runtimeScript && this.shouldVerifyLaunch(verificationArtifactType)) {
              const launch = await this.executeArtifactRuntimeVerification(task.id, runtimeScript, verificationArtifactType, plan.plan, scripts);
              this.upsertVerificationCheck(checks, {
                id: "launch",
                label: runtimeLabel,
                status: launch.ok ? "passed" : "failed",
                details: launch.ok
                  ? this.buildRuntimeVerificationAfterRepairDetails(verificationArtifactType, runtimeScript)
                  : `${runtimeLabel} failed after requirement repair.`
              });
              if (!launch.ok) {
                this.updateTaskVerification(task, checks);
                throw new Error(this.buildCommandFailureMessage(runtimeLabel, launch, "failed after prompt-repair attempt"));
              }
              if (this.shouldVerifyServedWebPage(verificationArtifactType)) {
                const servedPage = await this.verifyServedWebPage(plan.plan, scripts, runtimeScript, launch);
                this.upsertVerificationCheck(checks, servedPage);
                if (servedPage.status === "failed") {
                  this.updateTaskVerification(task, checks);
                  throw new Error(servedPage.details || "Served web page failed after prompt-repair attempt.");
                }
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
              this.upsertVerificationCheck(checks, previewHealth);
              if (previewHealth.status === "failed") {
                this.updateTaskVerification(task, checks);
                throw new Error(previewHealth.details || "Preview health failed after prompt-repair attempt.");
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
              this.upsertVerificationCheck(checks, uiSmoke);
              if (uiSmoke.status === "failed") {
                this.updateTaskVerification(task, checks);
                throw new Error(uiSmoke.details || "Basic UI smoke failed after prompt-repair attempt.");
              }
            }

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

        const report = this.buildVerificationReport(checks, verificationArtifactType);
        task.verification = report;
        task.artifactType = this.classifyArtifactType(task.prompt, plan.plan, report, packageJson ?? inspection.packageManifest);
        task.output = this.buildTaskOutput(task.artifactType, {
          packageName: packageJson?.name,
          scripts,
          workingDirectory: plan.plan.workingDirectory,
          verification: report
        }, task.prompt);
        return { summary: `Verification finished: ${report.summary}.` };
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
      this.persistTaskState();
    } catch (err) {
      task.status = task.status === "stopped" ? "stopped" : "failed";
      task.summary = err instanceof Error ? err.message : "Agent task failed.";
      task.updatedAt = new Date().toISOString();
      if (task.status === "failed") {
        this.markTaskFailureStage(task, this.getMostRelevantFailureStage(task), task.summary);
      }
      this.appendLog(task.id, `Agent task failed: ${task.summary}`);
      this.persistTaskState();
    } finally {
      if (this.activeTaskId === task.id) {
        this.activeTaskId = null;
      }
      this.activeProcesses.delete(task.id);
      this.taskModelFailureCounts.delete(task.id);
      this.taskModelBlacklist.delete(task.id);
      this.taskStageRoutes.delete(task.id);
      this.persistTaskState();
    }
  }

  private updateTaskVerification(task: AgentTask, checks: AgentVerificationCheck[]): void {
    task.verification = this.buildVerificationReport(checks, task.artifactType);
    this.updateTaskVerificationTelemetry(task, task.verification);
    task.updatedAt = new Date().toISOString();
    this.persistTaskState();
  }

  private ensureVerificationRequired(task: AgentTask): void {
    const verificationStep = task.steps.find((step) => step.title === "Verify build and quality scripts");
    if (!verificationStep || verificationStep.status !== "completed") {
      throw new Error("Verification is required before completing an agent task.");
    }

    const verification = task.verification;
    if (!verification || verification.checks.length === 0) {
      throw new Error("Verification report is required before completing an agent task.");
    }
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
            ? `Run ${runCommand} from ${workingDirectory ?? "the app folder"} to start the desktop app.`
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
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "src/main.tsx"));
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "src/App.tsx"));
      if (artifactType === "desktop-app") {
        requiredPaths.add(this.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
      }
    } else {
      requiredPaths.add(this.joinWorkspacePath(workingDirectory, "package.json"));
    }

    for (const requestedPath of plan.requestedPaths ?? []) {
      if (this.isPathInsideWorkingDirectory(requestedPath, workingDirectory)) {
        requiredPaths.add(requestedPath);
      }
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

  private resolveRuntimeVerificationScript(scripts: PackageScripts): "start" | "dev" | null {
    if (scripts.start) return "start";
    if (scripts.dev) return "dev";
    return null;
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

    if (!(await this.generatedNodePackageNeedsInstall(normalizedWorkingDirectory))) return;

    this.appendLog(taskId, `Installing generated node-package dependencies in ${normalizedWorkingDirectory}.`);
    const install = await this.executeCommand(taskId, {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["install"],
      cwd: normalizedWorkingDirectory,
      timeoutMs: 180_000
    });
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

  private async tryAutoFixGeneratedNodePackageInstall(
    taskId: string,
    plan: TaskExecutionPlan,
    installResult: TerminalCommandResult
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const contextFiles = await this.collectFixContextFiles(installResult.combinedOutput, plan);
    let fix: FixResponse | null = null;
    let usedModelFix = false;

    if (contextFiles.length > 0) {
      this.appendLog(taskId, `Preparing ${contextFiles.length} context file(s) for dependency-install repair.`);
      try {
        fix = await this.requestStructuredFix(taskId, task.prompt, installResult, contextFiles, 1, "Dependency install");
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
      timeoutMs: 180_000
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
    await this.ensureGeneratedNodePackageDependencies(taskId, plan);
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
      const startupProbe = artifactType === "web-app"
        ? async (result: TerminalCommandResult) => this.probeServedWebPage(plan, scripts, scriptName, result)
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
    const hasHeading = /<h1|<h2|<h3/.test(joined);
    const hasPrimaryAction = /<button|type="submit"|type='submit'|href="#/.test(joined);
    const requiresInputFlow = plan.builderMode === "notes" || plan.builderMode === "crud" || plan.builderMode === "kanban";
    const hasInputs = /<form|<input|<textarea|onchange=|onchange\s*=|onchange\{|value=\{/.test(joined);
    const hasInteraction = /onsubmit=|onclick=|addeventlistener\("submit"|addeventlistener\('submit'|addeventlistener\("click"|addeventlistener\('click'|set[a-z0-9_]+\(/.test(joined);
    const hasStatefulFlow = /localstorage|usestate|set[a-z0-9_]+\(|\.push\(|\.splice\(|\.filter\(|\.map\(|replacechildren|appendchild|render[a-z0-9_]*\(|json\.stringify|new formdata|notes\s*=|records\s*=/.test(joined);
    const hasCollectionView = /<ul|<ol|<table|<tbody|role="list"|role='list'|notes-list|records-list|note-card|record-row|recent activity|kanban-grid|kanban-lane|kanban-card|board-column|task-card/.test(joined);

    const failures: string[] = [];
    if (!hasHeading) failures.push("No visible heading was detected.");
    if (!hasPrimaryAction) failures.push("No primary action button or call-to-action was detected.");
    if (requiresInputFlow && (!hasInputs || !hasInteraction)) {
      failures.push("Expected data-entry flow markers were not detected for this app type.");
    }
    if (requiresInputFlow && (!hasStatefulFlow || !hasCollectionView)) {
      failures.push("Expected stateful save/update flow markers were not detected for this app type.");
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
      requiresInputFlow && hasStatefulFlow ? "stateful flow" : ""
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
    this.persistTaskState();

    try {
      const result = await work();
      this.throwIfTaskStopped(task);
      step.status = "completed";
      step.finishedAt = new Date().toISOString();
      step.summary = result.summary;
      task.updatedAt = step.finishedAt;
      this.appendLog(task.id, result.summary);
      this.persistTaskState();
      return result;
    } catch (err) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.summary = err instanceof Error ? err.message : `${title} failed.`;
      task.updatedAt = step.finishedAt;
      this.markTaskFailureStage(task, title, step.summary);
      this.appendLog(task.id, `${title} failed: ${step.summary}`);
      this.persistTaskState();
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
    this.persistTaskState();

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
      this.persistTaskState();
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
      this.persistTaskState();
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

      const proc = spawn(command, args, {
        cwd,
        env: childEnv,
        stdio: "pipe",
        shell: useShell,
        windowsHide: true
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
    probe?: (result: TerminalCommandResult) => Promise<StartupProbeResult>
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
        const result: TerminalCommandResult = {
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
          const probeResult = await probe(result);
          const marker = `[served-page] ${probeResult.status} | ${probeResult.details}`;
          result.combinedOutput = [result.combinedOutput, marker].filter(Boolean).join("\n");
          result.stderr = [result.stderr, marker].filter(Boolean).join("\n");
          if (probeResult.status === "failed") {
            result.ok = false;
          }
        }
        await finish(result);
        await this.terminateProcessTree(proc);
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
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, "Build");
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
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, runtimeLabel);
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
          fix = await this.requestStructuredFix(task.id, task.prompt, currentResult, contextFiles, attempt, "Lint");
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

  private async buildExecutionPlan(prompt: string, workingDirectory = "."): Promise<TaskExecutionPlan> {
    const promptTerms = this.extractPromptTerms(prompt);
    const candidateFiles = new Set<string>();
    const detectedWorkspaceKind = await this.detectWorkspaceKind(workingDirectory);
    const requestedPaths = this.extractExplicitPromptFilePaths(prompt, workingDirectory);
    const workspaceKind = this.resolveWorkspaceKindForPrompt(prompt, detectedWorkspaceKind, requestedPaths);
    const promptArtifact = this.inferArtifactTypeFromPrompt((prompt ?? "").trim().toLowerCase());
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
    const workItems = this.buildTaskWorkItems(prompt, workingDirectory, workspaceKind, requestedPaths);
    const builderMode = this.detectBuilderMode(prompt);
    const scopedPaths = new Set(workItems.flatMap((item) => item.allowedPaths ?? []));
    const files = (scopedPaths.size > 0
      ? initialFiles.filter((file) => scopedPaths.has(file))
      : initialFiles).slice(0, MAX_CONTEXT_FILES);
    return {
      summary: files.length > 0
        ? `Planned execution around ${files.length} likely file(s): ${files.join(", ")}. Work items: ${workItems.map((item) => item.title).join(", ")}.`
        : "No prompt-specific files identified; using default workspace entrypoints.",
      candidateFiles: files,
      requestedPaths,
      promptTerms,
      workingDirectory,
      workspaceManifest,
      workItems,
      promptRequirements: this.extractPromptRequirements(prompt),
      workspaceKind,
      builderMode
    };
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

  private extractPromptRequirements(prompt: string): PromptRequirement[] {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const requirements: PromptRequirement[] = [];
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    const supportsVisualRequirements = promptArtifact === null || promptArtifact === "web-app" || promptArtifact === "desktop-app";

    if (normalized.includes("hero")) {
      requirements.push({
        id: "req-hero",
        label: "Hero section",
        terms: ["hero"],
        mode: "any"
      });
    }

    if (normalized.includes("feature cards") || normalized.includes("features")) {
      requirements.push({
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
      requirements.push({
        id: "req-contact",
        label: "Contact CTA",
        terms: ["contact", "cta"],
        mode: "all"
      });
    }

    if (supportsVisualRequirements && normalized.includes("dashboard")) {
      requirements.push({
        id: "req-dashboard",
        label: "Dashboard content",
        terms: ["dashboard", "metric", "activity"],
        mode: "any"
      });
    }

    if (supportsVisualRequirements && normalized.includes("notes")) {
      requirements.push({
        id: "req-notes",
        label: "Notes experience",
        terms: ["note", "notes"],
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
    if (this.isSimpleDesktopUtilityPrompt(normalized)) return true;

    const layoutSignals = [
      /\bsidebar\b/,
      /\b(queue|list|recording list)\b/,
      /\b(filter|filters)\b/,
      /\b(primary action|new-[a-z-]+ action|clear [a-z-]+ action|add-[a-z-]+ action|add [a-z-]+ action|start [a-z-]+ action)\b/
    ];
    const matchedSignals = layoutSignals.filter((pattern) => pattern.test(normalized)).length;
    return matchedSignals >= 3;
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

    const allowed = new Set((plan.candidateFiles ?? []).map((value) => value.replace(/\\/g, "/")));
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
    const requestedNames = new Set(
      requestedPaths
        .map((path) => path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "")
        .filter(Boolean)
    );

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
    requestedPaths: string[] = []
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

    if (["kanban", "task board"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build kanban layout",
          instruction: `Create the main kanban board layout${targetHint} with todo, in progress, and done columns plus clear task cards.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add task creation and status flow",
          instruction: `Implement add-task and status-change interactions${targetHint}. Users should be able to create a task and move it between visible columns.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish board design",
          instruction: `Improve the kanban board styling${targetHint} so it feels intentional, readable, and responsive.`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term))) {
      const items: TaskWorkItem[] = [
        {
          title: "Build notes interface",
          instruction: `Create or improve the main notes app interface${targetHint}. Replace starter content with a real notes experience.`,
          allowedPaths: preferredPaths
        }
      ];
      if (normalized.includes("add") || normalized.includes("create")) {
        items.push({
          title: "Add note creation flow",
          instruction: `Implement a reliable add-note flow${targetHint}. Users should be able to enter a note title and body and save it into the visible notes list.`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("search")) {
        items.push({
          title: "Add search and filtering",
          instruction: `Implement note search/filtering${targetHint}. Searching should reduce the visible notes list based on title or body matches.`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("delete") || normalized.includes("remove")) {
        items.push({
          title: "Add note deletion",
          instruction: `Add note deletion controls${targetHint}. Users should be able to remove notes from the list cleanly.`,
          allowedPaths: preferredPaths
        });
      }
      if (normalized.includes("ui") || normalized.includes("design") || normalized.includes("improve")) {
        items.push({
          title: "Polish visual design",
          instruction: `Improve layout and styling${targetHint}. Make the notes UI feel intentional, clean, and responsive.`,
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
        instruction: `Implement the requested ${promptArtifact.replace(/-/g, " ")} updates${targetHint}. Keep the solution inside the planned package files and avoid unrelated UI scaffolding.`,
        allowedPaths: preferredPaths
      }];
    }

    if (["landing page", "website", "site"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build page structure",
          instruction: `Create the main page layout${targetHint} with complete sections and usable content.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish visual design",
          instruction: `Improve styling and hierarchy${targetHint} so the interface looks intentional and responsive.`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["dashboard", "admin panel", "analytics"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build dashboard structure",
          instruction: `Create the main dashboard layout${targetHint} with stats, activity, and clear navigation areas.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add data cards and tables",
          instruction: `Add dashboard content blocks${targetHint} including metric cards, a simple chart area, and recent activity or table rows.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish dashboard design",
          instruction: `Improve dashboard styling${targetHint} so it feels clear, intentional, and responsive.`,
          allowedPaths: preferredPaths
        }
      ];
    }

    if (["crud", "inventory app", "contacts app", "admin tool", "record manager"].some((term) => normalized.includes(term))) {
      return [
        {
          title: "Build CRUD layout",
          instruction: `Create the main CRUD app layout${targetHint} with a clear form area, records list, and useful summary section.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Add create, edit, and delete flows",
          instruction: `Implement create, edit, and delete interactions${targetHint}. Users should be able to manage visible records cleanly from the interface.`,
          allowedPaths: preferredPaths
        },
        {
          title: "Polish CRUD experience",
          instruction: `Improve the CRUD app styling${targetHint} so it feels intentional, responsive, and easy to scan.`,
          allowedPaths: preferredPaths
        }
      ];
    }

    return [
      {
        title: "Implement requested changes",
        instruction: prompt,
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
    const routes = this.resolveModelRoutes("Implementation");
    const contextFiles = await this.collectImplementationContextFiles(plan, workItem);
    if (contextFiles.length === 0) {
      return { summary: "No planned files were available for implementation.", edits: [] };
    }

    this.appendLog(taskId, `Implementation model candidates: ${routes.map((route) => route.model).join(", ")}`);
    this.appendLog(taskId, `Implementation context files: ${contextFiles.map((file) => file.path).join(", ")}`);

    const messages = [
      {
        role: "system",
        content:
          "You are a precise coding agent. Implement the user's request using the provided workspace files and manifest. " +
          `You may create new files only inside the working directory "${plan.workingDirectory}". ` +
          "Return only strict JSON with shape {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
          "Do not include markdown fences or prose outside JSON. Do not emit edits for files that do not need changes. " +
          "Every edit path must stay inside the allowed planned files for this work item."
      },
      {
        role: "user",
        content: [
          `Task: ${userPrompt}`,
          `Working directory: ${plan.workingDirectory}`,
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
        ].join("\n")
      }
    ];

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

    const candidatePaths = new Set<string>(plan.candidateFiles);
    candidatePaths.add(this.joinWorkspacePath(plan.workingDirectory, "package.json"));
    return [...candidatePaths];
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
    const allowed = new Set((plan?.candidateFiles ?? []).map((value) => value.trim()).filter(Boolean));
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
    const isFileRenamer = this.isSimpleDesktopUtilityPrompt(normalized)
      && (/\b(file renamer|rename files?|rename action)\b/.test(normalized)
        || (/\brename\b/.test(normalized) && /\bfiles?\b/.test(normalized)));
    const isPdfCombiner = this.isSimpleDesktopUtilityPrompt(normalized)
      && /\bpdf\b/.test(normalized)
      && /\b(combiner|merge)\b/.test(normalized);
    if (plan.builderMode === "notes" && !isVoiceWorkspace) return null;

    const appContent = isFileRenamer
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
    const entity = normalized.includes("invoice")
      ? { singular: "invoice", plural: "invoices", collectionPath: "/invoices", primaryField: "customer", defaultPrimaryValue: "Acme Corp" }
      : normalized.includes("booking")
        ? { singular: "booking", plural: "bookings", collectionPath: "/bookings", primaryField: "guest", defaultPrimaryValue: "Jordan Lee" }
        : normalized.includes("ticket")
          ? { singular: "ticket", plural: "tickets", collectionPath: "/tickets", primaryField: "subject", defaultPrimaryValue: "Login issue" }
          : normalized.includes("expense")
            ? { singular: "request", plural: "requests", collectionPath: "/requests", primaryField: "requester", defaultPrimaryValue: "Morgan Chen" }
            : { singular: "record", plural: "records", collectionPath: "/records", primaryField: "title", defaultPrimaryValue: "Sample item" };

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
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static dashboard with metrics, activity, and responsive layout.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticDashboardHtml(title) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticDashboardCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticDashboardJs() }
        ]
      };
    }
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} dashboard with metrics, activity, and responsive layout.`,
      edits: [
        { path: appPath, content: this.buildDashboardTsx(title) },
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
    if (plan.workspaceKind === "static") {
      return {
        summary: `Created a heuristic ${title} static CRUD app with record management and responsive layout.`,
        edits: [
          { path: this.joinWorkspacePath(plan.workingDirectory, "index.html"), content: this.buildStaticCrudHtml(title) },
          { path: this.joinWorkspacePath(plan.workingDirectory, "styles.css"), content: this.buildStaticCrudCss() },
          { path: this.joinWorkspacePath(plan.workingDirectory, "app.js"), content: this.buildStaticCrudJs(title) }
        ]
      };
    }
    const appPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.tsx");
    const appCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/App.css");
    const indexCssPath = this.joinWorkspacePath(plan.workingDirectory, "src/index.css");

    return {
      summary: `Created a heuristic ${title} CRUD app with record management, filters, and responsive layout.`,
      edits: [
        { path: appPath, content: isVendorPayments ? this.buildVendorPaymentsCrudAppTsx(title) : this.buildCrudAppTsx(title) },
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

  private buildStaticDashboardHtml(title: string): string {
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
          <p class="lede">A responsive static dashboard with metrics, activity, and a compact operational summary.</p>
        </div>
        <button id="refresh-dashboard" type="button">Refresh metrics</button>
      </section>

      <section class="stats-grid" id="stats-grid"></section>

      <section class="dashboard-grid">
        <article class="panel">
          <div class="panel-head">
            <h2>Pipeline trend</h2>
            <span id="trend-badge">Stable</span>
          </div>
          <div class="bars" id="trend-bars"></div>
        </article>
        <article class="panel">
          <div class="panel-head">
            <h2>Recent activity</h2>
            <span>Live</span>
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

  private buildStaticDashboardJs(): string {
    return `const stats = [
  { label: "Qualified leads", value: 128, delta: "+14%" },
  { label: "Active projects", value: 18, delta: "+3" },
  { label: "Conversion", value: "6.4%", delta: "+0.8%" },
  { label: "Open issues", value: 7, delta: "-2" }
];

const trend = [58, 78, 66, 92, 81, 108];
const activity = [
  "Design review cleared for the next release candidate.",
  "Ops flagged two stale incidents and resolved one automatically.",
  "Product accepted the new onboarding sequence.",
  "Support queue dropped below the daily target."
];

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

  private buildStaticCrudHtml(title: string): string {
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
          <p class="lede">A static CRUD workspace with a record form, searchable table, and quick summary panel.</p>
        </div>
      </section>

      <section class="crud-grid">
        <form class="panel form-panel" id="record-form">
          <div class="panel-head">
            <h2>Record details</h2>
            <span id="form-mode">Create</span>
          </div>
          <label>Name<input id="record-name" placeholder="Avery Stone" /></label>
          <label>Status
            <select id="record-status">
              <option>Active</option>
              <option>Paused</option>
              <option>Review</option>
            </select>
          </label>
          <label>Owner<input id="record-owner" placeholder="North Team" /></label>
          <button type="submit">Save record</button>
        </form>

        <section class="panel table-panel">
          <div class="panel-head">
            <div>
              <h2>Records</h2>
              <span id="records-count">0 records</span>
            </div>
            <label class="search-field">Search<input id="record-search" placeholder="Search records..." /></label>
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

  private buildStaticCrudJs(title: string): string {
    void title;
    return `const state = {
  editingId: "",
  records: [
    { id: "1", name: "North Region Rollout", status: "Active", owner: "Avery Stone" },
    { id: "2", name: "Retention Audit", status: "Review", owner: "Mina Patel" }
  ]
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
    listEl.innerHTML = '<article class="record-item"><h3>No matches</h3><p>Try a different search term or save a new record.</p></article>';
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

  private buildDashboardTsx(title: string): string {
    return `import "./App.css";

const metrics = [
  { label: "Revenue", value: "$128k", change: "+12.4%", tone: "up" },
  { label: "Active users", value: "8,421", change: "+6.8%", tone: "up" },
  { label: "Conversion", value: "4.7%", change: "+0.9%", tone: "up" }
];

const activities = [
  "Enterprise lead upgraded to annual plan",
  "Marketing campaign reached target CPA",
  "Customer success cleared 18 open tickets",
  "New release health checks passed"
];

const team = [
  { name: "Aisha", role: "Ops lead", status: "On track" },
  { name: "Mina", role: "Customer success", status: "Reviewing" },
  { name: "Zayd", role: "Growth", status: "Shipping" }
];

function App() {
  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="eyebrow">Operations hub</p>
        <h1>${title}</h1>
        <nav>
          <a href="#overview">Overview</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#activity">Activity</a>
          <a href="#team">Team</a>
        </nav>
      </aside>

      <section className="dashboard-main">
        <header id="overview" className="dashboard-header">
          <div>
            <p className="eyebrow">Operations snapshot</p>
            <h2>Clarity for the team, fast.</h2>
            <p>One place to scan performance, momentum, and the next actions without digging through tabs.</p>
          </div>
          <button type="button">Export report</button>
        </header>

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
              <h3>Pipeline</h3>
              <span>Last 30 days</span>
            </div>
            <div className="chart-bars">
              <div style={{ height: "42%" }}></div>
              <div style={{ height: "56%" }}></div>
              <div style={{ height: "74%" }}></div>
              <div style={{ height: "61%" }}></div>
              <div style={{ height: "88%" }}></div>
              <div style={{ height: "70%" }}></div>
            </div>
          </article>

          <article id="activity" className="panel activity-panel">
            <div className="panel-header">
              <h3>Recent activity</h3>
              <span>Live feed</span>
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
              <h3>Team focus</h3>
              <span>This week</span>
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

          <article className="panel signal-panel">
            <div className="panel-header">
              <h3>What changed</h3>
              <span>Top signal</span>
            </div>
            <p className="signal-copy">
              Conversion improved after the latest onboarding update, while support load stayed flat. The current setup is stable enough to scale spend.
            </p>
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

  private buildCrudAppTsx(title: string): string {
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

const initialRecords: RecordItem[] = [
  { id: "1", name: "Northwind Pipeline", category: "Sales", owner: "Aisha", status: "Active" },
  { id: "2", name: "Q2 Hiring Plan", category: "People", owner: "Zayd", status: "Review" },
  { id: "3", name: "Support Audit", category: "Operations", owner: "Mina", status: "Archived" }
];

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
          <p className="eyebrow">Cipher Workspace</p>
          <h1>${title}</h1>
          <p className="lede">A focused CRUD workspace for managing records, reviewing ownership, and keeping the list organized.</p>
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
              <h2>{editingId ? "Edit record" : "Create record"}</h2>
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
            Name
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Project, client, asset..."
            />
          </label>

          <label>
            Category
            <input
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              placeholder="Sales, Ops, Finance..."
            />
          </label>

          <label>
            Owner
            <input
              value={draft.owner}
              onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
              placeholder="Who is responsible?"
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

          <button type="submit">{editingId ? "Save changes" : "Add record"}</button>
        </form>

        <section className="records-card">
          <div className="section-heading records-heading">
            <div>
              <h2>Records</h2>
              <span>{visibleRecords.length} visible</span>
            </div>
            <label className="search-field">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name, owner, or status"
              />
            </label>
          </div>

          <div className="records-table">
            <div className="records-table-head">
              <span>Name</span>
              <span>Category</span>
              <span>Owner</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {visibleRecords.length === 0 ? (
              <div className="records-empty">No records match the current filter.</div>
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
    stageLabel = "Fix"
  ): Promise<FixResponse> {
    const routes = this.resolveModelRoutes(stageLabel);
    const failureLabel = `${stageLabel.toLowerCase()} failure`;
    const failureCategory = this.classifyFailureCategory(stageLabel, commandResult.combinedOutput || "");
    const failureGuidance = this.buildFailureCategoryGuidance(failureCategory);
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
    const baseMessages = [
      {
        role: "system",
        content:
          `You are a precise coding agent. Fix the ${failureLabel} using the provided workspace files only. ` +
          "Return only strict JSON with shape {\"summary\":\"...\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"full file content\"}]}. " +
          "Do not include markdown fences. Do not omit unchanged surrounding code in edited files."
      },
      {
        role: "user",
        content: [
          `Task: ${userPrompt}`,
          `Attempt: ${attempt}`,
          `Failure category: ${failureCategory}`,
          `Repair guidance: ${failureGuidance}`,
          "",
          `${stageLabel} failure output:`,
          commandResult.combinedOutput || "(no output)",
          "",
          "Workspace file context:",
          ...contextFiles.flatMap((file) => [
            `--- FILE: ${file.path} ---`,
            file.content
          ])
        ].join("\n")
      }
    ];

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
          const edits = this.normalizeStrictStructuredEdits(parsed);
          if (!this.matchesStrictFixResponseSchema(parsed)) {
            return {
              extractedJson: fencedJson,
              issue: "schema-mismatch"
            };
          }
          if (edits.length === 0) {
            return {
              extractedJson: fencedJson,
              issue: "no-usable-edits"
            };
          }
          return {
            fix: {
              summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
              edits
            },
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
    const edits = options.strictSchema
      ? this.normalizeStrictStructuredEdits(parsed)
      : this.normalizeStructuredEdits(parsed);

    if (options.strictSchema && !this.matchesStrictFixResponseSchema(parsed)) {
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
        summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
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
    messages: Array<{ role: string; content: string }>,
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
          const blacklisted = this.recordTaskModelFailure(taskId, route.model);
          if (blacklisted) {
            this.appendLog(taskId, `Blacklisting ${route.model} for the rest of task ${taskId} after repeated failures.`);
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
    this.persistTaskState();
  }

  private recordTaskModelFailure(taskId: string, model: string): boolean {
    const normalizedModel = (model ?? "").trim();
    if (!taskId || !normalizedModel) return false;
    const taskFailures = this.taskModelFailureCounts.get(taskId) ?? new Map<string, number>();
    const nextCount = (taskFailures.get(normalizedModel) ?? 0) + 1;
    taskFailures.set(normalizedModel, nextCount);
    this.taskModelFailureCounts.set(taskId, taskFailures);
    this.syncTaskRouteTelemetry(taskId);

    if (nextCount < 2) return false;
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
    if (!state) return;

    this.recordModelAttempt(taskId, normalizedStage, state.route.model, state.routeIndex, state.attempt, "semantic-error", message);
    this.recordModelRouteStat(state.route, "semantic-error");
    const blacklisted = this.recordTaskModelFailure(taskId, state.route.model);
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

  private spawnTaskProcess(command: string, args: string[], cwd: string): ChildProcessWithoutNullStreams {
    return spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "pipe",
      shell: process.platform === "win32",
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
      this.persistTaskState();
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
    return {
      build: pkg?.scripts?.build,
      lint: pkg?.scripts?.lint,
      test: pkg?.scripts?.test,
      start: pkg?.scripts?.start,
      dev: pkg?.scripts?.dev
    };
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
    const normalized: Record<string, unknown> = {
      name: packageName,
      private: current.private ?? true,
      version: typeof current.version === "string" && current.version.trim() ? current.version : "0.0.0",
      type: "module",
      scripts: isDesktopApp
        ? {
          start: "node scripts/desktop-launch.mjs",
          dev: "vite",
          "dev:web": "vite",
          build: "tsc -b && vite build",
          lint: "eslint .",
          preview: "vite preview"
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
        globals: "^17.4.0",
        typescript: "~5.9.3",
        "typescript-eslint": "^8.57.0",
        vite: "^8.0.1"
      }
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
    const wantsNodePackage = promptArtifact === "script-tool" || promptArtifact === "library" || promptArtifact === "api-service";
    const template: BootstrapPlan["template"] = wantsNodePackage ? "node-package" : (wantsNext ? "nextjs" : (wantsStatic ? "static" : "react-vite"));
    const commands = this.buildBootstrapCommands(template, targetDirectory);

    return {
      targetDirectory,
      template,
      artifactType: wantsNodePackage ? promptArtifact : undefined,
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
    const wantsNodePackage = promptArtifact === "script-tool" || promptArtifact === "library" || promptArtifact === "api-service";
    const template: BootstrapPlan["template"] = wantsNodePackage ? "node-package" : (wantsNext ? "nextjs" : (wantsStatic ? "static" : "react-vite"));
    return {
      targetDirectory,
      template,
      artifactType: wantsNodePackage ? promptArtifact : undefined,
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
        this.appendLog(taskId, `Reusing existing bootstrap directory: ${plan.targetDirectory}`);
        return {
          summary: `Reusing existing ${plan.template} project in ${plan.targetDirectory}.`
        };
      }
    } else {
      await mkdir(targetPath, { recursive: true });
    }

    if (plan.template === "static") {
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "index.html"), this.buildStaticBootstrapHtml(plan.projectName));
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "styles.css"), this.buildStaticBootstrapCss());
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "app.js"), this.buildStaticBootstrapJs(plan.projectName));
      await this.writeWorkspaceFile(this.joinWorkspacePath(plan.targetDirectory, "package.json"), JSON.stringify({
        name: plan.projectName,
        private: true,
        version: "0.1.0",
        scripts: {
          build: "python -c \"print('Static site ready')\"",
          start: "python -m http.server 4173"
        }
      }, null, 2) + "\n");
      this.appendLog(taskId, `Static app scaffold created in ${plan.targetDirectory}`);
      return { summary: plan.summary };
    }

    if (plan.template === "node-package") {
      await this.writeBootstrapNodePackage(plan);
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
          this.joinWorkspacePath(plan.targetDirectory, "src/main.tsx"),
          this.joinWorkspacePath(plan.targetDirectory, "src/App.tsx"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/@vitejs/plugin-react/package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/vite/package.json"),
          this.joinWorkspacePath(plan.targetDirectory, "node_modules/react/package.json")
        ];

    for (const relPath of requiredPaths) {
      try {
        await stat(this.resolveWorkspacePath(relPath));
      } catch {
        return false;
      }
    }
    return true;
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
        start: "node src/server.js"
      };
    }
    if (artifactType === "library") {
      return {
        build: "node -e \"console.log('Package ready')\""
      };
    }
    return {
      build: "node -e \"console.log('Tool ready')\"",
      start: "node src/index.js"
    };
  }

  private buildNodePackageStarterContent(projectName: string, artifactType?: AgentArtifactType): Array<{ path: string; content: string }> {
    if (artifactType === "api-service") {
      return [{
        path: "src/server.js",
        content: [
          "import http from 'node:http';",
          "",
          "const server = http.createServer((_req, res) => {",
          "  res.writeHead(200, { 'content-type': 'application/json' });",
          `  res.end(JSON.stringify({ service: '${projectName}', status: 'ok' }));`,
          "});",
          "",
          "server.listen(process.env.PORT || 3000, () => {",
          `  console.log('${projectName} listening');`,
          "});"
        ].join("\n") + "\n"
      }];
    }

    if (artifactType === "library") {
      return [{
        path: "src/index.js",
        content: [
          `export function describe${projectName.replace(/(^|[-_\s]+)([a-z])/gi, (_match, _sep, char) => char.toUpperCase())}() {`,
          `  return '${projectName} package ready';`,
          "}"
        ].join("\n") + "\n"
      }];
    }

    return [{
      path: "src/index.js",
      content: [
        "#!/usr/bin/env node",
        "",
        "const input = process.argv.slice(2).join(' ').trim();",
        `console.log(input || '${projectName} tool ready');`
      ].join("\n") + "\n"
    }];
  }

  private async writeBootstrapNodePackage(plan: BootstrapPlan): Promise<void> {
    const packageJsonPath = this.joinWorkspacePath(plan.targetDirectory, "package.json");
    await this.writeWorkspaceFile(packageJsonPath, JSON.stringify({
      name: plan.projectName,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: this.buildNodePackageScripts(plan.artifactType)
    }, null, 2) + "\n");

    for (const file of this.buildNodePackageStarterContent(plan.projectName, plan.artifactType)) {
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

  private buildStaticBootstrapHtml(projectName: string): string {
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

  private buildStaticBootstrapCss(): string {
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

  private buildStaticBootstrapJs(projectName: string): string {
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

  private buildStageModelOrder(settings: ReturnType<SettingsStore["get"]>, stage: AgentRoutingStage): string[] {
    const pool = [
      (settings.defaultModel ?? "").trim(),
      (settings.routing?.default ?? "").trim(),
      (settings.routing?.think ?? "").trim(),
      (settings.routing?.longContext ?? "").trim(),
      ...(settings.models ?? []).map((model) => (model ?? "").trim())
    ].filter(Boolean);

    const preferred = stage === "planner"
      ? [
        (settings.routing?.longContext ?? "").trim(),
        (settings.routing?.think ?? "").trim(),
        (settings.defaultModel ?? "").trim(),
        (settings.routing?.default ?? "").trim()
      ]
      : stage === "repair"
        ? [
          (settings.routing?.think ?? "").trim(),
          (settings.defaultModel ?? "").trim(),
          (settings.routing?.default ?? "").trim(),
          (settings.routing?.longContext ?? "").trim()
        ]
        : [
          (settings.defaultModel ?? "").trim(),
          (settings.routing?.default ?? "").trim(),
          (settings.routing?.think ?? "").trim(),
          (settings.routing?.longContext ?? "").trim()
        ];

    return [...new Set([...preferred, ...pool].filter(Boolean))];
  }

  private parseModelScaleBillions(model: string): number | null {
    const match = String(model ?? "").trim().toLowerCase().match(/(\d+(?:\.\d+)?)b\b/);
    return match ? Number.parseFloat(match[1]) : null;
  }

  private isInteractiveFriendlyLocalModel(model: string): boolean {
    const normalized = String(model ?? "").trim().toLowerCase();
    if (!normalized) return false;
    if (/(^|[-_/])vl([:-]|$)|vision/.test(normalized)) {
      return false;
    }
    const scale = this.parseModelScaleBillions(normalized);
    if (scale !== null && scale > 20) {
      return false;
    }
    return true;
  }

  private getInteractiveLocalCodeModelBias(model: string): number {
    const normalized = String(model ?? "").trim().toLowerCase();
    if (!normalized) return 0;
    if (/coder|code|codellama|starcoder|deepcoder|granite-code|devstral/.test(normalized)) {
      return 3;
    }
    if (/gemma/.test(normalized)) {
      return 2;
    }
    if (/r1|reason|gpt-oss/.test(normalized)) {
      return -2;
    }
    return 0;
  }

  private rankInteractiveLocalModels(models: string[]): string[] {
    return [...models].sort((left, right) => {
      const biasDelta = this.getInteractiveLocalCodeModelBias(right) - this.getInteractiveLocalCodeModelBias(left);
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

  private selectLocalRoutesForStage(localModels: string[], stage: AgentRoutingStage): string[] {
    if (localModels.length === 0) {
      return [];
    }
    const friendlyLocalModels = localModels.filter((model) => this.isInteractiveFriendlyLocalModel(model));
    const rankedFriendlyLocalModels = this.rankInteractiveLocalModels(friendlyLocalModels);
    const codeFocusedLocalModels = rankedFriendlyLocalModels.filter(
      (model) => this.getInteractiveLocalCodeModelBias(model) > 0
    );
    const selectedLocalModels = stage === "planner"
      ? (friendlyLocalModels.length > 0 ? rankedFriendlyLocalModels : this.rankInteractiveLocalModels(localModels))
      : this.rankInteractiveLocalModels(
        codeFocusedLocalModels.length > 0
          ? codeFocusedLocalModels
          : friendlyLocalModels.length > 0
            ? friendlyLocalModels
            : localModels
      );
    return [...new Set(selectedLocalModels.filter(Boolean))];
  }

  private resolveModelRoutes(stageLabel?: string): ModelRoute[] {
    const settings = this.settingsStore.get();
    const stage = this.normalizeRoutingStage(stageLabel);
    const defaultModel = (settings.defaultModel ?? "").trim();
    const apiKey = (settings.apiKey ?? "").trim();
    const routes: ModelRoute[] = [];
    const seen = new Set<string>();
    const stageOrder = this.buildStageModelOrder(settings, stage);
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
        throw new Error("OpenRouter key is set, but no cloud model is configured for agent fixes.");
      }
      for (const model of cloudCandidates) {
        pushRoute({
          model,
          baseUrl: (settings.baseUrl ?? "").trim() || "https://openrouter.ai/api/v1",
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

    const selectedLocalModels = this.selectLocalRoutesForStage([...new Set(ollamaStageCandidates)], stage);

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
      throw new Error("No model route available for agent fixes. Configure OpenRouter or Ollama first.");
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
        if (IGNORED_FOLDERS.has(entry.name)) continue;
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
    return task.telemetry;
  }

  private buildTaskRouteTelemetrySummary(taskId: string): AgentTaskRouteTelemetrySummary {
    const blacklistedModels = [...(this.taskModelBlacklist.get(taskId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
    const failureCounts = [...(this.taskModelFailureCounts.get(taskId)?.entries() ?? [])]
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
    const activeStageRoutes = [...(this.taskStageRoutes.get(taskId)?.entries() ?? [])]
      .map(([stage, state]) => ({
        stage,
        model: state.route.model,
        baseUrl: state.route.baseUrl,
        provider: state.route.skipAuth ? "local" as const : "remote" as const,
        routeIndex: state.routeIndex,
        attempt: state.attempt
      }))
      .sort((a, b) => a.stage.localeCompare(b.stage));

    return {
      blacklistedModels,
      failureCounts,
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
    this.persistTaskState();
  }

  private cloneTask(task: AgentTask): AgentTask {
    return {
      ...task,
      steps: task.steps.map((step) => ({ ...step })),
      output: task.output ? { ...task.output } : undefined,
      telemetry: task.telemetry
        ? {
          ...task.telemetry,
          fallbackUsed: task.telemetry.fallbackUsed ?? false,
          modelAttempts: (task.telemetry.modelAttempts ?? []).map((attempt) => ({ ...attempt })),
          routeDiagnostics: task.telemetry.routeDiagnostics
            ? {
              blacklistedModels: [...task.telemetry.routeDiagnostics.blacklistedModels],
              failureCounts: task.telemetry.routeDiagnostics.failureCounts.map((entry) => ({ ...entry })),
              activeStageRoutes: task.telemetry.routeDiagnostics.activeStageRoutes.map((entry) => ({ ...entry }))
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

  private async createSnapshot(
    label: string,
    taskId?: string,
    options?: { kind?: WorkspaceSnapshot["kind"]; targetPathHint?: string }
  ): Promise<WorkspaceSnapshot> {
    const id = `snapshot_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const snapshotPath = join(this.snapshotRoot, id);
    const filesPath = join(snapshotPath, "files");
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
      if (IGNORED_FOLDERS.has(entry.name)) continue;
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
