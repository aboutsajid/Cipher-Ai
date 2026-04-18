import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_SOAK_SCENARIOS } from "../shared/agentSoakScenarios";
import {
  appendAgentSoakHistory,
  attachAgentSoakTrendSummary,
  buildAgentSoakReport,
  extractAgentSoakId,
  formatAgentSoakMarkdown,
  normalizeAgentSoakHistory,
  normalizeAgentSoakScenarios,
  withAgentSoakMarker
} from "../shared/agentSoak";
import type { AgentTask } from "../shared/types";

function pickScenarios(ids: string[]) {
  const wanted = new Set(ids);
  return AGENT_SOAK_SCENARIOS.filter((scenario) => wanted.has(scenario.id));
}

test("agent soak scenario normalization enforces markers, filters invalid artifacts, and removes duplicate ids", () => {
  const scenarios = normalizeAgentSoakScenarios([
    {
      id: "landing.test",
      category: "static-web",
      title: "Landing",
      prompt: "Build a landing page",
      expectedArtifactType: "web-app"
    },
    {
      id: "landing.test",
      category: "static-web",
      title: "Duplicate",
      prompt: "Should be ignored"
    },
    {
      id: "tool.invalid",
      category: "developer-tool",
      title: "Invalid artifact",
      prompt: "[SOAK:wrong.marker] Build a tool",
      expectedArtifactType: "not-real"
    }
  ]);

  assert.equal(scenarios.length, 2);
  assert.equal(scenarios[0]?.prompt, "[SOAK:landing.test] Build a landing page");
  assert.equal(scenarios[0]?.expectedArtifactType, "web-app");
  assert.equal(scenarios[1]?.prompt, "[SOAK:tool.invalid] Build a tool");
  assert.equal("expectedArtifactType" in (scenarios[1] ?? {}), false);
});

test("agent soak helpers keep prompt ids stable", () => {
  assert.equal(withAgentSoakMarker("demo.case", "Create a demo"), "[SOAK:demo.case] Create a demo");
  assert.equal(withAgentSoakMarker("demo.case", "[SOAK:demo.case] Create a demo"), "[SOAK:demo.case] Create a demo");
  assert.equal(extractAgentSoakId("[SOAK:demo.case] Create a demo"), "demo.case");
});

