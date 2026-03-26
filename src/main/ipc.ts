import { ipcMain, BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import type { ChatsStore } from "./services/chatsStore";
import type { SettingsStore } from "./services/settingsStore";
import type { CcrService } from "./services/ccrService";
import type { AttachmentPayload, McpServerConfig, Message } from "../shared/types";

interface Deps {
  mainWindow: BrowserWindow;
  settingsStore: SettingsStore;
  chatsStore: ChatsStore;
  ccrService: CcrService;
}

interface ChatSendOptions {
  attachments?: AttachmentPayload[];
  compareModel?: string;
  enabledTools?: string[];
}

interface McpRuntime {
  process: ChildProcess;
  logs: string[];
  tools: string[];
}

const activeControllers = new Map<string, AbortController>();
const mcpProcesses = new Map<string, McpRuntime>();

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".js", ".ts", ".py", ".json", ".html", ".css", ".cpp", ".c", ".rs", ".go"]);
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
const MAX_FOLDER_ATTACHMENTS = 500;
const MAX_FOLDER_BUNDLE_FILES = 220;
const MAX_FOLDER_BUNDLE_CHARS = 900_000;
const MAX_FOLDER_FILE_CHARS = 60_000;
const MAX_FOLDER_FILE_BYTES = 250_000;
const MAX_FOLDER_SCAN_ENTRIES = 5000;
const SKIPPED_FOLDER_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode"
]);

