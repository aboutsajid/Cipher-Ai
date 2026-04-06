import { ipcMain } from "electron";
import {
  getAgentRouteDiagnostics,
  getAgentTask,
  getAgentTaskLogs,
  restoreAgentSnapshot,
  startAgentTask,
  stopAgentTask
} from "./agentIpcSupport";
import { getRouterLogs, getRouterStatus, startRouter, stopRouter, testRouter } from "./routerIpcSupport";
import type { CcrService } from "./services/ccrService";
import type { AgentTaskRunner } from "./services/agentTaskRunner";
import type { TerminalCommandRequest } from "../shared/types";

interface Deps {
  ccrService: CcrService;
  agentTaskRunner: AgentTaskRunner;
  broadcastToWindows: (channel: string, ...args: unknown[]) => void;
}

export function registerAgentWorkspaceRouterIpcHandlers(deps: Deps): void {
  const { ccrService, agentTaskRunner, broadcastToWindows } = deps;

  ipcMain.removeHandler("agent:listTasks");
  ipcMain.handle("agent:listTasks", () => agentTaskRunner.listTasks());

  ipcMain.removeHandler("agent:getTask");
  ipcMain.handle("agent:getTask", (_e, taskId: string) => getAgentTask(agentTaskRunner, taskId));

  ipcMain.removeHandler("agent:getLogs");
  ipcMain.handle("agent:getLogs", (_e, taskId: string) => getAgentTaskLogs(agentTaskRunner, taskId));

  ipcMain.removeHandler("agent:getRouteDiagnostics");
  ipcMain.handle("agent:getRouteDiagnostics", (_e, taskId?: string) => getAgentRouteDiagnostics(agentTaskRunner, taskId));

  ipcMain.removeHandler("agent:startTask");
  ipcMain.handle("agent:startTask", async (_e, prompt: string) => startAgentTask(agentTaskRunner, prompt));

  ipcMain.removeHandler("agent:stopTask");
  ipcMain.handle("agent:stopTask", (_e, taskId: string) => stopAgentTask(agentTaskRunner, taskId));

  ipcMain.removeHandler("agent:listSnapshots");
  ipcMain.handle("agent:listSnapshots", () => agentTaskRunner.listSnapshots());

  ipcMain.removeHandler("agent:getRestoreState");
  ipcMain.handle("agent:getRestoreState", async () => agentTaskRunner.getLastRestoreState());

  ipcMain.removeHandler("agent:restoreSnapshot");
  ipcMain.handle("agent:restoreSnapshot", async (_e, snapshotId: string) => restoreAgentSnapshot(agentTaskRunner, snapshotId));

  ipcMain.removeHandler("terminal:run");
  ipcMain.handle("terminal:run", async (_e, request: TerminalCommandRequest) => agentTaskRunner.runTerminalCommand(request));

  ipcMain.removeHandler("workspace:listFiles");
  ipcMain.handle("workspace:listFiles", async (_e, targetPath?: string, depth?: number) => {
    return agentTaskRunner.listWorkspaceFiles(targetPath, depth);
  });

  ipcMain.removeHandler("workspace:readFile");
  ipcMain.handle("workspace:readFile", async (_e, targetPath: string) => agentTaskRunner.readWorkspaceFile(targetPath));

  ipcMain.removeHandler("workspace:writeFile");
  ipcMain.handle("workspace:writeFile", async (_e, targetPath: string, content: string) => {
    return agentTaskRunner.writeWorkspaceFile(targetPath, content);
  });

  ipcMain.removeHandler("workspace:search");
  ipcMain.handle("workspace:search", async (_e, pattern: string, targetPath?: string) => {
    return agentTaskRunner.searchWorkspace(pattern, targetPath);
  });

  ipcMain.removeHandler("router:status");
  ipcMain.handle("router:status", () => getRouterStatus(ccrService));

  ipcMain.removeHandler("router:logs");
  ipcMain.handle("router:logs", () => getRouterLogs(ccrService));

  ipcMain.removeHandler("router:start");
  ipcMain.handle("router:start", async () => {
    const result = await startRouter(ccrService);
    broadcastToWindows("router:stateChanged");
    return result;
  });

  ipcMain.removeHandler("router:stop");
  ipcMain.handle("router:stop", async () => {
    const result = await stopRouter(ccrService);
    broadcastToWindows("router:stateChanged");
    return result;
  });

  ipcMain.removeHandler("router:test");
  ipcMain.handle("router:test", async () => testRouter(ccrService));
}
