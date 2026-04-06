import test from "node:test";
import assert from "node:assert/strict";
import { buildChatHistory, createAssistantMessages, createOutgoingUserMessage } from "../main/chatSendSupport";
import type { AttachmentPayload, Chat } from "../shared/types";

test("createOutgoingUserMessage includes attachment metadata only when needed", () => {
  const messageWithAttachments = createOutgoingUserMessage("Hello", ["notes.md"]);
  const messageWithoutAttachments = createOutgoingUserMessage("Hello", []);

  assert.equal(messageWithAttachments.role, "user");
  assert.deepEqual(messageWithAttachments.metadata, { attachmentNames: ["notes.md"] });
  assert.equal(messageWithoutAttachments.metadata, undefined);
});

test("createAssistantMessages assigns compare metadata for compare runs", () => {
  const messages = createAssistantMessages(["model-a", "model-b"]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, "assistant");
  assert.equal(messages[0]?.metadata?.compareSlot, "A");
  assert.equal(messages[1]?.metadata?.compareSlot, "B");
  assert.equal(messages[0]?.metadata?.compareGroup, messages[1]?.metadata?.compareGroup);
});

test("buildChatHistory injects tool hints, text attachments, and image content on the current user turn", () => {
  const userMessage = createOutgoingUserMessage("Review this screenshot", ["src/app.ts", "mock.png"]);
  const chat: Chat = {
    id: "chat-1",
    title: "Demo",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    systemPrompt: "Be concise.",
    messages: [
      { id: "old-user", role: "user", content: "Previous prompt", createdAt: "2025-01-01T00:00:01.000Z" },
      userMessage,
      { id: "assistant-skip", role: "assistant", content: "", createdAt: "2025-01-01T00:00:02.000Z" }
    ]
  };
  const attachments: AttachmentPayload[] = [
    { name: "src/app.ts", type: "text", content: "console.log('hello');", sourcePath: "src/app.ts" },
    { name: "mock.png", type: "image", content: "data:image/png;base64,YWJj", mimeType: "image/png" }
  ];

  const history = buildChatHistory(chat, userMessage, attachments, ["workspace.search"], new Set(["assistant-skip"]));

  assert.equal(history[0]?.role, "system");
  assert.equal(history[0]?.content, "Be concise.");
  assert.equal(history[1]?.role, "system");
  assert.match(String(history[1]?.content), /workspace\.search/);
  assert.equal(history[2]?.role, "user");
  assert.equal(history[2]?.content, "Previous prompt");
  assert.equal(history[3]?.role, "system");
  assert.match(String(history[3]?.content), /File: src\/app\.ts/);
  assert.equal(history[4]?.role, "user");
  assert.ok(Array.isArray(history[4]?.content));
  assert.equal(history[4]?.content[0]?.type, "image_url");
  assert.equal(history[4]?.content[1]?.type, "text");
});
