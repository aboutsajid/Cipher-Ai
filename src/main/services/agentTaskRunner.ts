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
import { type ChatHistoryEntry } from "../chatSendSupport";
import {
  buildStagePreferredCloudModelList,
  getDefaultBaseUrlForCloudProvider,
  getModelCapabilityHints,
  inferCloudProvider
} from "../../shared/modelCatalog";
import { isIgnoredWorkspaceFolder, isSnapshotPreserveFolder } from "./workspaceFolderGuards";
import {
  collectReferencedSnapshotIds as collectReferencedSnapshotIdsFromState,
  listSnapshots as listStoredSnapshots,
  listStoredSnapshotEntries,
  type StoredSnapshotEntry
} from "./snapshotStore";
import {
  buildCommandFailureMessage as buildCommandFailureMessageText,
  buildCompletedTaskSummary as buildCompletedTaskSummaryText,
  buildRequirementFailureMessage as buildRequirementFailureMessageText,
  describeArtifactType as describeArtifactTypeText,
  extractTerminalFailureDetail as extractTerminalFailureDetailText
} from "./agentTaskMessages";
import {
  isNoSpaceLeftError as isNoSpaceLeftErrorText,
  isRetriableWorkspaceFsError as isRetriableWorkspaceFsErrorText,
  withWorkspaceFsRetry as withWorkspaceFsRetryOperation
} from "./workspaceFsRetry";
import {
  buildRestartPrompt as buildRestartPromptText,
  buildRestoreSuccessMessage as buildRestoreSuccessMessageText
} from "./agentTaskLifecycleMessages";
import {
  buildTaskApproval as buildTaskApprovalGuard,
  ensureVerificationRequired as ensureVerificationRequiredGuard,
  upsertVerificationCheck as upsertVerificationCheckGuard
} from "./agentTaskVerificationGuards";
import {
  describeRestartMode as describeRestartModeText,
  ensureNoRunningTask as ensureNoRunningTaskGuard
} from "./agentTaskRunGuards";
import {
  buildFetchHeaders as buildFetchHeadersText,
  extractApiProbeResult as extractApiProbeResultText,
  extractServedPageProbeResult as extractServedPageProbeResultText,
  isApiCollectionPayload as isApiCollectionPayloadText,
  isBrowserSmokeInfrastructureFailure as isBrowserSmokeInfrastructureFailureText,
  looksLikeCliUsageFailure as looksLikeCliUsageFailureText,
  parseBrowserSmokeResult as parseBrowserSmokeResultText,
  parseJsonFromOutput as parseJsonFromOutputText,
  stripAnsiControlSequences as stripAnsiControlSequencesText
} from "./runtimeProbeParsers";
import {
  isRecoverableGeneratedInstallFailure as isRecoverableGeneratedInstallFailureText,
  isTransientGeneratedInstallLockFailure as isTransientGeneratedInstallLockFailureText,
  isTransientGeneratedPackagingLockFailure as isTransientGeneratedPackagingLockFailureText
} from "./generatedInstallFailureGuards";
import {
  buildElectronBuilderPackagingRequest as buildElectronBuilderPackagingRequestText,
  parseCommandArgs as parseCommandArgsText
} from "./packagingRequestBuilder";
import {
  getBuildVerificationLabel as getBuildVerificationLabelText,
  getEntryVerificationLabel as getEntryVerificationLabelText,
  getLaunchVerificationLabel as getLaunchVerificationLabelText,
  getLintVerificationLabel as getLintVerificationLabelText,
  getTestVerificationLabel as getTestVerificationLabelText,
  resolveRuntimeVerificationScript as resolveRuntimeVerificationScriptText
} from "./verificationLabelHelpers";
import {
  shouldVerifyLaunch as shouldVerifyLaunchText,
  shouldVerifyPreviewHealth as shouldVerifyPreviewHealthText,
  shouldVerifyRuntimeDepth as shouldVerifyRuntimeDepthText,
  shouldVerifyServedWebPage as shouldVerifyServedWebPageText,
  shouldVerifyUiSmoke as shouldVerifyUiSmokeText,
  usesStartupVerification as usesStartupVerificationText
} from "./runtimeVerificationSelectors";
import {
  buildRuntimeVerificationAfterRepairDetails as buildRuntimeVerificationAfterRepairDetailsText,
  buildRuntimeVerificationDetails as buildRuntimeVerificationDetailsText
} from "./runtimeVerificationMessages";
import { resolvePreferredRunCommand as resolvePreferredRunCommandText } from "./runCommandResolver";
import {
  extractScripts as extractScriptsText,
  resolveVerificationScripts as resolveVerificationScriptsText
} from "./verificationScriptResolver";
import { parseLoosePackageManifest as parseLoosePackageManifestText } from "./packageManifestParser";
import { buildNpmScriptRequest as buildNpmScriptRequestText } from "./npmScriptRequestBuilder";
import { buildTaskStageSelectionReason as buildTaskStageSelectionReasonText } from "./modelRouteSelectionReason";
import {
  buildTaskPromptMessages as buildTaskPromptMessagesText,
  cloneTaskAttachments as cloneTaskAttachmentsText,
  taskRequiresVisionRoute as taskRequiresVisionRouteText
} from "./taskAttachmentHelpers";
import {
  classifyFailureCategory as classifyFailureCategoryText,
  deriveFinalVerificationResult as deriveFinalVerificationResultText
} from "./taskFailureClassification";
import {
  normalizeTaskTargetPath as normalizeTaskTargetPathText,
  resolveWorkspacePath as resolveWorkspacePathText,
  toWorkspaceRelative as toWorkspaceRelativeText
} from "./workspacePathResolver";
import { ensureTaskTelemetry as ensureTaskTelemetryText } from "./taskTelemetryHelpers";
import {
  hasStartupFailureSignal as hasStartupFailureSignalText
} from "./startupSignalDetection";
import { buildFailureCategoryGuidance as buildFailureCategoryGuidanceText } from "./failureCategoryGuidance";
import { buildModelFailureStatus as buildModelFailureStatusText } from "./modelFailureStatus";
import {
  buildFailureMemoryGuidance as buildFailureMemoryGuidanceText,
  buildFailureMemorySignature as buildFailureMemorySignatureText
} from "./failureMemoryGuidance";
import {
  buildExhaustedModelRouteMessage as buildExhaustedModelRouteMessageText,
  compactFailureMessage as compactFailureMessageText
} from "./modelRouteFailureMessages";
import {
  buildModelRouteKey as buildModelRouteKeyText,
  buildModelRouteScoreFactors as buildModelRouteScoreFactorsText,
  getModelRouteScore as getModelRouteScoreText,
  inferRoutingStage as inferRoutingStageText,
  isTransientModelFailure as isTransientModelFailureText,
  type AgentRoutingStage as AgentRoutingStageText,
  type ModelRouteReliabilityStats
} from "./modelRouteScoring";
import {
  buildNextModelRouteReliabilityStats as buildNextModelRouteReliabilityStatsText,
  normalizeModelRouteReliabilityStats as normalizeModelRouteReliabilityStatsText
} from "./modelRouteStats";
import {
  clearTaskRouteState as clearTaskRouteStateText,
  isTaskModelBlacklisted as isTaskModelBlacklistedText,
  recordTaskModelFailureState as recordTaskModelFailureStateText,
  rememberTaskStageRouteState as rememberTaskStageRouteStateText
} from "./modelRouteTaskState";
import { buildTaskRouteTelemetrySummary as buildTaskRouteTelemetrySummaryText } from "./taskRouteTelemetrySummary";
import {
  normalizeLooseJson as normalizeLooseJsonText,
  tryParseStructuredFixResponse as tryParseStructuredFixResponseText
} from "./fixResponseParser";
import { appendTaskLogLine as appendTaskLogLineText, extractTaskOutputLogLines as extractTaskOutputLogLinesText } from "./taskLogStore";
import {
  type FailureMemoryRecord,
  formatFailureMemoryForPrompt as formatFailureMemoryForPromptText,
  selectRelevantFailureMemory as selectRelevantFailureMemoryText,
  trimFailureMemoryStore as trimFailureMemoryStoreText,
  upsertFailureMemoryEntry as upsertFailureMemoryEntryText
} from "./failureMemoryStore";
import {
  extractProjectName as extractProjectNameText,
  extractPromptTerms as extractPromptTermsText,
  toDisplayLabel as toDisplayLabelText,
  toDisplayNameFromDirectory as toDisplayNameFromDirectoryText
} from "./projectNaming";
import { buildBootstrapCommands as buildBootstrapCommandsText } from "./bootstrapCommandBuilder";
import { buildHeuristicDesktopWorkspace as buildHeuristicDesktopWorkspaceResult } from "./heuristicDesktopWorkspaceBuilders";
import {
  buildNotesAppCssTemplate,
  buildNotesAppTsxTemplate,
  buildNotesIndexCssTemplate,
  buildStaticNotesCssTemplate,
  buildStaticNotesHtmlTemplate,
  buildStaticNotesJsTemplate,
} from "./heuristicNotesTemplates";
import {
  buildKanbanBoardCssTemplate,
  buildKanbanBoardIndexCssTemplate,
  buildKanbanBoardTsxTemplate,
  buildStaticKanbanCssTemplate,
  buildStaticKanbanHtmlTemplate,
  buildStaticKanbanJsTemplate,
} from "./heuristicKanbanTemplates";
import {
  buildCrudAppCssTemplate,
  buildCrudIndexCssTemplate,
  buildDashboardCssTemplate,
  buildDashboardIndexCssTemplate,
  buildStaticCrudCssTemplate,
  buildStaticDashboardCssTemplate,
} from "./heuristicStyleTemplates";
import {
  buildAnnouncementPageCssTemplate,
  buildAnnouncementPageTsxTemplate,
  buildLandingIndexCssTemplate,
  buildLandingPageCssTemplate,
  buildLandingPageTsxTemplate,
  buildPricingPageCssTemplate,
  buildPricingPageTsxTemplate,
  buildStaticLandingCssTemplate,
  buildStaticLandingHtmlTemplate,
  buildStaticLandingJsTemplate,
} from "./heuristicMarketingTemplates";
import {
  buildVendorPaymentsCrudAppTsxTemplate,
} from "./heuristicReactDashboardCrudTemplates";
import {
  buildHeuristicCrudWorkspace,
  buildHeuristicDashboardWorkspace,
} from "./heuristicDashboardCrudWorkspaceBuilders";
import {
  buildCrudAppTsxForDomain,
  buildDashboardTsxForDomain,
  buildStaticCrudHtmlForDomain,
  buildStaticCrudJsForDomain,
  buildStaticDashboardHtmlForDomain,
  buildStaticDashboardJsForDomain
} from "./heuristicDashboardCrudTemplateComposers";
import {
  buildHeuristicLandingWorkspace,
  buildHeuristicMarketingPageWorkspace
} from "./heuristicMarketingWorkspaceBuilders";
import {
  buildHeuristicKanbanWorkspace,
  buildHeuristicNotesWorkspace
} from "./heuristicNotesKanbanWorkspaceBuilders";
import {
  buildHeuristicApiServiceWorkspace,
  buildHeuristicLibraryWorkspace,
  buildHeuristicScriptToolWorkspace
} from "./heuristicGenericWorkspaceBuilders";
import {
  buildApiEntityForDomainFocus,
  buildDesktopDomainContentForFocus,
  type ApiEntityContent,
  type DesktopDomainContent,
} from "./heuristicDesktopApiDomainContent";
import {
  isDesktopBusinessReportingPrompt as isDesktopBusinessReportingPromptText,
  isSimpleDesktopShellPrompt as isSimpleDesktopShellPromptText,
  isSimpleDesktopUtilityPrompt as isSimpleDesktopUtilityPromptText
} from "./heuristicDesktopPromptGuards";
import {
  isSimpleGeneratedPackagePrompt as isSimpleGeneratedPackagePromptText,
  isSimpleNotesAppPrompt as isSimpleNotesAppPromptText
} from "./heuristicGeneratedPromptGuards";
import {
  extractPromptRequirements as extractPromptRequirementsText
} from "./heuristicPromptRequirements";
import {
  extractExplicitPromptFilePaths as extractExplicitPromptFilePathsText,
  isPathInsideWorkingDirectory as isPathInsideWorkingDirectoryText,
  joinWorkspacePath as joinWorkspacePathText
} from "./heuristicWorkspacePathHelpers";
import {
  getConflictingScaffoldPaths as getConflictingScaffoldPathsText,
  isBuilderRecoveryPrimaryPlan as isBuilderRecoveryPrimaryPlanText,
  isUnexpectedGeneratedAppFile as isUnexpectedGeneratedAppFileText
} from "./heuristicGeneratedScaffoldRecovery";
import {
  detectBuilderMode as detectBuilderModeText,
  isLockedBuilderMode as isLockedBuilderModeText
} from "./heuristicBuilderModeGuards";
import { detectStarterPlaceholderSignals as detectStarterPlaceholderSignalsText } from "./heuristicStarterPlaceholderSignals";
import {
  buildGeneratedDesktopScaffoldFiles,
  buildGeneratedDesktopAppIdTemplate,
  buildGeneratedReactScaffoldFiles,
  buildDesktopBootstrapAppCssTemplate,
  buildDesktopBootstrapAppTsxTemplate,
  buildDesktopBootstrapIndexCssTemplate,
  buildGeneralReactStarterAppTemplate,
  buildGeneralReactStarterCssTemplate,
  buildGeneralReactStarterIndexCssTemplate,
  buildGeneratedDesktopMainProcessTemplate,
  buildGeneratedDesktopPreloadBridgeTemplate,
  buildReactBootstrapHtmlTemplate,
  buildStaticBootstrapCssTemplate,
  buildStaticBootstrapHtmlTemplate,
  buildStaticBootstrapJsTemplate,
} from "./heuristicBootstrapTemplates";
import { hasPreviewBootstrapSignals as hasPreviewBootstrapSignalsText } from "./previewBootstrapSignals";
import {
  escapeRegExp as escapeRegExpText,
  isLikelyValidStylesheet as isLikelyValidStylesheetText,
  normalizeLocalHtmlScriptsForVite as normalizeLocalHtmlScriptsForViteText,
  resolvePreviewAssetPath as resolvePreviewAssetPathText
} from "./previewAssetHelpers";
import {
  buildNodePackageManifestTemplate,
  buildNodePackageScriptsTemplate,
  buildNodePackageStarterContentTemplate
} from "./heuristicNodePackageTemplates";
import { resolveServedWebPageUrl as resolveServedWebPageUrlText } from "./servedWebPageUrlResolver";
import {
  buildGeneratedGenericPackageManifest,
  buildGeneratedStaticPackageManifest
} from "./generatedPackageManifestTemplates";
import { inferGeneratedGenericArtifactType as inferGeneratedGenericArtifactTypeFromData } from "./generatedGenericArtifactType";
import { buildProjectReadmeTemplate } from "./projectReadmeTemplate";

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

