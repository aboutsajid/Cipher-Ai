import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
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
  AgentTaskDoDGateId,
  AgentTaskDoDGateOutcome,
  AgentTaskModelAttempt,
  AgentTaskPlanPreview,
  AgentTaskOutput,
  AgentTaskRunBudget,
  AgentTaskRunMode,
  AgentTaskRunBudgetUsage,
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
  listStoredSnapshotEntries
} from "./snapshotStore";
import {
  buildCommandFailureMessage as buildCommandFailureMessageText,
  buildCompletedTaskSummary as buildCompletedTaskSummaryText,
  buildRequirementFailureMessage as buildRequirementFailureMessageText
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
  buildElectronBuilderPackagingRequest as buildElectronBuilderPackagingRequestText
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
  buildDesktopDomainContentForFocus
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
import { getRequestedEntryPathAliasGroups as getRequestedEntryPathAliasGroupsText } from "./entryPathAliasGroups";
import { buildRequiredEntryPaths as buildRequiredEntryPathsText } from "./entryFileRequirements";
import {
  getConflictingScaffoldPaths as getConflictingScaffoldPathsText,
  isBuilderRecoveryPrimaryPlan as isBuilderRecoveryPrimaryPlanText,
  isUnexpectedGeneratedAppFile as isUnexpectedGeneratedAppFileText
} from "./heuristicGeneratedScaffoldRecovery";
import {
  detectBuilderMode as detectBuilderModeText,
  isLockedBuilderMode as isLockedBuilderModeText
} from "./heuristicBuilderModeGuards";
import {
  inferArtifactTypeFromPrompt as inferArtifactTypeFromPromptText,
  looksLikeCrudAppPrompt as looksLikeCrudAppPromptText
} from "./heuristicPromptArtifactGuards";
import { classifyArtifactType as classifyArtifactTypeText } from "./artifactTypeClassifier";
import { inferArtifactTypeFromPackage as inferArtifactTypeFromPackageText } from "./packageArtifactType";
import { buildTaskOutput as buildTaskOutputText } from "./taskOutputBuilder";
import {
  allFilesExist as allFilesExistText,
  pathExists as pathExistsText
} from "./workspaceExistenceChecks";
import { detectWorkspaceKind as detectWorkspaceKindText } from "./workspaceKindDetector";
import { resolveWorkspaceKindForPrompt as resolveWorkspaceKindForPromptText } from "./workspaceKindPromptResolver";
import {
  detectLintingTool as detectLintingToolText,
  detectModuleFormat as detectModuleFormatText,
  detectStylingApproach as detectStylingApproachText,
  detectTestingTool as detectTestingToolText,
  detectUiFramework as detectUiFrameworkText
} from "./repositoryConventionDetectors";
import { buildRepositoryContextSummary as buildRepositoryContextSummaryText } from "./repositoryContextSummary";
import {
  describeDomainFocus as describeDomainFocusText,
  describeStarterProfile as describeStarterProfileText,
  inferDomainFocus as inferDomainFocusText,
  inferStarterProfile as inferStarterProfileText
} from "./starterDomainFocusHeuristics";
import {
  buildSpecAcceptanceCriteria as buildSpecAcceptanceCriteriaText,
  buildSpecDeliverables as buildSpecDeliverablesText,
  buildSpecQualityGates as buildSpecQualityGatesText,
  buildSpecRequiredFiles as buildSpecRequiredFilesText,
  buildSpecRequiredScriptGroups as buildSpecRequiredScriptGroupsText
} from "./taskExecutionSpecBuilders";
import { buildTaskExecutionSpec as buildTaskExecutionSpecText } from "./taskExecutionSpecPlanner";
import { buildTaskWorkItems as buildTaskWorkItemsText } from "./taskWorkItemBuilder";
import {
  getPackagingVerificationLabel as getPackagingVerificationLabelText,
  shouldVerifyWindowsPackaging as shouldVerifyWindowsPackagingText
} from "./windowsPackagingVerificationGuards";
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
  build?: {
    productName?: string;
    executableName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
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

interface TaskBudgetUsageState {
  startedAtMs: number;
  commandCount: number;
  repairAttemptCount: number;
  editedFiles: Set<string>;
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
  private readonly taskBudgetUsage = new Map<string, TaskBudgetUsageState>();
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

  private async withWorkspaceFsRetry<T>(operation: () => Promise<T>, attempts = 4, delayMs = 150): Promise<T> {
    return withWorkspaceFsRetryOperation(operation, {
      attempts,
      delayMs,
      isRetriable: isRetriableWorkspaceFsErrorText
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
          score: getModelRouteScoreText(this.modelRouteStats, {
            model,
            baseUrl,
            skipAuth: provider === "local"
          }),
          scoreFactors: buildModelRouteScoreFactorsText(this.modelRouteStats, {
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
    const taskSummary = buildTaskRouteTelemetrySummaryText({
      taskId: normalizedTaskId,
      taskModelBlacklist: this.taskModelBlacklist,
      taskModelFailureCounts: this.taskModelFailureCounts,
      taskStageRoutes: this.taskStageRoutes,
      visionRequested: taskRequiresVisionRouteText(cloneTaskAttachmentsText(this.tasks.get(normalizedTaskId)?.attachments)),
      buildTaskModelFailureStatus: (targetTaskId, model) => {
        const normalizedModel = (model ?? "").trim();
        const count = this.taskModelFailureCounts.get(targetTaskId)?.get(normalizedModel) ?? 0;
        return buildModelFailureStatusText({
          count,
          blacklisted: isTaskModelBlacklistedText(this.taskModelBlacklist, targetTaskId, normalizedModel),
          hardFailureThreshold: AGENT_MODEL_BLACKLIST_THRESHOLD,
          transientFailureThreshold: AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD
        });
      },
      getModelRouteScore: (route) => getModelRouteScoreText(this.modelRouteStats, route),
      buildModelRouteScoreFactors: (route) => buildModelRouteScoreFactorsText(this.modelRouteStats, route),
      buildTaskStageSelectionReason: (targetTaskId, stage, route, routeIndex) => buildTaskStageSelectionReasonText({
        routingStage: inferRoutingStageText(stage),
        route,
        routeIndex,
        requiresVision: taskRequiresVisionRouteText(cloneTaskAttachmentsText(this.tasks.get(targetTaskId)?.attachments))
      })
    });

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

  private normalizeTaskRunBudget(budget?: AgentTaskRunBudget): AgentTaskRunBudget | undefined {
    if (!budget) return undefined;
    const normalized: AgentTaskRunBudget = {};
    const maxRuntimeMs = Number(budget.maxRuntimeMs);
    if (Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0) {
      normalized.maxRuntimeMs = Math.min(8 * 60 * 60 * 1000, Math.max(30_000, Math.floor(maxRuntimeMs)));
    }
    const maxCommands = Number(budget.maxCommands);
    if (Number.isFinite(maxCommands) && maxCommands > 0) {
      normalized.maxCommands = Math.min(300, Math.max(1, Math.floor(maxCommands)));
    }
    const maxFileEdits = Number(budget.maxFileEdits);
    if (Number.isFinite(maxFileEdits) && maxFileEdits > 0) {
      normalized.maxFileEdits = Math.min(500, Math.max(1, Math.floor(maxFileEdits)));
    }
    const maxRepairAttempts = Number(budget.maxRepairAttempts);
    if (Number.isFinite(maxRepairAttempts) && maxRepairAttempts > 0) {
      normalized.maxRepairAttempts = Math.min(100, Math.max(1, Math.floor(maxRepairAttempts)));
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private buildBudgetUsageSnapshot(state: TaskBudgetUsageState): AgentTaskRunBudgetUsage {
    return {
      runtimeMs: Math.max(0, Date.now() - state.startedAtMs),
      commands: state.commandCount,
      fileEdits: state.editedFiles.size,
      repairAttempts: state.repairAttemptCount
    };
  }

  private syncTaskBudgetUsage(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) {
      task.budgetUsage = undefined;
      return;
    }
    task.budgetUsage = this.buildBudgetUsageSnapshot(usage);
  }

  private initializeTaskBudgetUsage(taskId: string, budget?: AgentTaskRunBudget): void {
    if (!budget) {
      this.taskBudgetUsage.delete(taskId);
      return;
    }
    this.taskBudgetUsage.set(taskId, {
      startedAtMs: Date.now(),
      commandCount: 0,
      repairAttemptCount: 0,
      editedFiles: new Set<string>()
    });
    this.syncTaskBudgetUsage(taskId);
  }

  private clearTaskBudgetUsage(taskId: string): void {
    const task = this.tasks.get(taskId);
    const usage = this.taskBudgetUsage.get(taskId);
    if (task && usage) {
      task.budgetUsage = this.buildBudgetUsageSnapshot(usage);
    }
    this.taskBudgetUsage.delete(taskId);
  }

  private enforceTaskRuntimeBudget(taskId: string, context: string): void {
    const task = this.tasks.get(taskId);
    const maxRuntimeMs = task?.budget?.maxRuntimeMs;
    if (!task || !maxRuntimeMs) return;
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) return;
    const runtimeMs = Date.now() - usage.startedAtMs;
    if (runtimeMs <= maxRuntimeMs) {
      this.syncTaskBudgetUsage(taskId);
      return;
    }
    this.syncTaskBudgetUsage(taskId);
    throw new Error(`Run budget exceeded (${context}): runtime limit ${maxRuntimeMs}ms reached.`);
  }

  private consumeTaskCommandBudget(taskId: string, commandLine: string): void {
    const task = this.tasks.get(taskId);
    const maxCommands = task?.budget?.maxCommands;
    if (!task || !maxCommands) return;
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) return;
    usage.commandCount += 1;
    this.syncTaskBudgetUsage(taskId);
    if (usage.commandCount > maxCommands) {
      throw new Error(`Run budget exceeded (command limit ${maxCommands}): ${commandLine}`);
    }
  }

  private consumeTaskRepairAttemptBudget(taskId: string, title: string): void {
    const task = this.tasks.get(taskId);
    const maxRepairAttempts = task?.budget?.maxRepairAttempts;
    if (!task || !maxRepairAttempts) return;
    if (!/\bfix\b/i.test(title)) return;
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) return;
    usage.repairAttemptCount += 1;
    this.syncTaskBudgetUsage(taskId);
    if (usage.repairAttemptCount > maxRepairAttempts) {
      throw new Error(`Run budget exceeded (repair attempts limit ${maxRepairAttempts}) at stage "${title}".`);
    }
  }

  private enforceTaskFileEditBudget(taskId: string, editPaths: string[]): void {
    const task = this.tasks.get(taskId);
    const maxFileEdits = task?.budget?.maxFileEdits;
    if (!task || !maxFileEdits) return;
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) return;
    const projected = new Set(usage.editedFiles);
    for (const path of editPaths) {
      const normalized = (path ?? "").trim();
      if (normalized) projected.add(normalized);
    }
    if (projected.size > maxFileEdits) {
      this.syncTaskBudgetUsage(taskId);
      throw new Error(`Run budget exceeded (file edit limit ${maxFileEdits}).`);
    }
  }

  private trackTaskEditedFiles(taskId: string, editPaths: string[]): void {
    const usage = this.taskBudgetUsage.get(taskId);
    if (!usage) return;
    for (const path of editPaths) {
      const normalized = (path ?? "").trim();
      if (normalized) usage.editedFiles.add(normalized);
    }
    this.syncTaskBudgetUsage(taskId);
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
        this.persistTaskStateNow(Date.now());
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
      this.persistTaskStateNow(Date.now(), taskId || undefined);
      return null;
    }

    return { ...this.lastRestoreState };
  }

  async listSnapshots(): Promise<WorkspaceSnapshot[]> {
    return listStoredSnapshots(this.snapshotRoot);
  }

  private async removeSnapshotDirectory(directoryPath: string): Promise<void> {
    await this.withWorkspaceFsRetry(
      () => rm(directoryPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
    );
  }

  private async pruneStoredSnapshots(options?: { aggressive?: boolean }): Promise<number> {
    const referencedIds = collectReferencedSnapshotIdsFromState(this.tasks.values(), this.lastRestoreState);
    const entries = await listStoredSnapshotEntries(this.snapshotRoot);
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
      message: buildRestoreSuccessMessageText(snapshot),
      snapshotId: snapshot.id,
      snapshotLabel: snapshot.label,
      snapshotKind: snapshot.kind,
      taskId: snapshot.taskId,
      targetPathHint: snapshot.targetPathHint
    };
    this.lastRestoreState = result;
    this.persistTaskStateNow(Date.now(), snapshot.taskId, "restore");
    return result;
  }

  async previewTaskPlan(
    prompt: string,
    attachments: AttachmentPayload[] = [],
    targetPath?: string,
    runMode: AgentTaskRunMode = "build-product",
    budget?: AgentTaskRunBudget
  ): Promise<AgentTaskPlanPreview> {
    const normalizedPrompt = (prompt ?? "").trim();
    if (!normalizedPrompt) {
      throw new Error("Agent prompt is required.");
    }
    const normalizedRunMode: AgentTaskRunMode = runMode === "standard" ? "standard" : "build-product";
    const normalizedTargetPath = normalizeTaskTargetPathText(this.workspaceRoot, targetPath);
    const normalizedAttachments = normalizeAttachments(attachments);
    const workingDirectory = normalizedTargetPath
      ?? this.extractGeneratedAppDirectoryFromPrompt(normalizedPrompt)
      ?? ".";
    const plan = await this.buildExecutionPlan(normalizedPrompt, workingDirectory, normalizedAttachments);
    const packageManifest = await this.tryReadPackageJson(plan.workingDirectory);
    const scripts = resolveVerificationScriptsText(packageManifest, plan.workspaceKind) as PackageScripts;
    const normalizedBudget = this.normalizeTaskRunBudget(budget);
    const budgetNotes: string[] = [];
    if (normalizedBudget?.maxRuntimeMs) budgetNotes.push(`runtime<=${normalizedBudget.maxRuntimeMs}ms`);
    if (normalizedBudget?.maxCommands) budgetNotes.push(`commands<=${normalizedBudget.maxCommands}`);
    if (normalizedBudget?.maxFileEdits) budgetNotes.push(`file-edits<=${normalizedBudget.maxFileEdits}`);
    if (normalizedBudget?.maxRepairAttempts) budgetNotes.push(`repair-attempts<=${normalizedBudget.maxRepairAttempts}`);
    const artifactType = classifyArtifactTypeText(normalizedPrompt, {
      previewReady: false,
      workspaceKind: plan.workspaceKind,
      promptArtifact: inferArtifactTypeFromPromptText(normalizedPrompt.toLowerCase()),
      packageArtifact: inferArtifactTypeFromPackageText(packageManifest ?? null)
    });
    return {
      prompt: normalizedPrompt,
      runMode: normalizedRunMode,
      targetPath: normalizedTargetPath || undefined,
      workingDirectory: plan.workingDirectory,
      artifactType,
      summary: budgetNotes.length > 0
        ? `${plan.summary} Active budgets: ${budgetNotes.join(", ")}.`
        : plan.summary,
      stages: normalizedRunMode === "build-product"
        ? [
          "Plan task execution",
          "Implement",
          "Verify build and quality scripts",
          "Repair verification failures (if needed)",
          "Package Windows installer",
          "Run Windows installer smoke",
          "Approve generated output"
        ]
        : [
          "Plan task execution",
          "Implement",
          "Verify build and quality scripts",
          "Repair verification failures (if needed)",
          "Approve generated output"
        ],
      workItems: plan.workItems.map((item) => item.title),
      candidateFiles: [...plan.candidateFiles],
      qualityGates: [...(plan.spec?.qualityGates ?? [])],
      requiredScripts: Object.keys(scripts)
    };
  }

  async startTask(
    prompt: string,
    attachments: AttachmentPayload[] = [],
    targetPath?: string,
    runMode: AgentTaskRunMode = "build-product",
    budget?: AgentTaskRunBudget
  ): Promise<AgentTask> {
    ensureNoRunningTaskGuard(this.activeTaskId, this.tasks);

    const taskId = `agent_${randomUUID()}`;
    const now = new Date().toISOString();
    const normalizedRunMode: AgentTaskRunMode = runMode === "standard" ? "standard" : "build-product";
    const normalizedAttachments = normalizeAttachments(attachments);
    const normalizedTargetPath = normalizeTaskTargetPathText(this.workspaceRoot, targetPath);
    const initialArtifactType = classifyArtifactTypeText((prompt ?? "").trim(), {
      previewReady: false,
      workspaceKind: null,
      promptArtifact: inferArtifactTypeFromPromptText(((prompt ?? "").trim().toLowerCase())),
      packageArtifact: inferArtifactTypeFromPackageText(null)
    });
    const normalizedBudget = this.normalizeTaskRunBudget(budget);
    const task: AgentTask = {
      id: taskId,
      prompt: (prompt ?? "").trim(),
      attachments: normalizedAttachments,
      runMode: normalizedRunMode,
      budget: normalizedBudget,
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
        runMode: normalizedRunMode,
        fallbackUsed: false,
        dodGateOutcomes: [],
        modelAttempts: []
      }
    };
    const snapshot = await this.createSnapshot(`Before agent task: ${task.prompt.slice(0, 80)}`, taskId, {
      kind: "before-task",
      targetPathHint: normalizedTargetPath ?? this.extractGeneratedAppDirectoryFromPrompt(task.prompt) ?? undefined
    });
    task.rollbackSnapshotId = snapshot.id;

    this.tasks.set(taskId, task);
    this.initializeTaskBudgetUsage(taskId, normalizedBudget);
    this.taskLogs.set(taskId, []);
    clearTaskRouteStateText(taskId, this.taskModelFailureCounts, this.taskModelBlacklist, this.taskStageRoutes);
    this.activeTaskId = taskId;
    this.lastRestoreState = null;
    this.appendLog(taskId, `Agent task started. Rollback snapshot: ${snapshot.id}`);
    if (normalizedAttachments.length > 0) {
      this.appendLog(taskId, `Task attachments: ${normalizedAttachments.map((attachment) => attachment.name).join(", ")}`);
    }
    this.persistTaskStateNow(Date.now(), taskId);

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

    ensureNoRunningTaskGuard(this.activeTaskId, this.tasks);

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

    const nextPrompt = buildRestartPromptText(task, mode);
    const restarted = await this.startTask(
      nextPrompt,
      task.attachments ?? [],
      task.targetPath,
      task.runMode ?? "build-product",
      task.budget
    );
    this.appendLog(restarted.id, `Restarted from ${task.id} using ${describeRestartModeText(mode)}.`);
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
      this.persistTaskStateNow(Date.now(), task.id);
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
    const root = resolveWorkspacePathText(this.workspaceRoot, targetPath);
    return this.scanEntries(root, Math.max(0, Math.min(depth, 6)));
  }

  async readWorkspaceFile(targetPath: string): Promise<WorkspaceFileReadResult> {
    const fullPath = resolveWorkspacePathText(this.workspaceRoot, targetPath);
    const fileInfo = await stat(fullPath);
    if (!fileInfo.isFile()) {
      throw new Error("Target path is not a file.");
    }
    if (fileInfo.size > MAX_FILE_READ_BYTES) {
      throw new Error(`File is too large to read in-app (${fileInfo.size} bytes).`);
    }

    const content = await readFile(fullPath, "utf8");
    return {
      path: toWorkspaceRelativeText(this.workspaceRoot, fullPath),
      content,
      size: fileInfo.size
    };
  }

  async writeWorkspaceFile(targetPath: string, content: string): Promise<{ ok: boolean; path: string; size: number }> {
    const fullPath = resolveWorkspacePathText(this.workspaceRoot, targetPath);
    const contentBytes = Buffer.byteLength(content, "utf8");
    if (contentBytes > MAX_FILE_WRITE_BYTES) {
      throw new Error(`File is too large to write in-app (${contentBytes} bytes).`);
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
    const info = await stat(fullPath);
    return {
      ok: true,
      path: toWorkspaceRelativeText(this.workspaceRoot, fullPath),
      size: info.size
    };
  }

  async searchWorkspace(pattern: string, targetPath = "."): Promise<WorkspaceFileSearchResult[]> {
    const normalizedPattern = (pattern ?? "").trim().toLowerCase();
    if (!normalizedPattern) return [];

    const root = resolveWorkspacePathText(this.workspaceRoot, targetPath);
    const files = await this.scanEntries(root, 6);
    const results: WorkspaceFileSearchResult[] = [];

    for (const entry of files) {
      if (entry.type !== "file") continue;
      if (!TEXT_FILE_EXTENSIONS.has(extname(entry.path).toLowerCase())) continue;
      const fullPath = resolveWorkspacePathText(this.workspaceRoot, entry.path);
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
    const runMode: AgentTaskRunMode = task.runMode === "standard" ? "standard" : "build-product";
    task.runMode = runMode;
    ensureTaskTelemetryText(task).runMode = runMode;

    try {
      const inspection = await this.inspectTaskWorkspace(task);
      const workingDirectory = await this.resolveTaskWorkingDirectory(task, inspection);
      const plan = await this.planTaskExecutionPhase(task, workingDirectory, inspection);

      await this.executeImplementationPhase(task, plan);

      const { verificationGate, verificationChecks } = await this.executeVerificationPhase(
        task,
        plan,
        inspection.packageManifest ?? null
      );

      await this.executePackagingPhases(
        task,
        plan,
        runMode,
        verificationGate.artifactType,
        verificationChecks,
        inspection.packageName
      );

      await this.executeApprovalPhase(task, plan);
      await this.finalizeCompletedTask(task, runMode);
    } catch (err) {
      this.handleTaskRunFailure(task, err);
    } finally {
      this.cleanupTaskRunState(task);
    }
  }

  private async inspectTaskWorkspace(task: AgentTask): Promise<WorkspaceInspectionResult> {
    return this.runStep(task, "Inspect workspace", async () => {
      const packageJson = await this.tryReadPackageJson();
      const scripts = extractScriptsText(packageJson) as PackageScripts;
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
  }

  private async resolveTaskWorkingDirectory(task: AgentTask, inspection: WorkspaceInspectionResult): Promise<string> {
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
    return workingDirectory;
  }

  private async planTaskExecutionPhase(
    task: AgentTask,
    workingDirectory: string,
    inspection: WorkspaceInspectionResult
  ): Promise<TaskExecutionPlan> {
    const planResult = await this.runStep(task, "Plan task execution", async () => {
      const executionPlan = await this.buildExecutionPlan(task.prompt, workingDirectory, task.attachments ?? []);
      const packageManifest = await this.tryReadPackageJson(executionPlan.workingDirectory);
      const scripts = resolveVerificationScriptsText(packageManifest, executionPlan.workspaceKind) as PackageScripts;
      task.artifactType = classifyArtifactTypeText(task.prompt, {
        previewReady: false,
        workspaceKind: executionPlan.workspaceKind,
        promptArtifact: inferArtifactTypeFromPromptText((task.prompt ?? "").trim().toLowerCase()),
        packageArtifact: inferArtifactTypeFromPackageText(packageManifest ?? inspection.packageManifest ?? null)
      });
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
    return planResult.plan;
  }

  private async executeImplementationPhase(task: AgentTask, plan: TaskExecutionPlan): Promise<void> {
    if (!this.isVerificationOnlyPrompt(task.prompt)) {
      const appliedFiles = new Set<string>();
      for (const [index, workItem] of plan.workItems.entries()) {
        await this.runStep(task, `Implement: ${workItem.title}`, async () => {
          let implementation: FixResponse;
          const preferHeuristicImplementation = isLockedBuilderModeText(plan.builderMode)
            || isSimpleDesktopShellPromptText(task.prompt, plan.workspaceKind)
            || isSimpleNotesAppPromptText(task.prompt, {
              builderMode: plan.builderMode,
              workspaceKind: plan.workspaceKind,
              workingDirectory: plan.workingDirectory
            })
            || isSimpleGeneratedPackagePromptText(
              task.prompt,
              {
                workspaceKind: plan.workspaceKind,
                workingDirectory: plan.workingDirectory
              },
              inferArtifactTypeFromPromptText((task.prompt ?? "").trim().toLowerCase())
            );
          if (preferHeuristicImplementation) {
            const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan);
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
              implementation = await this.requestTaskImplementation(task.id, workItem.instruction, plan, workItem);
            } catch (err) {
              const message = err instanceof Error ? err.message : "Unknown implementation failure.";
              this.appendLog(task.id, `Model-based implementation failed for "${workItem.title}": ${message}`);
              const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan);
              if (!heuristicImplementation || heuristicImplementation.edits.length === 0) {
                throw err;
              }
              this.appendLog(task.id, `Using heuristic implementation fallback: ${heuristicImplementation.summary}`);
              implementation = {
                summary: heuristicImplementation.summary,
                edits: heuristicImplementation.edits
              };
            }
            implementation.edits = this.inspectStructuredEdits(implementation.edits, plan, workItem).acceptedEdits;
            if (!this.hasUsefulImplementation(implementation, workItem)) {
              const reason = implementation.summary || "Model returned no useful file changes.";
              this.appendLog(task.id, `Model-based implementation failed for "${workItem.title}": ${reason}`);
              const heuristicImplementation = await this.tryHeuristicImplementation(task.id, `${task.prompt}\n${workItem.instruction}`, plan);
              if (!heuristicImplementation || heuristicImplementation.edits.length === 0) {
                return { summary: `No useful implementation produced for ${workItem.title}.` };
              }
              this.appendLog(task.id, `Using heuristic implementation fallback: ${heuristicImplementation.summary}`);
              implementation = {
                summary: heuristicImplementation.summary,
                edits: this.inspectStructuredEdits(heuristicImplementation.edits, plan, workItem).acceptedEdits
              };
            }
          }
          implementation.edits = this.inspectStructuredEdits(implementation.edits, plan, workItem).acceptedEdits;
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
        ? `Implementation finished across ${plan.workItems.length} work item(s). Files changed: ${[...appliedFiles].join(", ")}.`
        : `Implementation finished across ${plan.workItems.length} work item(s) with no file changes.`;
      this.appendLog(task.id, implementationSummary);
      task.steps.push({
        id: `step_${randomUUID()}`,
        title: "Implement requested changes",
        status: "completed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: implementationSummary
      });
      this.recordDoDGateOutcome(task, "implement", "passed", implementationSummary);
      return;
    }

    this.appendLog(task.id, "Skipping implementation step for verification-only prompt.");
    const implementationSkipSummary = "Implementation skipped for verification-only prompt.";
    task.steps.push({
      id: `step_${randomUUID()}`,
      title: "Implement requested changes",
      status: "completed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: implementationSkipSummary
    });
    this.recordDoDGateOutcome(task, "implement", "skipped", implementationSkipSummary);
  }

  private async executeVerificationPhase(
    task: AgentTask,
    plan: TaskExecutionPlan,
    inspectionPackageManifest: PackageManifest | null
  ): Promise<{
    verificationGate: { summary: string; artifactType: AgentArtifactType };
    verificationChecks: AgentVerificationCheck[];
  }> {
    let verificationChecks: AgentVerificationCheck[] = [];
    let verificationRepairsApplied = false;
    const verificationGate = await this.runDeferredStep(task, "Verify build and quality scripts", async () => {
      await this.prepareGeneratedWorkspace(task.id, plan);
      const packageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const verificationArtifactType = task.artifactType ?? classifyArtifactTypeText(task.prompt, {
        previewReady: false,
        workspaceKind: plan.workspaceKind,
        promptArtifact: inferArtifactTypeFromPromptText((task.prompt ?? "").trim().toLowerCase()),
        packageArtifact: inferArtifactTypeFromPackageText(packageJson ?? inspectionPackageManifest)
      });
      task.artifactType = verificationArtifactType;
      const scripts = resolveVerificationScriptsText(packageJson, plan.workspaceKind) as PackageScripts;
      const buildLabel = getBuildVerificationLabelText(verificationArtifactType);
      const lintLabel = getLintVerificationLabelText(verificationArtifactType);
      const testLabel = getTestVerificationLabelText(verificationArtifactType);
      const runtimeLabel = getLaunchVerificationLabelText(verificationArtifactType);
      const runtimeScript = resolveRuntimeVerificationScriptText(scripts);
      const outputArtifactType = task.artifactType ?? classifyArtifactTypeText(task.prompt, {
        previewReady: Boolean(task.verification?.previewReady),
        workspaceKind: plan.workspaceKind,
        promptArtifact: inferArtifactTypeFromPromptText((task.prompt ?? "").trim().toLowerCase()),
        packageArtifact: inferArtifactTypeFromPackageText(packageJson ?? inspectionPackageManifest)
      });
      task.output = this.buildTaskOutput(outputArtifactType, {
        packageName: packageJson?.name,
        scripts,
        workingDirectory: plan.workingDirectory,
        verification: task.verification
      }, task.prompt);
      let checks: AgentVerificationCheck[] = [];

      await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);

      const entryCheck = await this.verifyExpectedEntryFiles(plan, verificationArtifactType);
      checks.push(entryCheck);
      this.updateTaskVerification(task, checks);

      if (scripts.build) {
        let build = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
        if (!build.ok) {
          verificationRepairsApplied = true;
          build = await this.tryAutoFixBuild(task, build, plan);
        }
        checks.push({
          id: "build",
          label: buildLabel,
          status: build.ok ? "passed" : "failed",
          details: build.ok ? `${buildLabel} completed successfully.` : `${buildLabel} still failing after fix attempts.`
        });
        this.updateTaskVerification(task, checks);
        if (!build.ok) {
          throw new Error(buildCommandFailureMessageText(buildLabel, build, "still failing after agent fix attempts"));
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
        let lint = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
        if (!lint.ok) {
          verificationRepairsApplied = true;
          lint = await this.tryAutoFixLint(task, lint, plan);
        }
        checks.push({
          id: "lint",
          label: lintLabel,
          status: lint.ok ? "passed" : "failed",
          details: lint.ok ? `${lintLabel} completed successfully.` : `${lintLabel} still failing after fix attempts.`
        });
        this.updateTaskVerification(task, checks);
        if (!lint.ok) {
          throw new Error(buildCommandFailureMessageText(lintLabel, lint, "still failing after agent fix attempts"));
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
        const test = await this.executeCommand(task.id, buildNpmScriptRequestText("test", 120_000, plan.workingDirectory));
        checks.push({
          id: "test",
          label: testLabel,
          status: test.ok ? "passed" : "failed",
          details: test.ok ? `${testLabel} completed successfully.` : `${testLabel} reported failures.`
        });
        this.updateTaskVerification(task, checks);
        if (!test.ok) {
          throw new Error(buildCommandFailureMessageText(testLabel, test, "reported failures"));
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

      if (runtimeScript && shouldVerifyLaunchText(verificationArtifactType)) {
        let launch = await this.executeArtifactRuntimeVerification(task.id, runtimeScript, verificationArtifactType, plan, scripts);
        if (!launch.ok) {
          verificationRepairsApplied = true;
          launch = await this.tryAutoFixLaunch(task, launch, plan, verificationArtifactType, runtimeLabel);
        }
        checks.push({
          id: "launch",
          label: runtimeLabel,
          status: launch.ok ? "passed" : "failed",
          details: buildRuntimeVerificationDetailsText(verificationArtifactType, runtimeScript, launch.ok)
        });
        this.updateTaskVerification(task, checks);
        if (!launch.ok) {
          throw new Error(buildCommandFailureMessageText(runtimeLabel, launch, "still failing after agent fix attempts"));
        }
        if (shouldVerifyServedWebPageText(verificationArtifactType)) {
          const servedPage = await this.verifyServedWebPage(plan, scripts, runtimeScript, launch);
          checks.push(servedPage);
          this.updateTaskVerification(task, checks);
          if (servedPage.status === "failed") {
            throw new Error(servedPage.details || "Served web page verification failed.");
          }
        }
        if (shouldVerifyRuntimeDepthText(verificationArtifactType)) {
          const runtimeDepth = await this.verifyRuntimeDepth(plan, verificationArtifactType, scripts, runtimeScript, launch);
          if (runtimeDepth) {
            checks.push(runtimeDepth);
            this.updateTaskVerification(task, checks);
            if (runtimeDepth.status === "failed") {
              throw new Error(runtimeDepth.details || "Runtime depth verification failed.");
            }
          }
        }
      } else if (shouldVerifyLaunchText(verificationArtifactType)) {
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

      if (shouldVerifyPreviewHealthText(verificationArtifactType)) {
        let previewHealth = await this.verifyPreviewHealth(plan, scripts);
        if (previewHealth.status === "failed") {
          verificationRepairsApplied = true;
          const repaired = await this.tryAutoFixPreviewHealth(task, previewHealth, plan, scripts, buildLabel);
          if (repaired) {
            previewHealth = await this.verifyPreviewHealth(plan, scripts);
          }
        }
        checks.push(previewHealth);
        this.updateTaskVerification(task, checks);
        if (previewHealth.status === "failed") {
          throw new Error(previewHealth.details || "Preview health verification failed.");
        }
      }

      if (shouldVerifyUiSmokeText(verificationArtifactType)) {
        let uiSmoke = await this.verifyBasicUiSmoke(plan);
        if (uiSmoke.status === "failed") {
          verificationRepairsApplied = true;
          const repaired = await this.tryAutoFixUiSmoke(task, uiSmoke, plan, scripts, buildLabel, lintLabel, testLabel);
          if (repaired) {
            uiSmoke = await this.verifyBasicUiSmoke(plan);
          }
        }
        checks.push(uiSmoke);
        this.updateTaskVerification(task, checks);
        if (uiSmoke.status === "failed") {
          throw new Error(uiSmoke.details || "Basic UI smoke verification failed.");
        }
      }

      const specChecks = await this.verifyExecutionSpec(plan, verificationArtifactType, scripts);
      checks.push(...specChecks);
      this.updateTaskVerification(task, checks);
      if (specChecks.some((check) => check.status === "failed")) {
        verificationRepairsApplied = true;
        const repaired = await this.tryAutoFixExecutionSpec(task, plan, verificationArtifactType, specChecks);
        if (repaired) {
          await this.rerunVerificationAfterContentRepair(task, plan, checks, verificationArtifactType, {
            buildLabel,
            lintLabel,
            testLabel,
            runtimeLabel
          });
          checks = checks.filter((check) => check.id !== "spec-deliverables" && check.id !== "spec-hygiene");
          const rerunSpecChecks = await this.verifyExecutionSpec(
            plan,
            verificationArtifactType,
            resolveVerificationScriptsText(
              await this.tryReadPackageJson(plan.workingDirectory),
              plan.workspaceKind
            ) as PackageScripts
          );
          checks.push(...rerunSpecChecks);
          this.updateTaskVerification(task, checks);
          if (rerunSpecChecks.some((check) => check.status === "failed")) {
            throw new Error(rerunSpecChecks.find((check) => check.status === "failed")?.details || "Execution spec verification failed after repair.");
          }
        } else {
          throw new Error(specChecks.find((check) => check.status === "failed")?.details || "Execution spec verification failed.");
        }
      }

      let requirementChecks = await this.verifyPromptRequirements(plan);
      checks.push(...requirementChecks);
      this.updateTaskVerification(task, checks);
      if (requirementChecks.some((check) => check.status === "failed")) {
        verificationRepairsApplied = true;
        const repaired = await this.tryAutoFixPromptRequirements(task, plan, requirementChecks);
        if (repaired) {
          await this.rerunVerificationAfterContentRepair(task, plan, checks, verificationArtifactType, {
            buildLabel,
            lintLabel,
            testLabel,
            runtimeLabel
          });

          requirementChecks = await this.verifyPromptRequirements(plan);
          checks = checks.filter((check) => !check.id.startsWith("req-") && check.id !== "requirements");
          checks.push(...requirementChecks);
          this.updateTaskVerification(task, checks);
        }
      }
      if (requirementChecks.some((check) => check.status === "failed")) {
        throw new Error(buildRequirementFailureMessageText(requirementChecks));
      }

      const finalEntryCheck = await this.verifyExpectedEntryFiles(plan, verificationArtifactType);
      upsertVerificationCheckGuard(checks, finalEntryCheck);
      this.updateTaskVerification(task, checks);
      if (finalEntryCheck.status === "failed") {
        throw new Error(finalEntryCheck.details || "Required entry files are still missing.");
      }

      const finalPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const finalScripts = resolveVerificationScriptsText(finalPackageJson, plan.workspaceKind) as PackageScripts;
      const report = this.buildVerificationReport(checks, verificationArtifactType);
      task.verification = report;
      task.artifactType = classifyArtifactTypeText(task.prompt, {
        previewReady: Boolean(report.previewReady),
        workspaceKind: plan.workspaceKind,
        promptArtifact: inferArtifactTypeFromPromptText((task.prompt ?? "").trim().toLowerCase()),
        packageArtifact: inferArtifactTypeFromPackageText(finalPackageJson ?? packageJson ?? inspectionPackageManifest)
      });
      task.output = this.buildTaskOutput(task.artifactType, {
        packageName: finalPackageJson?.name ?? packageJson?.name,
        scripts: finalScripts,
        workingDirectory: plan.workingDirectory,
        verification: report
      }, task.prompt);
      verificationChecks = checks.map((check) => ({ ...check }));
      return {
        summary: `Verification finished: ${report.summary}.`,
        artifactType: verificationArtifactType
      };
    });

    await this.runStep(task, "Repair verification failures", async () => {
      return {
        summary: verificationRepairsApplied
          ? "Verification repairs were applied and all checks revalidated."
          : "No verification repairs were required."
      };
    });

    return { verificationGate, verificationChecks };
  }

  private async executePackagingPhases(
    task: AgentTask,
    plan: TaskExecutionPlan,
    runMode: AgentTaskRunMode,
    verificationArtifactType: AgentArtifactType,
    verificationChecks: AgentVerificationCheck[],
    inspectionPackageName?: string
  ): Promise<void> {
    const syncTaskOutputFromVerification = async (): Promise<void> => {
      const latestPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const latestScripts = resolveVerificationScriptsText(latestPackageJson, plan.workspaceKind) as PackageScripts;
      task.output = this.buildTaskOutput(task.artifactType ?? verificationArtifactType, {
        packageName: latestPackageJson?.name ?? inspectionPackageName,
        scripts: latestScripts,
        workingDirectory: plan.workingDirectory,
        verification: task.verification
      }, task.prompt);
    };

    let packagedInstallerPath: string | null = null;
    const packagingGate = await this.runStep(task, "Package Windows installer", async () => {
      if (runMode !== "build-product") {
        return { summary: "Windows packaging gate skipped in standard mode." };
      }
      const packagingRequired = shouldVerifyWindowsPackagingText(verificationArtifactType, plan.workingDirectory);
      if (!packagingRequired) {
        return { summary: "Windows packaging gate skipped for this artifact and platform." };
      }

      const latestPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const latestScripts = resolveVerificationScriptsText(latestPackageJson, plan.workspaceKind) as PackageScripts;
      const packaging = await this.verifyWindowsDesktopPackaging(task.id, plan, latestScripts);
      upsertVerificationCheckGuard(verificationChecks, packaging);
      this.updateTaskVerification(task, verificationChecks);
      await syncTaskOutputFromVerification();

      if (packaging.status === "failed") {
        throw new Error(packaging.details || "Windows packaging verification failed.");
      }

      packagedInstallerPath = await this.findGeneratedDesktopInstaller(plan.workingDirectory);
      if (!packagedInstallerPath) {
        throw new Error("Windows packaging finished without producing an .exe installer.");
      }
      return { summary: packaging.details };
    });
    if (/skipped/i.test(packagingGate.summary)) {
      this.recordDoDGateOutcome(task, "package", "skipped", packagingGate.summary);
    }

    const installerSmokeGate = await this.runStep(task, "Run Windows installer smoke", async () => {
      if (runMode !== "build-product") {
        return { summary: "Installer smoke gate skipped in standard mode." };
      }
      const packagingRequired = shouldVerifyWindowsPackagingText(verificationArtifactType, plan.workingDirectory);
      if (!packagingRequired) {
        return { summary: "Installer smoke gate skipped for this artifact and platform." };
      }

      const latestPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const smoke = await this.verifyWindowsInstallerSmoke(
        task.id,
        plan,
        packagedInstallerPath,
        latestPackageJson
      );
      upsertVerificationCheckGuard(verificationChecks, smoke);
      this.updateTaskVerification(task, verificationChecks);
      await syncTaskOutputFromVerification();

      if (smoke.status === "failed") {
        throw new Error(smoke.details || "Windows installer smoke failed.");
      }
      return {
        summary: smoke.status === "passed"
          ? smoke.details
          : `Windows installer smoke skipped: ${smoke.details}`
      };
    });
    if (/skipped/i.test(installerSmokeGate.summary)) {
      this.recordDoDGateOutcome(task, "installer-smoke", "skipped", installerSmokeGate.summary);
    }
  }

  private async executeApprovalPhase(task: AgentTask, plan: TaskExecutionPlan): Promise<void> {
    await this.runStep(task, "Approve generated output", async () => {
      const finalPackageJson = await this.tryReadPackageJson(plan.workingDirectory);
      const finalScripts = resolveVerificationScriptsText(finalPackageJson, plan.workspaceKind) as PackageScripts;
      const approval = buildTaskApprovalGuard(
        task,
        finalPackageJson,
        finalScripts,
        plan.spec.starterProfile === "electron-desktop" || task.artifactType === "desktop-app"
      );
      if (!approval.ok) {
        throw new Error(approval.summary);
      }
      return { summary: approval.summary };
    });
  }

  private async finalizeCompletedTask(task: AgentTask, runMode: AgentTaskRunMode): Promise<void> {
    ensureVerificationRequiredGuard(task, runMode);
    task.status = "completed";
    task.summary = buildCompletedTaskSummaryText(task);
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
    this.persistTaskStateNow(Date.now(), task.id);
  }

  private handleTaskRunFailure(task: AgentTask, err: unknown): void {
    task.status = task.status === "stopped" ? "stopped" : "failed";
    task.summary = err instanceof Error ? err.message : "Agent task failed.";
    task.updatedAt = new Date().toISOString();
    if (task.status === "failed") {
      const latestFailedStep = [...task.steps].reverse().find((step) => step.status === "failed");
      const telemetry = ensureTaskTelemetryText(task);
      const failureStage = latestFailedStep?.title || telemetry.lastStage || "Task execution";
      telemetry.lastStage = failureStage;
      telemetry.failureStage = failureStage;
      telemetry.failureCategory = classifyFailureCategoryText(failureStage, task.summary);
      this.recordDoDGateOutcomeForStage(task, failureStage, "failed", task.summary);
    }
    this.appendLog(task.id, `Agent task failed: ${task.summary}`);
    this.persistTaskStateNow(Date.now(), task.id);
  }

  private cleanupTaskRunState(task: AgentTask): void {
    if (this.activeTaskId === task.id) {
      this.activeTaskId = null;
    }
    this.activeProcesses.delete(task.id);
    this.clearTaskBudgetUsage(task.id);
    clearTaskRouteStateText(task.id, this.taskModelFailureCounts, this.taskModelBlacklist, this.taskStageRoutes);
    this.persistTaskStateNow(Date.now(), task.id);
  }

  private updateTaskVerification(task: AgentTask, checks: AgentVerificationCheck[]): void {
    task.verification = this.buildVerificationReport(checks, task.artifactType);
    const telemetry = ensureTaskTelemetryText(task);
    telemetry.finalVerificationResult = deriveFinalVerificationResultText(task.verification);
    telemetry.verificationSummary = task.verification.summary;
    task.updatedAt = new Date().toISOString();
    this.persistTaskStateNow(Date.now(), task.id);
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

      const scopedEdits = this.inspectStructuredEdits(heuristic.edits, plan).acceptedEdits;
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
      cwd: resolveWorkspacePathText(this.workspaceRoot, plan.workingDirectory)
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

      const scopedEdits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
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
    const scopedEdits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
    if (scopedEdits.length === 0) return false;

    const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 3, scopedEdits);
    if (applied.length === 0) return false;
    await this.prepareGeneratedWorkspace(task.id, plan);

    if (scripts.build) {
      const build = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
      if (!build.ok) {
        throw new Error(buildCommandFailureMessageText(buildLabel, build, "failed after UI smoke repair"));
      }
    }

    if (scripts.lint) {
      const lint = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
      if (!lint.ok) {
        throw new Error(buildCommandFailureMessageText(lintLabel, lint, "failed after UI smoke repair"));
      }
    }

    if (scripts.test && !/no test specified/i.test(scripts.test)) {
      const test = await this.executeCommand(task.id, buildNpmScriptRequestText("test", 120_000, plan.workingDirectory));
      if (!test.ok) {
        throw new Error(buildCommandFailureMessageText(testLabel, test, "failed after UI smoke repair"));
      }
    }

    return true;
  }

  private async ensureExplicitGeneratedAppWorkspace(task: AgentTask, targetDirectory: string): Promise<void> {
    const targetPath = resolveWorkspacePathText(this.workspaceRoot, targetDirectory);
    const exists = await pathExistsText(targetPath);
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
    const targetPath = resolveWorkspacePathText(this.workspaceRoot, targetDirectory);
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
      const runtimeLabel = getLaunchVerificationLabelText(artifactType ?? "unknown");
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
    const runCommand = resolvePreferredRunCommandText(artifactType, context?.scripts);
    return buildTaskOutputText(artifactType, {
      packageName,
      workingDirectory,
      runCommand,
      hasPreview: artifactType === "web-app" && Boolean(context?.verification?.previewReady),
      hasPackagingScript: Boolean(context?.scripts?.["package:win"]),
      verificationChecks: context?.verification?.checks,
      prompt
    });
  }

  private async verifyExpectedEntryFiles(plan: TaskExecutionPlan, artifactType: AgentArtifactType): Promise<AgentVerificationCheck> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    const entryLabel = getEntryVerificationLabelText(artifactType);

    if (artifactType === "workspace-change" || artifactType === "unknown") {
      if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, workingDirectory))) {
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

    const requiredPaths = new Set(
      buildRequiredEntryPathsText({
        workingDirectory,
        workspaceKind: plan.workspaceKind,
        artifactType
      })
    );

    const conflictingPaths = await this.collectConflictingWorkspaceFiles(plan);

    const present: string[] = [];
    const missing: string[] = [];
    for (const path of requiredPaths) {
      try {
        await stat(resolveWorkspacePathText(this.workspaceRoot, path));
        present.push(path);
      } catch {
        missing.push(path);
      }
    }

    for (const requestedPath of plan.requestedPaths ?? []) {
      if (!isPathInsideWorkingDirectoryText(requestedPath, workingDirectory)) continue;
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
      await stat(resolveWorkspacePathText(this.workspaceRoot, requestedPath));
      return true;
    } catch {
      // allow compatible modern desktop scaffold aliases below
    }

    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    for (const aliasGroup of getRequestedEntryPathAliasGroupsText(requestedPath, workingDirectory, plan.workspaceKind, artifactType)) {
      if (await allFilesExistText(aliasGroup, {
        resolveWorkspacePath: (targetPath) => resolveWorkspacePathText(this.workspaceRoot, targetPath)
      })) {
        return true;
      }
    }

    return false;
  }

  private async findGeneratedDesktopInstaller(workingDirectory: string): Promise<string | null> {
    const baseDirectory = resolveWorkspacePathText(this.workspaceRoot, workingDirectory);
    const preferredOutputDirectories = ["release", "release-package"];
    try {
      const rootEntries = await readdir(baseDirectory, { withFileTypes: true });
      const dynamicFallbackDirectories = rootEntries
        .filter((entry) => entry.isDirectory() && /^release-package-/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));
      for (const outputDirectory of [...preferredOutputDirectories, ...dynamicFallbackDirectories]) {
        const releaseDirectory = resolveWorkspacePathText(this.workspaceRoot, joinWorkspacePathText(workingDirectory, outputDirectory));
        try {
          const entries = await readdir(releaseDirectory, { withFileTypes: true });
          const installer = entries.find((entry) => entry.isFile() && /\.exe$/i.test(entry.name));
          if (installer) {
            return joinWorkspacePathText(workingDirectory, outputDirectory, installer.name);
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

  private async verifyWindowsDesktopPackaging(
    taskId: string,
    plan: TaskExecutionPlan,
    scripts: PackageScripts
  ): Promise<AgentVerificationCheck> {
    const scriptName = "package:win";
    const label = getPackagingVerificationLabelText("desktop-app");
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
      packaging = await this.executeCommand(taskId, buildNpmScriptRequestText(scriptName, 300_000, workingDirectory));
      if (packaging.ok) {
        break;
      }
      if (!isTransientGeneratedPackagingLockFailureText(packaging) || attempt === maxPackagingAttempts) {
        break;
      }

      this.appendLog(
        taskId,
        `Windows packaging hit a transient workspace lock in ${workingDirectory}; retry ${attempt + 1}/${maxPackagingAttempts} after cleanup.`
      );
      await this.cleanupGeneratedDesktopPackagingState(taskId, workingDirectory);
      await delay(400 * attempt);
    }
    if (!packaging?.ok && packaging && isTransientGeneratedPackagingLockFailureText(packaging)) {
      const isolatedOutputDirectory = `release-package-${Date.now().toString(36)}`;
      const isolatedPackagingRequest = buildElectronBuilderPackagingRequestText(scripts[scriptName], workingDirectory, isolatedOutputDirectory);
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
        details: packaging && isTransientGeneratedPackagingLockFailureText(packaging)
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

  private async verifyWindowsInstallerSmoke(
    taskId: string,
    plan: TaskExecutionPlan,
    installerPath: string | null,
    packageManifest: PackageManifest | null,
    platform: NodeJS.Platform = process.platform
  ): Promise<AgentVerificationCheck> {
    if (platform !== "win32") {
      return {
        id: "installer-smoke",
        label: "Installer smoke",
        status: "skipped",
        details: "Installer smoke runs only on Windows hosts."
      };
    }

    const normalizedInstallerPath = (installerPath ?? "").trim();
    if (!normalizedInstallerPath) {
      return {
        id: "installer-smoke",
        label: "Installer smoke",
        status: "failed",
        details: "Installer smoke could not run because no installer path was available."
      };
    }

    const smokeHelperPath = join(this.workspaceRoot, "scripts", "smoke-win-installer.mjs");
    if (!existsSync(smokeHelperPath)) {
      return {
        id: "installer-smoke",
        label: "Installer smoke",
        status: "failed",
        details: "Installer smoke helper script is missing."
      };
    }

    const buildConfig = (packageManifest?.build ?? null) as {
      productName?: string;
      executableName?: string;
    } | null;
    const productName = String(
      buildConfig?.productName
      ?? buildConfig?.executableName
      ?? toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes")
    ).trim();
    const executableNameBase = String(buildConfig?.executableName ?? productName).trim() || "App";
    const executableName = /\.exe$/i.test(executableNameBase) ? executableNameBase : `${executableNameBase}.exe`;

    const runId = Date.now().toString(36);
    const reportPath = join(this.workspaceRoot, "tmp", `agent-installer-smoke-${runId}.json`);
    const installDir = join(this.workspaceRoot, "tmp", `agent-installer-smoke-${runId}-install`);
    const installerAbsolutePath = resolveWorkspacePathText(this.workspaceRoot, normalizedInstallerPath);

    const result = await this.executeDetachedCommand(taskId, {
      command: process.execPath,
      args: [
        smokeHelperPath,
        "--installer",
        installerAbsolutePath,
        "--install-dir",
        installDir,
        "--report",
        reportPath,
        "--exe-name",
        executableName,
        "--product-name",
        productName,
        "--skip-upgrade",
        "--skip-uninstall"
      ],
      cwd: this.workspaceRoot,
      timeoutMs: 240_000
    }, false);

    if (!result.ok) {
      const reportOutcome = await this.readInstallerSmokeReportOutcome(reportPath);
      if (reportOutcome?.status === "passed") {
        const suffix = result.timedOut
          ? " Smoke helper timed out after writing a passed report."
          : " Smoke helper returned a non-zero exit after writing a passed report.";
        return {
          id: "installer-smoke",
          label: "Installer smoke",
          status: "passed",
          details: `Installer smoke passed for ${normalizedInstallerPath}.${suffix}`
        };
      }

      const reportFailure = reportOutcome?.status === "failed" && reportOutcome.error
        ? ` Report error: ${reportOutcome.error}`
        : "";
      return {
        id: "installer-smoke",
        label: "Installer smoke",
        status: "failed",
        details: result.combinedOutput
          ? `Installer smoke failed: ${result.combinedOutput}${reportFailure}`
          : "Installer smoke command failed."
      };
    }

    return {
      id: "installer-smoke",
      label: "Installer smoke",
      status: "passed",
      details: `Installer smoke passed for ${normalizedInstallerPath}.`
    };
  }

  private async readInstallerSmokeReportOutcome(
    reportPath: string
  ): Promise<{ status: string; error: string | null } | null> {
    try {
      const raw = await readFile(reportPath, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as { status?: unknown; error?: unknown };
      const status = String(parsed?.status ?? "").trim().toLowerCase();
      if (!status) return null;
      const error = typeof parsed?.error === "string" && parsed.error.trim().length > 0
        ? parsed.error.trim()
        : null;
      return { status, error };
    } catch {
      return null;
    }
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
      const packagePath = joinWorkspacePathText(
        normalizedWorkingDirectory,
        "node_modules",
        ...packageName.split("/"),
        "package.json"
      );
      try {
        await stat(resolveWorkspacePathText(this.workspaceRoot, packagePath));
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
    if (!install.ok && isTransientGeneratedInstallLockFailureText(install)) {
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
      if (isRecoverableGeneratedInstallFailureText(install)) {
        const recovered = await this.tryAutoFixGeneratedNodePackageInstall(taskId, plan, install);
        if (recovered) return;
      }
      throw new Error(buildCommandFailureMessageText("Dependency install", install, "failed while running npm install"));
    }
  }

  private async cleanupGeneratedDesktopPackagingState(taskId: string, workingDirectory: string): Promise<void> {
    await this.cleanupGeneratedWorkspaceInstallLocks(taskId, workingDirectory, "desktop-app");

    const cleanupPaths = [
      joinWorkspacePathText(workingDirectory, "release/win-unpacked/resources/app.asar"),
      joinWorkspacePathText(workingDirectory, "release/win-unpacked/resources/app.asar.unpacked"),
      joinWorkspacePathText(workingDirectory, "release/win-unpacked/resources"),
      joinWorkspacePathText(workingDirectory, "release/win-unpacked"),
      joinWorkspacePathText(workingDirectory, "release"),
      joinWorkspacePathText(workingDirectory, "release-package/win-unpacked/resources/app.asar"),
      joinWorkspacePathText(workingDirectory, "release-package/win-unpacked/resources/app.asar.unpacked"),
      joinWorkspacePathText(workingDirectory, "release-package/win-unpacked/resources"),
      joinWorkspacePathText(workingDirectory, "release-package/win-unpacked"),
      joinWorkspacePathText(workingDirectory, "release-package"),
      joinWorkspacePathText(workingDirectory, "release-stage/win-unpacked/resources/app.asar"),
      joinWorkspacePathText(workingDirectory, "release-stage/win-unpacked/resources/app.asar.unpacked"),
      joinWorkspacePathText(workingDirectory, "release-stage")
    ];

    for (const cleanupPath of cleanupPaths) {
      try {
        await this.withWorkspaceFsRetry(
          () => rm(resolveWorkspacePathText(this.workspaceRoot, cleanupPath), { recursive: true, force: true }),
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

    const absoluteWorkingDirectory = resolveWorkspacePathText(this.workspaceRoot, workingDirectory).replace(/\//g, "\\");
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

    const scopedFixEdits = fix ? this.inspectStructuredEdits(fix.edits, plan).acceptedEdits : [];
    if (!fix || scopedFixEdits.length === 0) {
      const heuristicFix = await this.tryHeuristicImplementation(taskId, task.prompt, plan);
      if (!heuristicFix || heuristicFix.edits.length === 0) {
        return false;
      }
      this.appendLog(taskId, `Using heuristic dependency-install recovery: ${heuristicFix.summary}`);
      fix = {
        summary: heuristicFix.summary,
        edits: this.inspectStructuredEdits(heuristicFix.edits, plan).acceptedEdits
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
    const spec = plan.spec ?? buildTaskExecutionSpecText(
      "",
      workingDirectory,
      plan.workspaceKind ?? "generic",
      plan.builderMode ?? null,
      artifactType ?? null,
      plan.requestedPaths ?? [],
      {
        buildSpecAcceptanceCriteria: buildSpecAcceptanceCriteriaText,
        buildSpecDeliverables: buildSpecDeliverablesText,
        buildSpecQualityGates: buildSpecQualityGatesText,
        buildSpecRequiredFiles: (dir, kind, profile, expectsReadme, nextRequestedPaths) =>
          buildSpecRequiredFilesText(
            dir,
            kind,
            profile,
            expectsReadme,
            nextRequestedPaths,
            {
              isPathInsideWorkingDirectory: isPathInsideWorkingDirectoryText,
              joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts)
            }
          ),
        buildSpecRequiredScriptGroups: buildSpecRequiredScriptGroupsText,
        describeDomainFocus: describeDomainFocusText,
        describeStarterProfile: describeStarterProfileText,
        inferDomainFocus: inferDomainFocusText,
        inferStarterProfile: inferStarterProfileText,
        joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts),
        looksLikeNewProjectPrompt: (normalizedPrompt) => this.looksLikeNewProjectPrompt(normalizedPrompt)
      }
    );
    if (!spec.expectsReadme) return;

    const readmePath = joinWorkspacePathText(workingDirectory, "README.md");
    if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, readmePath))) {
      return;
    }

    await this.writeWorkspaceFile(
      readmePath,
      buildProjectReadmeTemplate({
        projectName: toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes"),
        artifactType: artifactType ?? null,
        starterProfileLabel: describeStarterProfileText(spec.starterProfile),
        workingDirectory: plan.workingDirectory,
        deliverables: spec.deliverables,
        acceptanceCriteria: spec.acceptanceCriteria,
        qualityGates: spec.qualityGates
      })
    );
  }

  private async ensureBootstrapProjectReadme(plan: BootstrapPlan): Promise<void> {
    const readmePath = joinWorkspacePathText(plan.targetDirectory, "README.md");
    if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, readmePath))) {
      return;
    }

    const spec = buildTaskExecutionSpecText(
      `Create ${plan.projectName}`,
      plan.targetDirectory,
      plan.template === "static" ? "static" : (plan.template === "node-package" ? "generic" : "react"),
      null,
      plan.artifactType ?? null,
      [],
      {
        buildSpecAcceptanceCriteria: buildSpecAcceptanceCriteriaText,
        buildSpecDeliverables: buildSpecDeliverablesText,
        buildSpecQualityGates: buildSpecQualityGatesText,
        buildSpecRequiredFiles: (dir, kind, profile, expectsReadme, nextRequestedPaths) =>
          buildSpecRequiredFilesText(
            dir,
            kind,
            profile,
            expectsReadme,
            nextRequestedPaths,
            {
              isPathInsideWorkingDirectory: isPathInsideWorkingDirectoryText,
              joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts)
            }
          ),
        buildSpecRequiredScriptGroups: buildSpecRequiredScriptGroupsText,
        describeDomainFocus: describeDomainFocusText,
        describeStarterProfile: describeStarterProfileText,
        inferDomainFocus: inferDomainFocusText,
        inferStarterProfile: inferStarterProfileText,
        joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts),
        looksLikeNewProjectPrompt: (normalizedPrompt) => this.looksLikeNewProjectPrompt(normalizedPrompt)
      }
    );
    await this.writeWorkspaceFile(
      readmePath,
      buildProjectReadmeTemplate({
        projectName: toDisplayNameFromDirectoryText(plan.targetDirectory, "Focus Notes"),
        artifactType: plan.artifactType,
        starterProfileLabel: describeStarterProfileText(plan.starterProfile),
        workingDirectory: plan.targetDirectory,
        deliverables: spec.deliverables,
        acceptanceCriteria: spec.acceptanceCriteria,
        qualityGates: spec.qualityGates
      })
    );
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
      const initialRequest = buildNpmScriptRequestText(scriptName, 45_000, cwd);
      const initialResult = await this.executeCommand(taskId, initialRequest);
      if (initialResult.ok || !looksLikeCliUsageFailureText(initialResult.combinedOutput || "")) {
        return initialResult;
      }

      const taskPrompt = this.tasks.get(taskId)?.prompt ?? "";
      const fixturePath = await this.ensureScriptToolVerificationFixture(cwd, `${taskPrompt}\n${initialResult.combinedOutput || ""}`);
      this.appendLog(taskId, `Retrying tool runtime verification with fixture input: ${fixturePath}`);
      return this.executeCommand(taskId, buildNpmScriptRequestText(scriptName, 45_000, cwd, [fixturePath]));
    }

    const request = buildNpmScriptRequestText(scriptName, 45_000, cwd);
    if (usesStartupVerificationText(artifactType)) {
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
    const scripts = resolveVerificationScriptsText(packageJson, plan.workspaceKind) as PackageScripts;
    const runtimeScript = resolveRuntimeVerificationScriptText(scripts);

    if (scripts.build) {
      const build = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
      upsertVerificationCheckGuard(checks, {
        id: "build",
        label: labels.buildLabel,
        status: build.ok ? "passed" : "failed",
        details: build.ok ? `${labels.buildLabel} completed successfully after repair.` : `${labels.buildLabel} failed after repair.`
      });
      if (!build.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(buildCommandFailureMessageText(labels.buildLabel, build, "failed after repair"));
      }
    }

    if (scripts.lint) {
      const lint = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
      upsertVerificationCheckGuard(checks, {
        id: "lint",
        label: labels.lintLabel,
        status: lint.ok ? "passed" : "failed",
        details: lint.ok ? `${labels.lintLabel} completed successfully after repair.` : `${labels.lintLabel} failed after repair.`
      });
      if (!lint.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(buildCommandFailureMessageText(labels.lintLabel, lint, "failed after repair"));
      }
    }

    if (scripts.test && !/no test specified/i.test(scripts.test)) {
      const test = await this.executeCommand(task.id, buildNpmScriptRequestText("test", 120_000, plan.workingDirectory));
      upsertVerificationCheckGuard(checks, {
        id: "test",
        label: labels.testLabel,
        status: test.ok ? "passed" : "failed",
        details: test.ok ? `${labels.testLabel} completed successfully after repair.` : `${labels.testLabel} failed after repair.`
      });
      if (!test.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(buildCommandFailureMessageText(labels.testLabel, test, "failed after repair"));
      }
    }

    if (runtimeScript && shouldVerifyLaunchText(artifactType)) {
      const launch = await this.executeArtifactRuntimeVerification(task.id, runtimeScript, artifactType, plan, scripts);
      upsertVerificationCheckGuard(checks, {
        id: "launch",
        label: labels.runtimeLabel,
        status: launch.ok ? "passed" : "failed",
        details: launch.ok
          ? buildRuntimeVerificationAfterRepairDetailsText(artifactType, runtimeScript)
          : `${labels.runtimeLabel} failed after repair.`
      });
      if (!launch.ok) {
        this.updateTaskVerification(task, checks);
        throw new Error(buildCommandFailureMessageText(labels.runtimeLabel, launch, "failed after repair"));
      }
      if (shouldVerifyServedWebPageText(artifactType)) {
        const servedPage = await this.verifyServedWebPage(plan, scripts, runtimeScript, launch);
        upsertVerificationCheckGuard(checks, servedPage);
        if (servedPage.status === "failed") {
          this.updateTaskVerification(task, checks);
          throw new Error(servedPage.details || "Served web page failed after repair.");
        }
      }
      if (shouldVerifyRuntimeDepthText(artifactType)) {
        const runtimeDepth = await this.verifyRuntimeDepth(plan, artifactType, scripts, runtimeScript, launch);
        if (runtimeDepth) {
          upsertVerificationCheckGuard(checks, runtimeDepth);
          if (runtimeDepth.status === "failed") {
            this.updateTaskVerification(task, checks);
            throw new Error(runtimeDepth.details || "Runtime depth verification failed after repair.");
          }
        }
      }
    }

    if (shouldVerifyPreviewHealthText(artifactType)) {
      let previewHealth = await this.verifyPreviewHealth(plan, scripts);
      if (previewHealth.status === "failed") {
        const repaired = await this.tryAutoFixPreviewHealth(task, previewHealth, plan, scripts, labels.buildLabel);
        if (repaired) {
          previewHealth = await this.verifyPreviewHealth(plan, scripts);
        }
      }
      upsertVerificationCheckGuard(checks, previewHealth);
      if (previewHealth.status === "failed") {
        this.updateTaskVerification(task, checks);
        throw new Error(previewHealth.details || "Preview health failed after repair.");
      }
    }

    if (shouldVerifyUiSmokeText(artifactType)) {
      let uiSmoke = await this.verifyBasicUiSmoke(plan);
      if (uiSmoke.status === "failed") {
        const repaired = await this.tryAutoFixUiSmoke(task, uiSmoke, plan, scripts, labels.buildLabel, labels.lintLabel, labels.testLabel);
        if (repaired) {
          uiSmoke = await this.verifyBasicUiSmoke(plan);
        }
      }
      upsertVerificationCheckGuard(checks, uiSmoke);
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
    const cachedProbe = extractServedPageProbeResultText(launch.combinedOutput || "");
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
    const cachedProbe = extractApiProbeResultText(launch.combinedOutput || "");
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
    const output = stripAnsiControlSequencesText(launch.combinedOutput || "").trim();
    if (!output) {
      return {
        id: "cli-probe",
        label: "CLI probe",
        status: "failed",
        details: "CLI runtime verification produced no output."
      };
    }

    if (looksLikeCliUsageFailureText(output)) {
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

    const parsed = parseJsonFromOutputText(output);
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
    const indexPath = joinWorkspacePathText(previewRoot, "index.html");
    if (!(await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, indexPath)))) {
      return {
        id: "desktop-interaction",
        label: "Desktop interaction",
        status: "failed",
        details: `Desktop preview entry is missing: ${indexPath}.`
      };
    }

    const previewUrl = pathToFileURL(resolveWorkspacePathText(this.workspaceRoot, indexPath)).toString();
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

    if (!isApiCollectionPayloadText(collection.payload)) {
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
    const url = resolveServedWebPageUrlText({
      workspaceKind: plan.workspaceKind,
      runtimeScript,
      startScript: scripts.start,
      devScript: scripts.dev,
      combinedOutput: stripAnsiControlSequencesText(launch.combinedOutput || "")
    });
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

    const parsed = parseBrowserSmokeResultText(result.combinedOutput || "");
    if (parsed) {
      if (parsed.status === "failed" && isBrowserSmokeInfrastructureFailureText(parsed.details)) {
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

  private resolveElectronBinary(): string | null {
    try {
      const electronBinary = require("electron");
      return typeof electronBinary === "string" && electronBinary.trim() ? electronBinary : null;
    } catch {
      return null;
    }
  }

  private async ensureScriptToolVerificationFixture(cwd: string, hint = ""): Promise<string> {
    const normalizedHint = (hint ?? "").toLowerCase();
    const fixtureName = normalizedHint.includes("json")
      ? ".cipher-tool-smoke.json"
      : normalizedHint.includes("csv")
        ? ".cipher-tool-smoke.csv"
        : ".cipher-tool-smoke.md";
    const fixturePath = joinWorkspacePathText(cwd, fixtureName);
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
      joinWorkspacePathText(plan.workingDirectory, "src/index.js"),
      joinWorkspacePathText(plan.workingDirectory, "src/index.mjs"),
      joinWorkspacePathText(plan.workingDirectory, "bin/cli.mjs")
    ]);
    const normalized = (source ?? "").toLowerCase();
    return normalized.includes("json.stringify");
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
          headers: buildFetchHeadersText(init),
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

  private async resolveApiServiceBaseUrl(
    plan: TaskExecutionPlan,
    scripts: PackageScripts,
    runtimeScript: "start" | "dev",
    launch: TerminalCommandResult
  ): Promise<string | null> {
    const explicit = resolveServedWebPageUrlText({
      workspaceKind: plan.workspaceKind,
      runtimeScript,
      startScript: scripts.start,
      devScript: scripts.dev,
      combinedOutput: stripAnsiControlSequencesText(launch.combinedOutput || "")
    });
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
      joinWorkspacePathText(plan.workingDirectory, "src/server.js"),
      joinWorkspacePathText(plan.workingDirectory, "src/index.js")
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
      joinWorkspacePathText(plan.workingDirectory, "src/server.js"),
      joinWorkspacePathText(plan.workingDirectory, "src/index.js")
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
      if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, file))) {
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
    const packageJsonPath = joinWorkspacePathText(plan.workingDirectory, "package.json");
    const hasPackageJson = await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, packageJsonPath));

    if (plan.workspaceKind !== "static" || hasPackageJson) {
      if (!hasPackageJson) {
        issues.push(`Missing package manifest: ${packageJsonPath}.`);
      } else {
        const rawManifest = await this.safeReadContextFile(packageJsonPath);
        const parsedManifest = rawManifest
          ? parseLoosePackageManifestText(rawManifest.content, normalizeLooseJsonText) as PackageManifest | null
          : null;
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
      const readmePath = joinWorkspacePathText(plan.workingDirectory, "README.md");
      if (!(await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, readmePath)))) {
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
    const indexPath = joinWorkspacePathText(previewRoot, "index.html");

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
    const resolvePreviewAsset = (ref: string): string | null => resolvePreviewAssetPathText(
      previewRoot,
      ref,
      (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath)
    );

    const assetProblems: string[] = [];
    for (const ref of [...stylesheetRefs, ...scriptRefs]) {
      const resolved = resolvePreviewAsset(ref);
      if (!resolved) {
        assetProblems.push(`Unsupported asset path: ${ref}`);
        continue;
      }
      if (!(await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, resolved)))) {
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
      const resolved = resolvePreviewAsset(ref);
      if (!resolved) continue;
      try {
        const css = (await this.readWorkspaceFile(resolved)).content;
        if (!isLikelyValidStylesheetText(css)) {
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
    const placeholderMarkers = detectStarterPlaceholderSignalsText(joined);
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
        joinWorkspacePathText(plan.workingDirectory, "index.html"),
        joinWorkspacePathText(plan.workingDirectory, "app.js")
      ]
      : [
        joinWorkspacePathText(plan.workingDirectory, "src/App.tsx"),
        joinWorkspacePathText(plan.workingDirectory, "src/main.tsx"),
        joinWorkspacePathText(plan.workingDirectory, "index.html")
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

      const mainPath = joinWorkspacePathText(plan.workingDirectory, "src/main.tsx");
      try {
        const mainContent = (await this.readWorkspaceFile(mainPath)).content;
        if (!hasPreviewBootstrapSignalsText(mainContent, "react")) {
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

    const appScriptPath = joinWorkspacePathText(previewRoot, "app.js");
    const appScriptExists = await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, appScriptPath));
    if (!appScriptExists) return problems;

    const hasAppScriptRef = scriptRefs.some((ref) => {
      const resolved = resolvePreviewAssetPathText(
        previewRoot,
        ref,
        (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath)
      );
      return resolved === appScriptPath || /(^|\/)app\.js$/i.test(ref);
    });
    if (!hasAppScriptRef) {
      problems.push(`Preview entry does not load ${appScriptPath}.`);
      return problems;
    }

    if (plan.builderMode === "notes" || plan.builderMode === "crud" || plan.builderMode === "dashboard" || plan.builderMode === "kanban") {
      try {
        const appScript = (await this.readWorkspaceFile(appScriptPath)).content;
        if (!hasPreviewBootstrapSignalsText(appScript, "static")) {
          problems.push(`Preview script ${appScriptPath} does not include obvious DOM bootstrap markers.`);
        }
      } catch {
        problems.push(`Unreadable preview script: ${appScriptPath}.`);
      }
    }

    return problems;
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
    const scopedEdits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
    const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 3, scopedEdits);
    if (applied.length === 0) return false;

    if (scripts.build) {
      const build = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
      if (!build.ok) {
        throw new Error(buildCommandFailureMessageText(buildLabel, build, "failed after preview-health repair"));
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
          path: joinWorkspacePathText(workingDirectory, "index.html"),
          content: buildReactBootstrapHtmlTemplate(toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes"))
        }]
      };
    }

    const missingJsAssets = [...details.matchAll(new RegExp(`${escapeRegExpText(`${workingDirectory}/dist/`)}([^\\s]+\\.js)`, "gi"))]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value));
    if (missingJsAssets.length === 0) return null;

    const indexPath = joinWorkspacePathText(workingDirectory, "index.html");
    const indexFile = await this.safeReadContextFile(indexPath);
    if (!indexFile) return null;

    const updated = normalizeLocalHtmlScriptsForViteText(indexFile.content, missingJsAssets);
    if (!updated || updated === indexFile.content) return null;

    return {
      summary: "Updated local script tags to module scripts so Vite preview assets build correctly.",
      edits: [{ path: indexPath, content: updated }]
    };
  }

  private async resolvePreviewRoot(plan: TaskExecutionPlan, scripts: PackageScripts): Promise<string> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    const isStatic = Boolean(scripts.start && /http\.server/i.test(scripts.start));
    if (isStatic) return workingDirectory;

    const distRoot = joinWorkspacePathText(workingDirectory, "dist");
    if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, distRoot))) {
      return distRoot;
    }

    return workingDirectory;
  }

  private async collectRequirementVerificationContent(plan: TaskExecutionPlan): Promise<string> {
    const preferredPaths = [
      joinWorkspacePathText(plan.workingDirectory, "index.html"),
      joinWorkspacePathText(plan.workingDirectory, "styles.css"),
      joinWorkspacePathText(plan.workingDirectory, "app.js"),
      joinWorkspacePathText(plan.workingDirectory, "src/App.tsx"),
      joinWorkspacePathText(plan.workingDirectory, "src/main.tsx"),
      joinWorkspacePathText(plan.workingDirectory, "src/App.css"),
      joinWorkspacePathText(plan.workingDirectory, "src/index.css")
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

  private async runStep<T>(
    task: AgentTask,
    title: string,
    work: () => Promise<{ summary: string } & T>
  ): Promise<{ summary: string } & T> {
    this.throwIfTaskStopped(task);
    this.enforceTaskRuntimeBudget(task.id, title);
    this.consumeTaskRepairAttemptBudget(task.id, title);
    ensureTaskTelemetryText(task).lastStage = title;
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
    this.persistTaskStateNow(Date.now(), task.id);

    try {
      const result = await work();
      this.throwIfTaskStopped(task);
      step.status = "completed";
      step.finishedAt = new Date().toISOString();
      step.summary = result.summary;
      task.updatedAt = step.finishedAt;
      this.recordDoDGateOutcomeForStage(task, title, "passed", step.summary ?? "");
      this.appendLog(task.id, result.summary);
      this.persistTaskStateNow(Date.now(), task.id);
      return result;
    } catch (err) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.summary = err instanceof Error ? err.message : `${title} failed.`;
      task.updatedAt = step.finishedAt;
      const failureSummary = step.summary ?? `${title} failed.`;
      const telemetry = ensureTaskTelemetryText(task);
      telemetry.lastStage = title;
      telemetry.failureStage = title;
      telemetry.failureCategory = classifyFailureCategoryText(title, failureSummary);
      this.recordDoDGateOutcomeForStage(task, title, "failed", failureSummary);
      this.appendLog(task.id, `${title} failed: ${failureSummary}`);
      this.persistTaskStateNow(Date.now(), task.id);
      throw err;
    }
  }

  private async runDeferredStep<T>(
    task: AgentTask,
    title: string,
    work: () => Promise<{ summary: string } & T>
  ): Promise<{ summary: string } & T> {
    this.throwIfTaskStopped(task);
    this.enforceTaskRuntimeBudget(task.id, title);
    this.consumeTaskRepairAttemptBudget(task.id, title);
    ensureTaskTelemetryText(task).lastStage = title;
    const startedAt = new Date().toISOString();
    task.updatedAt = startedAt;
    this.appendLog(task.id, `${title}...`);
    this.persistTaskStateNow(Date.now(), task.id);

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
      this.recordDoDGateOutcomeForStage(task, title, "passed", step.summary ?? "");
      this.appendLog(task.id, result.summary);
      this.persistTaskStateNow(Date.now(), task.id);
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
      const failureSummary = step.summary ?? `${title} failed.`;
      const telemetry = ensureTaskTelemetryText(task);
      telemetry.lastStage = title;
      telemetry.failureStage = title;
      telemetry.failureCategory = classifyFailureCategoryText(title, failureSummary);
      this.recordDoDGateOutcomeForStage(task, title, "failed", failureSummary);
      this.appendLog(task.id, `${title} failed: ${failureSummary}`);
      this.persistTaskStateNow(Date.now(), task.id);
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

    const cwd = request.cwd ? resolveWorkspacePathText(this.workspaceRoot, request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 60_000, 300_000));
    const commandLine = [command, ...args].join(" ");

    this.enforceTaskRuntimeBudget(taskId, "command execution");
    this.consumeTaskCommandBudget(taskId, commandLine);
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
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
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

    const cwd = request.cwd ? resolveWorkspacePathText(this.workspaceRoot, request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 60_000, 300_000));
    const commandLine = [command, ...args].join(" ");

    this.enforceTaskRuntimeBudget(taskId, "detached command execution");
    this.consumeTaskCommandBudget(taskId, commandLine);
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
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
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

    const cwd = request.cwd ? resolveWorkspacePathText(this.workspaceRoot, request.cwd) : this.workspaceRoot;
    const args = Array.isArray(request.args) ? request.args.map((value) => String(value)) : [];
    const commandLine = [command, ...args].join(" ");

    this.enforceTaskRuntimeBudget(taskId, "startup verification");
    this.consumeTaskCommandBudget(taskId, `${commandLine} [startup verify]`);
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
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
      };

      const collectErr = (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        extractTaskOutputLogLinesText(text).forEach((line) => this.appendLog(taskId, line));
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
          ok: code === 0 && !hasStartupFailureSignalText(combinedOutput),
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
        const hasFailure = hasStartupFailureSignalText(combinedOutput);
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

        if (isBuilderRecoveryPrimaryPlanText(plan.builderMode)) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Build recovery builder fallback produced no usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          const scopedEdits = this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits;
          const applied = await this.applyStructuredEdits(task.id, attempt, scopedEdits);
          await this.prepareGeneratedWorkspace(task.id, plan);
          currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
          return {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""} Files changed: ${applied.join(", ") || "none"}. Build ${currentResult.ok ? "passed" : "still failing"}.`
          };
        }

        const bootstrapRepair = await this.tryGeneratedReactBootstrapRepair(task.id, currentResult, plan);
        if (bootstrapRepair) {
          currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
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
        fix.edits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Build recovery did not produce any usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits
          };
          if (fix.edits.length === 0) {
            throw new Error("Build recovery did not produce any usable edits.");
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
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
        const scopedEdits = this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits;
        if (scopedEdits.length === 0) {
          return { summary: "Builder recovery produced no scoped edits." };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("build", 120_000, plan.workingDirectory));
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
    const originalScripts = extractScriptsText(originalPackageJson) as PackageScripts;
    const preservedLaunchScript = resolveRuntimeVerificationScriptText(originalScripts);
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
        fix.edits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error(`${runtimeLabel} recovery did not produce any usable edits.`);
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered ${runtimeNoun}-fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits
          };
          if (fix.edits.length === 0) {
            throw new Error(`${runtimeLabel} recovery did not produce any usable edits.`);
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        let packageJson = await this.tryReadPackageJson(plan.workingDirectory);
        let scripts = extractScriptsText(packageJson) as PackageScripts;
        let launchScript = resolveRuntimeVerificationScriptText(scripts);
        if (!launchScript && preservedLaunchScript && preservedLaunchCommand) {
          const restored = await this.restoreMissingRuntimeScript(plan.workingDirectory, preservedLaunchScript, preservedLaunchCommand);
          if (restored) {
            packageJson = await this.tryReadPackageJson(plan.workingDirectory);
            scripts = extractScriptsText(packageJson) as PackageScripts;
            launchScript = resolveRuntimeVerificationScriptText(scripts);
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
        const scopedEdits = this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits;
        if (scopedEdits.length === 0) {
          return { summary: `${runtimeLabel} builder recovery produced no scoped edits.` };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        const packageJson = await this.tryReadPackageJson(plan.workingDirectory);
        const scripts = extractScriptsText(packageJson) as PackageScripts;
        const launchScript = resolveRuntimeVerificationScriptText(scripts);
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
      joinWorkspacePathText(workingDirectory, "package.json"),
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

        if (isBuilderRecoveryPrimaryPlanText(plan.builderMode)) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Lint recovery builder fallback produced no usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          const scopedEdits = this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits;
          const applied = await this.applyStructuredEdits(task.id, attempt, scopedEdits);
          await this.prepareGeneratedWorkspace(task.id, plan);
          currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
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

        fix.edits = this.inspectStructuredEdits(fix.edits, plan).acceptedEdits;
        if (fix.edits.length === 0) {
          const builderFix = await this.tryHeuristicImplementation(task.id, task.prompt, plan);
          if (!builderFix || builderFix.edits.length === 0) {
            throw new Error("Lint recovery did not produce any usable edits.");
          }
          const removed = await this.pruneUnexpectedGeneratedAppFiles(task.id, plan);
          this.appendLog(task.id, `Filtered lint-fix edits to zero; using builder recovery fallback: ${builderFix.summary}`);
          fix = {
            summary: `${builderFix.summary}${removed.length > 0 ? ` Removed stray files: ${removed.join(", ")}.` : ""}`,
            edits: this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits
          };
          if (fix.edits.length === 0) {
            throw new Error("Lint recovery did not produce any usable edits.");
          }
        }

        const applied = await this.applyStructuredEdits(task.id, attempt, fix.edits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
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
        const scopedEdits = this.inspectStructuredEdits(builderFix.edits, plan).acceptedEdits;
        if (scopedEdits.length === 0) {
          return { summary: "Lint builder recovery produced no scoped edits." };
        }

        const applied = await this.applyStructuredEdits(task.id, MAX_FIX_ATTEMPTS + 1, scopedEdits);
        await this.prepareGeneratedWorkspace(task.id, plan);
        currentResult = await this.executeCommand(task.id, buildNpmScriptRequestText("lint", 120_000, plan.workingDirectory));
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
      .flatMap((value) => extractPromptTermsText(value))
      .slice(0, 6);
    const promptTerms = [...new Set([...extractPromptTermsText(prompt), ...attachmentTerms])].slice(0, 10);
    const candidateFiles = new Set<string>();
    const detectedWorkspaceKind = await detectWorkspaceKindText(workingDirectory, {
      allFilesExist: (paths) => allFilesExistText(paths, {
        resolveWorkspacePath: (targetPath) => resolveWorkspacePathText(this.workspaceRoot, targetPath)
      }),
      joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts)
    });
    const requestedPaths = [
      ...extractExplicitPromptFilePathsText(prompt, workingDirectory),
      ...this.getWorkspaceAttachmentPaths(attachments)
    ];
    const workspaceKind = resolveWorkspaceKindForPromptText(prompt, detectedWorkspaceKind, requestedPaths, {
      inferArtifactTypeFromPrompt: inferArtifactTypeFromPromptText
    });
    const builderMode = detectBuilderModeText(prompt, {
      looksLikeCrudAppPrompt: looksLikeCrudAppPromptText
    });
    const promptArtifact = inferArtifactTypeFromPromptText((prompt ?? "").trim().toLowerCase());
    const packageManifest = await this.tryReadPackageJson(workingDirectory);
    const spec = buildTaskExecutionSpecText(prompt, workingDirectory, workspaceKind, builderMode, promptArtifact, requestedPaths, {
      buildSpecAcceptanceCriteria: buildSpecAcceptanceCriteriaText,
      buildSpecDeliverables: buildSpecDeliverablesText,
      buildSpecQualityGates: buildSpecQualityGatesText,
      buildSpecRequiredFiles: (dir, kind, profile, expectsReadme, nextRequestedPaths) =>
        buildSpecRequiredFilesText(
          dir,
          kind,
          profile,
          expectsReadme,
          nextRequestedPaths,
          {
            isPathInsideWorkingDirectory: isPathInsideWorkingDirectoryText,
            joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts)
          }
        ),
      buildSpecRequiredScriptGroups: buildSpecRequiredScriptGroupsText,
      describeDomainFocus: describeDomainFocusText,
      describeStarterProfile: describeStarterProfileText,
      inferDomainFocus: inferDomainFocusText,
      inferStarterProfile: inferStarterProfileText,
      joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts),
      looksLikeNewProjectPrompt: (normalizedPrompt) => this.looksLikeNewProjectPrompt(normalizedPrompt)
    });
    const directCandidates = workspaceKind === "static"
      ? [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "index.html"),
        joinWorkspacePathText(workingDirectory, "styles.css"),
        joinWorkspacePathText(workingDirectory, "app.js")
      ]
      : workspaceKind === "react"
      ? [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "src/main.tsx"),
        joinWorkspacePathText(workingDirectory, "src/App.tsx"),
        joinWorkspacePathText(workingDirectory, "src/App.css"),
        joinWorkspacePathText(workingDirectory, "src/index.css"),
        joinWorkspacePathText(workingDirectory, "index.html")
      ]
      : promptArtifact === "script-tool"
      ? [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "src/index.js"),
        joinWorkspacePathText(workingDirectory, "src/index.ts"),
        joinWorkspacePathText(workingDirectory, "bin/cli.js"),
        joinWorkspacePathText(workingDirectory, "bin/cli.mjs"),
        joinWorkspacePathText(workingDirectory, "README.md")
      ]
      : promptArtifact === "library"
      ? [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "src/index.ts"),
        joinWorkspacePathText(workingDirectory, "src/index.js"),
        joinWorkspacePathText(workingDirectory, "README.md")
      ]
      : promptArtifact === "api-service"
      ? [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "src/server.js"),
        joinWorkspacePathText(workingDirectory, "src/server.ts"),
        joinWorkspacePathText(workingDirectory, "src/index.js"),
        joinWorkspacePathText(workingDirectory, "src/index.ts"),
        joinWorkspacePathText(workingDirectory, "README.md")
      ]
      : [
        joinWorkspacePathText(workingDirectory, "package.json"),
        joinWorkspacePathText(workingDirectory, "src/main/main.ts"),
        joinWorkspacePathText(workingDirectory, "src/main/ipc.ts"),
        joinWorkspacePathText(workingDirectory, "src/renderer/app.ts"),
        joinWorkspacePathText(workingDirectory, "src/shared/types.ts"),
        joinWorkspacePathText(workingDirectory, "src/main.tsx"),
        joinWorkspacePathText(workingDirectory, "src/App.tsx"),
        joinWorkspacePathText(workingDirectory, "src/app/page.tsx"),
        joinWorkspacePathText(workingDirectory, "index.html"),
        joinWorkspacePathText(workingDirectory, "styles.css"),
        joinWorkspacePathText(workingDirectory, "app.js")
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
    const workItems = buildTaskWorkItemsText(prompt, workingDirectory, workspaceKind, requestedPaths, spec, repositoryContext, {
      describeDomainFocus: describeDomainFocusText,
      inferArtifactTypeFromPrompt: inferArtifactTypeFromPromptText,
      isPathInsideWorkingDirectory: isPathInsideWorkingDirectoryText,
      joinWorkspacePath: (...parts) => joinWorkspacePathText(...parts)
    });
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
      promptRequirements: extractPromptRequirementsText(prompt, {
        promptArtifact: inferArtifactTypeFromPromptText((prompt ?? "").trim().toLowerCase()),
        isDesktopBusinessReportingPrompt: isDesktopBusinessReportingPromptText
      }),
      workspaceKind,
      builderMode
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
    const moduleFormat = detectModuleFormatText(packageManifest);
    const uiFramework = detectUiFrameworkText(packageManifest, workspaceKind);
    const styling = detectStylingApproachText(packageManifest, workspaceKind);
    const testing = detectTestingToolText(packageManifest);
    const linting = detectLintingToolText(packageManifest);
    return buildRepositoryContextSummaryText({
      workspaceShape,
      packageManager,
      languageStyle,
      moduleFormat,
      uiFramework,
      styling,
      testing,
      linting
    });
  }

  private async detectPackageManager(workingDirectory: string): Promise<TaskRepositoryContext["packageManager"]> {
    const checks: Array<{ path: string; label: TaskRepositoryContext["packageManager"] }> = [
      { path: joinWorkspacePathText(workingDirectory, "pnpm-lock.yaml"), label: "pnpm" },
      { path: joinWorkspacePathText(workingDirectory, "yarn.lock"), label: "yarn" },
      { path: joinWorkspacePathText(workingDirectory, "package-lock.json"), label: "npm" },
      { path: "pnpm-lock.yaml", label: "pnpm" },
      { path: "yarn.lock", label: "yarn" },
      { path: "package-lock.json", label: "npm" }
    ];
    for (const check of checks) {
      if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, check.path))) {
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
    const packageJson = joinWorkspacePathText(workingDirectory, "package.json");
    const rootPackageJson = "package.json";
    const hasNestedPackagesDir = await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, "packages"));
    const hasAppsDir = await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, "apps"));
    const isRoot = (workingDirectory ?? ".").trim() === ".";
    if ((hasNestedPackagesDir || hasAppsDir) && isRoot) {
      return "monorepo";
    }
    if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, packageJson)) || await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, rootPackageJson))) {
      return "single-package";
    }
    return "unknown";
  }

  private async detectLanguageStyle(workingDirectory: string): Promise<TaskRepositoryContext["languageStyle"]> {
    const candidates = [
      joinWorkspacePathText(workingDirectory, "tsconfig.json"),
      joinWorkspacePathText(workingDirectory, "src/main.tsx"),
      joinWorkspacePathText(workingDirectory, "src/App.tsx"),
      joinWorkspacePathText(workingDirectory, "src/index.ts"),
      joinWorkspacePathText(workingDirectory, "src/server.ts"),
      joinWorkspacePathText(workingDirectory, "src/main.js"),
      joinWorkspacePathText(workingDirectory, "src/App.jsx"),
      joinWorkspacePathText(workingDirectory, "src/index.js"),
      joinWorkspacePathText(workingDirectory, "src/server.js")
    ];
    let hasTs = false;
    let hasJs = false;
    for (const candidate of candidates) {
      if (/\.(ts|tsx)$/.test(candidate) && await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, candidate))) {
        hasTs = true;
      }
      if (/\.(js|jsx)$/.test(candidate) && await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, candidate))) {
        hasJs = true;
      }
    }
    if (await pathExistsText(resolveWorkspacePathText(this.workspaceRoot, joinWorkspacePathText(workingDirectory, "tsconfig.json")))) {
      hasTs = true;
    }
    if (hasTs && hasJs) return "mixed";
    if (hasTs) return "typescript";
    if (hasJs) return "javascript";
    return "unknown";
  }

  private async pruneUnexpectedGeneratedAppFiles(taskId: string, plan: TaskExecutionPlan): Promise<string[]> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return [];

    const allowed = new Set(this.getImplicitPlanAllowedPaths(plan).map((value) => value.replace(/\\/g, "/")));
    const entries = await this.listWorkspaceFiles(workingDirectory, 4);
    const conflicting = new Set(getConflictingScaffoldPathsText({
      workingDirectory: plan.workingDirectory,
      workspaceKind: plan.workspaceKind
    }));
    const removable = entries
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path.replace(/\\/g, "/"))
      .filter((path) => conflicting.has(path) || isUnexpectedGeneratedAppFileText(path, workingDirectory, allowed));

    const removed: string[] = [];
    for (const relPath of removable) {
      try {
        await rm(resolveWorkspacePathText(this.workspaceRoot, relPath), { force: true });
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

  private async collectConflictingWorkspaceFiles(plan: Pick<TaskExecutionPlan, "workingDirectory" | "workspaceKind">): Promise<string[]> {
    const present: string[] = [];
    for (const targetPath of getConflictingScaffoldPathsText({
      workingDirectory: plan.workingDirectory,
      workspaceKind: plan.workspaceKind
    })) {
      try {
        await stat(resolveWorkspacePathText(this.workspaceRoot, targetPath));
        present.push(targetPath);
      } catch {
        // ignore missing conflicting files
      }
    }
    return present;
  }

  private async requestTaskImplementation(
    taskId: string,
    userPrompt: string,
    plan: TaskExecutionPlan,
    workItem?: TaskWorkItem
  ): Promise<FixResponse> {
    const taskAttachments = cloneTaskAttachmentsText(this.tasks.get(taskId)?.attachments);
    const routes = this.resolveModelRoutes("Implementation", {
      requiresVision: taskRequiresVisionRouteText(taskAttachments)
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

    const messages = buildTaskPromptMessagesText(
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
      (route) => !exhaustedImplementationRoutes.has(route.model)
        && !isTaskModelBlacklistedText(this.taskModelBlacklist, taskId, route.model)
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
        initialParsed = tryParseStructuredFixResponseText(initialResponse, "Implementation", { strictSchema: true }) as ParsedFixResponse | null;
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
        retryParsed = tryParseStructuredFixResponseText(retryResponse, "Implementation", { strictSchema: true }) as ParsedFixResponse | null;
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

    allowed.add(joinWorkspacePathText(workingDirectory, "package.json"));

    for (const path of [...requested, ...required]) {
      if (path) allowed.add(path);
    }

    if (plan.workspaceKind === "react") {
      allowed.add(joinWorkspacePathText(workingDirectory, "index.html"));
      allowed.add(joinWorkspacePathText(workingDirectory, "src/main.tsx"));
      allowed.add(joinWorkspacePathText(workingDirectory, "src/App.tsx"));
      allowed.add(joinWorkspacePathText(workingDirectory, "src/App.css"));
      allowed.add(joinWorkspacePathText(workingDirectory, "src/index.css"));
      if (plan.spec?.starterProfile === "electron-desktop") {
        allowed.add(joinWorkspacePathText(workingDirectory, "electron/main.mjs"));
        allowed.add(joinWorkspacePathText(workingDirectory, "electron/preload.mjs"));
        allowed.add(joinWorkspacePathText(workingDirectory, "scripts/desktop-launch.mjs"));
      }
    } else if (plan.workspaceKind === "static") {
      allowed.add(joinWorkspacePathText(workingDirectory, "index.html"));
      allowed.add(joinWorkspacePathText(workingDirectory, "styles.css"));
      allowed.add(joinWorkspacePathText(workingDirectory, "app.js"));
    }

    return [...allowed];
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
      if (!plan && !allowed.has(path) && !isPathInsideWorkingDirectoryText(path, workingDirectory)) {
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
    if (!isPathInsideWorkingDirectoryText(path, workingDirectory)) return false;

    const relativePath = path
      .replace(/\\/g, "/")
      .replace(new RegExp(`^${escapeRegExpText(workingDirectory.replace(/^\.?\//, ""))}/?`), "")
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

    return joinWorkspacePathText(workingDirectory, normalized);
  }

  private hasUsefulImplementation(implementation: FixResponse, workItem: TaskWorkItem): boolean {
    void workItem;
    return implementation.edits.length > 0;
  }

  private isCandidatePathRelevant(
    path: string,
    workspaceKind: "static" | "react" | "generic",
    workingDirectory: string
  ): boolean {
    if (!isPathInsideWorkingDirectoryText(path, workingDirectory)) return false;

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
    const normalizedPrompt = (prompt ?? "").trim().toLowerCase();

    const wantsKanban = ["kanban", "task board"].some((term) => normalizedPrompt.includes(term));
    if (wantsKanban) {
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const kanbanBoard = buildHeuristicKanbanWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        isStaticWorkspace: plan.workspaceKind === "static",
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildStaticKanbanHtml: (nextTitle) => buildStaticKanbanHtmlTemplate(nextTitle),
        buildStaticKanbanCss: () => buildStaticKanbanCssTemplate(),
        buildStaticKanbanJs: () => buildStaticKanbanJsTemplate(),
        buildKanbanBoardTsx: (nextTitle) => buildKanbanBoardTsxTemplate(nextTitle),
        buildKanbanBoardCss: () => buildKanbanBoardCssTemplate(),
        buildKanbanBoardIndexCss: () => buildKanbanBoardIndexCssTemplate()
      });
      this.appendLog(taskId, `Using heuristic kanban implementation for ${plan.workingDirectory}.`);
      return kanbanBoard;
    }

    const desktopWorkspace = this.buildHeuristicDesktopWorkspace(prompt, plan);
    if (desktopWorkspace) {
      this.appendLog(taskId, `Using heuristic desktop workspace implementation for ${plan.workingDirectory}.`);
      return desktopWorkspace;
    }

    const wantsNotes = ["notes app", "note app", "notes", "todo"].some((term) => normalizedPrompt.includes(term));
    if (wantsNotes) {
      const wantsSearch = normalizedPrompt.includes("search");
      const wantsDelete = normalizedPrompt.includes("delete") || normalizedPrompt.includes("remove");
      const wantsAdd = normalizedPrompt.includes("add") || normalizedPrompt.includes("create");
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const notesApp = buildHeuristicNotesWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        isStaticWorkspace: plan.workspaceKind === "static",
        features: { wantsSearch, wantsDelete, wantsAdd },
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildStaticNotesHtml: (nextTitle) => buildStaticNotesHtmlTemplate(nextTitle),
        buildStaticNotesCss: () => buildStaticNotesCssTemplate(),
        buildStaticNotesJs: (nextTitle, features) => buildStaticNotesJsTemplate(nextTitle, features),
        buildNotesAppTsx: (nextTitle, features) => buildNotesAppTsxTemplate(nextTitle, features),
        buildNotesAppCss: () => buildNotesAppCssTemplate(),
        buildNotesIndexCss: () => buildNotesIndexCssTemplate()
      });
      this.appendLog(taskId, `Using heuristic notes app implementation for ${plan.workingDirectory}.`);
      return notesApp;
    }

    const scriptTool = buildHeuristicScriptToolWorkspace({
      prompt,
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory,
      inferArtifactTypeFromPrompt: inferArtifactTypeFromPromptText,
      extractProjectName: (nextPrompt) => extractProjectNameText(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath)
    });
    if (scriptTool) {
      this.appendLog(taskId, `Using heuristic script-tool implementation for ${plan.workingDirectory}.`);
      return scriptTool;
    }

    const library = buildHeuristicLibraryWorkspace({
      prompt,
      workspaceKind: plan.workspaceKind,
      workingDirectory: plan.workingDirectory,
      inferArtifactTypeFromPrompt: inferArtifactTypeFromPromptText,
      extractProjectName: (nextPrompt) => extractProjectNameText(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath)
    });
    if (library) {
      this.appendLog(taskId, `Using heuristic library implementation for ${plan.workingDirectory}.`);
      return library;
    }

    const apiService = this.buildHeuristicApiService(prompt, plan);
    if (apiService) {
      this.appendLog(taskId, `Using heuristic API service implementation for ${plan.workingDirectory}.`);
      return apiService;
    }

    const wantsLanding = ["landing page", "website", "site", "homepage"].some((term) => normalizedPrompt.includes(term));
    if (wantsLanding) {
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const landingPage = buildHeuristicLandingWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        isStaticWorkspace: plan.workspaceKind === "static",
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildStaticLandingHtml: (nextTitle) => buildStaticLandingHtmlTemplate(nextTitle),
        buildStaticLandingCss: () => buildStaticLandingCssTemplate(),
        buildStaticLandingJs: (nextTitle) => buildStaticLandingJsTemplate(nextTitle),
        buildLandingPageTsx: (nextTitle) => buildLandingPageTsxTemplate(nextTitle),
        buildLandingPageCss: () => buildLandingPageCssTemplate(),
        buildLandingIndexCss: () => buildLandingIndexCssTemplate()
      });
      this.appendLog(taskId, `Using heuristic landing page implementation for ${plan.workingDirectory}.`);
      return landingPage;
    }

    const wantsPricing = ["pricing page", "pricing", "plans", "plan comparison"].some((term) => normalizedPrompt.includes(term));
    if (wantsPricing) {
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const pricingPage = buildHeuristicMarketingPageWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildAppTsx: (nextTitle) => buildPricingPageTsxTemplate(nextTitle),
        buildAppCss: () => buildPricingPageCssTemplate(),
        buildIndexCss: () => buildLandingIndexCssTemplate(),
        summaryPrefix: "pricing page with hero, plan cards, comparison, and contact CTA"
      });
      this.appendLog(taskId, `Using heuristic pricing page implementation for ${plan.workingDirectory}.`);
      return pricingPage;
    }

    const wantsAnnouncement = ["announcement page", "feature announcement", "update page", "rollout timeline"].some((term) => normalizedPrompt.includes(term));
    if (wantsAnnouncement) {
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const announcementPage = buildHeuristicMarketingPageWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildAppTsx: (nextTitle) => buildAnnouncementPageTsxTemplate(nextTitle),
        buildAppCss: () => buildAnnouncementPageCssTemplate(),
        buildIndexCss: () => buildLandingIndexCssTemplate(),
        summaryPrefix: "feature announcement page with hero, update cards, rollout timeline, and contact CTA"
      });
      this.appendLog(taskId, `Using heuristic announcement page implementation for ${plan.workingDirectory}.`);
      return announcementPage;
    }

    const wantsDashboard = ["dashboard", "admin panel", "analytics", "wallboard", "kpi", "incident", "escalation"]
      .some((term) => normalizedPrompt.includes(term));
    if (wantsDashboard) {
      const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
      const domainFocus = plan.spec?.domainFocus ?? inferDomainFocusText(prompt, "react-dashboard", null);
      const dashboard = buildHeuristicDashboardWorkspace({
        title,
        workingDirectory: plan.workingDirectory,
        isStaticWorkspace: plan.workspaceKind === "static",
        domainFocus,
        resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
        buildStaticDashboardHtml: (nextTitle, nextDomainFocus) => buildStaticDashboardHtmlForDomain(nextTitle, nextDomainFocus),
        buildStaticDashboardCss: () => buildStaticDashboardCssTemplate(),
        buildStaticDashboardJs: (nextDomainFocus) => buildStaticDashboardJsForDomain(nextDomainFocus),
        buildDashboardTsx: (nextTitle, nextDomainFocus) => buildDashboardTsxForDomain(nextTitle, nextDomainFocus),
        buildDashboardCss: () => buildDashboardCssTemplate(),
        buildDashboardIndexCss: () => buildDashboardIndexCssTemplate()
      });
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
    const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
    return buildHeuristicDesktopWorkspaceResult({
      prompt,
      workspaceKind: plan.workspaceKind,
      builderMode: plan.builderMode,
      workingDirectory: plan.workingDirectory,
      title,
      isDesktopBusinessReportingPrompt: isDesktopBusinessReportingPromptText,
      isSimpleDesktopUtilityPrompt: isSimpleDesktopUtilityPromptText,
      resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath)
    });
  }

  private buildHeuristicApiService(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    if (inferArtifactTypeFromPromptText(normalized) !== "api-service") return null;
    if (plan.workspaceKind !== "generic") return null;

    const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
    const domainFocus = plan.spec?.domainFocus ?? inferDomainFocusText(prompt, "node-api-service", "api-service");
    return buildHeuristicApiServiceWorkspace({
      prompt,
      normalizedPrompt: normalized,
      title,
      domainFocus,
      workingDirectory: plan.workingDirectory,
      extractProjectName: (nextPrompt) => extractProjectNameText(nextPrompt),
      resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
      resolveDomainEntity: (nextDomainFocus) => buildApiEntityForDomainFocus(nextDomainFocus as DomainFocus)
    });
  }

  private buildHeuristicCrudApp(prompt: string, plan: TaskExecutionPlan): HeuristicImplementationResult | null {
    const normalized = (prompt ?? "").trim().toLowerCase();
    const wantsCrud = looksLikeCrudAppPromptText(normalized)
      || /\b(table|status|due date|due dates|vendor|vendors|payment status|mark (?:one )?paid)\b/.test(normalized);
    if (!wantsCrud) return null;
    const isVendorPayments = /\b(vendor|vendors|payment|payments|mark (?:one )?paid|due date|due dates)\b/.test(normalized);

    const title = toDisplayNameFromDirectoryText(plan.workingDirectory, "Focus Notes");
    const domainFocus = plan.spec?.domainFocus ?? inferDomainFocusText(prompt, "react-crud", null);
    return buildHeuristicCrudWorkspace({
      title,
      workingDirectory: plan.workingDirectory,
      isStaticWorkspace: plan.workspaceKind === "static",
      isVendorPayments,
      domainFocus,
      resolveWorkspacePath: (workingDirectory, relativePath) => joinWorkspacePathText(workingDirectory, relativePath),
      buildStaticCrudHtml: (nextTitle, nextDomainFocus) => buildStaticCrudHtmlForDomain(nextTitle, nextDomainFocus),
      buildStaticCrudCss: () => buildStaticCrudCssTemplate(),
      buildStaticCrudJs: (_nextTitle, nextDomainFocus) => buildStaticCrudJsForDomain(nextDomainFocus),
      buildCrudAppTsx: (nextTitle, nextDomainFocus) => buildCrudAppTsxForDomain(nextTitle, nextDomainFocus),
      buildVendorPaymentsCrudAppTsx: (nextTitle) => buildVendorPaymentsCrudAppTsxTemplate(nextTitle),
      buildCrudAppCss: () => buildCrudAppCssTemplate(),
      buildCrudIndexCss: () => buildCrudIndexCssTemplate()
    });
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
        : [joinWorkspacePathText(workingDirectory, "package.json")]
    );
    const staticCandidates = [
      joinWorkspacePathText(workingDirectory, "package.json"),
      joinWorkspacePathText(workingDirectory, "tsconfig.json"),
      joinWorkspacePathText(workingDirectory, "vite.config.ts"),
      joinWorkspacePathText(workingDirectory, "src/main.tsx"),
      joinWorkspacePathText(workingDirectory, "src/App.tsx"),
      joinWorkspacePathText(workingDirectory, "src/index.css"),
      joinWorkspacePathText(workingDirectory, "src/App.css"),
      joinWorkspacePathText(workingDirectory, "src/app/page.tsx"),
      joinWorkspacePathText(workingDirectory, "index.html"),
      joinWorkspacePathText(workingDirectory, "styles.css"),
      joinWorkspacePathText(workingDirectory, "app.js")
    ];
    const genericCandidates = [
      joinWorkspacePathText(workingDirectory, "package.json"),
      joinWorkspacePathText(workingDirectory, "src/index.js"),
      joinWorkspacePathText(workingDirectory, "src/index.ts"),
      joinWorkspacePathText(workingDirectory, "src/server.js"),
      joinWorkspacePathText(workingDirectory, "src/server.ts"),
      joinWorkspacePathText(workingDirectory, "bin/cli.js"),
      joinWorkspacePathText(workingDirectory, "bin/cli.mjs"),
      joinWorkspacePathText(workingDirectory, "README.md")
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
    const taskAttachments = cloneTaskAttachmentsText(this.tasks.get(taskId)?.attachments);
    const routes = this.resolveModelRoutes(stageLabel, {
      requiresVision: taskRequiresVisionRouteText(taskAttachments)
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
    const failureCategory = classifyFailureCategoryText(stageLabel, commandResult.combinedOutput || "");
    const failureGuidance = buildFailureCategoryGuidanceText(failureCategory);
    const failureMemory = this.getRelevantFailureMemory(taskId, stageLabel, failureCategory, plan);
    const specRequiredFiles = plan?.spec?.requiredFiles ?? [];
    const specRequiredScriptGroups = plan?.spec?.requiredScriptGroups ?? [];
    const specAcceptanceCriteria = plan?.spec?.acceptanceCriteria ?? [];
    const specQualityGates = plan?.spec?.qualityGates ?? [];
    const task = this.tasks.get(taskId);
    if (task) {
      const telemetry = ensureTaskTelemetryText(task);
      telemetry.failureMemoryHints = failureMemory.map((entry) => `${entry.category}/${entry.signature}: ${entry.guidance}`);
      this.persistTaskStateNow(Date.now(), task.id);
    }
    const recoveryStageLabel = `${stageLabel} recovery`;
    const exhaustedRepairRoutes = new Set<string>();
    const getAvailableRoutes = (): ModelRoute[] => routes.filter(
      (route) => !exhaustedRepairRoutes.has(route.model)
        && !isTaskModelBlacklistedText(this.taskModelBlacklist, taskId, route.model)
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
    const baseMessages = buildTaskPromptMessagesText(
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
        ...formatFailureMemoryForPromptText(failureMemory),
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
        initialParsed = tryParseStructuredFixResponseText(initialResponse, recoveryStageLabel, { strictSchema: true }) as ParsedFixResponse | null;
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
        retryParsed = tryParseStructuredFixResponseText(retryResponse, recoveryStageLabel, { strictSchema: true }) as ParsedFixResponse | null;
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
      if (!retryParsed || retryParsed.issue === "schema-mismatch") {
        const looseRetryParsed = tryParseStructuredFixResponseText(
          retryResponse,
          recoveryStageLabel,
          { strictSchema: false }
        ) as ParsedFixResponse | null;
        if (looseRetryParsed?.fix) {
          const strictFromLoose = tryParseStructuredFixResponseText(
            looseRetryParsed.extractedJson,
            recoveryStageLabel,
            { strictSchema: true }
          ) as ParsedFixResponse | null;
          if (strictFromLoose?.fix) {
            this.appendLog(
              taskId,
              `Structured JSON recovered after retry using loose-wrapper fallback (${looseRetryParsed.extractedJson.length} chars).`
            );
            return strictFromLoose.fix;
          }
        }
        if (looseRetryParsed?.issue === "no-usable-edits") {
          lastFailure = `${stageLabel} recovery model returned JSON without usable edits after retry.`;
          this.recordSemanticModelFailure(
            taskId,
            recoveryStageLabel,
            `${stageLabel} recovery response contained valid JSON but no usable edits after retry.`
          );
          markCurrentRepairRouteExhausted();
          if (!hasRemainingRoutes()) break;
          this.appendLog(taskId, `${lastFailure} Trying next ${stageLabel.toLowerCase()} recovery model route...`);
          continue;
        }
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

  private getRelevantFailureMemory(
    taskId: string,
    stageLabel: string,
    failureCategory: AgentTaskFailureCategory,
    plan?: TaskExecutionPlan
  ): FailureMemoryEntry[] {
    const task = this.tasks.get(taskId);
    const currentArtifact = task?.artifactType
      ?? (task?.prompt ? inferArtifactTypeFromPromptText(task.prompt) : null)
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
      if (isTaskModelBlacklistedText(this.taskModelBlacklist, taskId, route.model)) {
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
          const transient = isTransientModelFailureText(message);
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
      throw new Error(buildExhaustedModelRouteMessageText(stageLabel, routeFailures));
    }

    throw lastError instanceof Error ? lastError : new Error("Model request failed.");
  }

  private recordModelRouteStat(
    route: Pick<ModelRoute, "model" | "baseUrl" | "skipAuth">,
    outcome: AgentTaskModelAttempt["outcome"]
  ): void {
    const key = buildModelRouteKeyText(route);
    const next: ModelRouteStats = buildNextModelRouteReliabilityStatsText(this.modelRouteStats.get(key), outcome);
    this.modelRouteStats.set(key, next);
    this.persistTaskStateNow(Date.now(), this.activeTaskId ?? undefined);
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
    const detail = compactFailureMessageText(failureOutput || `${normalizedStage} verification still failed after applying model edits.`);
    this.recordSemanticModelFailure(
      taskId,
      `${normalizedStage} recovery`,
      `${normalizedStage} verification still failed after applying model edits. ${detail}`
    );
  }

  private rememberFailureMemory(taskId: string, stage: string, message: string): void {
    const normalizedStage = (stage ?? "").trim();
    const compact = compactFailureMessageText(message ?? "");
    if (!taskId || !normalizedStage || !compact) return;

    const task = this.tasks.get(taskId);
    const category = classifyFailureCategoryText(normalizedStage, compact);
    const artifactType = task?.artifactType
      ?? (task?.prompt ? inferArtifactTypeFromPromptText(task.prompt) : null)
      ?? "unknown";
    const signature = buildFailureMemorySignatureText(category, compact);
    const key = `${artifactType}|${category}|${signature}`;
    const guidance = buildFailureMemoryGuidanceText({
      signature,
      message: compact,
      categoryGuidance: buildFailureCategoryGuidanceText(category),
      compactFailureMessage: compactFailureMessageText
    });
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
    if (next.created) trimFailureMemoryStoreText(this.failureMemory, MAX_FAILURE_MEMORY_ENTRIES);
    this.persistTaskStateNow(Date.now(), taskId);
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
    this.enforceTaskRuntimeBudget(taskId, "apply edits");
    const editPaths = edits
      .map((edit) => (edit.path ?? "").trim())
      .filter(Boolean);
    this.enforceTaskFileEditBudget(taskId, editPaths);
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
    this.trackTaskEditedFiles(taskId, changedFiles);
    return changedFiles;
  }

  private normalizeStructuredEditContentForWrite(path: string, content: string): string {
    const normalizedPath = (path ?? "").replace(/\\/g, "/").toLowerCase();
    if (!normalizedPath.endsWith("package.json")) {
      return content;
    }

    const manifest = parseLoosePackageManifestText(content, normalizeLooseJsonText) as PackageManifest | null;
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

  private appendLog(taskId: string, line: string): void {
    appendTaskLogLineText(this.taskLogs, taskId, line, MAX_LOG_LINES);
    if (taskId !== "manual") {
      this.queueTaskStatePersist(taskId);
    }
  }

  private async tryReadPackageJson(targetDirectory = "."): Promise<PackageManifest | null> {
    const fullPath = join(resolveWorkspacePathText(this.workspaceRoot, targetDirectory), "package.json");
    try {
      const content = await readFile(fullPath, "utf8");
      return parseLoosePackageManifestText(content, normalizeLooseJsonText) as PackageManifest | null;
    } catch {
      return null;
    }
  }

  private async ensureGeneratedAppPackageJson(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;

    const packageJsonPath = joinWorkspacePathText(workingDirectory, "package.json");
    const packageLockPath = joinWorkspacePathText(workingDirectory, "package-lock.json");

    let current: Record<string, unknown> = {};
    try {
      const raw = await readFile(resolveWorkspacePathText(this.workspaceRoot, packageJsonPath), "utf8");
      current = (parseLoosePackageManifestText(raw, normalizeLooseJsonText) as Record<string, unknown> | null) ?? {};
    } catch {
      current = {};
    }

    let packageName = typeof current.name === "string" && current.name.trim()
      ? current.name.trim()
      : toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes").toLowerCase().replace(/\s+/g, "-");

    if (!packageName) {
      try {
        const rawLock = await readFile(resolveWorkspacePathText(this.workspaceRoot, packageLockPath), "utf8");
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
      const inferredArtifact = inferGeneratedGenericArtifactTypeFromData(plan, current);
      const defaultScripts = buildNodePackageScriptsTemplate(inferredArtifact ?? undefined);
      const normalized = buildGeneratedGenericPackageManifest(packageName, current, defaultScripts);

      await this.writeWorkspaceFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return;
    }

    if (plan.workspaceKind !== "react") return;

    const isDesktopApp = artifactType === "desktop-app";
    const displayName = toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes");
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
            appId: buildGeneratedDesktopAppIdTemplate(packageName),
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

  private async ensureGeneratedReactProjectFiles(
    plan: TaskExecutionPlan,
    artifactType?: AgentArtifactType
  ): Promise<void> {
    const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
    if (!workingDirectory.startsWith("generated-apps/")) return;
    if (plan.workspaceKind !== "react") return;

    const projectName = toDisplayNameFromDirectoryText(workingDirectory, "Focus Notes");
    for (const file of buildGeneratedReactScaffoldFiles(projectName)) {
      await this.writeWorkspaceFile(
        joinWorkspacePathText(workingDirectory, file.path),
        file.content
      );
    }

    if (artifactType !== "desktop-app") return;
    for (const file of buildGeneratedDesktopScaffoldFiles(projectName)) {
      await this.writeWorkspaceFile(
        joinWorkspacePathText(workingDirectory, file.path),
        file.content
      );
    }
  }

  private detectBootstrapPlan(prompt: string, inspection: WorkspaceInspectionResult): BootstrapPlan | null {
    const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
    if (!normalizedPrompt) return null;

    const wantsNewProject = this.looksLikeNewProjectPrompt(normalizedPrompt);

    if (!wantsNewProject) return null;

    const projectName = extractProjectNameText(prompt);
    const targetDirectory = joinWorkspacePathText("generated-apps", projectName);
    const normalizedPackageName = (inspection.packageName ?? "").trim().toLowerCase();
    const looksLikeCipherRepo = normalizedPackageName === "cipher-ai" || normalizedPackageName === "cipher-workspace";

    if (!looksLikeCipherRepo && normalizedPackageName) {
      return null;
    }

    const wantsNext = /\bnext(?:\.js|js)\b/.test(normalizedPrompt);
    const wantsStatic = ["landing page", "pricing page", "microsite", "showcase page", "marketing page", "static site", "html css", "vanilla js"].some((term) => normalizedPrompt.includes(term));
    const promptArtifact = inferArtifactTypeFromPromptText(normalizedPrompt);
    const starterProfile = inferStarterProfileText(
      promptArtifact,
      detectBuilderModeText(prompt, {
        looksLikeCrudAppPrompt: looksLikeCrudAppPromptText
      }),
      wantsStatic ? "static" : "react"
    );
    const domainFocus = inferDomainFocusText(prompt, starterProfile, promptArtifact);
    const wantsNodePackage = promptArtifact === "script-tool" || promptArtifact === "library" || promptArtifact === "api-service";
    const isDesktopStarter = starterProfile === "electron-desktop" || promptArtifact === "desktop-app";
    const template: BootstrapPlan["template"] = wantsNodePackage
      ? "node-package"
      : isDesktopStarter
        ? "react-vite"
        : (wantsNext ? "nextjs" : (wantsStatic ? "static" : "react-vite"));
    const commands = buildBootstrapCommandsText(template, targetDirectory, { platform: process.platform });

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
    const promptArtifact = inferArtifactTypeFromPromptText(normalizedPrompt);
    const starterProfile = inferStarterProfileText(
      promptArtifact,
      detectBuilderModeText(prompt, {
        looksLikeCrudAppPrompt: looksLikeCrudAppPromptText
      }),
      wantsStatic ? "static" : "react"
    );
    const domainFocus = inferDomainFocusText(prompt, starterProfile, promptArtifact);
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
      commands: buildBootstrapCommandsText(template, targetDirectory, { platform: process.platform })
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


  private async executeBootstrapPlan(taskId: string, plan: BootstrapPlan): Promise<{ summary: string }> {
    const targetPath = resolveWorkspacePathText(this.workspaceRoot, plan.targetDirectory);
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
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, "index.html"), buildStaticBootstrapHtmlTemplate(plan.projectName, plan.starterProfile));
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, "styles.css"), buildStaticBootstrapCssTemplate(plan.starterProfile));
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, "app.js"), buildStaticBootstrapJsTemplate(plan.projectName, plan.starterProfile));
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, "package.json"), JSON.stringify({
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
          throw new Error(buildCommandFailureMessageText("Bootstrap", result, `failed while running ${result.commandLine}`));
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
        joinWorkspacePathText(plan.targetDirectory, "index.html"),
        joinWorkspacePathText(plan.targetDirectory, "styles.css"),
        joinWorkspacePathText(plan.targetDirectory, "app.js"),
        joinWorkspacePathText(plan.targetDirectory, "package.json")
      ]
      : plan.template === "nextjs"
        ? [
          joinWorkspacePathText(plan.targetDirectory, "package.json"),
          joinWorkspacePathText(plan.targetDirectory, "src/app/page.tsx")
        ]
        : plan.template === "node-package"
          ? [
            joinWorkspacePathText(plan.targetDirectory, "package.json"),
            ...(plan.artifactType === "api-service"
              ? [joinWorkspacePathText(plan.targetDirectory, "src/server.js")]
              : [joinWorkspacePathText(plan.targetDirectory, "src/index.js")])
          ]
        : [
          joinWorkspacePathText(plan.targetDirectory, "package.json"),
          joinWorkspacePathText(plan.targetDirectory, "index.html"),
          joinWorkspacePathText(plan.targetDirectory, "src/main.tsx"),
          joinWorkspacePathText(plan.targetDirectory, "src/App.tsx"),
          joinWorkspacePathText(plan.targetDirectory, "node_modules/@vitejs/plugin-react/package.json"),
          joinWorkspacePathText(plan.targetDirectory, "node_modules/vite/package.json"),
          joinWorkspacePathText(plan.targetDirectory, "node_modules/react/package.json")
        ];

    if (plan.starterProfile === "electron-desktop") {
      requiredPaths.push(joinWorkspacePathText(plan.targetDirectory, "electron/main.mjs"));
      requiredPaths.push(joinWorkspacePathText(plan.targetDirectory, "electron/preload.mjs"));
      requiredPaths.push(joinWorkspacePathText(plan.targetDirectory, "scripts/desktop-launch.mjs"));
    }

    for (const relPath of requiredPaths) {
      try {
        await stat(resolveWorkspacePathText(this.workspaceRoot, relPath));
      } catch {
        return false;
      }
    }

    if (plan.starterProfile === "electron-desktop") {
      try {
        const raw = await readFile(resolveWorkspacePathText(this.workspaceRoot, joinWorkspacePathText(plan.targetDirectory, "package.json")), "utf8");
        const parsed = parseLoosePackageManifestText(raw, normalizeLooseJsonText) as PackageManifest | null;
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
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, file.path), file.content);
    }
  }

  private async ensureStaticWorkspaceScripts(targetDirectory: string): Promise<void> {
    const packageJsonPath = joinWorkspacePathText(targetDirectory, "package.json");
    const indexPath = joinWorkspacePathText(targetDirectory, "index.html");
    const stylesPath = joinWorkspacePathText(targetDirectory, "styles.css");
    const scriptPath = joinWorkspacePathText(targetDirectory, "app.js");

    try {
      await stat(resolveWorkspacePathText(this.workspaceRoot, indexPath));
      await stat(resolveWorkspacePathText(this.workspaceRoot, stylesPath));
      await stat(resolveWorkspacePathText(this.workspaceRoot, scriptPath));
    } catch {
      return;
    }

    try {
      const raw = await readFile(resolveWorkspacePathText(this.workspaceRoot, packageJsonPath), "utf8");
      const parsed = JSON.parse(raw) as {
        name?: string;
        private?: boolean;
        version?: string;
        scripts?: Record<string, string>;
      };
      const nextPackageJson = {
        name: parsed.name || toDisplayNameFromDirectoryText(targetDirectory, "Focus Notes").toLowerCase().replace(/\s+/g, "-"),
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

  private async writeBootstrapNodePackage(plan: BootstrapPlan): Promise<void> {
    const packageJsonPath = joinWorkspacePathText(plan.targetDirectory, "package.json");
    await this.writeWorkspaceFile(
      packageJsonPath,
      JSON.stringify(buildNodePackageManifestTemplate(plan.projectName, plan.artifactType), null, 2) + "\n"
    );

    for (const file of buildNodePackageStarterContentTemplate(plan.projectName, {
      artifactType: plan.artifactType,
      apiEntity: plan.artifactType === "api-service" ? buildApiEntityForDomainFocus(plan.domainFocus) : undefined
    })) {
      await this.writeWorkspaceFile(joinWorkspacePathText(plan.targetDirectory, file.path), file.content);
    }
  }

  private buildReactBootstrapStarterFiles(plan: BootstrapPlan): Array<{ path: string; content: string }> {
    const title = toDisplayNameFromDirectoryText(plan.targetDirectory, "Focus Notes");
    switch (plan.starterProfile) {
      case "electron-desktop":
        return [
          { path: "src/App.tsx", content: buildDesktopBootstrapAppTsxTemplate(title, buildDesktopDomainContentForFocus(plan.domainFocus)) },
          { path: "src/App.css", content: buildDesktopBootstrapAppCssTemplate() },
          { path: "src/index.css", content: buildDesktopBootstrapIndexCssTemplate() }
        ];
      case "react-dashboard":
        return [
          { path: "src/App.tsx", content: buildDashboardTsxForDomain(title, plan.domainFocus) },
          { path: "src/App.css", content: buildDashboardCssTemplate() },
          { path: "src/index.css", content: buildDashboardIndexCssTemplate() }
        ];
      case "react-crud":
        return [
          { path: "src/App.tsx", content: buildCrudAppTsxForDomain(title, plan.domainFocus) },
          { path: "src/App.css", content: buildCrudAppCssTemplate() },
          { path: "src/index.css", content: buildCrudIndexCssTemplate() }
        ];
      case "react-kanban":
        return [
          { path: "src/App.tsx", content: buildKanbanBoardTsxTemplate(title) },
          { path: "src/App.css", content: buildDashboardCssTemplate() },
          { path: "src/index.css", content: buildDashboardIndexCssTemplate() }
        ];
      case "react-notes":
        return [
          { path: "src/App.tsx", content: buildNotesAppTsxTemplate(title, { wantsSearch: true, wantsDelete: true, wantsAdd: true }) },
          { path: "src/App.css", content: buildNotesAppCssTemplate() },
          { path: "src/index.css", content: buildNotesIndexCssTemplate() }
        ];
      default:
        return [
          { path: "src/App.tsx", content: buildGeneralReactStarterAppTemplate(title) },
          { path: "src/App.css", content: buildGeneralReactStarterCssTemplate() },
          { path: "src/index.css", content: buildGeneralReactStarterIndexCssTemplate() }
        ];
    }
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
        score: getModelRouteScoreText(this.modelRouteStats, route),
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
    try {
      const rootInfo = await stat(root);
      if (!rootInfo.isDirectory()) return [];
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "ENOENT" || code === "ENOTDIR") {
        return [];
      }
      throw error;
    }

    const entries: WorkspaceFileEntry[] = [];
    await this.walkEntries(root, depth, entries);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async walkEntries(current: string, depth: number, acc: WorkspaceFileEntry[]): Promise<void> {
    let dirEntries: Dirent[];
    try {
      dirEntries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "ENOENT" || code === "ENOTDIR") {
        return;
      }
      throw error;
    }

    for (const entry of dirEntries) {
      const fullPath = join(current, entry.name);
      const relPath = toWorkspaceRelativeText(this.workspaceRoot, fullPath);
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

  private syncTaskRouteTelemetry(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const telemetry = ensureTaskTelemetryText(task);
    telemetry.routeDiagnostics = buildTaskRouteTelemetrySummaryText({
      taskId,
      taskModelBlacklist: this.taskModelBlacklist,
      taskModelFailureCounts: this.taskModelFailureCounts,
      taskStageRoutes: this.taskStageRoutes,
      visionRequested: taskRequiresVisionRouteText(cloneTaskAttachmentsText(this.tasks.get(taskId)?.attachments)),
      buildTaskModelFailureStatus: (targetTaskId, model) => {
        const normalizedModel = (model ?? "").trim();
        const count = this.taskModelFailureCounts.get(targetTaskId)?.get(normalizedModel) ?? 0;
        return buildModelFailureStatusText({
          count,
          blacklisted: isTaskModelBlacklistedText(this.taskModelBlacklist, targetTaskId, normalizedModel),
          hardFailureThreshold: AGENT_MODEL_BLACKLIST_THRESHOLD,
          transientFailureThreshold: AGENT_MODEL_TRANSIENT_BLACKLIST_THRESHOLD
        });
      },
      getModelRouteScore: (route) => getModelRouteScoreText(this.modelRouteStats, route),
      buildModelRouteScoreFactors: (route) => buildModelRouteScoreFactorsText(this.modelRouteStats, route),
      buildTaskStageSelectionReason: (targetTaskId, stage, route, routeIndex) => buildTaskStageSelectionReasonText({
        routingStage: inferRoutingStageText(stage),
        route,
        routeIndex,
        requiresVision: taskRequiresVisionRouteText(cloneTaskAttachmentsText(this.tasks.get(targetTaskId)?.attachments))
      })
    });
  }

  private mapDoDGateFromStage(stage: string): AgentTaskDoDGateId | null {
    const normalized = (stage ?? "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "plan task execution") return "plan";
    if (normalized === "implement requested changes" || normalized.startsWith("implement:")) return "implement";
    if (normalized === "verify build and quality scripts") return "verify";
    if (normalized === "repair verification failures") return "repair";
    if (normalized === "package windows installer") return "package";
    if (normalized === "run windows installer smoke") return "installer-smoke";
    if (normalized === "approve generated output") return "approve";
    return null;
  }

  private getDoDGateOrder(gate: AgentTaskDoDGateId): number {
    switch (gate) {
      case "plan":
        return 0;
      case "implement":
        return 1;
      case "verify":
        return 2;
      case "repair":
        return 3;
      case "package":
        return 4;
      case "installer-smoke":
        return 5;
      case "approve":
        return 6;
      default:
        return Number.MAX_SAFE_INTEGER;
    }
  }

  private recordDoDGateOutcome(
    task: AgentTask,
    gate: AgentTaskDoDGateId,
    status: AgentVerificationStatus,
    summary: string
  ): void {
    const telemetry = ensureTaskTelemetryText(task);
    const outcomes = telemetry.dodGateOutcomes ?? [];
    const nextOutcome: AgentTaskDoDGateOutcome = {
      gate,
      status,
      summary: (summary ?? "").trim() || `${gate} ${status}`,
      updatedAt: new Date().toISOString()
    };
    const existingIndex = outcomes.findIndex((entry) => entry.gate === gate);
    if (existingIndex >= 0) {
      outcomes[existingIndex] = nextOutcome;
    } else {
      outcomes.push(nextOutcome);
    }
    outcomes.sort((left, right) => this.getDoDGateOrder(left.gate) - this.getDoDGateOrder(right.gate));
    telemetry.dodGateOutcomes = outcomes;
  }

  private recordDoDGateOutcomeForStage(
    task: AgentTask,
    stage: string,
    status: AgentVerificationStatus,
    summary: string
  ): void {
    const gate = this.mapDoDGateFromStage(stage);
    if (!gate) return;
    this.recordDoDGateOutcome(task, gate, status, summary);
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

    const telemetry = ensureTaskTelemetryText(task);
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
    this.persistTaskStateNow(Date.now(), task.id);
  }

  private cloneTask(task: AgentTask): AgentTask {
    return {
      ...task,
      attachments: (task.attachments ?? []).map((attachment) => ({ ...attachment })),
      budget: task.budget ? { ...task.budget } : undefined,
      budgetUsage: task.budgetUsage ? { ...task.budgetUsage } : undefined,
      steps: task.steps.map((step) => ({ ...step })),
      output: task.output ? { ...task.output } : undefined,
      executionSpec: this.cloneExecutionSpec(task.executionSpec),
      telemetry: task.telemetry
        ? {
          ...task.telemetry,
          runMode: task.telemetry.runMode ?? task.runMode ?? "build-product",
          fallbackUsed: task.telemetry.fallbackUsed ?? false,
          failureMemoryHints: [...(task.telemetry.failureMemoryHints ?? [])],
          dodGateOutcomes: (task.telemetry.dodGateOutcomes ?? []).map((entry) => ({ ...entry })),
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
      if (!isNoSpaceLeftErrorText(error)) {
        throw error;
      }

      const removed = await this.pruneStoredSnapshots({ aggressive: true });
      if (removed > 0) {
        try {
          return await buildSnapshot();
        } catch (retryError) {
          await this.removeSnapshotDirectory(snapshotPath);
          if (!isNoSpaceLeftErrorText(retryError)) {
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
    return toWorkspaceRelativeText(this.workspaceRoot, resolveWorkspacePathText(this.workspaceRoot, normalizedTarget));
  }

  private async restoreSnapshotTarget(snapshotFilesRoot: string, targetPath: string): Promise<void> {
    const workspaceTargetPath = resolveWorkspacePathText(this.workspaceRoot, targetPath);
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
