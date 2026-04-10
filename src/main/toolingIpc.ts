import { ipcMain, BrowserWindow, WebContents } from "electron";
import { pickAttachmentPayloads, pickWritableRootPayloads } from "./attachmentSupport";
import { sendClaudePrompt } from "./claudeIpcSupport";
import { applyManagedClaudeEdits } from "./managedEditSupport";
import { repairManagedWriteProposal } from "./managedWriteRepairSupport";
import { verifyManagedWriteProposal } from "./managedWriteVerificationSupport";
import { addMcpServer, listMcpServers, removeMcpServer } from "./mcpIpcSupport";
import type { McpRuntimeManager } from "./mcpSupport";
import {
  deleteTemplate,
  listTemplates,
  refreshOllamaModels,
  saveSettingsPartial,
  saveTemplate
} from "./settingsSupport";
import { probeOllamaInstalled, ClaudeSessionManager } from "./claudeSupport";
import type { CcrService } from "./services/ccrService";
import type { SettingsStore } from "./services/settingsStore";
import type {
  AttachmentPayload,
  ClaudeManagedEdit,
  ClaudeManagedEditPermissions,
  ManagedWriteVerificationReport,
  McpServerConfig
} from "../shared/types";

interface ClaudeSendOptions {
  attachments?: AttachmentPayload[];
  enabledTools?: string[];
}

interface Deps {
  settingsStore: SettingsStore;
  ccrService: CcrService;
  mcpRuntimeManager: McpRuntimeManager;
  claudeSessionManager: ClaudeSessionManager;
  getWindowForSender: (sender: WebContents) => BrowserWindow | null;
  getPrimaryWindow: () => BrowserWindow | null;
  broadcastToWindows: (channel: string, ...args: unknown[]) => void;
}

export function registerToolingIpcHandlers(deps: Deps): void {
  const {
    settingsStore,
    ccrService,
    mcpRuntimeManager,
    claudeSessionManager,
    getWindowForSender,
    getPrimaryWindow,
    broadcastToWindows
  } = deps;

  const resolveDialogWindow = (sender: WebContents): BrowserWindow => {
    return getWindowForSender(sender) ?? getPrimaryWindow() ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!;
  };

  const emitSettingsChanged = (): void => {
    broadcastToWindows("settings:changed");
  };

  const emitRouterStateChanged = (): void => {
    broadcastToWindows("router:stateChanged");
  };

  ipcMain.removeHandler("settings:get");
  ipcMain.handle("settings:get", () => settingsStore.get());

  ipcMain.removeHandler("settings:save");
  ipcMain.handle("settings:save", async (_e, partial: Record<string, unknown>) => {
    const saved = await saveSettingsPartial(settingsStore, partial);
    emitSettingsChanged();
    return saved;
  });

  ipcMain.removeHandler("attachments:pick");
  ipcMain.handle("attachments:pick", async (event) => pickAttachmentPayloads(resolveDialogWindow(event.sender)));

  ipcMain.removeHandler("attachments:pickWritableRoots");
  ipcMain.handle("attachments:pickWritableRoots", async (event) => pickWritableRootPayloads(resolveDialogWindow(event.sender)));

  ipcMain.removeHandler("templates:list");
  ipcMain.handle("templates:list", () => listTemplates(settingsStore));

  ipcMain.removeHandler("templates:save");
  ipcMain.handle("templates:save", async (_e, name: string, content: string) => {
    const templates = await saveTemplate(settingsStore, name, content);
    emitSettingsChanged();
    return templates;
  });

  ipcMain.removeHandler("templates:delete");
  ipcMain.handle("templates:delete", async (_e, name: string) => {
    const templates = await deleteTemplate(settingsStore, name);
    emitSettingsChanged();
    return templates;
  });

  ipcMain.removeHandler("ollama:listModels");
  ipcMain.handle("ollama:listModels", async (_e, baseUrl?: string) => {
    const models = await refreshOllamaModels(settingsStore, ccrService, baseUrl);
    emitSettingsChanged();
    return models;
  });

  ipcMain.removeHandler("ollama:check");
  ipcMain.handle("ollama:check", async () => probeOllamaInstalled());

  ipcMain.removeHandler("mcp:list");
  ipcMain.handle("mcp:list", () => listMcpServers(settingsStore));

  ipcMain.removeHandler("mcp:add");
  ipcMain.handle("mcp:add", async (_e, server: McpServerConfig) => {
    const servers = await addMcpServer(settingsStore, server);
    emitSettingsChanged();
    emitRouterStateChanged();
    return servers;
  });

  ipcMain.removeHandler("mcp:remove");
  ipcMain.handle("mcp:remove", async (_e, name: string) => {
    const servers = await removeMcpServer(settingsStore, mcpRuntimeManager, name);
    emitSettingsChanged();
    emitRouterStateChanged();
    return servers;
  });

  ipcMain.removeHandler("mcp:start");
  ipcMain.handle("mcp:start", async (_e, name: string) => {
    const status = await mcpRuntimeManager.start(name);
    emitRouterStateChanged();
    return status;
  });

  ipcMain.removeHandler("mcp:stop");
  ipcMain.handle("mcp:stop", async (_e, name: string) => {
    const status = await mcpRuntimeManager.stop(name);
    emitRouterStateChanged();
    return status;
  });

  ipcMain.removeHandler("mcp:status");
  ipcMain.handle("mcp:status", () => mcpRuntimeManager.buildStatus());

  ipcMain.removeHandler("claude:status");
  ipcMain.handle("claude:status", () => claudeSessionManager.status());

  ipcMain.removeHandler("claude:start");
  ipcMain.handle("claude:start", async () => claudeSessionManager.start());

  ipcMain.removeHandler("claude:send");
  ipcMain.handle("claude:send", async (_e, prompt: string, options?: ClaudeSendOptions) => {
    return sendClaudePrompt(claudeSessionManager, prompt, options);
  });

  ipcMain.removeHandler("claude:applyEdits");
  ipcMain.handle("claude:applyEdits", async (_e, rawEdits: ClaudeManagedEdit[], permissions: ClaudeManagedEditPermissions) => {
    return applyManagedClaudeEdits(rawEdits, permissions);
  });

  ipcMain.removeHandler("claude:verifyManagedEdits");
  ipcMain.handle("claude:verifyManagedEdits", async (_e, rawEdits: ClaudeManagedEdit[]) => {
    return verifyManagedWriteProposal(
      settingsStore.get(),
      (history, model, onChunk, signal, options) => ccrService.sendMessageAdvanced(history, model, onChunk, signal, options),
      Array.isArray(rawEdits) ? rawEdits : []
    );
  });

  ipcMain.removeHandler("claude:repairManagedEdits");
  ipcMain.handle("claude:repairManagedEdits", async (_e, rawEdits: ClaudeManagedEdit[], verification: ManagedWriteVerificationReport) => {
    return repairManagedWriteProposal(
      settingsStore.get(),
      (history, model, onChunk, signal, options) => ccrService.sendMessageAdvanced(history, model, onChunk, signal, options),
      Array.isArray(rawEdits) ? rawEdits : [],
      verification
    );
  });

  ipcMain.removeHandler("claude:stop");
  ipcMain.handle("claude:stop", async () => claudeSessionManager.stop());
}
