import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentTaskChangedPayload,
  AgentTaskRequest,
  AgentTaskRestartMode,
  AgentRouteDiagnostics,
  AgentSnapshotRestoreResult,
  ClaudeChatFilesystemSettings,
  ChatContext,
  ClaudeManagedEditPermissions,
  GeneratedImageHistoryPage,
  GeneratedImageHistoryItem,
  ImageHistoryListRequest,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageHistoryMutationResult,
  ImageSaveResult,
  ManagedWriteRepairResult,
  ManagedWriteVerificationReport
} from "../shared/types";

const api = {
  app: {
    workspacePath: () => ipcRenderer.invoke("app:workspacePath"),
    info: (): Promise<{ name: string; version: string }> => ipcRenderer.invoke("app:getInfo"),
    newWindow: () => ipcRenderer.invoke("app:newWindow"),
    openExternal: (targetUrl: string) => ipcRenderer.invoke("app:openExternal", targetUrl),
    openPreview: (targetPath: string, preferredUrl?: string) => ipcRenderer.invoke("app:openPreview", targetPath, preferredUrl),
    openPreviewWindow: (targetUrl: string, title?: string) => ipcRenderer.invoke("app:openPreviewWindow", targetUrl, title)
  },
  chat: {
    list: () => ipcRenderer.invoke("chat:list"),
    get: (id: string) => ipcRenderer.invoke("chat:get", id),
    create: (context?: ChatContext) => ipcRenderer.invoke("chat:create", context),
    delete: (id: string) => ipcRenderer.invoke("chat:delete", id),
    rename: (id: string, title: string) => ipcRenderer.invoke("chat:rename", id, title),
    export: (id: string) => ipcRenderer.invoke("chat:export", id),
    import: () => ipcRenderer.invoke("chat:import"),
    appendMessage: (chatId: string, message: unknown) => ipcRenderer.invoke("chat:appendMessage", chatId, message),
    updateMessage: (chatId: string, messageId: string, patch: unknown) => ipcRenderer.invoke("chat:updateMessage", chatId, messageId, patch),
    setContext: (id: string, context: ChatContext) => ipcRenderer.invoke("chat:setContext", id, context),
    setSystemPrompt: (id: string, systemPrompt: string) => ipcRenderer.invoke("chat:setSystemPrompt", id, systemPrompt),
    summarize: (messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) => ipcRenderer.invoke("chat:summarize", messages),
    generateTitle: (chatId: string, firstUserMessage: string) => ipcRenderer.invoke("chat:generateTitle", chatId, firstUserMessage),
    transcribeAudio: (audioBytes: Uint8Array, mimeType?: string) => ipcRenderer.invoke("chat:transcribeAudio", audioBytes, mimeType),
    send: (
      chatId: string,
      content: string,
      model: string,
      options?: {
        attachments?: Array<{ name: string; type: "text" | "image"; content: string; mimeType?: string; sourcePath?: string }>;
        compareModel?: string;
        context?: ChatContext;
        enabledTools?: string[];
      }
    ) => ipcRenderer.invoke("chat:send", chatId, content, model, options),
    stop: (chatId: string) => ipcRenderer.invoke("chat:stop", chatId),
    onMessage: (cb: (chatId: string, msg: unknown) => void) => {
      ipcRenderer.on("chat:message", (_e, chatId, msg) => cb(chatId, msg));
    },
    onChunk: (cb: (chatId: string, msgId: string, chunk: string) => void) => {
      ipcRenderer.on("chat:chunk", (_e, chatId, msgId, chunk) => cb(chatId, msgId, chunk));
    },
    onDone: (cb: (chatId: string, msgId: string) => void) => {
      ipcRenderer.on("chat:done", (_e, chatId, msgId) => cb(chatId, msgId));
    },
    onError: (cb: (chatId: string, msgId: string, err: string) => void) => {
      ipcRenderer.on("chat:error", (_e, chatId, msgId, err) => cb(chatId, msgId, err));
    },
    onStoreChanged: (cb: (payload?: { chatId?: string; reason?: string }) => void) => {
      ipcRenderer.on("chat:storeChanged", (_e, payload) => cb(payload));
    }
  },
  images: {
    generate: (request: ImageGenerationRequest): Promise<ImageGenerationResult> => ipcRenderer.invoke("images:generate", request),
    listHistory: (): Promise<GeneratedImageHistoryItem[]> => ipcRenderer.invoke("images:listHistory"),
    listHistoryPage: (request?: ImageHistoryListRequest): Promise<GeneratedImageHistoryPage> => ipcRenderer.invoke("images:listHistoryPage", request),
    save: (dataUrl: string, suggestedName?: string, historyId?: string): Promise<ImageSaveResult> =>
      ipcRenderer.invoke("images:save", dataUrl, suggestedName, historyId),
    deleteHistory: (historyId: string): Promise<ImageHistoryMutationResult> => ipcRenderer.invoke("images:deleteHistory", historyId)
  },
  attachments: {
    pick: () => ipcRenderer.invoke("attachments:pick"),
    pickWritableRoots: () => ipcRenderer.invoke("attachments:pickWritableRoots")
  },
  templates: {
    list: () => ipcRenderer.invoke("templates:list"),
    save: (name: string, content: string) => ipcRenderer.invoke("templates:save", name, content),
    delete: (name: string) => ipcRenderer.invoke("templates:delete", name)
  },
  ollama: {
    check: () => ipcRenderer.invoke("ollama:check"),
    listModels: (baseUrl?: string) => ipcRenderer.invoke("ollama:listModels", baseUrl)
  },
  mcp: {
    list: () => ipcRenderer.invoke("mcp:list"),
    add: (server: { name: string; command: string; args: string[] }) => ipcRenderer.invoke("mcp:add", server),
    remove: (name: string) => ipcRenderer.invoke("mcp:remove", name),
    start: (name: string) => ipcRenderer.invoke("mcp:start", name),
    stop: (name: string) => ipcRenderer.invoke("mcp:stop", name),
    status: () => ipcRenderer.invoke("mcp:status"),
    onChanged: (cb: () => void) => {
      ipcRenderer.on("mcp:changed", () => cb());
    }
  },
  claude: {
      status: () => ipcRenderer.invoke("claude:status"),
      start: () => ipcRenderer.invoke("claude:start"),
      send: (
        prompt: string,
        options?: {
          chatId?: string;
          attachments?: Array<{ name: string; type: "text" | "image"; content: string; mimeType?: string; sourcePath?: string }>;
          enabledTools?: string[];
          includeFullTextAttachments?: boolean;
          filesystemAccess?: ClaudeChatFilesystemSettings;
        }
      ) => ipcRenderer.invoke("claude:send", prompt, options),
      inspectEdits: (
        edits: Array<{ path: string; content: string }>,
        permissions: ClaudeManagedEditPermissions,
        baselineContents?: Array<{ path: string; content: string }>
      ) => ipcRenderer.invoke("claude:inspectEdits", edits, permissions, baselineContents),
      applyEdits: (
        edits: Array<{ path: string; content: string }>,
        permissions: ClaudeManagedEditPermissions,
        baselineContents?: Array<{ path: string; content: string }>
      ) => ipcRenderer.invoke("claude:applyEdits", edits, permissions, baselineContents),
      verifyManagedEdits: (edits: Array<{ path: string; content: string }>): Promise<ManagedWriteVerificationReport> =>
        ipcRenderer.invoke("claude:verifyManagedEdits", edits),
      repairManagedEdits: (
        edits: Array<{ path: string; content: string }>,
        verification: ManagedWriteVerificationReport
      ): Promise<ManagedWriteRepairResult> => ipcRenderer.invoke("claude:repairManagedEdits", edits, verification),
      stop: () => ipcRenderer.invoke("claude:stop"),
    onOutput: (cb: (payload: { text: string; stream: "stdout" | "stderr" | "system" }) => void) => {
      ipcRenderer.on("claude:output", (_e, payload) => cb(payload));
    },
    onError: (cb: (message: string) => void) => {
      ipcRenderer.on("claude:error", (_e, message) => cb(message));
    },
    onExit: (cb: (payload: { code: number | null; signal: string | null }) => void) => {
      ipcRenderer.on("claude:exit", (_e, payload) => cb(payload));
    }
  },
  agent: {
    listTasks: () => ipcRenderer.invoke("agent:listTasks"),
    getTask: (taskId: string) => ipcRenderer.invoke("agent:getTask", taskId),
    getLogs: (taskId: string) => ipcRenderer.invoke("agent:getLogs", taskId),
    getRouteDiagnostics: (taskId?: string): Promise<AgentRouteDiagnostics> => ipcRenderer.invoke("agent:getRouteDiagnostics", taskId),
    startTask: (request: string | AgentTaskRequest) => ipcRenderer.invoke("agent:startTask", request),
    restartTask: (taskId: string, mode: AgentTaskRestartMode) => ipcRenderer.invoke("agent:restartTask", taskId, mode),
    stopTask: (taskId: string) => ipcRenderer.invoke("agent:stopTask", taskId),
    listSnapshots: () => ipcRenderer.invoke("agent:listSnapshots"),
    getRestoreState: (): Promise<AgentSnapshotRestoreResult | null> => ipcRenderer.invoke("agent:getRestoreState"),
    restoreSnapshot: (snapshotId: string): Promise<AgentSnapshotRestoreResult> => ipcRenderer.invoke("agent:restoreSnapshot", snapshotId),
    onChanged: (cb: (payload?: AgentTaskChangedPayload) => void) => {
      ipcRenderer.on("agent:changed", (_e, payload) => cb(payload));
    }
  },
  terminal: {
    run: (request: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) =>
      ipcRenderer.invoke("terminal:run", request)
  },
  workspace: {
    listFiles: (targetPath?: string, depth?: number) => ipcRenderer.invoke("workspace:listFiles", targetPath, depth),
    readFile: (targetPath: string) => ipcRenderer.invoke("workspace:readFile", targetPath),
    writeFile: (targetPath: string, content: string) => ipcRenderer.invoke("workspace:writeFile", targetPath, content),
    search: (pattern: string, targetPath?: string) => ipcRenderer.invoke("workspace:search", pattern, targetPath),
    pathExists: (targetPath: string) => ipcRenderer.invoke("workspace:pathExists", targetPath),
    openPath: (targetPath: string) => ipcRenderer.invoke("workspace:openPath", targetPath)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (partial: unknown) => ipcRenderer.invoke("settings:save", partial),
    onChanged: (cb: () => void) => {
      ipcRenderer.on("settings:changed", () => cb());
    }
  },
  stats: {
    get: () => ipcRenderer.invoke("stats:get")
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text)
  },
  router: {
    status: () => ipcRenderer.invoke("router:status"),
    logs: () => ipcRenderer.invoke("router:logs"),
    start: () => ipcRenderer.invoke("router:start"),
    stop: () => ipcRenderer.invoke("router:stop"),
    test: () => ipcRenderer.invoke("router:test"),
    onLog: (cb: (line: string) => void) => {
      ipcRenderer.on("router:log", (_e, line) => cb(line));
    },
    onStateChanged: (cb: () => void) => {
      ipcRenderer.on("router:stateChanged", () => cb());
    }
  }
};

contextBridge.exposeInMainWorld("api", api);
