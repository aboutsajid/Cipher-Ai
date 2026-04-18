import { randomUUID } from "node:crypto";
import type { Chat, Message } from "../shared/types";

export interface ImportedChatPayload {
  title: string;
  messages: Message[];
  systemPrompt?: string;
  context?: Chat["context"];
}

export interface ChatStatsSummary {
  totalChats: number;
  totalMessages: number;
  totalEstimatedTokens: number;
  mostUsedModel: string;
  mostUsedModelCount: number;
  averageMessagesPerChat: number;
}

export function formatChatMarkdown(title: string, messages: Message[]): string {
  const lines: string[] = [`# ${title.trim() || "Chat Export"}`, ""];
  for (const message of messages) {
    const roleLabel = message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : "System";
    lines.push(`**${roleLabel}:** ${message.content}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function parseImportedMarkdown(content: string, fallbackTitle: string): ImportedChatPayload {
  const lines = content.replace(/\r/g, "").split("\n");
  const messages: Message[] = [];
  const titleLine = lines.find((line) => line.trim().startsWith("# "));
  const title = titleLine?.replace(/^#\s+/, "").trim() || fallbackTitle;

  let currentRole: "user" | "assistant" | "system" | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentRole) return;
    const text = buffer.join("\n").trim();
    if (!text) {
      currentRole = null;
      buffer = [];
      return;
    }
    messages.push({
      id: randomUUID(),
      role: currentRole,
      content: text,
      createdAt: new Date().toISOString()
    });
    currentRole = null;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = /^\*\*(You|Assistant|System):\*\*\s?(.*)$/.exec(trimmed);
    if (match) {
      flush();
      currentRole = match[1] === "You" ? "user" : match[1] === "Assistant" ? "assistant" : "system";
      buffer.push(match[2] ?? "");
      continue;
    }
    if (!currentRole) continue;
    buffer.push(line);
  }
  flush();

  return { title, messages };
}

export function normalizeImportedChat(raw: unknown, fallbackTitle: string): ImportedChatPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<Chat> & { systemPrompt?: string };
  if (!Array.isArray(candidate.messages)) return null;

  const messages: Message[] = candidate.messages
    .filter((message) => message && typeof message.content === "string" && typeof message.role === "string")
    .map((message) => ({
      id: message.id?.trim() || randomUUID(),
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: message.content ?? "",
      createdAt: message.createdAt || new Date().toISOString(),
      model: message.model,
      error: message.error,
      metadata: message.metadata
    }));

  return {
    title: (candidate.title ?? "").trim() || fallbackTitle,
    messages,
    systemPrompt: candidate.systemPrompt ?? "",
    context: candidate.context
  };
}

export function formatConversationHistory(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

export function normalizeGeneratedTitle(raw: string): string {
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const stripped = firstLine
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,!?;:]+/g, "")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join(" ").trim() || "New Chat";
}

export function buildChatStats(chats: Chat[]): ChatStatsSummary {
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
}
