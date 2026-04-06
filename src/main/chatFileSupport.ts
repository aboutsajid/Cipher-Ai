import { basename, extname } from "node:path";
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from "electron";
import type { Chat } from "../shared/types";
import { formatChatMarkdown, normalizeImportedChat, parseImportedMarkdown } from "./chatSupport";

interface DialogSaveResult {
  canceled: boolean;
  filePath?: string;
}

interface DialogOpenResult {
  canceled: boolean;
  filePaths: string[];
}

interface ChatImportResult {
  ok: boolean;
  message: string;
  chat?: Chat;
}

interface ChatExportResult {
  ok: boolean;
  message: string;
}

export async function exportChatFile(
  mainWindow: BrowserWindow,
  chat: Chat | null | undefined,
  showSaveDialog: (window: BrowserWindow, options: SaveDialogOptions) => Promise<DialogSaveResult>,
  writeTextFile: (filePath: string, content: string) => Promise<void>
): Promise<ChatExportResult> {
  if (!chat) return { ok: false, message: "Chat not found." };

  const safeName = (chat.title || "chat-export").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "chat-export";
  const save = await showSaveDialog(mainWindow, {
    title: "Export Chat",
    defaultPath: `${safeName}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (save.canceled || !save.filePath) return { ok: false, message: "Export canceled." };

  const markdown = formatChatMarkdown(chat.title, chat.messages.filter((message) => message.role !== "system"));
  await writeTextFile(save.filePath, markdown);
  return { ok: true, message: `Exported to ${save.filePath}` };
}

export async function importChatFile(
  mainWindow: BrowserWindow,
  showOpenDialog: (window: BrowserWindow, options: OpenDialogOptions) => Promise<DialogOpenResult>,
  readTextFile: (filePath: string) => Promise<string>,
  importChat: (input: { title: string; messages: Chat["messages"]; systemPrompt?: string }) => Promise<Chat>
): Promise<ChatImportResult> {
  const open = await showOpenDialog(mainWindow, {
    title: "Import Chat",
    properties: ["openFile"],
    filters: [
      { name: "Cipher Chat", extensions: ["json", "md", "txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (open.canceled || open.filePaths.length === 0) return { ok: false, message: "Import canceled." };

  const filePath = open.filePaths[0];
  const fallbackTitle = basename(filePath, extname(filePath)) || "Imported Chat";
  const raw = await readTextFile(filePath);
  let imported: { title: string; messages: Chat["messages"]; systemPrompt?: string } | null = null;

  if (filePath.toLowerCase().endsWith(".json")) {
    try {
      imported = normalizeImportedChat(JSON.parse(raw), fallbackTitle);
    } catch {
      imported = null;
    }
  }

  if (!imported) {
    imported = parseImportedMarkdown(raw, fallbackTitle);
  }

  if (!imported || imported.messages.length === 0) {
    return { ok: false, message: "Could not import chat from that file." };
  }

  const chat = await importChat(imported);
  return { ok: true, message: `Imported "${chat.title}".`, chat };
}
