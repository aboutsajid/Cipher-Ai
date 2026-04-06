import test from "node:test";
import assert from "node:assert/strict";
import { exportChatFile, importChatFile } from "../main/chatFileSupport";
import type { Chat } from "../shared/types";

const fakeWindow = {} as never;

function createChat(): Chat {
  return {
    id: "chat-1",
    title: "Demo Chat",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    systemPrompt: "hidden",
    messages: [
      { id: "m1", role: "system", content: "sys", createdAt: "2025-01-01T00:00:00.000Z" },
      { id: "m2", role: "user", content: "hello", createdAt: "2025-01-01T00:00:01.000Z" }
    ]
  };
}

test("exportChatFile rejects missing chats and handles cancel/save", async () => {
  const missing = await exportChatFile(fakeWindow, null, async () => ({ canceled: true }), async () => {});
  const canceled = await exportChatFile(fakeWindow, createChat(), async () => ({ canceled: true }), async () => {});
  let writeCall: { path: string; content: string } | null = null;
  const saved = await exportChatFile(
    fakeWindow,
    createChat(),
    async () => ({ canceled: false, filePath: "D:\\exports\\demo.md" }),
    async (filePath, content) => {
      writeCall = { path: filePath, content };
    }
  );

  assert.deepEqual(missing, { ok: false, message: "Chat not found." });
  assert.deepEqual(canceled, { ok: false, message: "Export canceled." });
  assert.deepEqual(saved, { ok: true, message: "Exported to D:\\exports\\demo.md" });
  if (writeCall === null) {
    throw new Error("expected export write call");
  }
  const recordedWrite = writeCall as { path: string; content: string };
  assert.equal(recordedWrite.path, "D:\\exports\\demo.md");
  assert.match(recordedWrite.content, /\*\*You:\*\* hello/);
  assert.doesNotMatch(recordedWrite.content, /\*\*System:\*\*/);
});

test("importChatFile handles cancel, json import, and invalid content", async () => {
  const canceled = await importChatFile(fakeWindow, async () => ({ canceled: true, filePaths: [] }), async () => "", async () => createChat());

  const importedJson = await importChatFile(
    fakeWindow,
    async () => ({ canceled: false, filePaths: ["D:\\imports\\demo.json"] }),
    async () => JSON.stringify({
      title: "Imported",
      messages: [{ role: "user", content: "hello" }]
    }),
    async (input) => ({
      ...createChat(),
      title: input.title,
      messages: input.messages
    })
  );

  const invalid = await importChatFile(
    fakeWindow,
    async () => ({ canceled: false, filePaths: ["D:\\imports\\demo.md"] }),
    async () => "not a chat transcript",
    async () => createChat()
  );

  assert.deepEqual(canceled, { ok: false, message: "Import canceled." });
  assert.equal(importedJson.ok, true);
  assert.equal(importedJson.chat?.title, "Imported");
  assert.deepEqual(invalid, { ok: false, message: "Could not import chat from that file." });
});
