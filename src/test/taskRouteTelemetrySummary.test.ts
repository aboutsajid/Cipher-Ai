import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskRouteTelemetrySummary } from "../main/services/taskRouteTelemetrySummary";

test("buildTaskRouteTelemetrySummary sorts blacklist, failure counts, and stage routes", () => {
  const taskModelBlacklist = new Map<string, Set<string>>([
    ["task-1", new Set(["z-model", "a-model"])]
  ]);
  const taskModelFailureCounts = new Map<string, Map<string, number>>([
    ["task-1", new Map([["b-model", 2], ["a-model", 2], ["c-model", 1]])]
  ]);
  const taskStageRoutes = new Map<string, Map<string, { route: { model: string; baseUrl: string; apiKey: string; skipAuth: boolean }; routeIndex: number; attempt: number }>>([
    ["task-1", new Map([
      ["Build recovery", { route: { model: "b-model", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-1", skipAuth: false }, routeIndex: 1, attempt: 2 }],
      ["Analyze", { route: { model: "a-model", baseUrl: "http://localhost:11434/v1", apiKey: "", skipAuth: true }, routeIndex: 0, attempt: 1 }]
    ])]
  ]);

  const summary = buildTaskRouteTelemetrySummary({
    taskId: "task-1",
    taskModelBlacklist,
    taskModelFailureCounts,
    taskStageRoutes,
    visionRequested: true,
    buildTaskModelFailureStatus: (taskId, model) => {
      const count = taskModelFailureCounts.get(taskId)?.get(model) ?? 0;
      const blacklisted = taskModelBlacklist.get(taskId)?.has(model) ?? false;
      return {
        count,
        blacklisted,
        hardFailuresUntilBlacklist: Math.max(0, 2 - count),
        transientFailuresUntilBlacklist: Math.max(0, 3 - count)
      };
    },
    getModelRouteScore: (route) => (route.model === "a-model" ? 7 : 5),
    buildModelRouteScoreFactors: (route) => [{ label: route.model, delta: 1 }],
    buildTaskStageSelectionReason: (_taskId, stage, route, routeIndex) => `${stage}:${route.model}:${routeIndex}`
  });

  assert.deepEqual(summary.blacklistedModels, ["a-model", "z-model"]);
  assert.deepEqual(
    summary.failureCounts.map((entry) => `${entry.model}:${entry.count}`),
    ["a-model:2", "b-model:2", "c-model:1"]
  );
  assert.deepEqual(summary.activeStageRoutes.map((entry) => entry.stage), ["Analyze", "Build recovery"]);
  assert.equal(summary.activeStageRoutes[0]?.provider, "local");
  assert.equal(summary.activeStageRoutes[1]?.provider, "remote");
  assert.equal(summary.activeStageRoutes[0]?.score, 7);
  assert.equal(summary.activeStageRoutes[1]?.score, 5);
  assert.equal(summary.activeStageRoutes[0]?.visionRequested, true);
  assert.equal(summary.activeStageRoutes[0]?.selectionReason, "Analyze:a-model:0");
  assert.equal(typeof summary.activeStageRoutes[0]?.visionCapable, "boolean");
});

test("buildTaskRouteTelemetrySummary returns empty collections for unknown task ids", () => {
  const summary = buildTaskRouteTelemetrySummary({
    taskId: "missing-task",
    taskModelBlacklist: new Map(),
    taskModelFailureCounts: new Map(),
    taskStageRoutes: new Map(),
    visionRequested: false,
    buildTaskModelFailureStatus: () => ({
      count: 0,
      blacklisted: false,
      hardFailuresUntilBlacklist: 2,
      transientFailuresUntilBlacklist: 3
    }),
    getModelRouteScore: () => 0,
    buildModelRouteScoreFactors: () => [{ label: "none", delta: 0 }],
    buildTaskStageSelectionReason: () => "none"
  });

  assert.deepEqual(summary.blacklistedModels, []);
  assert.deepEqual(summary.failureCounts, []);
  assert.deepEqual(summary.activeStageRoutes, []);
  assert.equal(summary.visionRequested, false);
});