function formatChatMarkdown(title: string, messages: Message[]): string {
  const lines: string[] = [`# ${title.trim() || "Chat Export"}`, ""];
  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System";
    lines.push(`**${roleLabel}:** ${msg.content}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function normalizeAttachments(raw: AttachmentPayload[] | undefined): AttachmentPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): AttachmentPayload => ({
      name: (item?.name ?? "").trim(),
      type: item?.type === "image" ? "image" : "text",
      content: item?.content ?? "",
      mimeType: item?.mimeType
    }))
    .filter((item) => item.name && item.content);
}

interface FolderTextFile {
  absPath: string;
  relPath: string;
}

function formatPromptPath(input: string): string {
  return input.replace(/\\/g, "/");
}

async function collectFolderTextFiles(rootDir: string): Promise<{
  files: FolderTextFile[];
  skippedEntries: number;
  skippedDirs: number;
  truncatedScan: boolean;
}> {
  const files: FolderTextFile[] = [];
  let skippedEntries = 0;
  let skippedDirs = 0;
  let scannedEntries = 0;
  let truncatedScan = false;
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await readdir(currentDir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    } catch {
      skippedDirs += 1;
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      scannedEntries += 1;
      if (scannedEntries > MAX_FOLDER_SCAN_ENTRIES) {
        truncatedScan = true;
        break;
      }

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (SKIPPED_FOLDER_NAMES.has(lower) || entry.name.startsWith(".")) {
          skippedDirs += 1;
          continue;
        }
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        skippedEntries += 1;
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) {
        skippedEntries += 1;
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        skippedEntries += 1;
        continue;
      }

      if (fileStat.size > MAX_FOLDER_FILE_BYTES) {
        skippedEntries += 1;
        continue;
      }

      const relPath = formatPromptPath(relative(rootDir, fullPath));
      files.push({ absPath: fullPath, relPath });
      if (files.length >= MAX_FOLDER_BUNDLE_FILES) {
        truncatedScan = true;
        break;
      }
    }

    if (truncatedScan) break;
  }

  return { files, skippedEntries, skippedDirs, truncatedScan };
}

async function buildFolderBundleAttachment(folderPath: string): Promise<AttachmentPayload> {
  const folderName = basename(folderPath) || "folder";
  const archiveName = `${folderName}.zip`;
  const collected = await collectFolderTextFiles(folderPath);
  const sections: string[] = [];
  let usedChars = 0;
  let includedFiles = 0;
  let truncatedFiles = 0;

  for (const file of collected.files) {
    let raw = "";
    try {
      raw = await readFile(file.absPath, "utf8");
    } catch {
      continue;
    }

    if (raw.length > MAX_FOLDER_FILE_CHARS) {
      raw = raw.slice(0, MAX_FOLDER_FILE_CHARS);
      truncatedFiles += 1;
    }

    const section = `\n\n--- FILE: ${file.relPath} ---\n${raw}`;
    if (usedChars + section.length > MAX_FOLDER_BUNDLE_CHARS) break;
    sections.push(section);
    usedChars += section.length;
    includedFiles += 1;
  }

  const truncatedByContent = includedFiles < collected.files.length;
  const header = [
    `[Folder Archive: ${archiveName}]`,
    `Source Folder: ${folderName}`,
    `Included Text Files: ${includedFiles}`,
    `Files Truncated (per-file limit): ${truncatedFiles}`,
    `Skipped Entries: ${collected.skippedEntries}`,
    `Skipped Directories: ${collected.skippedDirs}`,
    `Archive Truncated: ${collected.truncatedScan || truncatedByContent ? "yes" : "no"}`,
    "",
    "Bundled File Contents:"
  ].join("\n");

  return {
    name: archiveName,
    type: "text",
    content: header + sections.join("")
  };
}

async function buildMultiSelectionBundleAttachment(selectedPaths: string[]): Promise<AttachmentPayload> {
  const archiveName = "selection.zip";
  const sections: string[] = [];
  const imageEntries: string[] = [];
  let usedChars = 0;
  let includedTextEntries = 0;
  let truncatedEntries = 0;

  for (const selectedPath of selectedPaths) {
    let collected: AttachmentPayload[] = [];
    try {
      collected = await collectAttachmentPayloads(selectedPath);
    } catch {
      continue;
    }

    for (const attachment of collected) {
      if (attachment.type === "image") {
        imageEntries.push(attachment.name);
        continue;
      }

      let sectionBody = attachment.content;
      if (sectionBody.length > MAX_FOLDER_FILE_CHARS) {
        sectionBody = sectionBody.slice(0, MAX_FOLDER_FILE_CHARS);
        truncatedEntries += 1;
      }

      const section = `\n\n--- ITEM: ${formatPromptPath(attachment.name)} ---\n${sectionBody}`;
      if (usedChars + section.length > MAX_FOLDER_BUNDLE_CHARS) {
        truncatedEntries += 1;
        continue;
      }
      sections.push(section);
      usedChars += section.length;
      includedTextEntries += 1;
    }
  }

  const header = [
    `[Selection Archive: ${archiveName}]`,
    `Selected Items: ${selectedPaths.length}`,
    `Included Text Entries: ${includedTextEntries}`,
    `Image Entries Listed: ${imageEntries.length}`,
    `Entries Truncated/Skipped by limits: ${truncatedEntries}`,
    "",
    imageEntries.length > 0 ? `Images: ${imageEntries.join(", ")}` : "Images: none",
    "",
    "Bundled File Contents:"
  ].join("\n");

  return {
    name: archiveName,
    type: "text",
    content: header + sections.join("")
  };
}

async function collectAttachmentPayloads(targetPath: string, rootDir?: string): Promise<AttachmentPayload[]> {
  const info = await stat(targetPath);

  if (info.isDirectory()) {
    const folderRoot = rootDir ?? targetPath;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await readdir(targetPath, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    } catch {
      return [];
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    const payloads: AttachmentPayload[] = [];
    for (const entry of entries) {
      const childPath = join(targetPath, entry.name);
      try {
        const collected = await collectAttachmentPayloads(childPath, folderRoot);
        payloads.push(...collected);
      } catch {
        // Skip unreadable child entries.
      }
      if (payloads.length >= MAX_FOLDER_ATTACHMENTS) break;
    }

    return payloads.slice(0, MAX_FOLDER_ATTACHMENTS);
  }

  if (!info.isFile()) return [];
  if (info.size > MAX_FOLDER_FILE_BYTES) return [];

  const relName = rootDir ? formatPromptPath(relative(rootDir, targetPath)) : basename(targetPath);
  const name = relName || basename(targetPath);
  const extension = extname(targetPath).toLowerCase();
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension];
  if (!imageMime) {
    const content = await readFile(targetPath, "utf8");
    return [{ name, type: "text", content }];
  }

  const buffer = await readFile(targetPath);
  const base64 = buffer.toString("base64");
  return [{
    name,
    type: "image",
    mimeType: imageMime,
    content: `data:${imageMime};base64,${base64}`
  }];
}

async function pickAttachmentPaths(mainWindow: BrowserWindow): Promise<string[]> {
  const filters = [
    { name: "All Files", extensions: ["*"] },
    { name: "Text Files", extensions: ["txt", "md", "js", "ts", "py", "json", "html", "css", "cpp", "c", "rs", "go"] },
    { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }
  ];

  if (process.platform === "win32" || process.platform === "linux") {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Files", "Folder", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: "Attach files or a folder?",
      detail: "On this platform, file and folder pickers are separate."
    });

    if (choice.response === 2) return [];

    if (choice.response === 1) {
      const folderPick = await dialog.showOpenDialog(mainWindow, {
        title: "Attach folder",
        properties: ["openDirectory", "multiSelections"]
      });
      if (folderPick.canceled || folderPick.filePaths.length === 0) return [];
      return folderPick.filePaths;
    }

    const filePick = await dialog.showOpenDialog(mainWindow, {
      title: "Attach files",
      properties: ["openFile", "multiSelections"],
      filters
    });
    if (filePick.canceled || filePick.filePaths.length === 0) return [];
    return filePick.filePaths;
  }

  const open = await dialog.showOpenDialog(mainWindow, {
    title: "Attach files",
    properties: ["openFile", "openDirectory", "multiSelections"],
    filters
  });
  if (open.canceled || open.filePaths.length === 0) return [];
  return open.filePaths;
}

function appendMcpLog(runtime: McpRuntime, line: string): void {
  runtime.logs.push(line);
  if (runtime.logs.length > 200) runtime.logs.shift();
}

function collectMcpTools(): string[] {
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const runtime of mcpProcesses.values()) {
    for (const tool of runtime.tools) {
      if (seen.has(tool)) continue;
      seen.add(tool);
      tools.push(tool);
    }
  }
  return tools;
}

function buildMcpStatus(settingsStore: SettingsStore) {
  const servers = settingsStore.listMcpServers().map((server) => {
    const key = server.name.toLowerCase();
    const runtime = mcpProcesses.get(key);
    return {
      ...server,
      running: Boolean(runtime),
      pid: runtime?.process.pid,
      tools: runtime?.tools ?? [],
      logs: runtime?.logs ?? []
    };
  });

  return { servers, tools: collectMcpTools() };
}

async function stopMcpRuntime(serverName: string): Promise<void> {
  const key = serverName.toLowerCase();
  const runtime = mcpProcesses.get(key);
  if (!runtime) return;

  const proc = runtime.process;
  const pid = proc.pid;

  if (!pid) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // noop
    }
    mcpProcesses.delete(key);
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    mcpProcesses.delete(key);
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {
      // noop
    }
  }
  mcpProcesses.delete(key);
}

function pickOpenRouterModel(settingsStore: SettingsStore): string {
  const settings = settingsStore.get();
  const candidates = [settings.defaultModel, ...settings.models]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .filter((value) => !value.startsWith("ollama/"));

  if (candidates.length === 0) {
    throw new Error("No OpenRouter model configured.");
  }
  return candidates[0];
}

function formatConversationHistory(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

function normalizeGeneratedTitle(raw: string): string {
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const stripped = firstLine
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,!?;:]+/g, "")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join(" ").trim() || "New Chat";
}

function normalizeAudioBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) {
    const ints = raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(255, Math.round(value))));
    return Uint8Array.from(ints);
  }
  throw new Error("Invalid audio payload.");
}

function getAudioExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  return "webm";
}

async function transcribeAudio(settingsStore: SettingsStore, bytes: Uint8Array, mimeType?: string): Promise<string> {
  const settings = settingsStore.get();
  const apiKey = (settings.apiKey ?? "").trim();
  if (!apiKey) throw new Error("No API key set. Add your OpenRouter key in Settings.");

  const baseUrl = (settings.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("No OpenRouter base URL configured.");

  const type = (mimeType ?? "audio/webm").trim() || "audio/webm";
  const ext = getAudioExtension(type);
  const blob = new Blob([Buffer.from(bytes)], { type });

  const form = new FormData();
  form.append("model", "openai/whisper-1");
  form.append("file", blob, `voice.${ext}`);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://cipher-ai.local",
      "X-Title": "Cipher Ai"
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new Error("Invalid API key for transcription.");
    if (response.status === 402) throw new Error("Insufficient OpenRouter credits for transcription.");
    if (response.status === 429) throw new Error("Transcription rate limit hit. Try again.");
    throw new Error(`Transcription API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json() as { text?: string };
  const text = (payload.text ?? "").trim();
  if (!text) throw new Error("Transcription returned empty text.");
  return text;
}

async function sendOpenRouterPrompt(settingsStore: SettingsStore, prompt: string, maxTokens: number): Promise<string> {
  const settings = settingsStore.get();
  const apiKey = (settings.apiKey ?? "").trim();
  if (!apiKey) throw new Error("No API key set. Go to Settings and add your OpenRouter key.");

  const baseUrl = (settings.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("No OpenRouter base URL configured.");

  const model = pickOpenRouterModel(settingsStore);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://cipher-ai.local",
      "X-Title": "Cipher Ai"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new Error("Invalid API key. Check your OpenRouter key in Settings.");
    if (response.status === 402) throw new Error("Insufficient OpenRouter credits/budget for this request.");
    if (response.status === 429) throw new Error("Rate limit hit. Try again shortly.");
    throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Received empty response from OpenRouter.");
  }
  return content.trim();
}

export function registerIpcHandlers(deps: Deps): void {
  const { mainWindow, settingsStore, chatsStore, ccrService } = deps;

  ccrService.setLogHandler((line) => {
    mainWindow.webContents.send("router:log", line);
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
    return chatsStore.create();
  });

  ipcMain.removeHandler("chat:delete");
  ipcMain.handle("chat:delete", async (_e, id: string) => {
    return chatsStore.delete(id);
  });

  ipcMain.removeHandler("chat:rename");
  ipcMain.handle("chat:rename", async (_e, id: string, title: string) => {
    return chatsStore.rename(id, title);
  });

  ipcMain.removeHandler("chat:export");
  ipcMain.handle("chat:export", async (_e, id: string) => {
    const chat = chatsStore.get(id);
    if (!chat) return { ok: false, message: "Chat not found." };

    const safeName = (chat.title || "chat-export").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "chat-export";
    const save = await dialog.showSaveDialog(mainWindow, {
      title: "Export Chat",
      defaultPath: `${safeName}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (save.canceled || !save.filePath) return { ok: false, message: "Export canceled." };

    const markdown = formatChatMarkdown(chat.title, chat.messages.filter((m) => m.role !== "system"));
    await writeFile(save.filePath, markdown, "utf8");
    return { ok: true, message: `Exported to ${save.filePath}` };
  });

  ipcMain.removeHandler("chat:setSystemPrompt");
  ipcMain.handle("chat:setSystemPrompt", async (_e, id: string, systemPrompt: string) => {
    const normalized = (systemPrompt ?? "").trim();
    return chatsStore.setSystemPrompt(id, normalized);
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
    return sendOpenRouterPrompt(settingsStore, prompt, 320);
  });

  ipcMain.removeHandler("chat:generateTitle");
  ipcMain.handle("chat:generateTitle", async (_e, chatId: string, firstUserMessage: string) => {
    const normalizedChatId = (chatId ?? "").trim();
    const normalizedFirstUserMessage = (firstUserMessage ?? "").trim();

    if (!normalizedChatId) throw new Error("Chat ID is required.");
    if (!normalizedFirstUserMessage) throw new Error("First user message is required.");

    const prompt = `Generate a concise 4-6 word title for this conversation. Reply with only the title, no quotes, no punctuation:\n\n${normalizedFirstUserMessage}`;
    const generated = await sendOpenRouterPrompt(settingsStore, prompt, 32);
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

    const userMsg: Message = {
      id: `msg_${randomUUID()}`,
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
      metadata: attachmentNames.length > 0 ? { attachmentNames } : undefined
    };
    await chatsStore.appendMessage(chatId, userMsg);
    mainWindow.webContents.send("chat:message", chatId, userMsg);

    const compareModel = (options?.compareModel ?? "").trim();
    const modelsToRun = [model, ...(compareModel ? [compareModel] : [])];
    const compareGroup = modelsToRun.length > 1 ? `cmp_${randomUUID()}` : undefined;

    const assistantMsgs: Message[] = [];
    for (let i = 0; i < modelsToRun.length; i += 1) {
      const assistantMsg: Message = {
        id: `msg_${randomUUID()}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        model: modelsToRun[i],
        metadata: compareGroup
          ? {
            compareGroup,
            compareSlot: i === 0 ? "A" : "B"
          }
          : undefined
      };
      assistantMsgs.push(assistantMsg);
      await chatsStore.appendMessage(chatId, assistantMsg);
      mainWindow.webContents.send("chat:message", chatId, assistantMsg);
    }

    const controller = new AbortController();
    activeControllers.set(chatId, controller);

    const chat = chatsStore.get(chatId);
    const systemPrompt = (chat?.systemPrompt ?? "").trim();
    const assistantIds = new Set(assistantMsgs.map((message) => message.id));
    const textAttachmentMessages = normalizedAttachments
      .filter((attachment) => attachment.type === "text")
      .map((attachment) => ({
        role: "system",
        content: `File: ${attachment.name}\n\n${attachment.content}`
      }));
    const imageParts = normalizedAttachments
      .filter((attachment) => attachment.type === "image")
      .map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.content }
      }));
    const toolMessage = enabledTools.length > 0
      ? {
        role: "system" as const,
        content: `You have access to the following tools: ${enabledTools.join(", ")}`
      }
      : null;

    const history: Array<{
      role: string;
      content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    }> = [];

    if (systemPrompt) history.push({ role: "system", content: systemPrompt });
    if (toolMessage) history.push(toolMessage);

    for (const message of chat?.messages ?? []) {
      if (message.role === "system") continue;
      if (assistantIds.has(message.id)) continue;

      if (message.id === userMsg.id) {
        history.push(...textAttachmentMessages);
        if (imageParts.length > 0) {
          history.push({
            role: "user",
            content: [...imageParts, { type: "text", text: message.content }]
          });
        } else {
          history.push({ role: message.role, content: message.content });
        }
        continue;
      }

      history.push({ role: message.role, content: message.content });
    }

    try {
      await Promise.all(assistantMsgs.map(async (assistantMsg) => {
        const selectedModel = assistantMsg.model ?? model;
        const appSettings = settingsStore.get();
        const useOllama = appSettings.ollamaEnabled && selectedModel.startsWith("ollama/");
        const targetModel = useOllama ? selectedModel.slice("ollama/".length) : selectedModel;

        try {
          await ccrService.sendMessageAdvanced(
            history,
            targetModel,
            async (chunk) => {
              assistantMsg.content += chunk;
              mainWindow.webContents.send("chat:chunk", chatId, assistantMsg.id, chunk);
              await chatsStore.updateMessage(chatId, assistantMsg.id, { content: assistantMsg.content });
            },
            controller.signal,
            {
              baseUrl: useOllama ? appSettings.ollamaBaseUrl : appSettings.baseUrl,
              apiKey: useOllama ? "" : appSettings.apiKey,
              skipAuth: useOllama
            }
          );
          mainWindow.webContents.send("chat:done", chatId, assistantMsg.id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          assistantMsg.error = errMsg;
          await chatsStore.updateMessage(chatId, assistantMsg.id, {
            error: errMsg,
            content: assistantMsg.content || errMsg
          });
          mainWindow.webContents.send("chat:error", chatId, assistantMsg.id, errMsg);
        }
      }));
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
  ipcMain.handle("stats:get", () => {
    const chats = chatsStore.getAll();
    const totalChats = chats.length;

    let totalMessages = 0;
    let totalCharacters = 0;
    const modelCounts = new Map<string, number>();

    for (const chat of chats) {
      for (const message of chat.messages) {
        totalMessages += 1;
        totalCharacters += (message.content ?? "").length;
        const model = (message.model ?? "").trim();
        if (!model) continue;
        modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
      }
    }

    let mostUsedModel = "N/A";
    let mostUsedModelCount = 0;
    for (const [model, count] of modelCounts.entries()) {
      if (count > mostUsedModelCount) {
        mostUsedModel = model;
        mostUsedModelCount = count;
      }
    }

    return {
      totalChats,
      totalMessages,
      totalEstimatedTokens: Number((totalCharacters / 4).toFixed(2)),
      mostUsedModel,
      mostUsedModelCount,
      averageMessagesPerChat: totalChats > 0 ? Number((totalMessages / totalChats).toFixed(2)) : 0
    };
  });

  ipcMain.removeHandler("settings:get");
  ipcMain.handle("settings:get", () => settingsStore.get());

  ipcMain.removeHandler("settings:save");
  ipcMain.handle("settings:save", async (_e, partial: Record<string, unknown>) => {
    await settingsStore.save(partial as Parameters<typeof settingsStore.save>[0]);
    return settingsStore.get();
  });

  ipcMain.removeHandler("attachments:pick");
  ipcMain.handle("attachments:pick", async () => {
    const selectedPaths = await pickAttachmentPaths(mainWindow);
    if (selectedPaths.length === 0) {
      return [] as AttachmentPayload[];
    }

    const payloads: AttachmentPayload[] = [];
    for (const selectedPath of selectedPaths) {
      try {
        const collected = await collectAttachmentPayloads(selectedPath);
        payloads.push(...collected);
      } catch {
        // Skip unreadable selections.
      }
      if (payloads.length >= MAX_FOLDER_ATTACHMENTS) break;
    }

    return payloads.slice(0, MAX_FOLDER_ATTACHMENTS);
  });

  ipcMain.removeHandler("templates:list");
  ipcMain.handle("templates:list", () => settingsStore.listTemplates());

  ipcMain.removeHandler("templates:save");
  ipcMain.handle("templates:save", async (_e, name: string, content: string) => {
    return settingsStore.saveTemplate({ name, content });
  });

  ipcMain.removeHandler("templates:delete");
  ipcMain.handle("templates:delete", async (_e, name: string) => {
    return settingsStore.deleteTemplate(name);
  });

  ipcMain.removeHandler("ollama:listModels");
  ipcMain.handle("ollama:listModels", async (_e, baseUrl?: string) => {
    const sourceUrl = (baseUrl ?? settingsStore.get().ollamaBaseUrl).trim() || "http://localhost:11434/v1";
    const models = await ccrService.listOllamaModels(sourceUrl);
    await settingsStore.save({ ollamaModels: models });
    return models;
  });

  ipcMain.removeHandler("mcp:list");
  ipcMain.handle("mcp:list", () => settingsStore.listMcpServers());

  ipcMain.removeHandler("mcp:add");
  ipcMain.handle("mcp:add", async (_e, server: McpServerConfig) => {
    return settingsStore.addMcpServer(server);
  });

  ipcMain.removeHandler("mcp:remove");
  ipcMain.handle("mcp:remove", async (_e, name: string) => {
    await stopMcpRuntime(name);
    return settingsStore.removeMcpServer(name);
  });

  ipcMain.removeHandler("mcp:start");
  ipcMain.handle("mcp:start", async (_e, name: string) => {
    const serverName = (name ?? "").trim();
    if (!serverName) return { ok: false, message: "Server name required.", ...buildMcpStatus(settingsStore) };

    const key = serverName.toLowerCase();
    if (mcpProcesses.has(key)) return { ok: false, message: "Server already running.", ...buildMcpStatus(settingsStore) };

    const config = settingsStore.listMcpServers().find((server) => server.name.toLowerCase() === key);
    if (!config) return { ok: false, message: "Server not found.", ...buildMcpStatus(settingsStore) };

    let proc: ChildProcess;
    try {
      proc = spawn(config.command, config.args, {
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `Failed to start ${config.name}: ${message}`, ...buildMcpStatus(settingsStore) };
    }

    const toolName = `${config.name}.tool`;
    const runtime: McpRuntime = {
      process: proc,
      logs: [],
      tools: [toolName]
    };
    appendMcpLog(runtime, `[MCP] Starting ${config.name} ...`);
    mcpProcesses.set(key, runtime);

    const collect = (prefix: string, chunk: Buffer) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => appendMcpLog(runtime, `[${prefix}] ${line}`));
    };

    proc.stdout?.on("data", (chunk: Buffer) => collect("out", chunk));
    proc.stderr?.on("data", (chunk: Buffer) => collect("err", chunk));
    proc.once("error", (err) => {
      appendMcpLog(runtime, `[MCP] Error: ${err.message}`);
    });
    proc.once("exit", (code) => {
      appendMcpLog(runtime, `[MCP] Exited${typeof code === "number" ? ` with code ${code}` : ""}`);
      mcpProcesses.delete(key);
    });

    return { ok: true, message: `${config.name} started.`, ...buildMcpStatus(settingsStore) };
  });

  ipcMain.removeHandler("mcp:stop");
  ipcMain.handle("mcp:stop", async (_e, name: string) => {
    const serverName = (name ?? "").trim();
    if (!serverName) return { ok: false, message: "Server name required.", ...buildMcpStatus(settingsStore) };
    await stopMcpRuntime(serverName);
    return { ok: true, message: `${serverName} stopped.`, ...buildMcpStatus(settingsStore) };
  });

  ipcMain.removeHandler("mcp:status");
  ipcMain.handle("mcp:status", () => buildMcpStatus(settingsStore));

  ipcMain.removeHandler("router:status");
  ipcMain.handle("router:status", () => ccrService.getStatus());

  ipcMain.removeHandler("router:logs");
  ipcMain.handle("router:logs", () => ccrService.getLogs());

  ipcMain.removeHandler("router:start");
  ipcMain.handle("router:start", async () => {
    return ccrService.startRouter();
  });

  ipcMain.removeHandler("router:stop");
  ipcMain.handle("router:stop", () => {
    return ccrService.stopRouter();
  });

  ipcMain.removeHandler("router:test");
  ipcMain.handle("router:test", async () => {
    return ccrService.testConnection();
  });
}
