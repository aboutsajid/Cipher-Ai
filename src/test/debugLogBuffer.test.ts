import test from "node:test";
import assert from "node:assert/strict";
import { createBufferedLogWriter, redactDebugLogText } from "../main/services/debugLogBuffer";

test("redactDebugLogText hides token-like values and API keys", () => {
  const source = [
    "Authorization: Bearer abcdef1234567890",
    "apiKey=\"sk-or-v1-abcdefghijklmnopqrstuvwxyz\"",
    "OPENAI_API_KEY=sk-abcdefghijklmnop",
    "https://example.com?token=abcdef123456"
  ].join(" | ");

  const redacted = redactDebugLogText(source);
  assert.equal(redacted.includes("abcdef1234567890"), false);
  assert.equal(redacted.includes("sk-or-v1-abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(redacted.includes("sk-abcdefghijklmnop"), false);
  assert.equal(redacted.includes("token=abcdef123456"), false);
  assert.equal(redacted.includes("[REDACTED]"), true);
});

test("createBufferedLogWriter flushes when line threshold is reached", async () => {
  const writes: string[] = [];
  const writer = createBufferedLogWriter(
    {
      append: async (chunk) => {
        writes.push(chunk);
      },
      appendSync: (chunk) => {
        writes.push(chunk);
      }
    },
    { flushIntervalMs: 10_000, flushLineThreshold: 2 }
  );

  writer.appendLine("line-1\n");
  writer.appendLine("line-2\n");
  await writer.flush();

  assert.deepEqual(writes, ["line-1\nline-2\n"]);
});

test("createBufferedLogWriter flushSync writes pending lines immediately", () => {
  const writes: string[] = [];
  const writer = createBufferedLogWriter(
    {
      append: async (chunk) => {
        writes.push(chunk);
      },
      appendSync: (chunk) => {
        writes.push(chunk);
      }
    },
    { flushIntervalMs: 10_000, flushLineThreshold: 99 }
  );

  writer.appendLine("sync-line-1\n");
  writer.appendLine("sync-line-2\n");
  writer.flushSync();

  assert.deepEqual(writes, ["sync-line-1\nsync-line-2\n"]);
});

test("createBufferedLogWriter uses scheduled flush when under threshold", async () => {
  const writes: string[] = [];
  const writer = createBufferedLogWriter(
    {
      append: async (chunk) => {
        writes.push(chunk);
      },
      appendSync: (chunk) => {
        writes.push(chunk);
      }
    },
    { flushIntervalMs: 20, flushLineThreshold: 10 }
  );

  writer.appendLine("delayed-line\n");
  await new Promise<void>((resolve) => setTimeout(resolve, 35));
  await writer.flush();

  assert.deepEqual(writes, ["delayed-line\n"]);
});
