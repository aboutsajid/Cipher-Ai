import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelRouteKey,
  buildModelRouteScoreFactors,
  getModelRouteScore,
  inferRoutingStage,
  isTransientModelFailure,
  type ModelRouteReliabilityStats
} from "../main/services/modelRouteScoring";

test("isTransientModelFailure matches retryable transport and capacity failures", () => {
  assert.equal(isTransientModelFailure("API error 429: rate limit reached"), true);
  assert.equal(isTransientModelFailure("socket hang up while streaming"), true);
  assert.equal(isTransientModelFailure("Unhandled syntax error in response parser"), false);
});

test("buildModelRouteKey differentiates local and remote routes", () => {
  assert.equal(
    buildModelRouteKey({ model: "qwen/qwen3-coder:free", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }),
    "remote|https://openrouter.ai/api/v1|qwen/qwen3-coder:free"
  );
  assert.equal(
    buildModelRouteKey({ model: "llama3.2", baseUrl: "http://localhost:11434/v1", skipAuth: true }),
    "local|http://localhost:11434/v1|llama3.2"
  );
});

test("getModelRouteScore calculates weighted reliability score", () => {
  const stats = new Map<string, ModelRouteReliabilityStats>([
    [
      "remote|https://openrouter.ai/api/v1|qwen/qwen3-coder:free",
      { successes: 3, failures: 1, transientFailures: 2, semanticFailures: 1 }
    ]
  ]);

  const score = getModelRouteScore(stats, {
    model: "qwen/qwen3-coder:free",
    baseUrl: "https://openrouter.ai/api/v1",
    skipAuth: false
  });

  assert.equal(score, -4);
  assert.equal(
    getModelRouteScore(stats, { model: "missing/model", baseUrl: "https://openrouter.ai/api/v1", skipAuth: false }),
    0
  );
});

test("buildModelRouteScoreFactors explains reliability deltas", () => {
  const stats = new Map<string, ModelRouteReliabilityStats>([
    [
      "remote|https://openrouter.ai/api/v1|qwen/qwen3-coder:free",
      { successes: 2, failures: 1, transientFailures: 3, semanticFailures: 4 }
    ]
  ]);

  assert.deepEqual(
    buildModelRouteScoreFactors(stats, {
      model: "qwen/qwen3-coder:free",
      baseUrl: "https://openrouter.ai/api/v1",
      skipAuth: false
    }),
    [
      { label: "2 successes", delta: 6 },
      { label: "1 hard fail", delta: -4 },
      { label: "3 transient failures", delta: -6 },
      { label: "4 semantic failures", delta: -20 }
    ]
  );

  assert.deepEqual(
    buildModelRouteScoreFactors(new Map(), {
      model: "missing/model",
      baseUrl: "https://openrouter.ai/api/v1",
      skipAuth: false
    }),
    [{ label: "No reliability history", delta: 0 }]
  );
});

test("inferRoutingStage categorizes planner, repair, and generator stages", () => {
  assert.equal(inferRoutingStage("Plan Phase"), "planner");
  assert.equal(inferRoutingStage("Fix recovery"), "repair");
  assert.equal(inferRoutingStage("Implement stage"), "generator");
});
