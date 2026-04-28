import test from "node:test";
import assert from "node:assert/strict";
import {
  isTaskModelBlacklisted,
  recordTaskModelFailureState,
  rememberTaskStageRouteState
} from "../main/services/modelRouteTaskState";

test("recordTaskModelFailureState increments counts and blacklists on hard-failure threshold", () => {
  const taskModelFailureCounts = new Map<string, Map<string, number>>();
  const taskModelBlacklist = new Map<string, Set<string>>();

  const first = recordTaskModelFailureState({
    taskId: "task-1",
    model: "first-model",
    outcome: "error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });
  const second = recordTaskModelFailureState({
    taskId: "task-1",
    model: "first-model",
    outcome: "error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });

  assert.deepEqual(first, { updated: true, blacklisted: false });
  assert.deepEqual(second, { updated: true, blacklisted: true });
  assert.equal(taskModelFailureCounts.get("task-1")?.get("first-model"), 2);
  assert.equal(taskModelBlacklist.get("task-1")?.has("first-model"), true);
});

test("recordTaskModelFailureState uses transient threshold for transient failures", () => {
  const taskModelFailureCounts = new Map<string, Map<string, number>>();
  const taskModelBlacklist = new Map<string, Set<string>>();

  recordTaskModelFailureState({
    taskId: "task-1",
    model: "transient-model",
    outcome: "transient-error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });
  recordTaskModelFailureState({
    taskId: "task-1",
    model: "transient-model",
    outcome: "transient-error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });
  const third = recordTaskModelFailureState({
    taskId: "task-1",
    model: "transient-model",
    outcome: "transient-error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });

  assert.deepEqual(third, { updated: true, blacklisted: true });
  assert.equal(taskModelFailureCounts.get("task-1")?.get("transient-model"), 3);
  assert.equal(taskModelBlacklist.get("task-1")?.has("transient-model"), true);
});

test("recordTaskModelFailureState rejects empty identifiers and trims model keys", () => {
  const taskModelFailureCounts = new Map<string, Map<string, number>>();
  const taskModelBlacklist = new Map<string, Set<string>>();

  const emptyTask = recordTaskModelFailureState({
    taskId: "",
    model: "first-model",
    outcome: "error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });
  const emptyModel = recordTaskModelFailureState({
    taskId: "task-1",
    model: "   ",
    outcome: "error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });
  const trimmedModel = recordTaskModelFailureState({
    taskId: "task-1",
    model: "  spaced-model  ",
    outcome: "error",
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold: 2,
    transientFailureThreshold: 3
  });

  assert.deepEqual(emptyTask, { updated: false, blacklisted: false });
  assert.deepEqual(emptyModel, { updated: false, blacklisted: false });
  assert.deepEqual(trimmedModel, { updated: true, blacklisted: false });
  assert.equal(taskModelFailureCounts.get("task-1")?.has("spaced-model"), true);
});

test("isTaskModelBlacklisted uses trimmed model lookup", () => {
  const taskModelBlacklist = new Map<string, Set<string>>([
    ["task-1", new Set(["first-model"])]
  ]);
  assert.equal(isTaskModelBlacklisted(taskModelBlacklist, "task-1", " first-model "), true);
  assert.equal(isTaskModelBlacklisted(taskModelBlacklist, "task-1", "second-model"), false);
});

test("rememberTaskStageRouteState stores normalized stage keys and route snapshots", () => {
  const taskStageRoutes = new Map<string, Map<string, { route: { model: string; baseUrl: string; skipAuth: boolean }; routeIndex: number; attempt: number }>>();
  const route = { model: "first-model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false };

  const stored = rememberTaskStageRouteState({
    taskId: "task-1",
    stage: "  Build recovery  ",
    route,
    routeIndex: 0,
    attempt: 1,
    taskStageRoutes
  });

  route.model = "mutated-after-store";
  const state = taskStageRoutes.get("task-1")?.get("Build recovery");
  assert.equal(stored, true);
  assert.equal(state?.route.model, "first-model");
  assert.equal(state?.routeIndex, 0);
  assert.equal(state?.attempt, 1);

  const rejected = rememberTaskStageRouteState({
    taskId: "",
    stage: "Build recovery",
    route,
    routeIndex: 0,
    attempt: 2,
    taskStageRoutes
  });
  assert.equal(rejected, false);
});