test("agent soak report uses the latest task per scenario and aggregates telemetry", () => {
  const tasks: AgentTask[] = [
    {
      id: "task-old",
      prompt: "[SOAK:landing.fintech-hero] older run",
      status: "failed",
      createdAt: "2026-04-05T08:00:00.000Z",
      updatedAt: "2026-04-05T08:01:00.000Z",
      summary: "older result",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: false,
        modelAttempts: [],
        finalVerificationResult: "failed",
        failureCategory: "build-error"
      }
    },
    {
      id: "task-new",
      prompt: "[SOAK:landing.fintech-hero] newer run",
      status: "completed",
      createdAt: "2026-04-05T09:00:00.000Z",
      updatedAt: "2026-04-05T09:01:00.000Z",
      summary: "newer result",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: true,
        fallbackModel: "repair-model",
        selectedModel: "primary-model",
        modelAttempts: [],
        finalVerificationResult: "passed",
        routeDiagnostics: {
          blacklistedModels: ["primary-model"],
          failureCounts: [{
            model: "primary-model",
            count: 2,
            blacklisted: true,
            hardFailuresUntilBlacklist: 0,
            transientFailuresUntilBlacklist: 1
          }],
          visionRequested: false,
          activeStageRoutes: [{
            stage: "Build recovery",
            model: "repair-model",
            baseUrl: "https://example.com",
            provider: "remote",
            routeIndex: 1,
            attempt: 2,
            score: 0,
            scoreFactors: [{ label: "No reliability history", delta: 0 }],
            failureCount: 0,
            blacklisted: false,
            hardFailuresUntilBlacklist: 2,
            transientFailuresUntilBlacklist: 3,
            visionRequested: false,
            visionCapable: false,
            selectionReason: "Repair stages favor coder and reasoning models. Saved soak fixture route."
          }]
        }
      }
    },
    {
      id: "task-crud",
      prompt: "[SOAK:crud.inventory-tracker] crud run",
      status: "failed",
      createdAt: "2026-04-05T10:00:00.000Z",
      updatedAt: "2026-04-05T10:01:00.000Z",
      summary: "crud failed",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: false,
        modelAttempts: [],
        finalVerificationResult: "failed",
        failureCategory: "runtime-error",
        failureStage: "UI smoke"
      }
    }
  ];

  const report = buildAgentSoakReport(
    pickScenarios([
      "landing.fintech-hero",
      "landing.event-countdown",
      "notes.daily-journal",
      "crud.inventory-tracker"
    ]),
    tasks,
    "2026-04-05T12:00:00.000Z"
  );

  assert.equal(report.totals.scenarios, 4);
  assert.equal(report.totals.run, 2);
  assert.equal(report.totals.notRun, 2);
  assert.equal(report.totals.completed, 1);
  assert.equal(report.totals.failed, 1);
  assert.equal(report.totals.fallbackUsed, 1);
  assert.equal(report.totals.routeDiagnosticsCaptured, 1);
  assert.equal(report.totals.blacklistedScenarios, 1);
  assert.deepEqual(report.failures, [{ category: "runtime-error", count: 1 }]);
  assert.deepEqual(report.blacklistedModels, [{ model: "primary-model", scenarios: 1 }]);
  assert.deepEqual(report.stageRoutes, [{ stage: "Build recovery", model: "repair-model", scenarios: 1 }]);

  const landingScenario = report.scenarios.find((scenario) => scenario.scenarioId === "landing.fintech-hero");
  assert.equal(landingScenario?.taskId, "task-new");
  assert.equal(landingScenario?.verificationResult, "passed");
  assert.equal(landingScenario?.fallbackUsed, true);
  assert.deepEqual(landingScenario?.routeDiagnostics, {
    blacklistedModels: ["primary-model"],
    failureCounts: [{
      model: "primary-model",
      count: 2,
      blacklisted: true,
      hardFailuresUntilBlacklist: 0,
      transientFailuresUntilBlacklist: 1
    }],
    visionRequested: false,
    activeStageRoutes: [{
      stage: "Build recovery",
      model: "repair-model",
      baseUrl: "https://example.com",
      provider: "remote",
      routeIndex: 1,
      attempt: 2,
      score: 0,
      scoreFactors: [{ label: "No reliability history", delta: 0 }],
      failureCount: 0,
      blacklisted: false,
      hardFailuresUntilBlacklist: 2,
      transientFailuresUntilBlacklist: 3,
      visionRequested: false,
      visionCapable: false,
      selectionReason: "Repair stages favor coder and reasoning models. Saved soak fixture route."
    }]
  });

  const notRunScenario = report.scenarios.find((scenario) => scenario.scenarioId === "landing.event-countdown");
  assert.equal(notRunScenario?.taskStatus, "not-run");
});

