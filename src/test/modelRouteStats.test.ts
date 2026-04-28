import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNextModelRouteReliabilityStats,
  normalizeModelRouteReliabilityStats
} from "../main/services/modelRouteStats";

test("normalizeModelRouteReliabilityStats clamps counters and preserves string timestamps", () => {
  assert.deepEqual(
    normalizeModelRouteReliabilityStats({
      successes: 3,
      failures: -2,
      transientFailures: Number.NaN,
      semanticFailures: 1,
      lastUsedAt: "2026-04-28T00:00:00.000Z"
    }),
    {
      successes: 3,
      failures: 0,
      transientFailures: 0,
      semanticFailures: 1,
      lastUsedAt: "2026-04-28T00:00:00.000Z"
    }
  );
});

test("buildNextModelRouteReliabilityStats increments the outcome bucket and stamps lastUsedAt", () => {
  const now = "2026-04-28T12:00:00.000Z";
  const base = {
    successes: 1,
    failures: 2,
    transientFailures: 3,
    semanticFailures: 4,
    lastUsedAt: "2026-04-28T11:59:59.000Z"
  };

  assert.deepEqual(
    buildNextModelRouteReliabilityStats(base, "success", now),
    {
      successes: 2,
      failures: 2,
      transientFailures: 3,
      semanticFailures: 4,
      lastUsedAt: now
    }
  );
  assert.deepEqual(
    buildNextModelRouteReliabilityStats(base, "error", now),
    {
      successes: 1,
      failures: 3,
      transientFailures: 3,
      semanticFailures: 4,
      lastUsedAt: now
    }
  );
  assert.deepEqual(
    buildNextModelRouteReliabilityStats(base, "transient-error", now),
    {
      successes: 1,
      failures: 2,
      transientFailures: 4,
      semanticFailures: 4,
      lastUsedAt: now
    }
  );
  assert.deepEqual(
    buildNextModelRouteReliabilityStats(base, "semantic-error", now),
    {
      successes: 1,
      failures: 2,
      transientFailures: 3,
      semanticFailures: 5,
      lastUsedAt: now
    }
  );
});

test("buildNextModelRouteReliabilityStats normalizes missing baseline stats", () => {
  assert.deepEqual(
    buildNextModelRouteReliabilityStats(undefined, "error", "2026-04-28T12:00:00.000Z"),
    {
      successes: 0,
      failures: 1,
      transientFailures: 0,
      semanticFailures: 0,
      lastUsedAt: "2026-04-28T12:00:00.000Z"
    }
  );
});
