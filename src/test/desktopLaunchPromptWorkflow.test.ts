import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("desktop launch prompt queues on task completion transitions and recent completions", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /function completedTaskIsRecent\(task: AgentTask, withinMs = 20_000\): boolean/);
  assert.match(rendererSource, /function shouldQueueDesktopLaunchPrompt\(\s*task: AgentTask,\s*previousStatus: AgentTask\["status"\] \| null,/);
  assert.match(rendererSource, /if \(previousStatus === "running"\) return true;/);
  assert.match(rendererSource, /return completedTaskIsRecent\(task\);/);
});

test("refreshAgentTask queues desktop launch prompts before rendering the completed task", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /if \(shouldQueueDesktopLaunchPrompt\(task, previousTaskStatus, restoreState\)\) \{\s*pendingDesktopLaunchPromptTasks\.add\(task\.id\);\s*\}[\s\S]*renderAgentTask\(task, logs\);/);
});