test("agent soak markdown includes fallback and failure summaries", () => {
  const baseReport = buildAgentSoakReport(
    pickScenarios(["landing.fintech-hero", "landing.event-countdown"]),
    [{
      id: "task-1",
      prompt: "[SOAK:landing.fintech-hero] test run",
      status: "failed",
      createdAt: "2026-04-05T08:00:00.000Z",
      updatedAt: "2026-04-05T08:01:00.000Z",
      summary: "preview broken",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: true,
        fallbackModel: "repair-model",
        modelAttempts: [],
        finalVerificationResult: "failed",
        failureCategory: "preview-error",
        routeDiagnostics: {
          blacklistedModels: ["repair-model"],
          failureCounts: [{
            model: "repair-model",
            count: 2,
            blacklisted: true,
            hardFailuresUntilBlacklist: 0,
            transientFailuresUntilBlacklist: 1
          }],
          visionRequested: false,
          activeStageRoutes: [{
            stage: "Preview recovery",
            model: "repair-model",
            baseUrl: "https://example.com",
            provider: "remote",
            routeIndex: 0,
            attempt: 2,
            score: 0,
            scoreFactors: [{ label: "No reliability history", delta: 0 }],
            failureCount: 2,
            blacklisted: true,
            hardFailuresUntilBlacklist: 0,
            transientFailuresUntilBlacklist: 1,
            visionRequested: false,
            visionCapable: false,
            selectionReason: "Repair stages favor coder and reasoning models. Saved soak fixture route."
          }]
        }
      }
    }],
    "2026-04-05T12:00:00.000Z"
  );
  const history = appendAgentSoakHistory(normalizeAgentSoakHistory(null), baseReport, 10);
  const report = attachAgentSoakTrendSummary(baseReport, history);

  const markdown = formatAgentSoakMarkdown(report);

  assert.match(markdown, /# Agent Soak Report/);
  assert.match(markdown, /Fallback used: 1/);
  assert.match(markdown, /Route diagnostics captured: 1/);
  assert.match(markdown, /## Failure Categories/);
  assert.match(markdown, /preview-error: 1/);
  assert.match(markdown, /## Route Blacklists/);
  assert.match(markdown, /repair-model: 1 scenario/);
  assert.match(markdown, /## Remembered Stage Routes/);
  assert.match(markdown, /Preview recovery -> repair-model: 1 scenario/);
  assert.match(markdown, /## Trends/);
  assert.match(markdown, /Runs tracked: 1/);
  assert.match(markdown, /Fallback used: yes \(repair-model\)/);
  assert.match(markdown, /Route blacklists: repair-model/);
  assert.match(markdown, /Route failure counts: repair-model x2/);
  assert.match(markdown, /Remembered routes: Preview recovery -> repair-model \(route 1, attempt 2\)/);
});

test("agent soak history appends runs and summarizes instability trends", () => {
  const firstReport = buildAgentSoakReport(
    pickScenarios(["landing.fintech-hero", "landing.event-countdown"]),
    [{
      id: "task-1",
      prompt: "[SOAK:landing.fintech-hero] run 1",
      status: "completed",
      createdAt: "2026-04-05T08:00:00.000Z",
      updatedAt: "2026-04-05T08:01:00.000Z",
      summary: "ok",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: false,
        modelAttempts: [],
        finalVerificationResult: "passed"
      }
    }],
    "2026-04-05T12:00:00.000Z"
  );
  const secondReport = buildAgentSoakReport(
    pickScenarios(["landing.fintech-hero", "landing.event-countdown"]),
    [{
      id: "task-2",
      prompt: "[SOAK:landing.fintech-hero] run 2",
      status: "failed",
      createdAt: "2026-04-06T08:00:00.000Z",
      updatedAt: "2026-04-06T08:01:00.000Z",
      summary: "preview broke",
      steps: [],
      artifactType: "web-app",
      telemetry: {
        fallbackUsed: true,
        modelAttempts: [],
        finalVerificationResult: "failed",
        failureCategory: "preview-error",
        routeDiagnostics: {
          blacklistedModels: ["repair-model"],
          failureCounts: [{
            model: "repair-model",
            count: 2,
            blacklisted: true,
            hardFailuresUntilBlacklist: 0,
            transientFailuresUntilBlacklist: 1
          }],
          visionRequested: false,
          activeStageRoutes: []
        }
      }
    }],
    "2026-04-06T12:00:00.000Z"
  );

  const history1 = appendAgentSoakHistory(normalizeAgentSoakHistory(null), firstReport, 10);
  const history2 = appendAgentSoakHistory(history1, secondReport, 10);
  const reportWithTrends = attachAgentSoakTrendSummary(secondReport, history2);

  assert.equal(history2.runs.length, 2);
  assert.equal(reportWithTrends.trends?.runsTracked, 2);
  assert.equal(reportWithTrends.trends?.averageCompleted, 0.5);
  assert.equal(reportWithTrends.trends?.averageFailed, 0.5);
  assert.equal(reportWithTrends.trends?.recentWindow, undefined);
  assert.deepEqual(reportWithTrends.trends?.failureCategories, [{ category: "preview-error", count: 1 }]);
  assert.deepEqual(reportWithTrends.trends?.blacklistedModels, [{ model: "repair-model", scenarios: 1 }]);
  assert.deepEqual(reportWithTrends.trends?.unstableScenarios, [{
    scenarioId: "landing.fintech-hero",
    title: "Fintech marketing landing page",
    category: "static-web",
    runs: 2,
    completed: 1,
    failed: 1,
    fallbackUsed: 1,
    lastStatus: "failed",
    lastVerificationResult: "failed",
    lastFailureCategory: "preview-error"
  }]);
});

test("agent soak trends include a recent window when history is longer than five runs", () => {
  const scenarios = pickScenarios(["landing.fintech-hero"]);
  let history = normalizeAgentSoakHistory(null);

  for (let index = 0; index < 6; index += 1) {
    const report = buildAgentSoakReport(
      scenarios,
      [{
        id: `task-${index}`,
        prompt: "[SOAK:landing.fintech-hero] run",
        status: index < 3 ? "failed" : "completed",
        createdAt: `2026-04-0${index + 1}T08:00:00.000Z`,
        updatedAt: `2026-04-0${index + 1}T08:01:00.000Z`,
        summary: index < 3 ? "failed" : "ok",
        steps: [],
        artifactType: "web-app",
        telemetry: {
          fallbackUsed: index < 3,
          modelAttempts: [],
          finalVerificationResult: index < 3 ? "failed" : "passed",
          ...(index < 3 ? { failureCategory: "preview-error" as const } : {})
        }
      }],
      `2026-04-0${index + 1}T12:00:00.000Z`
    );
    history = appendAgentSoakHistory(history, report, 10);
  }

  const reportWithTrends = attachAgentSoakTrendSummary(
    buildAgentSoakReport(scenarios, [], "2026-04-06T12:00:00.000Z"),
    history
  );
  const markdown = formatAgentSoakMarkdown(reportWithTrends);

  assert.equal(reportWithTrends.trends?.runsTracked, 6);
  assert.equal(reportWithTrends.trends?.recentWindow?.runsTracked, 5);
  assert.equal(reportWithTrends.trends?.recentWindow?.averageFailed, 0.4);
  assert.equal(reportWithTrends.trends?.recentWindow?.averageFallbackUsed, 0.4);
  assert.match(markdown, /## Recent Trends/);
  assert.match(markdown, /## Recently Unstable Scenarios/);
});

test("agent soak scenario catalog stays normalized and marker-addressable", () => {
  assert.ok(AGENT_SOAK_SCENARIOS.length >= 10);
  const ids = new Set<string>();

  for (const scenario of AGENT_SOAK_SCENARIOS) {
    assert.equal(extractAgentSoakId(scenario.prompt), scenario.id);
    assert.equal(ids.has(scenario.id), false);
    ids.add(scenario.id);
  }
});

test("critical agent soak pack stays normalized and covers the cross-artifact release lane", () => {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), "prompts", "agent-critical-pack.json"), "utf8"));
  const scenarios = normalizeAgentSoakScenarios(raw);

  assert.equal(scenarios.length, 7);
  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    [
      "critical.ops-landing-page",
      "critical.inventory-workspace",
      "critical.revenue-dashboard",
      "critical.dispatch-desktop",
      "critical.orders-api",
      "critical.json-audit-cli",
      "critical.date-helper-library"
    ]
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.expectedArtifactType))].sort(),
    ["api-service", "desktop-app", "library", "script-tool", "web-app"]
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.category))].sort(),
    ["api-service", "desktop-app", "developer-tool", "interactive-web", "library", "react-web", "static-web"]
  );

  for (const scenario of scenarios) {
    assert.equal(extractAgentSoakId(scenario.prompt), scenario.id);
  }
});

