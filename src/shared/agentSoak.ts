import type {
  AgentArtifactType,
  AgentTask,
  AgentTaskFailureCategory,
  AgentTaskFinalVerificationResult,
  AgentTaskRouteFailureCount,
  AgentTaskRouteTelemetrySummary,
  AgentTaskStageRouteDiagnostics,
  AgentTaskStatus
} from "./types";

const VALID_AGENT_ARTIFACT_TYPES = new Set<AgentArtifactType>([
  "web-app",
  "api-service",
  "script-tool",
  "library",
  "desktop-app",
  "workspace-change",
  "unknown"
]);

export interface AgentSoakScenario {
  id: string;
  category: string;
  title: string;
  prompt: string;
  expectedArtifactType?: AgentArtifactType;
}

export interface AgentSoakScenarioResult {
  scenarioId: string;
  category: string;
  title: string;
  prompt: string;
  expectedArtifactType?: AgentArtifactType;
  taskId?: string;
  taskStatus: AgentTaskStatus | "not-run";
  artifactType?: AgentArtifactType;
  artifactMatchesExpectation?: boolean;
  verificationResult?: AgentTaskFinalVerificationResult;
  failureCategory?: AgentTaskFailureCategory;
  failureStage?: string;
  selectedModel?: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  routeDiagnostics?: AgentTaskRouteTelemetrySummary;
  updatedAt?: string;
  summary?: string;
}

export interface AgentSoakCategorySummary {
  category: string;
  scenarios: number;
  run: number;
  notRun: number;
  completed: number;
  failed: number;
}

export interface AgentSoakFailureSummary {
  category: AgentTaskFailureCategory;
  count: number;
}

export interface AgentSoakBlacklistedModelSummary {
  model: string;
  scenarios: number;
}

export interface AgentSoakStageRouteSummary {
  stage: string;
  model: string;
  scenarios: number;
}

export interface AgentSoakReport {
  generatedAt: string;
  totals: {
    scenarios: number;
    run: number;
    notRun: number;
    completed: number;
    failed: number;
    running: number;
    stopped: number;
    fallbackUsed: number;
    routeDiagnosticsCaptured: number;
    blacklistedScenarios: number;
    verificationPassed: number;
    verificationPartial: number;
    verificationFailed: number;
  };
  categories: AgentSoakCategorySummary[];
  failures: AgentSoakFailureSummary[];
  blacklistedModels: AgentSoakBlacklistedModelSummary[];
  stageRoutes: AgentSoakStageRouteSummary[];
  trends?: AgentSoakTrendSummary;
  scenarios: AgentSoakScenarioResult[];
}

export interface AgentSoakHistoryScenarioSnapshot {
  scenarioId: string;
  title: string;
  category: string;
  taskStatus: AgentTaskStatus | "not-run";
  verificationResult?: AgentTaskFinalVerificationResult;
  failureCategory?: AgentTaskFailureCategory;
  fallbackUsed: boolean;
}

export interface AgentSoakHistoryRun {
  generatedAt: string;
  totals: AgentSoakReport["totals"];
  failures: AgentSoakFailureSummary[];
  blacklistedModels: AgentSoakBlacklistedModelSummary[];
  scenarios: AgentSoakHistoryScenarioSnapshot[];
}

export interface AgentSoakHistory {
  version: 1;
  runs: AgentSoakHistoryRun[];
}

export interface AgentSoakScenarioTrend {
  scenarioId: string;
  title: string;
  category: string;
  runs: number;
  completed: number;
  failed: number;
  fallbackUsed: number;
  lastStatus: AgentTaskStatus | "not-run";
  lastVerificationResult?: AgentTaskFinalVerificationResult;
  lastFailureCategory?: AgentTaskFailureCategory;
}

export interface AgentSoakTrendSummary {
  runsTracked: number;
  firstRunAt?: string;
  lastRunAt?: string;
  averageCompleted: number;
  averageFailed: number;
  averageFallbackUsed: number;
  failureCategories: AgentSoakFailureSummary[];
  blacklistedModels: AgentSoakBlacklistedModelSummary[];
  unstableScenarios: AgentSoakScenarioTrend[];
  recentWindow?: {
    runsTracked: number;
    firstRunAt?: string;
    lastRunAt?: string;
    averageCompleted: number;
    averageFailed: number;
    averageFallbackUsed: number;
    failureCategories: AgentSoakFailureSummary[];
    blacklistedModels: AgentSoakBlacklistedModelSummary[];
    unstableScenarios: AgentSoakScenarioTrend[];
  };
}

