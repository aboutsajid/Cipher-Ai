import test from "node:test";
import assert from "node:assert/strict";
import { appendTaskLogLine, extractTaskOutputLogLines } from "../main/services/taskLogStore";

test("extractTaskOutputLogLines trims trailing whitespace and skips blank lines", () => {
  assert.deepEqual(
    extractTaskOutputLogLines(" first  \n\nsecond\t\n   \nthird"),
    [" first", "second", "third"]
  );
});

test("appendTaskLogLine stores timestamped lines and enforces max history", () => {
  const taskLogs = new Map<string, string[]>();
  appendTaskLogLine(taskLogs, "task-1", "line-1", 2, "2026-04-28T00:00:00.000Z");
  appendTaskLogLine(taskLogs, "task-1", "line-2", 2, "2026-04-28T00:00:01.000Z");
  appendTaskLogLine(taskLogs, "task-1", "line-3", 2, "2026-04-28T00:00:02.000Z");

  assert.deepEqual(taskLogs.get("task-1"), [
    "[2026-04-28T00:00:01.000Z] line-2",
    "[2026-04-28T00:00:02.000Z] line-3"
  ]);
});
