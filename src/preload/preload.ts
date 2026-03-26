import { contextBridge, ipcRenderer } from "electron";

const api = {
  chat: {
    list: () => ipcRenderer.invoke("chat:list"),
    get: (id: string) => ipcRenderer.invoke("chat:get", id),
    create: () => ipcRenderer.invoke("chat:create"),
    delete: (id: string) => ipcRenderer.invoke("chat:delete", id),
    rename: (id: string, title: string) => ipcRenderer.invoke("chat:rename", id, title),
    export: (id: string) => ipcRenderer.invoke("chat:export", id),
    setSystemPrompt: (id: string, systemPrompt: string) => ipcRenderer.invoke("chat:setSystemPrompt", id, systemPrompt),
    summarize: (messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) => ipcRenderer.invoke("chat:summarize", messages),
    generateTitle: (chatId: string, firstUserMessage: string) => ipcRenderer.invoke("chat:generateTitle", chatId, firstUserMessage),
    transcribeAudio: (audioBytes: Uint8Array, mimeType?: string) => ipcRenderer.invoke("chat:transcribeAudio", audioBytes, mimeType),
    send: (
      chatId: string,
      content: string,
      model: string,
      options?: {
        attachments?: Array<{ name: string; type: "text" | "image"; content: string; mimeType?: string }>;
        compareModel?: string;
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
    }
  },
  attachments: {
    pick: () => ipcRenderer.invoke("attachments:pick")
  },
  templates: {
    list: () => ipcRenderer.invoke("templates:list"),
    save: (name: string, content: string) => ipcRenderer.invoke("templates:save", name, content),
    delete: (name: string) => ipcRenderer.invoke("templates:delete", name)
  },
  ollama: {
    listModels: (baseUrl?: string) => ipcRenderer.invoke("ollama:listModels", baseUrl)
  },
  mcp: {
    list: () => ipcRenderer.invoke("mcp:list"),
    add: (server: { name: string; command: string; args: string[] }) => ipcRenderer.invoke("mcp:add", server),
    remove: (name: string) => ipcRenderer.invoke("mcp:remove", name),
    start: (name: string) => ipcRenderer.invoke("mcp:start", name),
    stop: (name: string) => ipcRenderer.invoke("mcp:stop", name),
    status: () => ipcRenderer.invoke("mcp:status")
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (partial: unknown) => ipcRenderer.invoke("settings:save", partial)
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
    }
  }
};

contextBridge.exposeInMainWorld("api", api);
