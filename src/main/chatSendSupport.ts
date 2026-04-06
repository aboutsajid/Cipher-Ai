import { randomUUID } from "node:crypto";
import type { AttachmentPayload, Chat, Message } from "../shared/types";

export type ChatHistoryEntry = {
  role: string;
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export function createOutgoingUserMessage(messageText: string, attachmentNames: string[]): Message {
  return {
    id: `msg_${randomUUID()}`,
    role: "user",
    content: messageText,
    createdAt: new Date().toISOString(),
    metadata: attachmentNames.length > 0 ? { attachmentNames } : undefined
  };
}

export function createAssistantMessages(modelsToRun: string[]): Message[] {
  const compareGroup = modelsToRun.length > 1 ? `cmp_${randomUUID()}` : undefined;
  return modelsToRun.map((model, index) => ({
    id: `msg_${randomUUID()}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    model,
    metadata: compareGroup
      ? {
        compareGroup,
        compareSlot: index === 0 ? "A" : "B"
      }
      : undefined
  }));
}

export function buildChatHistory(
  chat: Chat | undefined,
  userMessage: Message,
  attachments: AttachmentPayload[],
  enabledTools: string[],
  assistantIds: Set<string>
): ChatHistoryEntry[] {
  const history: ChatHistoryEntry[] = [];
  const systemPrompt = (chat?.systemPrompt ?? "").trim();

  if (systemPrompt) {
    history.push({ role: "system", content: systemPrompt });
  }

  if (enabledTools.length > 0) {
    history.push({
      role: "system",
      content: `You have access to the following tools: ${enabledTools.join(", ")}`
    });
  }

  const textAttachmentMessages = attachments
    .filter((attachment) => attachment.type === "text")
    .map((attachment) => ({
      role: "system",
      content: `File: ${attachment.name}\n\n${attachment.content}`
    }));
  const imageParts = attachments
    .filter((attachment) => attachment.type === "image")
    .map((attachment) => ({
      type: "image_url" as const,
      image_url: { url: attachment.content }
    }));

  for (const message of chat?.messages ?? []) {
    if (message.role === "system") continue;
    if (assistantIds.has(message.id)) continue;

    if (message.id === userMessage.id) {
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

  return history;
}