test("package scripts expose the critical agent soak lane", () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  const scripts = packageJson?.scripts ?? {};

  assert.equal(
    scripts["soak:agent:critical:prompts"],
    "node scripts/agent-soak-report.mjs prompts --scenarios-file prompts/agent-critical-pack.json --markdown tmp/agent-critical-prompts.md"
  );
  assert.equal(
    scripts["soak:agent:critical:report"],
    "node scripts/agent-soak-report.mjs report --scenarios-file prompts/agent-critical-pack.json --markdown tmp/agent-critical-report.md --json tmp/agent-critical-report.json --history tmp/agent-critical-history.json"
  );
  assert.equal(
    scripts["soak:agent:critical:run"],
    "node scripts/agent-soak-run.mjs --scenarios-file prompts/agent-critical-pack.json --markdown tmp/agent-critical-report.md --json tmp/agent-critical-report.json"
  );
});

test("agent soak runner supports env-driven custom endpoints and optional no-auth mode", () => {
  const runnerScript = readFileSync(resolve(process.cwd(), "scripts", "agent-soak-run.mjs"), "utf8");

  assert.match(runnerScript, /CIPHER_BASE_URL/);
  assert.match(runnerScript, /CIPHER_API_KEY/);
  assert.match(runnerScript, /CIPHER_MODEL/);
  assert.match(runnerScript, /CIPHER_SKIP_AUTH/);
  assert.match(runnerScript, /SKIP_AUTH_SENTINEL/);
});