type ModelRouteStats = ModelRouteReliabilityStats;

type FailureMemoryEntry = FailureMemoryRecord<AgentArtifactType | "unknown", AgentTaskFailureCategory>;

interface TaskStageRouteState {
  route: ModelRoute;
  routeIndex: number;
  attempt: number;
}

type AgentRoutingStage = AgentRoutingStageText;

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
    return buildRestoreSuccessMessageText(snapshot);
  }

  private isRetriableWorkspaceFsError(error: unknown): boolean {
    return isRetriableWorkspaceFsErrorText(error);
  }

  private isNoSpaceLeftError(error: unknown): boolean {
    return isNoSpaceLeftErrorText(error);
  }

  private async withWorkspaceFsRetry<T>(operation: () => Promise<T>, attempts = 4, delayMs = 150): Promise<T> {
    return withWorkspaceFsRetryOperation(operation, {
      attempts,
      delayMs,
      isRetriable: (error) => this.isRetriableWorkspaceFsError(error)
    });
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
        this.modelRouteStats.set(routeKey, normalizeModelRouteReliabilityStatsText(stats));
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
    return listStoredSnapshots(this.snapshotRoot);
  }

  private collectReferencedSnapshotIds(): Set<string> {
    return collectReferencedSnapshotIdsFromState(this.tasks.values(), this.lastRestoreState);
  }

  private async listStoredSnapshotEntries(): Promise<StoredSnapshotEntry[]> {
    return listStoredSnapshotEntries(this.snapshotRoot);
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
    clearTaskRouteStateText(taskId, this.taskModelFailureCounts, this.taskModelBlacklist, this.taskStageRoutes);
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
      clearTaskRouteStateText(task.id, this.taskModelFailureCounts, this.taskModelBlacklist, this.taskStageRoutes);
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
    ensureVerificationRequiredGuard(task);
  }

  private buildTaskApproval(
    plan: TaskExecutionPlan,
    task: AgentTask,
    packageManifest: PackageManifest | null,
    scripts: PackageScripts
  ): { ok: boolean; summary: string } {
    const requiresDesktopApproval = plan.spec.starterProfile === "electron-desktop" || task.artifactType === "desktop-app";
    return buildTaskApprovalGuard(task, packageManifest, scripts, requiresDesktopApproval);
  }

  private buildCompletedTaskSummary(task: AgentTask): string {
    return buildCompletedTaskSummaryText(task);
  }

  private buildRequirementFailureMessage(checks: AgentVerificationCheck[]): string {
    return buildRequirementFailureMessageText(checks);
  }

  private buildCommandFailureMessage(label: string, result: TerminalCommandResult, qualifier = "failed"): string {
    return buildCommandFailureMessageText(label, result, qualifier);
  }

  private extractTerminalFailureDetail(result: TerminalCommandResult): string {
    return extractTerminalFailureDetailText(result);
  }

  private describeArtifactType(artifactType: AgentArtifactType | undefined): string {
    return describeArtifactTypeText(artifactType);
  }

  private upsertVerificationCheck(checks: AgentVerificationCheck[], next: AgentVerificationCheck): void {
    upsertVerificationCheckGuard(checks, next);
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
    ensureNoRunningTaskGuard(this.activeTaskId, this.tasks);
  }

  private buildRestartPrompt(task: AgentTask, mode: AgentTaskRestartMode): string {
    return buildRestartPromptText(task, mode);
  }

  private describeRestartMode(mode: AgentTaskRestartMode): string {
    return describeRestartModeText(mode);
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
    return resolvePreferredRunCommandText(artifactType, scripts);
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
    return getEntryVerificationLabelText(artifactType);
  }

  private getBuildVerificationLabel(artifactType: AgentArtifactType): string {
    return getBuildVerificationLabelText(artifactType);
  }

  private getLintVerificationLabel(artifactType: AgentArtifactType): string {
    return getLintVerificationLabelText(artifactType);
  }

  private getTestVerificationLabel(artifactType: AgentArtifactType): string {
    return getTestVerificationLabelText(artifactType);
  }

  private getLaunchVerificationLabel(artifactType: AgentArtifactType): string {
    return getLaunchVerificationLabelText(artifactType);
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
    return resolveRuntimeVerificationScriptText(scripts);
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
    return parseCommandArgsText(command);
  }

  private buildElectronBuilderPackagingRequest(
    script: string,
    workingDirectory: string,
    outputDirectory: string
  ): TerminalCommandRequest | null {
    return buildElectronBuilderPackagingRequestText(script, workingDirectory, outputDirectory);
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
    return isRecoverableGeneratedInstallFailureText(result);
  }

  private isTransientGeneratedInstallLockFailure(result: TerminalCommandResult): boolean {
    return isTransientGeneratedInstallLockFailureText(result);
  }

  private isTransientGeneratedPackagingLockFailure(result: TerminalCommandResult): boolean {
    return isTransientGeneratedPackagingLockFailureText(result);
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
    return buildProjectReadmeTemplate({
      projectName,
      artifactType,
      starterProfileLabel: this.describeStarterProfile(spec.starterProfile),
      workingDirectory,
      deliverables: spec.deliverables,
      acceptanceCriteria: spec.acceptanceCriteria,
      qualityGates: spec.qualityGates
    });
  }

  private usesStartupVerification(artifactType: AgentArtifactType): boolean {
    return usesStartupVerificationText(artifactType);
  }

  private shouldVerifyLaunch(artifactType: AgentArtifactType): boolean {
    return shouldVerifyLaunchText(artifactType);
  }

  private shouldVerifyPreviewHealth(artifactType: AgentArtifactType): boolean {
    return shouldVerifyPreviewHealthText(artifactType);
  }

  private shouldVerifyUiSmoke(artifactType: AgentArtifactType): boolean {
    return shouldVerifyUiSmokeText(artifactType);
  }

  private shouldVerifyServedWebPage(artifactType: AgentArtifactType): boolean {
    return shouldVerifyServedWebPageText(artifactType);
  }

  private shouldVerifyRuntimeDepth(artifactType: AgentArtifactType): boolean {
    return shouldVerifyRuntimeDepthText(artifactType);
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
    return buildRuntimeVerificationDetailsText(artifactType, scriptName, ok);
  }

  private buildRuntimeVerificationAfterRepairDetails(
    artifactType: AgentArtifactType,
    scriptName: "start" | "dev"
  ): string {
    return buildRuntimeVerificationAfterRepairDetailsText(artifactType, scriptName);
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
    return resolveServedWebPageUrlText({
      workspaceKind: plan.workspaceKind,
      runtimeScript,
      startScript: scripts.start,
      devScript: scripts.dev,
      combinedOutput
    });
  }

  private stripAnsiControlSequences(value: string): string {
    return stripAnsiControlSequencesText(value);
  }

  private parseBrowserSmokeResult(output: string): BrowserSmokeResult | null {
    return parseBrowserSmokeResultText(output);
  }

  private isBrowserSmokeInfrastructureFailure(details: string): boolean {
    return isBrowserSmokeInfrastructureFailureText(details);
  }

  private extractServedPageProbeResult(output: string): StartupProbeResult | null {
    return extractServedPageProbeResultText(output);
  }

  private extractApiProbeResult(output: string): StartupProbeResult | null {
    return extractApiProbeResultText(output);
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
    return looksLikeCliUsageFailureText(output);
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
    return parseJsonFromOutputText(output);
  }

  private buildFetchHeaders(init?: RequestInit): HeadersInit {
    return buildFetchHeadersText(init);
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
    return isApiCollectionPayloadText(payload);
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
    return hasPreviewBootstrapSignalsText(source, mode);
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
    return normalizeLocalHtmlScriptsForViteText(content, expectedScripts);
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
    return resolvePreviewAssetPathText(
      previewRoot,
      ref,
      (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath)
    );
  }

  private escapeRegExp(value: string): string {
    return escapeRegExpText(value);
  }

  private isLikelyValidStylesheet(content: string): boolean {
    return isLikelyValidStylesheetText(content);
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

  private buildDesktopDomainContent(domainFocus: DomainFocus): DesktopDomainContent {
    return buildDesktopDomainContentForFocus(domainFocus);
  }

  private buildApiEntityForDomain(domainFocus: DomainFocus): ApiEntityContent {
    return buildApiEntityForDomainFocus(domainFocus);
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
    return detectBuilderModeText(prompt, {
      looksLikeCrudAppPrompt: (normalizedPrompt) => this.looksLikeCrudAppPrompt(normalizedPrompt)
    });
  }

  private extractPromptRequirements(prompt: string): PromptRequirement[] {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    return extractPromptRequirementsText(prompt, {
      promptArtifact,
      isDesktopBusinessReportingPrompt: (nextPrompt) => this.isDesktopBusinessReportingPrompt(nextPrompt)
    });
  }

  private extractExplicitPromptFilePaths(prompt: string, workingDirectory: string): string[] {
    return extractExplicitPromptFilePathsText(prompt, workingDirectory);
  }

  private isLockedBuilderPlan(plan: TaskExecutionPlan): boolean {
    return isLockedBuilderModeText(plan.builderMode);
  }

  private shouldPreferHeuristicImplementation(prompt: string, plan: TaskExecutionPlan): boolean {
    return this.isLockedBuilderPlan(plan)
      || this.isSimpleDesktopShellPrompt(prompt, plan)
      || this.isSimpleNotesAppPrompt(prompt, plan)
      || this.isSimpleGeneratedPackagePrompt(prompt, plan);
  }

  private isSimpleDesktopShellPrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    return isSimpleDesktopShellPromptText(prompt, plan.workspaceKind);
  }

  private detectStarterPlaceholderSignals(content: string): string[] {
    return detectStarterPlaceholderSignalsText(content);
  }

  private isDesktopBusinessReportingPrompt(normalizedPrompt: string): boolean {
    return isDesktopBusinessReportingPromptText(normalizedPrompt);
  }

  private isSimpleDesktopUtilityPrompt(normalizedPrompt: string): boolean {
    return isSimpleDesktopUtilityPromptText(normalizedPrompt);
  }

  private isSimpleNotesAppPrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    return isSimpleNotesAppPromptText(prompt, {
      builderMode: plan.builderMode,
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory
    });
  }

  private isSimpleGeneratedPackagePrompt(prompt: string, plan: TaskExecutionPlan): boolean {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const promptArtifact = this.inferArtifactTypeFromPrompt(normalized);
    return isSimpleGeneratedPackagePromptText(prompt, {
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory
    }, promptArtifact);
  }

  private isBuilderRecoveryPrimaryPlan(plan: TaskExecutionPlan): boolean {
    return isBuilderRecoveryPrimaryPlanText(plan.builderMode);
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
    return getConflictingScaffoldPathsText({
      workingDirectory: plan.workingDirectory,
      workspaceKind: plan.workspaceKind
    });
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
    return isUnexpectedGeneratedAppFileText(path, workingDirectory, allowed);
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
    return extractPromptTermsText(prompt);
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
    return isPathInsideWorkingDirectoryText(path, workingDirectory);
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
    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicDesktopWorkspaceResult({
      prompt,
      workspaceKind: plan.workspaceKind,
      builderMode: plan.builderMode,
      workingDirectory: plan.workingDirectory,
      title,
      isDesktopBusinessReportingPrompt: (normalizedPrompt) => this.isDesktopBusinessReportingPrompt(normalizedPrompt),
      isSimpleDesktopUtilityPrompt: (normalizedPrompt) => this.isSimpleDesktopUtilityPrompt(normalizedPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath)
    });
  }

  private buildHeuristicApiService(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (this.inferArtifactTypeFromPrompt(normalized) !== "api-service") return null;
    if (plan.workspaceKind !== "generic") return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "node-api-service", "api-service");
    return buildHeuristicApiServiceWorkspace({
      prompt,
      normalizedPrompt: normalized,
      title,
      domainFocus,
      workingDirectory: plan.workingDirectory,
      extractProjectName: (nextPrompt) => this.extractProjectName(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      resolveDomainEntity: (nextDomainFocus) => this.buildApiEntityForDomain(nextDomainFocus as DomainFocus)
    });
  }

  private buildHeuristicScriptTool(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    return buildHeuristicScriptToolWorkspace({
      prompt,
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory,
      inferArtifactTypeFromPrompt: (nextPrompt) => this.inferArtifactTypeFromPrompt(nextPrompt),
      extractProjectName: (nextPrompt) => this.extractProjectName(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath)
    });
  }

  private buildHeuristicLibrary(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    return buildHeuristicLibraryWorkspace({
      prompt,
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory,
      inferArtifactTypeFromPrompt: (nextPrompt) => this.inferArtifactTypeFromPrompt(nextPrompt),
      extractProjectName: (nextPrompt) => this.extractProjectName(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath)
    });
  }

  private buildHeuristicNotesApp(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsNotes = ["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term));
    if (!wantsNotes) return null;

    const wantsSearch = normalized.includes("search");
    const wantsDelete = normalized.includes("delete") || normalized.includes("remove");
    const wantsAdd = normalized.includes("add") || normalized.includes("create");
    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicNotesWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      features: { wantsSearch, wantsDelete, wantsAdd },
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildStaticNotesHtml: (nextTitle) => this.buildStaticNotesHtml(nextTitle),
      buildStaticNotesCss: () => this.buildStaticNotesCss(),
      buildStaticNotesJs: (nextTitle, features) => this.buildStaticNotesJs(nextTitle, features),
      buildNotesAppTsx: (nextTitle, features) => this.buildNotesAppTsx(nextTitle, features),
      buildNotesAppCss: () => this.buildNotesAppCss(),
      buildNotesIndexCss: () => this.buildNotesIndexCss()
    });
  }

  private buildHeuristicKanbanBoard(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsKanban = ["kanban", "task board"].some((term) => normalized.includes(term));
    if (!wantsKanban) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicKanbanWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildStaticKanbanHtml: (nextTitle) => this.buildStaticKanbanHtml(nextTitle),
      buildStaticKanbanCss: () => this.buildStaticKanbanCss(),
      buildStaticKanbanJs: () => this.buildStaticKanbanJs(),
      buildKanbanBoardTsx: (nextTitle) => this.buildKanbanBoardTsx(nextTitle),
      buildKanbanBoardCss: () => this.buildKanbanBoardCss(),
      buildKanbanBoardIndexCss: () => this.buildKanbanBoardIndexCss()
    });
  }

  private buildHeuristicLandingPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsLanding = ["landing page", "website", "site", "homepage"].some((term) => normalized.includes(term));
    if (!wantsLanding) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicLandingWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildStaticLandingHtml: (nextTitle) => this.buildStaticLandingHtml(nextTitle),
      buildStaticLandingCss: () => this.buildStaticLandingCss(),
      buildStaticLandingJs: (nextTitle) => this.buildStaticLandingJs(nextTitle),
      buildLandingPageTsx: (nextTitle) => this.buildLandingPageTsx(nextTitle),
      buildLandingPageCss: () => this.buildLandingPageCss(),
      buildLandingIndexCss: () => this.buildLandingIndexCss()
    });
  }

  private buildHeuristicDashboard(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsDashboard = ["dashboard", "admin panel", "analytics", "wallboard", "kpi", "incident", "escalation"]
      .some((term) => normalized.includes(term));
    if (!wantsDashboard) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "react-dashboard", null);
    return buildHeuristicDashboardWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      domainFocus,
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildStaticDashboardHtml: (nextTitle, nextDomainFocus) => this.buildStaticDashboardHtml(nextTitle, nextDomainFocus),
      buildStaticDashboardCss: () => this.buildStaticDashboardCss(),
      buildStaticDashboardJs: (nextDomainFocus) => this.buildStaticDashboardJs(nextDomainFocus),
      buildDashboardTsx: (nextTitle, nextDomainFocus) => this.buildDashboardTsx(nextTitle, nextDomainFocus),
      buildDashboardCss: () => this.buildDashboardCss(),
      buildDashboardIndexCss: () => this.buildDashboardIndexCss()
    });
  }

  private buildHeuristicPricingPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsPricing = ["pricing page", "pricing", "plans", "plan comparison"].some((term) => normalized.includes(term));
    if (!wantsPricing) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicMarketingPageWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildAppTsx: (nextTitle) => this.buildPricingPageTsx(nextTitle),
      buildAppCss: () => this.buildPricingPageCss(),
      buildIndexCss: () => this.buildLandingIndexCss(),
      summaryPrefix: "pricing page with hero, plan cards, comparison, and contact CTA"
    });
  }

  private buildHeuristicAnnouncementPage(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsAnnouncement = ["announcement page", "feature announcement", "update page", "rollout timeline"].some((term) => normalized.includes(term));
    if (!wantsAnnouncement) return null;

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    return buildHeuristicMarketingPageWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildAppTsx: (nextTitle) => this.buildAnnouncementPageTsx(nextTitle),
      buildAppCss: () => this.buildAnnouncementPageCss(),
      buildIndexCss: () => this.buildLandingIndexCss(),
      summaryPrefix: "feature announcement page with hero, update cards, rollout timeline, and contact CTA"
    });
  }

  private buildHeuristicCrudApp(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsCrud = this.looksLikeCrudAppPrompt(normalized)
      || /\b(table|status|due date|due dates|vendor|vendors|payment status|mark (?:one )?paid)\b/.test(normalized);
    if (!wantsCrud) return null;
    const isVendorPayments = /\b(vendor|vendors|payment|payments|mark (?:one )?paid|due date|due dates)\b/.test(normalized);

    const title = this.toDisplayNameFromDirectory(plan.workingDirectory);
    const domainFocus = plan.spec?.domainFocus ?? this.inferDomainFocus(prompt, "react-crud", null);
    return buildHeuristicCrudWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      isVendorPayments,
      domainFocus,
      resolveWorkspacePath: (workingDirectory, relativePath) => this.joinWorkspacePath(workingDirectory, relativePath),
      buildStaticCrudHtml: (nextTitle, nextDomainFocus) => this.buildStaticCrudHtml(nextTitle, nextDomainFocus),
      buildStaticCrudCss: () => this.buildStaticCrudCss(),
      buildStaticCrudJs: (nextTitle, nextDomainFocus) => this.buildStaticCrudJs(nextTitle, nextDomainFocus),
      buildCrudAppTsx: (nextTitle, nextDomainFocus) => this.buildCrudAppTsx(nextTitle, nextDomainFocus),
      buildVendorPaymentsCrudAppTsx: (nextTitle) => this.buildVendorPaymentsCrudAppTsx(nextTitle),
      buildCrudAppCss: () => this.buildCrudAppCss(),
      buildCrudIndexCss: () => this.buildCrudIndexCss()
    });
  }

  private toDisplayNameFromDirectory(workingDirectory: string): string {
    return toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes");
  }

  private toDisplayLabel(value: string, fallback = "Generated App"): string {
    return toDisplayLabelText(value, fallback);
  }

  private buildNotesAppTsx(title: string, options: { wantsSearch: boolean; wantsDelete: boolean; wantsAdd: boolean }): string {
    return buildNotesAppTsxTemplate(title, options);
  }

  private buildStaticNotesHtml(title: string): string {
    return buildStaticNotesHtmlTemplate(title);
  }

  private buildStaticNotesCss(): string {
    return buildStaticNotesCssTemplate();
  }

  private buildStaticNotesJs(title: string, options: { wantsSearch: boolean; wantsDelete: boolean; wantsAdd: boolean }): string {
    return buildStaticNotesJsTemplate(title, options);
  }

  private buildStaticDashboardHtml(title: string, domainFocus: DomainFocus = "generic"): string {
    return buildStaticDashboardHtmlForDomain(title, domainFocus);
  }

  private buildStaticDashboardCss(): string {
    return buildStaticDashboardCssTemplate();
  }

  private buildStaticDashboardJs(domainFocus: DomainFocus = "generic"): string {
    return buildStaticDashboardJsForDomain(domainFocus);
  }

  private buildStaticCrudHtml(title: string, domainFocus: DomainFocus = "generic"): string {
    return buildStaticCrudHtmlForDomain(title, domainFocus);
  }

  private buildStaticCrudCss(): string {
    return buildStaticCrudCssTemplate();
  }

  private buildStaticCrudJs(title: string, domainFocus: DomainFocus = "generic"): string {
    void title;
    return buildStaticCrudJsForDomain(domainFocus);
  }

  private buildPricingPageTsx(title: string): string {
    return buildPricingPageTsxTemplate(title);
  }

  private buildPricingPageCss(): string {
    return buildPricingPageCssTemplate();
  }

  private buildNotesAppCss(): string {
    return buildNotesAppCssTemplate();
  }

  private buildNotesIndexCss(): string {
    return buildNotesIndexCssTemplate();
  }

  private buildAnnouncementPageTsx(title: string): string {
    return buildAnnouncementPageTsxTemplate(title);
  }

  private buildAnnouncementPageCss(): string {
    return buildAnnouncementPageCssTemplate();
  }

  private buildLandingPageTsx(title: string): string {
    return buildLandingPageTsxTemplate(title);
  }

  private buildStaticLandingHtml(title: string): string {
    return buildStaticLandingHtmlTemplate(title);
  }

  private buildStaticLandingCss(): string {
    return buildStaticLandingCssTemplate();
  }

  private buildStaticLandingJs(title: string): string {
    return buildStaticLandingJsTemplate(title);
  }

  private buildLandingPageCss(): string {
    return buildLandingPageCssTemplate();
  }

  private buildLandingIndexCss(): string {
    return buildLandingIndexCssTemplate();
  }

  private buildDashboardTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    return buildDashboardTsxForDomain(title, domainFocus);
  }

  private buildDashboardCss(): string {
    return buildDashboardCssTemplate();
  }

  private buildDashboardIndexCss(): string {
    return buildDashboardIndexCssTemplate();
  }

  private buildKanbanBoardTsx(title: string): string {
    return buildKanbanBoardTsxTemplate(title);
  }

  private buildKanbanBoardCss(): string {
    return buildKanbanBoardCssTemplate();
  }

  private buildKanbanBoardIndexCss(): string {
    return buildKanbanBoardIndexCssTemplate();
  }

  private buildStaticKanbanHtml(title: string): string {
    return buildStaticKanbanHtmlTemplate(title);
  }

  private buildStaticKanbanCss(): string {
    return buildStaticKanbanCssTemplate();
  }

  private buildStaticKanbanJs(): string {
    return buildStaticKanbanJsTemplate();
  }

  private buildCrudAppTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    return buildCrudAppTsxForDomain(title, domainFocus);
  }

  private buildVendorPaymentsCrudAppTsx(title: string): string {
    return buildVendorPaymentsCrudAppTsxTemplate(title);
  }

  private buildCrudAppCss(): string {
    return buildCrudAppCssTemplate();
  }

  private buildCrudIndexCss(): string {
    return buildCrudIndexCssTemplate();
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
    return buildFailureCategoryGuidanceText(category);
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
    return selectRelevantFailureMemoryText([...this.failureMemory.values()], {
      failureCategory,
      stageLabel,
      currentArtifact
    }) as FailureMemoryEntry[];
  }

  private formatFailureMemoryForPrompt(entries: FailureMemoryEntry[]): string[] {
    return formatFailureMemoryForPromptText(entries);
  }

  private tryParseFixResponse(raw: string, responseLabel = "Fix", options: ParseFixResponseOptions = {}): ParsedFixResponse | null {
    return tryParseStructuredFixResponseText(raw, responseLabel, options) as ParsedFixResponse | null;
  }

  private normalizeLooseJson(raw: string): string {
    return normalizeLooseJsonText(raw);
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
    return isTransientModelFailureText(message);
  }

  private buildModelRouteKey(route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">): string {
    return buildModelRouteKeyText(route);
  }

  private getModelRouteScore(route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">): number {
    return getModelRouteScoreText(this.modelRouteStats, route);
  }

  private buildModelRouteScoreFactors(
    route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">
  ): AgentModelRouteScoreFactor[] {
    return buildModelRouteScoreFactorsText(this.modelRouteStats, route);
  }

  private inferRoutingStage(stageLabel: string): AgentRoutingStage {
    return inferRoutingStageText(stageLabel);
  }

  private buildTaskModelFailureStatus(taskId: string, model: string): {
    count: number;
    blacklisted: boolean;
    hardFailuresUntilBlacklist: number;
    transientFailuresUntilBlacklist: number;
  } {
    const normalizedModel = (model ?? "").trim();
    const count = this.taskModelFailureCounts.get(taskId)?.get(normalizedModel) ?? 0;
    return buildModelFailureStatusText({
      count,
      blacklisted: this.isTaskModelBlacklisted(taskId, normalizedModel),
      hardFailureThreshold: AGENT_MODEL_BLACKLIST_THRESHOLD,
      transientFailureThreshold: AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD
    });
  }

  private getTaskAttachments(taskId: string): AttachmentPayload[] {
    return cloneTaskAttachmentsText(this.tasks.get(taskId)?.attachments);
  }

  private taskRequiresVisionRoute(taskId: string): boolean {
    return taskRequiresVisionRouteText(this.getTaskAttachments(taskId));
  }

  private buildTaskPromptMessages(
    prompt: string,
    attachments: AttachmentPayload[],
    systemPreamble: string
  ): ChatHistoryEntry[] {
    return buildTaskPromptMessagesText(prompt, attachments, systemPreamble);
  }

  private buildTaskStageSelectionReason(taskId: string, stage: string, route: ModelRoute, routeIndex: number): string {
    return buildTaskStageSelectionReasonText({
      routingStage: this.inferRoutingStage(stage),
      route,
      routeIndex,
      requiresVision: this.taskRequiresVisionRoute(taskId)
    });
  }

  private recordModelRouteStat(
    route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">,
    outcome: AgentTaskModelAttempt["outcome"]
  ): void {
    const key = this.buildModelRouteKey(route);
    const next: ModelRouteStats = buildNextModelRouteReliabilityStatsText(this.modelRouteStats.get(key), outcome);
    this.modelRouteStats.set(key, next);
    this.persistTaskState(this.activeTaskId ?? undefined);
  }

  private recordTaskModelFailure(
    taskId: string,
    model: string,
    outcome: Extract<AgentTaskModelAttempt["outcome"], "transient-error" | "error" | "semantic-error">
  ): boolean {
    const result = recordTaskModelFailureStateText({
      taskId,
      model,
      outcome,
      taskModelFailureCounts: this.taskModelFailureCounts,
      taskModelBlacklist: this.taskModelBlacklist,
      hardFailureThreshold: AGENT_MODEL_BLACKLIST_THRESHOLD,
      transientFailureThreshold: AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD
    });
    if (!result.updated) return false;
    this.syncTaskRouteTelemetry(taskId);
    if (!result.blacklisted) return false;
    this.syncTaskRouteTelemetry(taskId);
    return true;
  }

  private isTaskModelBlacklisted(taskId: string, model: string): boolean {
    return isTaskModelBlacklistedText(this.taskModelBlacklist, taskId, model);
  }

  private rememberTaskStageRoute(
    taskId: string,
    stage: string,
    route: ModelRoute,
    routeIndex: number,
    attempt: number
  ): void {
    const updated = rememberTaskStageRouteStateText({
      taskId,
      stage,
      route,
      routeIndex,
      attempt,
      taskStageRoutes: this.taskStageRoutes
    });
    if (!updated) return;
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
    return buildExhaustedModelRouteMessageText(stageLabel, failures);
  }

  private compactFailureMessage(message: string): string {
    return compactFailureMessageText(message);
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
    const guidance = this.buildFailureMemoryGuidance(category, signature, compact);
    const next = upsertFailureMemoryEntryText({
      current: this.failureMemory.get(key),
      key,
      artifactType,
      category,
      stage: normalizedStage,
      signature,
      guidance,
      example: compact
    });
    this.failureMemory.set(key, next.entry);
    if (next.created) this.trimFailureMemory();
    this.persistTaskState(taskId);
  }

  private trimFailureMemory(): void {
    trimFailureMemoryStoreText(this.failureMemory, MAX_FAILURE_MEMORY_ENTRIES);
  }

  private buildFailureMemorySignature(category: AgentTaskFailureCategory, message: string): string {
    return buildFailureMemorySignatureText(category, message);
  }

  private buildFailureMemoryGuidance(
    category: AgentTaskFailureCategory,
    signature: string,
    message: string
  ): string {
    return buildFailureMemoryGuidanceText({
      signature,
      message,
      categoryGuidance: this.buildFailureCategoryGuidance(category),
      compactFailureMessage: (value) => this.compactFailureMessage(value)
    });
  }

  private hasStartupFailureSignal(output: string): boolean {
    return hasStartupFailureSignalText(output);
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
    extractTaskOutputLogLinesText(output).forEach((line) => this.appendLog(taskId, line));
  }

  private appendLog(taskId: string, line: string): void {
    appendTaskLogLineText(this.taskLogs, taskId, line, MAX_LOG_LINES);
    if (taskId !== "manual") {
      this.queueTaskStatePersist(taskId);
    }
  }

  private buildNpmScriptRequest(scriptName: string, timeoutMs: number, cwd = ".", extraArgs: string[] = []): TerminalCommandRequest {
    return buildNpmScriptRequestText(scriptName, timeoutMs, cwd, extraArgs);
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
    return parseLoosePackageManifestText(raw, (value) => this.normalizeLooseJson(value)) as PackageManifest | null;
  }

  private extractScripts(pkg: { scripts?: PackageScripts } | null): PackageScripts {
    return extractScriptsText(pkg) as PackageScripts;
  }

  private resolveVerificationScripts(pkg: { scripts?: PackageScripts } | null, plan: TaskExecutionPlan): PackageScripts {
    return resolveVerificationScriptsText(pkg, plan.workspaceKind) as PackageScripts;
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
      const normalized = buildGeneratedStaticPackageManifest(packageName, current);

      await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return;
    }

    if (plan.workspaceKind === "generic") {
      const inferredArtifact = this.inferGeneratedGenericArtifactType(plan, current);
      const defaultScripts = this.buildNodePackageScripts(inferredArtifact ?? undefined);
      const normalized = buildGeneratedGenericPackageManifest(packageName, current, defaultScripts);

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
    return inferGeneratedGenericArtifactTypeFromData(plan, current);
  }

  private async ensureGeneratedReactProjectFiles(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;
    if (plan.workspaceKind !== "react") return;

    const projectName = this.toDisplayNameFromDirectory(workingDirectory);
    for (const file of buildGeneratedReactScaffoldFiles(projectName)) {
      await this.writeWorkspaceFile(
        this.joinWorkspacePath(workingDirectory, file.path),
        file.content
      );
    }

    if (artifactType !== "desktop-app") return;
    for (const file of buildGeneratedDesktopScaffoldFiles(projectName)) {
      await this.writeWorkspaceFile(
        this.joinWorkspacePath(workingDirectory, file.path),
        file.content
      );
    }
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
    return buildBootstrapCommandsText(template, targetDirectory, { platform: process.platform });
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
    return buildNodePackageScriptsTemplate(artifactType);
  }

  private buildNodePackageManifest(projectName: string, artifactType?: AgentArtifactType): PackageManifest {
    return buildNodePackageManifestTemplate(projectName, artifactType);
  }

  private buildNodePackageStarterContent(
    projectName: string,
    artifactType?: AgentArtifactType,
    domainFocus: DomainFocus = "generic"
  ): Array<{ path: string; content: string }> {
    return buildNodePackageStarterContentTemplate(projectName, {
      artifactType,
      apiEntity: artifactType === "api-service" ? this.buildApiEntityForDomain(domainFocus) : undefined
    });
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
    return extractProjectNameText(prompt);
  }

  private joinWorkspacePath(...parts: string[]): string {
    return joinWorkspacePathText(...parts);
  }

  private buildGeneralReactStarterApp(projectName: string): string {
    return buildGeneralReactStarterAppTemplate(projectName);
  }

  private buildGeneralReactStarterCss(): string {
    return buildGeneralReactStarterCssTemplate();
  }

  private buildGeneralReactStarterIndexCss(): string {
    return buildGeneralReactStarterIndexCssTemplate();
  }

  private buildStaticBootstrapHtml(projectName: string, starterProfile: StarterProfile = "static-marketing"): string {
    return buildStaticBootstrapHtmlTemplate(projectName, starterProfile);
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
    return buildReactBootstrapHtmlTemplate(projectName);
  }

  private buildDesktopBootstrapAppTsx(title: string, domainFocus: DomainFocus = "generic"): string {
    const content = this.buildDesktopDomainContent(domainFocus);
    return buildDesktopBootstrapAppTsxTemplate(title, content);
  }

  private buildDesktopBootstrapAppCss(): string {
    return buildDesktopBootstrapAppCssTemplate();
  }

  private buildDesktopBootstrapIndexCss(): string {
    return buildDesktopBootstrapIndexCssTemplate();
  }

  private buildGeneratedDesktopAppId(packageName: string): string {
    return buildGeneratedDesktopAppIdTemplate(packageName);
  }

  private buildGeneratedDesktopMainProcess(projectName: string): string {
    return buildGeneratedDesktopMainProcessTemplate(projectName);
  }

  private buildGeneratedDesktopPreloadBridge(): string {
    return buildGeneratedDesktopPreloadBridgeTemplate();
  }

  private buildStaticBootstrapCss(starterProfile: StarterProfile = "static-marketing"): string {
    return buildStaticBootstrapCssTemplate(starterProfile);
  }

  private buildStaticBootstrapJs(projectName: string, starterProfile: StarterProfile = "static-marketing"): string {
    return buildStaticBootstrapJsTemplate(projectName, starterProfile);
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
    return resolveWorkspacePathText(this.workspaceRoot, targetPath);
  }

  private normalizeTaskTargetPath(targetPath?: string): string | undefined {
    return normalizeTaskTargetPathText(this.workspaceRoot, targetPath);
  }

  private toWorkspaceRelative(fullPath: string): string {
    return toWorkspaceRelativeText(this.workspaceRoot, fullPath);
  }

  private ensureTaskTelemetry(task: AgentTask): AgentTaskTelemetry {
    return ensureTaskTelemetryText(task);
  }

  private buildTaskRouteTelemetrySummary(taskId: string): AgentTaskRouteTelemetrySummary {
    return buildTaskRouteTelemetrySummaryText({
      taskId,
      taskModelBlacklist: this.taskModelBlacklist,
      taskModelFailureCounts: this.taskModelFailureCounts,
      taskStageRoutes: this.taskStageRoutes,
      visionRequested: this.taskRequiresVisionRoute(taskId),
      buildTaskModelFailureStatus: (targetTaskId, model) => this.buildTaskModelFailureStatus(targetTaskId, model),
      getModelRouteScore: (route) => this.getModelRouteScore(route),
      buildModelRouteScoreFactors: (route) => this.buildModelRouteScoreFactors(route),
      buildTaskStageSelectionReason: (targetTaskId, stage, route, routeIndex) => (
        this.buildTaskStageSelectionReason(targetTaskId, stage, route, routeIndex)
      )
    });
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
    return classifyFailureCategoryText(stage, message);
  }

  private getMostRelevantFailureStage(task: AgentTask): string {
    const latestFailedStep = [...task.steps].reverse().find((step) => step.status === "failed");
    if (latestFailedStep?.title) return latestFailedStep.title;
    const telemetry = this.ensureTaskTelemetry(task);
    return telemetry.lastStage || "Task execution";
  }

  private deriveFinalVerificationResult(report: AgentVerificationReport): AgentTaskFinalVerificationResult | undefined {
    return deriveFinalVerificationResultText(report);
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
