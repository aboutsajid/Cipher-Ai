import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFailureMemoryForPrompt,
  selectRelevantFailureMemory,
  trimFailureMemoryStore,
  upsertFailureMemoryEntry,
  type FailureMemoryRecord
} from "../main/services/failureMemoryStore";

test("selectRelevantFailureMemory prioritizes category, recency, and artifact fit", () => {
  const entries: FailureMemoryRecord[] = [
    {
      key: "a",
      artifactType: "script-tool",
      category: "runtime-error",
      stage: "Build recovery",
      signature: "cli-usage-output",
      guidance: "Use real output",
      example: "usage",
      count: 2,
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:01:00.000Z"
    },
    {
      key: "b",
      artifactType: "api-service",
      category: "runtime-error",
      stage: "Launch recovery",
      signature: "api-runtime-endpoints",
      guidance: "Probe health endpoint",
      example: "500",
      count: 3,
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:02:00.000Z"
    }
  ];

  const selected = selectRelevantFailureMemory(entries, {
    failureCategory: "runtime-error",
    stageLabel: "Build",
    currentArtifact: "script-tool"
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.key, "a");
});

test("formatFailureMemoryForPrompt renders expected heading and lines", () => {
  const lines = formatFailureMemoryForPrompt([
    {
      key: "a",
      artifactType: "script-tool",
      category: "runtime-error",
      stage: "Build recovery",
      signature: "cli-usage-output",
      guidance: "Use real output",
      example: "usage",
      count: 2,
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:01:00.000Z"
    }
  ]);
  assert.deepEqual(lines, [
    "Recurring failure memory:",
    "- 2x runtime-error/cli-usage-output: Use real output"
  ]);
});

test("trimFailureMemoryStore removes lowest-priority entries beyond limit", () => {
  const memory = new Map<string, FailureMemoryRecord>([
    ["a", {
      key: "a", artifactType: "unknown", category: "unknown", stage: "Build", signature: "a", guidance: "", example: "", count: 5,
      firstSeenAt: "2026-04-28T00:00:00.000Z", lastSeenAt: "2026-04-28T00:05:00.000Z"
    }],
    ["b", {
      key: "b", artifactType: "unknown", category: "unknown", stage: "Build", signature: "b", guidance: "", example: "", count: 3,
      firstSeenAt: "2026-04-28T00:00:00.000Z", lastSeenAt: "2026-04-28T00:04:00.000Z"
    }],
    ["c", {
      key: "c", artifactType: "unknown", category: "unknown", stage: "Build", signature: "c", guidance: "", example: "", count: 1,
      firstSeenAt: "2026-04-28T00:00:00.000Z", lastSeenAt: "2026-04-28T00:03:00.000Z"
    }]
  ]);

  trimFailureMemoryStore(memory, 2);
  assert.equal(memory.has("a"), true);
  assert.equal(memory.has("b"), true);
  assert.equal(memory.has("c"), false);
});

test("upsertFailureMemoryEntry creates a new entry with initial counters", () => {
  const result = upsertFailureMemoryEntry({
    current: undefined,
    key: "script-tool|runtime-error|missing-start-script",
    artifactType: "script-tool",
    category: "runtime-error",
    stage: "Launch recovery",
    signature: "missing-start-script",
    guidance: "Add a start script before launching.",
    example: "npm ERR! missing script: start",
    now: "2026-04-28T08:00:00.000Z"
  });

  assert.equal(result.created, true);
  assert.deepEqual(result.entry, {
    key: "script-tool|runtime-error|missing-start-script",
    artifactType: "script-tool",
    category: "runtime-error",
    stage: "Launch recovery",
    signature: "missing-start-script",
    guidance: "Add a start script before launching.",
    example: "npm ERR! missing script: start",
    count: 1,
    firstSeenAt: "2026-04-28T08:00:00.000Z",
    lastSeenAt: "2026-04-28T08:00:00.000Z"
  });
});

test("upsertFailureMemoryEntry updates existing entries and increments count", () => {
  const current: FailureMemoryRecord = {
    key: "script-tool|runtime-error|missing-start-script",
    artifactType: "script-tool",
    category: "runtime-error",
    stage: "Build recovery",
    signature: "missing-start-script",
    guidance: "Old guidance",
    example: "old example",
    count: 2,
    firstSeenAt: "2026-04-28T07:00:00.000Z",
    lastSeenAt: "2026-04-28T07:30:00.000Z"
  };

  const result = upsertFailureMemoryEntry({
    current,
    key: "script-tool|runtime-error|missing-start-script",
    artifactType: "script-tool",
    category: "runtime-error",
    stage: "Launch recovery",
    signature: "missing-start-script",
    guidance: "Add a start script before launching.",
    example: "npm ERR! missing script: start",
    now: "2026-04-28T08:00:00.000Z"
  });

  assert.equal(result.created, false);
  assert.deepEqual(result.entry, {
    key: "script-tool|runtime-error|missing-start-script",
    artifactType: "script-tool",
    category: "runtime-error",
    stage: "Launch recovery",
    signature: "missing-start-script",
    guidance: "Add a start script before launching.",
    example: "npm ERR! missing script: start",
    count: 3,
    firstSeenAt: "2026-04-28T07:00:00.000Z",
    lastSeenAt: "2026-04-28T08:00:00.000Z"
  });
});
