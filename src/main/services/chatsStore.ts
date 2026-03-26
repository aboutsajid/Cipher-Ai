import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  private chats: Chat[] = [];
  private userMessageAutoTitleEnabled = false;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "cipher-chat", "chats.json");
  }

  async init(): Promise<void> {
    try {
      await mkdir(join(this.filePath, ".."), { recursive: true });
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.chats = Array.isArray(parsed.chats) ? parsed.chats : [];
    } catch {
      this.chats = [];
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

  async appendMessage(chatId: string, message: Message): Promise<void> {
    const chat = this.get(chatId);
    if (!chat) return;
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
    if (this.userMessageAutoTitleEnabled && chat.title === "New Chat" && message.role === "user") {
      const compact = message.content.replace(/\s+/g, " ").trim();
      chat.title = compact.length > 50 ? compact.slice(0, 47) + "..." : compact;
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
}
