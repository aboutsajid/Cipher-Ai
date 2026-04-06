import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatStats,
  formatChatMarkdown,
  formatConversationHistory,
  normalizeGeneratedTitle,
  normalizeImportedChat,
  parseImportedMarkdown
} from "../main/chatSupport";

test("formatChatMarkdown exports non-empty chat markdown", () => {
  const markdown = formatChatMarkdown("Demo", [
    { id: "1", role: "user", content: "Hello", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: "2", role: "assistant", content: "Hi", createdAt: "2025-01-01T00:00:01.000Z" }
  ]);

  assert.match(markdown, /^# Demo/m);
  assert.match(markdown, /\*\*You:\*\* Hello/);
  assert.match(markdown, /\*\*Assistant:\*\* Hi/);
});

test("parseImportedMarkdown restores title and messages", () => {
  const imported = parseImportedMarkdown("# Imported\n\n**You:** hello\nline two\n\n**Assistant:** hi there", "Fallback");

  assert.equal(imported.title, "Imported");
  assert.equal(imported.messages.length, 2);
  assert.equal(imported.messages[0]?.role, "user");
  assert.equal(imported.messages[0]?.content, "hello\nline two");
  assert.equal(imported.messages[1]?.role, "assistant");
});

test("normalizeImportedChat filters invalid messages and normalizes roles", () => {
  const imported = normalizeImportedChat({
    title: " Imported ",
    systemPrompt: "sys",
    messages: [
      { id: "", role: "assistant", content: "ok", createdAt: "" },
      { role: "weird", content: "user fallback" },
      { role: "user", content: 42 }
    ]
  }, "Fallback");

  assert.ok(imported);
  assert.equal(imported?.title, "Imported");
  assert.equal(imported?.systemPrompt, "sys");
  assert.equal(imported?.messages.length, 2);
  assert.equal(imported?.messages[1]?.role, "user");
});

test("formatConversationHistory and normalizeGeneratedTitle keep utility prompts compact", () => {
  const history = formatConversationHistory([
    { role: "user", content: "Need a summary" },
    { role: "assistant", content: "Here it is" }
  ]);
  const title = normalizeGeneratedTitle("\"Build status, next steps!\"");

  assert.match(history, /USER: Need a summary/);
  assert.match(history, /ASSISTANT: Here it is/);
  assert.equal(title, "Build status next steps");
});

test("buildChatStats reports message and model aggregates", () => {
  const stats = buildChatStats([
    {
      id: "chat-1",
      title: "One",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      messages: [
        { id: "m1", role: "user", content: "abcd", createdAt: "2025-01-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "1234", createdAt: "2025-01-01T00:00:01.000Z", model: "gpt-test" }
      ]
    },
    {
      id: "chat-2",
      title: "Two",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      messages: [
        { id: "m3", role: "assistant", content: "zzzz", createdAt: "2025-01-01T00:00:02.000Z", model: "gpt-test" }
      ]
    }
  ]);

  assert.equal(stats.totalChats, 2);
  assert.equal(stats.totalMessages, 3);
  assert.equal(stats.totalEstimatedTokens, 3);
  assert.equal(stats.mostUsedModel, "gpt-test");
  assert.equal(stats.mostUsedModelCount, 2);
  assert.equal(stats.averageMessagesPerChat, 1.5);
});
