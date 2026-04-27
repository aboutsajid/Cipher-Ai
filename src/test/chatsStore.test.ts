import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatsStore } from "../main/services/chatsStore";
import type { Message } from "../shared/types";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cipher-chats-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function makeMessage(content: string, role: Message["role"] = "user"): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

test("ChatsStore renames a new chat from the first user message and persists it", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new ChatsStore(userDataPath);
    await store.init();

    const chat = await store.create();
    const firstMessage = makeMessage("   Build me a desktop dashboard with logs and charts   ");
    await store.appendMessage(chat.id, firstMessage);

    const updated = store.get(chat.id);
    assert.ok(updated);
    assert.equal(updated.title, "Build me a desktop dashboard with logs and charts");

    const persistedPath = join(userDataPath, "cipher-workspace", "chats.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { chats: Array<{ id: string; title: string }> };
    assert.equal(persisted.chats[0]?.title, "Build me a desktop dashboard with logs and charts");
  });
});

test("ChatsStore keeps imported chats sorted by most recent update time", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new ChatsStore(userDataPath);
    await store.init();

    const older = await store.importChat({
      title: "Older",
      messages: [{ ...makeMessage("hello"), createdAt: "2026-01-01T00:00:00.000Z" }]
    });
    const newer = await store.importChat({
      title: "Newer",
      messages: [{ ...makeMessage("world"), createdAt: "2026-01-02T00:00:00.000Z" }]
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await store.rename(older.id, "Older renamed");
    const listed = store.list();

    assert.equal(listed[0]?.id, older.id);
    assert.equal(listed[1]?.id, newer.id);
    assert.equal(listed[0]?.title, "Older renamed");
  });
});

test("ChatsStore persists chat context updates", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new ChatsStore(userDataPath);
    await store.init();

    const chat = await store.create({
      provider: "openrouter",
      selectedModel: "qwen/qwen3-coder:free"
    });
    const updated = await store.setContext(chat.id, {
      provider: "nvidia",
      selectedModel: "meta/llama-3.1-70b-instruct",
      compareEnabled: true,
      compareModel: "deepseek/deepseek-r1"
    });

    assert.equal(updated, true);
    assert.deepEqual(store.get(chat.id)?.context, {
      provider: "nvidia",
      selectedModel: "meta/llama-3.1-70b-instruct",
      compareEnabled: true,
      compareModel: "deepseek/deepseek-r1"
    });

    const persistedPath = join(userDataPath, "cipher-workspace", "chats.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as {
      chats: Array<{ id: string; context?: { provider?: string; selectedModel?: string; compareEnabled?: boolean; compareModel?: string } }>;
    };
    assert.deepEqual(persisted.chats[0]?.context, {
      provider: "nvidia",
      selectedModel: "meta/llama-3.1-70b-instruct",
      compareEnabled: true,
      compareModel: "deepseek/deepseek-r1"
    });
  });
});

test("ChatsStore flushPendingWrites persists debounced stream updates", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new ChatsStore(userDataPath);
    await store.init();

    const chat = await store.create();
    const assistantMessage = makeMessage("Booting response...", "assistant");
    await store.appendMessage(chat.id, assistantMessage);

    await store.updateMessage(chat.id, assistantMessage.id, { content: "Booting response... 25%" });
    await store.updateMessage(chat.id, assistantMessage.id, { content: "Booting response... 50%" });
    await store.updateMessage(chat.id, assistantMessage.id, { content: "Booting response... done" });
    await store.flushPendingWrites();

    const persistedPath = join(userDataPath, "cipher-workspace", "chats.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as {
      chats: Array<{ id: string; messages: Array<{ id: string; content: string }> }>;
    };
    const savedChat = persisted.chats.find((candidate) => candidate.id === chat.id);
    const savedMessage = savedChat?.messages.find((candidate) => candidate.id === assistantMessage.id);
    assert.equal(savedMessage?.content, "Booting response... done");
  });
});
