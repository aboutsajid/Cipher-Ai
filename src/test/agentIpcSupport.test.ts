import test from "node:test";
import assert from "node:assert/strict";
import {
  getAgentRouteDiagnostics,
  getAgentTask,
  getAgentTaskLogs,
  preflightAgentTaskPrompt,
  restoreAgentSnapshot,
  startAgentTask,
  stopAgentTask
} from "../main/agentIpcSupport";

function createRunner() {
  return {
    listTasks: () => [],
    getTask: (taskId: string) => ({ id: taskId, prompt: "demo", status: "running" }),
    getTaskLogs: (taskId: string) => [`log:${taskId}`],
    getRouteDiagnostics: (taskId?: string) => ({ routes: [], task: taskId ? { taskId, blacklistedModels: [], failureCounts: [], activeStageRoutes: [] } : undefined }),
    startTask: async (
      prompt: string,
      attachments?: Array<{ name: string }>,
      targetPath?: string,
      runMode?: "standard" | "build-product"
    ) => ({ id: "task-1", prompt, attachments, targetPath, runMode, status: "running" }),
    stopTask: async (taskId: string) => taskId === "task-1",
    listSnapshots: () => [],
    getLastRestoreState: async () => null,
    restoreSnapshot: async (snapshotId: string) => ({ ok: true, message: "restored", snapshotId }),
    runTerminalCommand: async () => ({ ok: true }),
    listWorkspaceFiles: async () => [],
    readWorkspaceFile: async () => ({ path: "a", content: "", size: 0 }),
    writeWorkspaceFile: async () => ({ ok: true, path: "a", size: 1 }),
    searchWorkspace: async () => []
  };
}

test("agent ipc helpers trim ids and validate prompts", async () => {
  const runner = createRunner();

  assert.deepEqual(getAgentTask(runner as never, "  task-1 "), { id: "task-1", prompt: "demo", status: "running" });
  assert.deepEqual(getAgentTaskLogs(runner as never, "  task-1 "), ["log:task-1"]);
  assert.deepEqual(getAgentRouteDiagnostics(runner as never, "  task-1 "), {
    routes: [],
    task: {
      taskId: "task-1",
      blacklistedModels: [],
      failureCounts: [],
      activeStageRoutes: []
    }
  });
  assert.equal(await stopAgentTask(runner as never, " task-1 "), true);
  assert.deepEqual(await restoreAgentSnapshot(runner as never, " snap-1 "), {
    ok: true,
    message: "restored",
    snapshotId: "snap-1"
  });
  await assert.rejects(() => startAgentTask(runner as never, "   "), /Agent prompt is required/);
  assert.deepEqual(await startAgentTask(runner as never, "  build app  "), {
    id: "task-1",
    prompt: "build app",
    attachments: [],
    targetPath: undefined,
    runMode: "build-product",
    status: "running"
  });
  assert.deepEqual(await startAgentTask(runner as never, {
    prompt: "  inspect screenshot  ",
    attachments: [{ name: "screen.png", type: "image", content: "data:image/png;base64,YWJj", mimeType: "image/png" }],
    targetPath: "  generated-apps/custom-agent  "
  }), {
    id: "task-1",
    prompt: "inspect screenshot",
    attachments: [{ name: "screen.png", type: "image", content: "data:image/png;base64,YWJj", mimeType: "image/png", sourcePath: undefined, writableRoot: undefined }],
    targetPath: "generated-apps/custom-agent",
    runMode: "build-product",
    status: "running"
  });
  assert.deepEqual(await startAgentTask(runner as never, {
    prompt: "run a quick standard lane",
    runMode: "standard"
  }), {
    id: "task-1",
    prompt: "run a quick standard lane",
    attachments: [],
    targetPath: undefined,
    runMode: "standard",
    status: "running"
  });
});

test("agent preflight flags blocking prompt contradictions and impossible constraints", () => {
  const contradiction = preflightAgentTaskPrompt({
    prompt: "Build a landing page with hero section, but do not include any hero section.",
    runMode: "build-product"
  });
  assert.equal(contradiction.ok, false);
  assert.equal(contradiction.issues.some((issue) => issue.code === "contradictory-requirement"), true);

  const impossible = preflightAgentTaskPrompt({
    prompt: "Create a desktop app but do not modify any files at all.",
    runMode: "build-product"
  });
  assert.equal(impossible.ok, false);
  assert.equal(impossible.issues.some((issue) => issue.code === "impossible-constraint"), true);
});

test("agent preflight passes explicit desktop packaging prompts", () => {
  const result = preflightAgentTaskPrompt({
    prompt: "Create an Electron desktop app with package:win, Windows installer, and installer smoke.",
    runMode: "build-product"
  });
  assert.equal(result.inferredArtifact, "desktop-app");
  assert.equal(result.ok, true);
});
