import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Chat, ChatContext, ChatSummary, Message } from "../../shared/types";

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

const CHAT_PROVIDERS = new Set<ChatContext["provider"]>(["openrouter", "nvidia", "ollama", "claude"]);

function normalizeChatContext(context: Chat["context"] | null | undefined): Chat["context"] {
  if (!context || typeof context !== "object") return undefined;

  const provider = typeof context.provider === "string" && CHAT_PROVIDERS.has(context.provider as ChatContext["provider"])
    ? context.provider as ChatContext["provider"]
    : undefined;
  if (!provider) return undefined;

  const selectedModel = typeof context.selectedModel === "string" ? context.selectedModel.trim() : "";
  const compareModel = typeof context.compareModel === "string" ? context.compareModel.trim() : "";
  const compareEnabled = provider !== "claude" && Boolean(context.compareEnabled && compareModel);

  return {
    provider,
    ...(selectedModel ? { selectedModel } : {}),
    ...(compareEnabled ? { compareEnabled: true, compareModel } : {})
  };
}

function cloneChat(chat: Chat): Chat {
  return {
    ...chat,
    context: chat.context ? { ...chat.context } : undefined,
    messages: chat.messages.map((message) => ({ ...message }))
  };
}

function normalizeStoredChat(chat: Chat): Chat {
  return {
    ...chat,
    systemPrompt: chat.systemPrompt ?? "",
    context: normalizeChatContext(chat.context),
    messages: Array.isArray(chat.messages) ? chat.messages.map((message) => ({ ...message })) : []
  };
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
      this.chats = Array.isArray(parsed.chats) ? parsed.chats.map(normalizeStoredChat) : [];
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
    const chat = this.chats.find((c) => c.id === id);
    return chat ? cloneChat(chat) : undefined;
  }

  getAll(): Chat[] {
    return this.chats.map(cloneChat);
  }

  async create(context?: Chat["context"]): Promise<Chat> {
    const t = now();
    const chat: Chat = {
      id: makeId("chat"),
      title: "New Chat",
      createdAt: t,
      updatedAt: t,
      messages: [],
      systemPrompt: "",
      context: normalizeChatContext(context)
    };
    this.chats.unshift(chat);
    await this.persist();
    return cloneChat(chat);
  }

  async delete(id: string): Promise<boolean> {
    const before = this.chats.length;
    this.chats = this.chats.filter((c) => c.id !== id);
    if (this.chats.length !== before) { await this.persist(); return true; }
    return false;
  }

  async rename(id: string, title: string): Promise<boolean> {
    const chat = this.chats.find((candidate) => candidate.id === id);
    if (!chat) return false;
    chat.title = title.trim() || "New Chat";
    chat.updatedAt = now();
    await this.persist();
    return true;
  }

  async setSystemPrompt(id: string, systemPrompt: string): Promise<boolean> {
    const chat = this.chats.find((candidate) => candidate.id === id);
    if (!chat) return false;
    chat.systemPrompt = systemPrompt;
    chat.updatedAt = now();
    await this.persist();
    return true;
  }

  async setContext(id: string, context: Chat["context"]): Promise<boolean> {
    const chat = this.chats.find((candidate) => candidate.id === id);
    if (!chat) return false;
    chat.context = normalizeChatContext(context);
    chat.updatedAt = now();
    await this.persist();
    return true;
  }

  async importChat(input: { title: string; messages: Message[]; systemPrompt?: string; context?: Chat["context"] }): Promise<Chat> {
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
      systemPrompt: input.systemPrompt ?? "",
      context: normalizeChatContext(input.context)
    };

    this.chats.unshift(chat);
    await this.persist();
    return cloneChat(chat);
  }

  async appendMessage(chatId: string, message: Message): Promise<void> {
    const chat = this.chats.find((candidate) => candidate.id === chatId);
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
    const chat = this.chats.find((candidate) => candidate.id === chatId);
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
          return parsed.chats.map(normalizeStoredChat);
        }
      } catch {
        // Ignore unreadable legacy files.
      }
    }

    return [];
  }
}