export function extractAgentSoakId(prompt: string): string | null {
  const match = (prompt ?? "").match(/\[SOAK:([A-Za-z0-9._-]+)\]/i);
  return match?.[1]?.trim() || null;
}

export function withAgentSoakMarker(id: string, prompt: string): string {
  const normalizedId = String(id ?? "").trim();
  const normalizedPrompt = String(prompt ?? "").trim();
  if (!normalizedId) return normalizedPrompt;
  const marker = `[SOAK:${normalizedId}]`;
  const existingId = extractAgentSoakId(normalizedPrompt);
  if (!normalizedPrompt) return marker;
  if (existingId === normalizedId) return normalizedPrompt;
  if (existingId) {
    return normalizedPrompt.replace(/\[SOAK:[A-Za-z0-9._-]+\]/i, marker);
  }
  return `${marker} ${normalizedPrompt}`.trim();
}

export function normalizeAgentSoakScenarios(raw: unknown): AgentSoakScenario[] {
  if (!Array.isArray(raw)) return [];
  const scenarios = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const scenario = entry as Record<string, unknown>;
      const id = String(scenario.id ?? "").trim();
      const category = String(scenario.category ?? "").trim();
      const title = String(scenario.title ?? "").trim();
      const prompt = withAgentSoakMarker(id, String(scenario.prompt ?? "").trim());
      const expectedArtifactType = String(scenario.expectedArtifactType ?? "").trim();
      if (!id || !category || !title || !prompt) return null;
      return {
        id,
        category,
        title,
        prompt,
        ...(VALID_AGENT_ARTIFACT_TYPES.has(expectedArtifactType as AgentArtifactType)
          ? { expectedArtifactType: expectedArtifactType as AgentArtifactType }
          : {})
      } satisfies AgentSoakScenario;
    })
    .filter((scenario): scenario is AgentSoakScenario => Boolean(scenario));

  const seen = new Set<string>();
  return scenarios.filter((scenario) => {
    if (seen.has(scenario.id)) return false;
    seen.add(scenario.id);
    return true;
  });
}

