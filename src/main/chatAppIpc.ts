import { ipcMain, BrowserWindow, dialog, clipboard, WebContents } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { normalizeAttachments } from "./attachmentSupport";
import { exportChatFile, importChatFile } from "./chatFileSupport";
import { buildChatStats, formatConversationHistory, normalizeGeneratedTitle } from "./chatSupport";
import { buildChatHistory, createAssistantMessages, createOutgoingUserMessage } from "./chatSendSupport";
import { streamAssistantResponses } from "./chatRuntimeSupport";
import {
  openExternalTarget,
  openManagedPreviewTarget,
  openPreviewWindowTarget,
  openWorkspaceTargetPath,
  workspaceTargetExists
} from "./previewSupport";
import { sendUtilityPrompt } from "./utilityPromptSupport";
import type { ChatsStore } from "./services/chatsStore";
import type { SettingsStore } from "./services/settingsStore";
import type { CcrService } from "./services/ccrService";
import type { AgentTaskRunner } from "./services/agentTaskRunner";
import type { AttachmentPayload, Message } from "../shared/types";

interface ChatSendOptions {
  attachments?: AttachmentPayload[];
  compareModel?: string;
  enabledTools?: string[];
}

interface Deps {
  settingsStore: SettingsStore;
  chatsStore: ChatsStore;
  ccrService: CcrService;
  agentTaskRunner: AgentTaskRunner;
  activeControllers: Map<string, AbortController>;
  createWindow: (initialChatId?: string, startDraftChat?: boolean) => Promise<BrowserWindow>;
  getWindowForSender: (sender: WebContents) => BrowserWindow | null;
  getPrimaryWindow: () => BrowserWindow | null;
  broadcastToWindows: (channel: string, ...args: unknown[]) => void;
  transcribeAudio: (settingsStore: SettingsStore, bytes: Uint8Array, mimeType?: string) => Promise<string>;
  normalizeAudioBytes: (raw: unknown) => Uint8Array;
}

