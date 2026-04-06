import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Chat, ChatSummary, Message } from "../../shared/types";

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export class ChatsStore {
  private filePath: string;
  private userDataPath: string;
  private chats: Chat[] = [];

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    this.filePath = join(userDataPath, "cipher-workspace", "chats.json");
  }

  async init(): Promise<void> {
    try {
      await mkdir(join(this.filePath, ".."), { recursive: true });
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.chats = Array.isArray(parsed.chats) ? parsed.chats : [];
      if (this.chats.length === 0) {
        const legacyChats = await this.loadLegacyChats();
        if (legacyChats.length > 0) {
          this.chats = legacyChats;
          await this.persist();
        }
      }
    } catch {
      this.chats = await this.loadLegacyChats();
      await this.persist();
    }
  }

  list(): ChatSummary[] {
    return this.chats
      .map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Chat | undefined {
    return this.chats.find((c) => c.id === id);
  }

  getAll(): Chat[] {
    return this.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => ({ ...message }))
    }));
  }

  async create(): Promise<Chat> {
    const t = now();
    const chat: Chat = { id: makeId("chat"), title: "New Chat", createdAt: t, updatedAt: t, messages: [], systemPrompt: "" };
    this.chats.unshift(chat);
    await this.persist();
    return { ...chat };
  }

  async delete(id: string): Promise<boolean> {
    const before = this.chats.length;
    this.chats = this.chats.filter((c) => c.id !== id);
    if (this.chats.length !== before) { await this.persist(); return true; }
    return false;
  }

  async rename(id: string, title: string): Promise<boolean> {
    const chat = this.get(id);
    if (!chat) return false;
    chat.title = title.trim() || "New Chat";
    chat.updatedAt = now();
    await this.persist();
    return true;
  }

  async setSystemPrompt(id: string, systemPrompt: string): Promise<boolean> {
    const chat = this.get(id);
    if (!chat) return false;
    chat.systemPrompt = systemPrompt;
    chat.updatedAt = now();
    await this.persist();
    return true;
  }

  async importChat(input: { title: string; messages: Message[]; systemPrompt?: string }): Promise<Chat> {
    const t = now();
    const normalizedMessages = (input.messages ?? [])
      .filter((message) => message && typeof message.content === "string" && typeof message.role === "string")
      .map((message) => ({
        ...message,
        id: message.id?.trim() || makeId("msg"),
        createdAt: message.createdAt || t
      }));

    const chat: Chat = {
      id: makeId("chat"),
      title: input.title.trim() || "Imported Chat",
      createdAt: t,
      updatedAt: t,
      messages: normalizedMessages,
      systemPrompt: input.systemPrompt ?? ""
    };

    this.chats.unshift(chat);
    await this.persist();
    return { ...chat, messages: chat.messages.map((message) => ({ ...message })) };
  }

  async appendMessage(chatId: string, message: Message): Promise<void> {
    const chat = this.get(chatId);
    if (!chat) return;
    const wasEmptyBeforeAppend = chat.messages.length === 0;
    const normalized: Message = {
      ...message,
      metadata: message.metadata
        ? {
          ...message.metadata,
          attachmentNames: message.metadata.attachmentNames?.map((name) => name.trim()).filter(Boolean)
        }
        : undefined
    };
    chat.messages.push(normalized);
    if (chat.title === "New Chat" && wasEmptyBeforeAppend && message.role === "user") {
      const compact = message.content.replace(/\s+/g, " ").trim();
      chat.title = compact.length > 50 ? compact.slice(0, 50) : compact;
    }
    chat.updatedAt = now();
    await this.persist();
  }

  async updateMessage(chatId: string, messageId: string, patch: Partial<Message>): Promise<void> {
    const chat = this.get(chatId);
    if (!chat) return;
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg) return;
    Object.assign(msg, patch);
    chat.updatedAt = now();
    await this.persist();
  }

  makeId(prefix: string): string {
    return makeId(prefix);
  }

  private async persist(): Promise<void> {
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ chats: this.chats }, null, 2), "utf8");
  }

  private getLegacyChatPaths(): string[] {
    const appDataPath = dirname(this.userDataPath);
    const appNames = ["Electron", "cipher-ai", "cipher-chat", "Cipher Chat", "CipherChat", "Cipher Workspace"];
    const paths = new Set<string>();

    for (const appName of appNames) {
      paths.add(join(appDataPath, appName, "cipher-chat", "chats.json"));
      paths.add(join(appDataPath, appName, "chats.json"));
    }

    paths.add(join(this.userDataPath, "chats.json"));
    paths.add(join(dirname(this.userDataPath), "cipher-chat", "chats.json"));

    const current = resolve(this.filePath);
    return [...paths].map((path) => resolve(path)).filter((path) => path !== current);
  }

  private async loadLegacyChats(): Promise<Chat[]> {
    for (const path of this.getLegacyChatPaths()) {
      try {
        await access(path);
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as { chats?: Chat[] };
        if (Array.isArray(parsed?.chats)) {
          return parsed.chats;
        }
      } catch {
        // Ignore unreadable legacy files.
      }
    }

    return [];
  }
}