export function buildAgentSoakReport(
  scenarios: AgentSoakScenario[],
  tasks: AgentTask[],
  generatedAt = new Date().toISOString()
): AgentSoakReport {
  const latestTasksByScenario = new Map<string, AgentTask>();

  for (const task of tasks) {
    const scenarioId = extractAgentSoakId(task.prompt);
    if (!scenarioId) continue;
    const current = latestTasksByScenario.get(scenarioId);
    if (!current || current.updatedAt.localeCompare(task.updatedAt) < 0) {
      latestTasksByScenario.set(scenarioId, task);
    }
  }

  const scenarioResults = scenarios.map((scenario) => {
    const task = latestTasksByScenario.get(scenario.id);
    if (!task) {
      return {
        scenarioId: scenario.id,
        category: scenario.category,
        title: scenario.title,
        prompt: scenario.prompt,
        expectedArtifactType: scenario.expectedArtifactType,
        taskStatus: "not-run",
        fallbackUsed: false
      } satisfies AgentSoakScenarioResult;
    }

    return {
      scenarioId: scenario.id,
      category: scenario.category,
      title: scenario.title,
      prompt: scenario.prompt,
      expectedArtifactType: scenario.expectedArtifactType,
      taskId: task.id,
      taskStatus: task.status,
      artifactType: task.artifactType,
      artifactMatchesExpectation: scenario.expectedArtifactType
        ? task.artifactType === scenario.expectedArtifactType
        : undefined,
      verificationResult: task.telemetry?.finalVerificationResult,
      failureCategory: task.telemetry?.failureCategory,
      failureStage: task.telemetry?.failureStage,
      selectedModel: task.telemetry?.selectedModel,
      fallbackModel: task.telemetry?.fallbackModel,
      fallbackUsed: task.telemetry?.fallbackUsed ?? false,
      routeDiagnostics: task.telemetry?.routeDiagnostics
        ? {
          blacklistedModels: [...task.telemetry.routeDiagnostics.blacklistedModels],
          failureCounts: task.telemetry.routeDiagnostics.failureCounts.map((entry) => ({ ...entry })),
          activeStageRoutes: task.telemetry.routeDiagnostics.activeStageRoutes.map((entry) => ({ ...entry }))
        }
        : undefined,
      updatedAt: task.updatedAt,
      summary: task.summary
    } satisfies AgentSoakScenarioResult;
  });

  const categoryMap = new Map<string, AgentSoakCategorySummary>();
  const failureMap = new Map<AgentTaskFailureCategory, number>();
  const blacklistedModelMap = new Map<string, number>();
  const stageRouteMap = new Map<string, { stage: string; model: string; scenarios: number }>();
  for (const result of scenarioResults) {
    const summary = categoryMap.get(result.category) ?? {
      category: result.category,
      scenarios: 0,
      run: 0,
      notRun: 0,
      completed: 0,
      failed: 0
    };
    summary.scenarios += 1;
    if (result.taskStatus === "not-run") {
      summary.notRun += 1;
    } else {
      summary.run += 1;
    }
    if (result.taskStatus === "completed") summary.completed += 1;
    if (result.taskStatus === "failed") summary.failed += 1;
    categoryMap.set(result.category, summary);
    if (result.failureCategory) {
      failureMap.set(result.failureCategory, (failureMap.get(result.failureCategory) ?? 0) + 1);
    }
    for (const model of result.routeDiagnostics?.blacklistedModels ?? []) {
      blacklistedModelMap.set(model, (blacklistedModelMap.get(model) ?? 0) + 1);
    }
    for (const entry of result.routeDiagnostics?.activeStageRoutes ?? []) {
      const key = `${entry.stage}|${entry.model}`;
      const current = stageRouteMap.get(key) ?? { stage: entry.stage, model: entry.model, scenarios: 0 };
      current.scenarios += 1;
      stageRouteMap.set(key, current);
    }
  }

  return {
    generatedAt,
    totals: {
      scenarios: scenarioResults.length,
      run: scenarioResults.filter((item) => item.taskStatus !== "not-run").length,
      notRun: scenarioResults.filter((item) => item.taskStatus === "not-run").length,
      completed: scenarioResults.filter((item) => item.taskStatus === "completed").length,
      failed: scenarioResults.filter((item) => item.taskStatus === "failed").length,
      running: scenarioResults.filter((item) => item.taskStatus === "running").length,
      stopped: scenarioResults.filter((item) => item.taskStatus === "stopped").length,
      fallbackUsed: scenarioResults.filter((item) => item.fallbackUsed).length,
      routeDiagnosticsCaptured: scenarioResults.filter((item) => item.routeDiagnostics).length,
      blacklistedScenarios: scenarioResults.filter((item) => (item.routeDiagnostics?.blacklistedModels.length ?? 0) > 0).length,
      verificationPassed: scenarioResults.filter((item) => item.verificationResult === "passed").length,
      verificationPartial: scenarioResults.filter((item) => item.verificationResult === "partial").length,
      verificationFailed: scenarioResults.filter((item) => item.verificationResult === "failed").length
    },
    categories: [...categoryMap.values()].sort((a, b) => a.category.localeCompare(b.category)),
    failures: [...failureMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    blacklistedModels: [...blacklistedModelMap.entries()]
      .map(([model, scenarios]) => ({ model, scenarios }))
      .sort((a, b) => b.scenarios - a.scenarios || a.model.localeCompare(b.model)),
    stageRoutes: [...stageRouteMap.values()]
      .sort((a, b) => b.scenarios - a.scenarios || a.stage.localeCompare(b.stage) || a.model.localeCompare(b.model)),
    scenarios: scenarioResults
  };
}

export function normalizeAgentSoakHistory(raw: unknown): AgentSoakHistory {
  if (!raw || typeof raw !== "object") {
    return { version: 1, runs: [] };
  }

  const source = raw as { runs?: unknown };
  const runs: AgentSoakHistoryRun[] = [];
  if (Array.isArray(source.runs)) {
    for (const entry of source.runs) {
      if (!entry || typeof entry !== "object") continue;
      const run = entry as Record<string, unknown>;
      const generatedAt = String(run.generatedAt ?? "").trim();
      const totals = run.totals;
      const rawScenarios = Array.isArray(run.scenarios) ? run.scenarios : [];
      if (!generatedAt || !totals || typeof totals !== "object") continue;

      const scenarios: AgentSoakHistoryScenarioSnapshot[] = [];
      for (const rawScenario of rawScenarios) {
        if (!rawScenario || typeof rawScenario !== "object") continue;
        const value = rawScenario as Record<string, unknown>;
        const scenarioId = String(value.scenarioId ?? "").trim();
        const title = String(value.title ?? "").trim();
        const category = String(value.category ?? "").trim();
        const taskStatus = String(value.taskStatus ?? "").trim() as AgentTaskStatus | "not-run";
        if (!scenarioId || !title || !category || !taskStatus) continue;
        scenarios.push({
          scenarioId,
          title,
          category,
          taskStatus,
          verificationResult: normalizeVerificationResult(value.verificationResult),
          failureCategory: normalizeFailureCategory(value.failureCategory),
          fallbackUsed: Boolean(value.fallbackUsed)
        });
      }

      runs.push({
        generatedAt,
        totals: {
          scenarios: Number((totals as Record<string, unknown>).scenarios ?? 0),
          run: Number((totals as Record<string, unknown>).run ?? 0),
          notRun: Number((totals as Record<string, unknown>).notRun ?? 0),
          completed: Number((totals as Record<string, unknown>).completed ?? 0),
          failed: Number((totals as Record<string, unknown>).failed ?? 0),
          running: Number((totals as Record<string, unknown>).running ?? 0),
          stopped: Number((totals as Record<string, unknown>).stopped ?? 0),
          fallbackUsed: Number((totals as Record<string, unknown>).fallbackUsed ?? 0),
          routeDiagnosticsCaptured: Number((totals as Record<string, unknown>).routeDiagnosticsCaptured ?? 0),
          blacklistedScenarios: Number((totals as Record<string, unknown>).blacklistedScenarios ?? 0),
          verificationPassed: Number((totals as Record<string, unknown>).verificationPassed ?? 0),
          verificationPartial: Number((totals as Record<string, unknown>).verificationPartial ?? 0),
          verificationFailed: Number((totals as Record<string, unknown>).verificationFailed ?? 0)
        },
        failures: normalizeAgentSoakFailureSummaries(run.failures),
        blacklistedModels: normalizeAgentSoakBlacklistedModelSummaries(run.blacklistedModels),
        scenarios
      });
    }
  }

  return {
    version: 1,
    runs: runs.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
  };
}

export function appendAgentSoakHistory(
  history: AgentSoakHistory,
  report: AgentSoakReport,
  maxRuns = 30
): AgentSoakHistory {
  const nextRuns = [
    ...history.runs.filter((entry) => entry.generatedAt !== report.generatedAt),
    createAgentSoakHistoryRun(report)
  ].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

  return {
    version: 1,
    runs: nextRuns.slice(Math.max(0, nextRuns.length - maxRuns))
  };
}

export function attachAgentSoakTrendSummary(
  report: AgentSoakReport,
  history: AgentSoakHistory,
  maxScenarios = 5
): AgentSoakReport {
  return {
    ...report,
    trends: buildAgentSoakTrendSummary(history, maxScenarios)
  };
}

export function formatAgentSoakMarkdown(report: AgentSoakReport): string {
  const lines = [
    "# Agent Soak Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Totals",
    `- Scenarios: ${report.totals.scenarios}`,
    `- Run: ${report.totals.run}`,
    `- Not run: ${report.totals.notRun}`,
    `- Completed: ${report.totals.completed}`,
    `- Failed: ${report.totals.failed}`,
    `- Running: ${report.totals.running}`,
    `- Stopped: ${report.totals.stopped}`,
    `- Fallback used: ${report.totals.fallbackUsed}`,
    `- Route diagnostics captured: ${report.totals.routeDiagnosticsCaptured}`,
    `- Blacklisted scenarios: ${report.totals.blacklistedScenarios}`,
    `- Verification passed: ${report.totals.verificationPassed}`,
    `- Verification partial: ${report.totals.verificationPartial}`,
    `- Verification failed: ${report.totals.verificationFailed}`,
    "",
    "## Categories"
  ];

  for (const category of report.categories) {
    lines.push(`- ${category.category}: ${category.run}/${category.scenarios} run, ${category.completed} completed, ${category.failed} failed`);
  }

  if (report.failures.length > 0) {
    lines.push("", "## Failure Categories");
    for (const failure of report.failures) {
      lines.push(`- ${failure.category}: ${failure.count}`);
    }
  }

  if (report.blacklistedModels.length > 0) {
    lines.push("", "## Route Blacklists");
    for (const entry of report.blacklistedModels) {
      lines.push(`- ${entry.model}: ${entry.scenarios} scenario${entry.scenarios === 1 ? "" : "s"}`);
    }
  }

  if (report.stageRoutes.length > 0) {
    lines.push("", "## Remembered Stage Routes");
    for (const entry of report.stageRoutes) {
      lines.push(`- ${entry.stage} -> ${entry.model}: ${entry.scenarios} scenario${entry.scenarios === 1 ? "" : "s"}`);
    }
  }

  if (report.trends && report.trends.runsTracked > 0) {
    lines.push("", "## Trends");
    lines.push(`- Runs tracked: ${report.trends.runsTracked}`);
    if (report.trends.firstRunAt) lines.push(`- First run: ${report.trends.firstRunAt}`);
    if (report.trends.lastRunAt) lines.push(`- Last run: ${report.trends.lastRunAt}`);
    lines.push(`- Average completed: ${report.trends.averageCompleted.toFixed(2)}`);
    lines.push(`- Average failed: ${report.trends.averageFailed.toFixed(2)}`);
    lines.push(`- Average fallback used: ${report.trends.averageFallbackUsed.toFixed(2)}`);

    if (report.trends.recentWindow && report.trends.recentWindow.runsTracked > 0) {
      lines.push("", "## Recent Trends");
      lines.push(`- Runs tracked: ${report.trends.recentWindow.runsTracked}`);
      if (report.trends.recentWindow.firstRunAt) lines.push(`- First run: ${report.trends.recentWindow.firstRunAt}`);
      if (report.trends.recentWindow.lastRunAt) lines.push(`- Last run: ${report.trends.recentWindow.lastRunAt}`);
      lines.push(`- Average completed: ${report.trends.recentWindow.averageCompleted.toFixed(2)}`);
      lines.push(`- Average failed: ${report.trends.recentWindow.averageFailed.toFixed(2)}`);
      lines.push(`- Average fallback used: ${report.trends.recentWindow.averageFallbackUsed.toFixed(2)}`);

      if (report.trends.recentWindow.failureCategories.length > 0) {
        lines.push("", "## Recent Failure Categories");
        for (const failure of report.trends.recentWindow.failureCategories) {
          lines.push(`- ${failure.category}: ${failure.count}`);
        }
      }

      if (report.trends.recentWindow.blacklistedModels.length > 0) {
        lines.push("", "## Recent Route Blacklists");
        for (const entry of report.trends.recentWindow.blacklistedModels) {
          lines.push(`- ${entry.model}: ${entry.scenarios} run${entry.scenarios === 1 ? "" : "s"}`);
        }
      }

      if (report.trends.recentWindow.unstableScenarios.length > 0) {
        lines.push("", "## Recently Unstable Scenarios");
        for (const scenario of report.trends.recentWindow.unstableScenarios) {
          lines.push(
            `- ${scenario.scenarioId}: ${scenario.failed}/${scenario.runs} failed, ${scenario.completed}/${scenario.runs} completed, fallback in ${scenario.fallbackUsed}/${scenario.runs}, last status ${scenario.lastStatus}${scenario.lastFailureCategory ? ` (${scenario.lastFailureCategory})` : ""}`
          );
        }
      }
    }

    if (report.trends.failureCategories.length > 0) {
      lines.push("", "## Trend Failure Categories");
      for (const failure of report.trends.failureCategories) {
        lines.push(`- ${failure.category}: ${failure.count}`);
      }
    }

    if (report.trends.blacklistedModels.length > 0) {
      lines.push("", "## Trend Route Blacklists");
      for (const entry of report.trends.blacklistedModels) {
        lines.push(`- ${entry.model}: ${entry.scenarios} run${entry.scenarios === 1 ? "" : "s"}`);
      }
    }

    if (report.trends.unstableScenarios.length > 0) {
      lines.push("", "## Unstable Scenarios");
      for (const scenario of report.trends.unstableScenarios) {
        lines.push(
          `- ${scenario.scenarioId}: ${scenario.failed}/${scenario.runs} failed, ${scenario.completed}/${scenario.runs} completed, fallback in ${scenario.fallbackUsed}/${scenario.runs}, last status ${scenario.lastStatus}${scenario.lastFailureCategory ? ` (${scenario.lastFailureCategory})` : ""}`
        );
      }
    }
  }

  lines.push("", "## Scenarios");
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.title} [${scenario.scenarioId}]`);
    lines.push(`- Category: ${scenario.category}`);
    lines.push(`- Status: ${scenario.taskStatus}`);
    if (scenario.expectedArtifactType) lines.push(`- Expected artifact: ${scenario.expectedArtifactType}`);
    if (scenario.artifactType) lines.push(`- Actual artifact: ${scenario.artifactType}`);
    if (typeof scenario.artifactMatchesExpectation === "boolean") {
      lines.push(`- Artifact match: ${scenario.artifactMatchesExpectation ? "yes" : "no"}`);
    }
    if (scenario.verificationResult) lines.push(`- Verification: ${scenario.verificationResult}`);
    if (scenario.failureCategory) lines.push(`- Failure category: ${scenario.failureCategory}`);
    if (scenario.failureStage) lines.push(`- Failure stage: ${scenario.failureStage}`);
    if (scenario.selectedModel) lines.push(`- Model: ${scenario.selectedModel}`);
    if (scenario.fallbackUsed) {
      lines.push(`- Fallback used: yes${scenario.fallbackModel ? ` (${scenario.fallbackModel})` : ""}`);
    }
    if ((scenario.routeDiagnostics?.blacklistedModels.length ?? 0) > 0) {
      lines.push(`- Route blacklists: ${scenario.routeDiagnostics?.blacklistedModels.join(", ")}`);
    }
    if ((scenario.routeDiagnostics?.failureCounts.length ?? 0) > 0) {
      lines.push(`- Route failure counts: ${formatAgentSoakFailureCounts(scenario.routeDiagnostics?.failureCounts ?? [])}`);
    }
    if ((scenario.routeDiagnostics?.activeStageRoutes.length ?? 0) > 0) {
      lines.push(`- Remembered routes: ${formatAgentSoakStageRoutes(scenario.routeDiagnostics?.activeStageRoutes ?? [])}`);
    }
    if (scenario.updatedAt) lines.push(`- Updated: ${scenario.updatedAt}`);
    if (scenario.summary) lines.push(`- Summary: ${scenario.summary}`);
    lines.push(`- Prompt: ${scenario.prompt}`, "");
  }

  return lines.join("\n").trimEnd();
}

function formatAgentSoakFailureCounts(entries: AgentTaskRouteFailureCount[]): string {
  return entries.map((entry) => `${entry.model} x${entry.count}`).join(", ");
}

function formatAgentSoakStageRoutes(entries: AgentTaskStageRouteDiagnostics[]): string {
  return entries
    .map((entry) => `${entry.stage} -> ${entry.model} (route ${entry.routeIndex + 1}, attempt ${entry.attempt})`)
    .join("; ");
}

function createAgentSoakHistoryRun(report: AgentSoakReport): AgentSoakHistoryRun {
  return {
    generatedAt: report.generatedAt,
    totals: { ...report.totals },
    failures: report.failures.map((entry) => ({ ...entry })),
    blacklistedModels: report.blacklistedModels.map((entry) => ({ ...entry })),
    scenarios: report.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      category: scenario.category,
      taskStatus: scenario.taskStatus,
      verificationResult: scenario.verificationResult,
      failureCategory: scenario.failureCategory,
      fallbackUsed: scenario.fallbackUsed
    }))
  };
}

function buildAgentSoakTrendSummary(history: AgentSoakHistory, maxScenarios: number): AgentSoakTrendSummary {
  const runs = history.runs;
  const recentRuns = runs.slice(Math.max(0, runs.length - 5));
  const overall = summarizeAgentSoakRuns(runs, maxScenarios);
  const recent = summarizeAgentSoakRuns(recentRuns, maxScenarios);

  return {
    ...overall,
    recentWindow: recent.runsTracked > 0 && recent.runsTracked < overall.runsTracked
      ? recent
      : undefined
  };
}

function summarizeAgentSoakRuns(
  runs: AgentSoakHistoryRun[],
  maxScenarios: number
): Omit<AgentSoakTrendSummary, "recentWindow"> {
  const failureMap = new Map<AgentTaskFailureCategory, number>();
  const blacklistMap = new Map<string, number>();
  const scenarioMap = new Map<string, AgentSoakScenarioTrend>();

  for (const run of runs) {
    for (const failure of run.failures) {
      failureMap.set(failure.category, (failureMap.get(failure.category) ?? 0) + failure.count);
    }
    for (const entry of run.blacklistedModels) {
      blacklistMap.set(entry.model, (blacklistMap.get(entry.model) ?? 0) + entry.scenarios);
    }
    for (const scenario of run.scenarios) {
      const current = scenarioMap.get(scenario.scenarioId) ?? {
        scenarioId: scenario.scenarioId,
        title: scenario.title,
        category: scenario.category,
        runs: 0,
        completed: 0,
        failed: 0,
        fallbackUsed: 0,
        lastStatus: scenario.taskStatus,
        lastVerificationResult: scenario.verificationResult,
        lastFailureCategory: scenario.failureCategory
      };
      current.runs += 1;
      if (scenario.taskStatus === "completed") current.completed += 1;
      if (scenario.taskStatus === "failed") current.failed += 1;
      if (scenario.fallbackUsed) current.fallbackUsed += 1;
      current.lastStatus = scenario.taskStatus;
      current.lastVerificationResult = scenario.verificationResult;
      current.lastFailureCategory = scenario.failureCategory;
      scenarioMap.set(scenario.scenarioId, current);
    }
  }

  return {
    runsTracked: runs.length,
    firstRunAt: runs[0]?.generatedAt,
    lastRunAt: runs[runs.length - 1]?.generatedAt,
    averageCompleted: runs.length > 0 ? sumBy(runs, (run) => run.totals.completed) / runs.length : 0,
    averageFailed: runs.length > 0 ? sumBy(runs, (run) => run.totals.failed) / runs.length : 0,
    averageFallbackUsed: runs.length > 0 ? sumBy(runs, (run) => run.totals.fallbackUsed) / runs.length : 0,
    failureCategories: [...failureMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    blacklistedModels: [...blacklistMap.entries()]
      .map(([model, scenarios]) => ({ model, scenarios }))
      .sort((a, b) => b.scenarios - a.scenarios || a.model.localeCompare(b.model)),
    unstableScenarios: [...scenarioMap.values()]
      .filter((scenario) => scenario.failed > 0 || scenario.fallbackUsed > 0)
      .sort((a, b) => b.failed - a.failed || b.fallbackUsed - a.fallbackUsed || a.scenarioId.localeCompare(b.scenarioId))
      .slice(0, maxScenarios)
  };
}

function sumBy<T>(values: T[], project: (value: T) => number): number {
  return values.reduce((total, value) => total + project(value), 0);
}

function normalizeVerificationResult(value: unknown): AgentTaskFinalVerificationResult | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "passed" || normalized === "partial" || normalized === "failed"
    ? normalized
    : undefined;
}

function normalizeFailureCategory(value: unknown): AgentTaskFailureCategory | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "missing-file"
    || normalized === "malformed-json"
    || normalized === "unsupported-path"
    || normalized === "wrong-scaffold"
    || normalized === "asset-missing"
    || normalized === "build-error"
    || normalized === "runtime-error"
    || normalized === "preview-error"
    || normalized === "lint-error"
    || normalized === "test-error"
    || normalized === "verification-error"
    || normalized === "unknown"
    ? normalized
    : undefined;
}

function normalizeAgentSoakFailureSummaries(raw: unknown): AgentSoakFailureSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const category = normalizeFailureCategory(value.category);
      if (!category) return null;
      return { category, count: Number(value.count ?? 0) } satisfies AgentSoakFailureSummary;
    })
    .filter((entry): entry is AgentSoakFailureSummary => Boolean(entry));
}

function normalizeAgentSoakBlacklistedModelSummaries(raw: unknown): AgentSoakBlacklistedModelSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const model = String(value.model ?? "").trim();
      if (!model) return null;
      return { model, scenarios: Number(value.scenarios ?? 0) } satisfies AgentSoakBlacklistedModelSummary;
    })
    .filter((entry): entry is AgentSoakBlacklistedModelSummary => Boolean(entry));
}