export function registerChatAppIpcHandlers(deps: Deps): void {
  const {
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
  } = deps;

  const resolveDialogWindow = (sender: WebContents): BrowserWindow => {
    return getWindowForSender(sender) ?? getPrimaryWindow() ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!;
  };

  const emitChatStoreChanged = (payload: { chatId?: string; reason: string }): void => {
    broadcastToWindows("chat:storeChanged", payload);
  };

  ipcMain.removeHandler("app:workspacePath");
  ipcMain.handle("app:workspacePath", () => agentTaskRunner.getWorkspaceRoot());

  ipcMain.removeHandler("app:newWindow");
  ipcMain.handle("app:newWindow", async () => {
    await createWindow(undefined, true);
    return { ok: true, message: "Opened a new Cipher Workspace window with a fresh draft chat." };
  });

  ipcMain.removeHandler("chat:list");
  ipcMain.handle("chat:list", () => chatsStore.list());

  ipcMain.removeHandler("chat:get");
  ipcMain.handle("chat:get", (_e, id: string) => {
    const chat = chatsStore.get(id);
    return chat ?? null;
  });

  ipcMain.removeHandler("chat:create");
  ipcMain.handle("chat:create", async () => {
    const chat = await chatsStore.create();
    emitChatStoreChanged({ chatId: chat.id, reason: "create" });
    return chat;
  });

  ipcMain.removeHandler("chat:delete");
  ipcMain.handle("chat:delete", async (_e, id: string) => {
    const deleted = await chatsStore.delete(id);
    if (deleted) emitChatStoreChanged({ chatId: id, reason: "delete" });
    return deleted;
  });

  ipcMain.removeHandler("chat:rename");
  ipcMain.handle("chat:rename", async (_e, id: string, title: string) => {
    const renamed = await chatsStore.rename(id, title);
    if (renamed) emitChatStoreChanged({ chatId: id, reason: "rename" });
    return renamed;
  });

  ipcMain.removeHandler("chat:export");
  ipcMain.handle("chat:export", async (event, id: string) => {
    return exportChatFile(
      resolveDialogWindow(event.sender),
      chatsStore.get(id),
      (window, options) => dialog.showSaveDialog(window, options),
      (filePath, content) => writeFile(filePath, content, "utf8")
    );
  });

  ipcMain.removeHandler("chat:import");
  ipcMain.handle("chat:import", async (event) => {
    const result = await importChatFile(
      resolveDialogWindow(event.sender),
      (window, options) => dialog.showOpenDialog(window, options),
      (filePath) => readFile(filePath, "utf8"),
      (input) => chatsStore.importChat(input)
    );
    if (result.ok && result.chat?.id) emitChatStoreChanged({ chatId: result.chat.id, reason: "import" });
    return result;
  });

  ipcMain.removeHandler("chat:appendMessage");
  ipcMain.handle("chat:appendMessage", async (_e, chatId: string, message: Message) => {
    await chatsStore.appendMessage(chatId, message);
    return true;
  });

  ipcMain.removeHandler("chat:updateMessage");
  ipcMain.handle("chat:updateMessage", async (_e, chatId: string, messageId: string, patch: Partial<Message>) => {
    await chatsStore.updateMessage(chatId, messageId, patch);
    return true;
  });

  ipcMain.removeHandler("chat:setSystemPrompt");
  ipcMain.handle("chat:setSystemPrompt", async (_e, id: string, systemPrompt: string) => {
    const updated = await chatsStore.setSystemPrompt(id, (systemPrompt ?? "").trim());
    if (updated) emitChatStoreChanged({ chatId: id, reason: "system-prompt" });
    return updated;
  });

  ipcMain.removeHandler("chat:transcribeAudio");
  ipcMain.handle("chat:transcribeAudio", async (_e, rawAudioBytes: unknown, mimeType?: string) => {
    const bytes = normalizeAudioBytes(rawAudioBytes);
    if (bytes.length === 0) throw new Error("Audio payload is empty.");
    console.log(`[voice] transcribe request bytes=${bytes.length} mime=${mimeType ?? "audio/webm"}`);
    try {
      const text = await transcribeAudio(settingsStore, bytes, mimeType);
      console.log(`[voice] transcribe success chars=${text.length}`);
      return text;
    } catch (err) {
      console.error("[voice] transcribe failed:", err instanceof Error ? err.message : err);
      throw err;
    }
  });

  ipcMain.removeHandler("chat:summarize");
  ipcMain.handle("chat:summarize", async (_e, messages: Array<{ role: string; content: string }>) => {
    const normalizedMessages = Array.isArray(messages)
      ? messages
        .map((message) => ({
          role: (message?.role ?? "").trim() || "user",
          content: (message?.content ?? "").trim()
        }))
        .filter((message) => Boolean(message.content))
      : [];

    if (normalizedMessages.length === 0) {
      throw new Error("No messages to summarize.");
    }

    const prompt = `Summarize this conversation concisely in bullet points:\n\n${formatConversationHistory(normalizedMessages)}`;
    return sendUtilityPrompt(settingsStore.get(), (history, model, onChunk, signal, options) => {
      return ccrService.sendMessageAdvanced(history, model, onChunk, signal, options);
    }, prompt);
  });

  ipcMain.removeHandler("chat:generateTitle");
  ipcMain.handle("chat:generateTitle", async (_e, chatId: string, firstUserMessage: string) => {
    const normalizedChatId = (chatId ?? "").trim();
    const normalizedFirstUserMessage = (firstUserMessage ?? "").trim();

    if (!normalizedChatId) throw new Error("Chat ID is required.");
    if (!normalizedFirstUserMessage) throw new Error("First user message is required.");

    const prompt = `Generate a concise 4-6 word title for this conversation. Reply with only the title, no quotes, no punctuation:\n\n${normalizedFirstUserMessage}`;
    const generated = await sendUtilityPrompt(settingsStore.get(), (history, model, onChunk, signal, options) => {
      return ccrService.sendMessageAdvanced(history, model, onChunk, signal, options);
    }, prompt);
    const title = normalizeGeneratedTitle(generated);
    await chatsStore.rename(normalizedChatId, title);
    return title;
  });

  ipcMain.removeHandler("chat:send");
  ipcMain.handle("chat:send", async (_e, chatId: string, content: string, model: string, options?: ChatSendOptions) => {
    if (activeControllers.has(chatId)) throw new Error("Already generating.");

    const messageText = (content ?? "").trim();
    if (!messageText) throw new Error("Message is empty.");

    const normalizedAttachments = normalizeAttachments(options?.attachments);
    const attachmentNames = normalizedAttachments.map((attachment) => attachment.name);
    const enabledTools = (options?.enabledTools ?? []).map((tool) => tool.trim()).filter(Boolean);

    const userMsg = createOutgoingUserMessage(messageText, attachmentNames);
    await chatsStore.appendMessage(chatId, userMsg);
    broadcastToWindows("chat:message", chatId, userMsg);

    const compareModel = (options?.compareModel ?? "").trim();
    const modelsToRun = [model, ...(compareModel ? [compareModel] : [])];
    const assistantMessages = createAssistantMessages(modelsToRun);
    for (const assistantMessage of assistantMessages) {
      await chatsStore.appendMessage(chatId, assistantMessage);
      broadcastToWindows("chat:message", chatId, assistantMessage);
    }
    emitChatStoreChanged({ chatId, reason: "send-start" });

    const controller = new AbortController();
    activeControllers.set(chatId, controller);

    const chat = chatsStore.get(chatId);
    const assistantIds = new Set(assistantMessages.map((message) => message.id));
    const history = buildChatHistory(chat, userMsg, normalizedAttachments, enabledTools, assistantIds);

    try {
      await streamAssistantResponses({
        assistantMessages,
        history,
        chatId,
        fallbackModel: model,
        signal: controller.signal,
        getSettings: () => settingsStore.get(),
        sendMessage: (messageHistory, selectedModel, onChunk, signal, routeOptions) => {
          return ccrService.sendMessageAdvanced(messageHistory, selectedModel, onChunk, signal, routeOptions);
        },
        updateMessage: (targetChatId, messageId, patch) => chatsStore.updateMessage(targetChatId, messageId, patch),
        emit: (channel, targetChatId, messageId, payload) => {
          if (channel === "chat:done") {
            broadcastToWindows(channel, targetChatId, messageId);
            emitChatStoreChanged({ chatId: targetChatId, reason: "send-done" });
            return;
          }
          if (channel === "chat:error") {
            emitChatStoreChanged({ chatId: targetChatId, reason: "send-error" });
          }
          broadcastToWindows(channel, targetChatId, messageId, payload);
        }
      });
    } finally {
      activeControllers.delete(chatId);
    }
  });

  ipcMain.removeHandler("chat:stop");
  ipcMain.handle("chat:stop", (_e, chatId: string) => {
    const controller = activeControllers.get(chatId);
    if (!controller) return false;
    controller.abort();
    activeControllers.delete(chatId);
    return true;
  });

  ipcMain.removeHandler("stats:get");
  ipcMain.handle("stats:get", () => buildChatStats(chatsStore.getAll()));

  ipcMain.removeHandler("app:openExternal");
  ipcMain.handle("app:openExternal", async (_e, targetUrl?: string) => openExternalTarget(targetUrl));

  ipcMain.removeHandler("app:openPreview");
  ipcMain.handle("app:openPreview", async (_e, targetPath?: string, _preferredUrl?: string) => {
    return openManagedPreviewTarget(agentTaskRunner, targetPath);
  });

  ipcMain.removeHandler("app:openPreviewWindow");
  ipcMain.handle("app:openPreviewWindow", async (_e, targetUrl?: string, title?: string) => {
    return openPreviewWindowTarget(targetUrl, title);
  });

  ipcMain.removeHandler("clipboard:writeText");
  ipcMain.handle("clipboard:writeText", (_e, text: string) => {
    clipboard.writeText((text ?? "").toString());
    return true;
  });

  ipcMain.removeHandler("workspace:pathExists");
  ipcMain.handle("workspace:pathExists", async (_e, targetPath?: string) => {
    return workspaceTargetExists(agentTaskRunner, targetPath);
  });

  ipcMain.removeHandler("workspace:openPath");
  ipcMain.handle("workspace:openPath", async (_e, targetPath?: string) => {
    return openWorkspaceTargetPath(agentTaskRunner, targetPath);
  });
}
