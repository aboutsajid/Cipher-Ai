import { BrowserWindow, WebContents } from "electron";
import { registerChatAppIpcHandlers } from "./chatAppIpc";
import { registerAgentWorkspaceRouterIpcHandlers } from "./agentWorkspaceRouterIpc";
import { ClaudeSessionManager } from "./claudeSupport";
import { McpRuntimeManager } from "./mcpSupport";
import { registerToolingIpcHandlers } from "./toolingIpc";
import { normalizeAudioBytes, transcribeAudio } from "./voiceSupport";
import type { ChatsStore } from "./services/chatsStore";
import type { SettingsStore } from "./services/settingsStore";
import type { CcrService } from "./services/ccrService";
import type { AgentTaskRunner } from "./services/agentTaskRunner";
import type { ImageGenerationService } from "./services/imageGenerationService";

interface Deps {
  settingsStore: SettingsStore;
  chatsStore: ChatsStore;
  ccrService: CcrService;
  agentTaskRunner: AgentTaskRunner;
  imageGenerationService: ImageGenerationService;
  claudeChatWorkingDirectory: string;
  createWindow: (initialChatId?: string, startDraftChat?: boolean) => Promise<BrowserWindow>;
  getWindowForSender: (sender: WebContents) => BrowserWindow | null;
  getPrimaryWindow: () => BrowserWindow | null;
  broadcastToWindows: (channel: string, ...args: unknown[]) => void;
}

const activeControllers = new Map<string, AbortController>();

export function registerIpcHandlers(deps: Deps): void {
  const {
    settingsStore,
    chatsStore,
    ccrService,
    agentTaskRunner,
    imageGenerationService,
    claudeChatWorkingDirectory,
    createWindow,
    getWindowForSender,
    getPrimaryWindow,
    broadcastToWindows
  } = deps;
  const mcpRuntimeManager = new McpRuntimeManager(settingsStore);
  const claudeSessionManager = new ClaudeSessionManager((channel, payload) => {
    broadcastToWindows(channel, payload);
  }, {
    workingDirectory: claudeChatWorkingDirectory
  });

  ccrService.setLogHandler((line) => {
    broadcastToWindows("router:log", line);
  });
  registerChatAppIpcHandlers({
    settingsStore,
    chatsStore,
    ccrService,
    agentTaskRunner,
    activeControllers,
    createWindow,
    getWindowForSender,
    getPrimaryWindow,
    broadcastToWindows,
    transcribeAudio,
    normalizeAudioBytes
  });

  registerToolingIpcHandlers({
    settingsStore,
    chatsStore,
    ccrService,
    imageGenerationService,
    mcpRuntimeManager,
    claudeSessionManager,
    getWindowForSender,
    getPrimaryWindow,
    broadcastToWindows
  });
  registerAgentWorkspaceRouterIpcHandlers({ ccrService, agentTaskRunner, broadcastToWindows });
}
