import test from "node:test";
import assert from "node:assert/strict";
import {
  getAgentRouteDiagnostics,
  getAgentTask,
  getAgentTaskLogs,
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
    startTask: async (prompt: string) => ({ id: "task-1", prompt, status: "running" }),
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
    status: "running"
  });
});
