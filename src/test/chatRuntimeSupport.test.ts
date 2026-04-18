import test from "node:test";
import assert from "node:assert/strict";
import { streamAssistantResponses } from "../main/chatRuntimeSupport";
import type { Message, Settings } from "../shared/types";

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiKey: "openrouter-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-coder:free",
    routerPort: 3456,
    models: ["qwen/qwen3-coder:free"],
    customTemplates: [],
    ollamaEnabled: false,
    ollamaBaseUrl: "http://localhost:11434/v1",
    ollamaModels: [],
    localVoiceEnabled: false,
    localVoiceModel: "base",
    mcpServers: [],
    routing: {
      default: "qwen/qwen3-coder:free",
      think: "qwen/qwen3-coder:free",
      longContext: "qwen/qwen3-coder:free"
    },
    ...overrides
  };
}

test("streamAssistantResponses routes ollama models and persists chunks", async () => {
  const assistant: Message = {
    id: "msg-1",
    role: "assistant",
    content: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    model: "ollama/codellama"
  };
  const updates: Array<Partial<Message>> = [];
  const emitted: Array<{ channel: string; payload?: string }> = [];

  await streamAssistantResponses({
    assistantMessages: [assistant],
    history: [{ role: "user", content: "Build it" }],
    chatId: "chat-1",
    fallbackModel: "qwen/qwen3-coder:free",
    signal: new AbortController().signal,
    getSettings: () => createSettings({ ollamaEnabled: true }),
    sendMessage: async (_history, model, onChunk, _signal, options) => {
      assert.equal(model, "codellama");
      assert.equal(options.baseUrl, "http://localhost:11434/v1");
      assert.equal(options.apiKey, "");
      assert.equal(options.skipAuth, true);
      await onChunk("hello ");
      await onChunk("world");
    },
    updateMessage: async (_chatId, _messageId, patch) => {
      updates.push(patch);
    },
    emit: (channel, _chatId, _messageId, payload) => {
      emitted.push({ channel, payload });
    }
  });

  assert.equal(assistant.content, "hello world");
  assert.deepEqual(updates, [{ content: "hello " }, { content: "hello world" }]);
  assert.deepEqual(emitted, [
    { channel: "chat:chunk", payload: "hello " },
    { channel: "chat:chunk", payload: "world" },
    { channel: "chat:done", payload: undefined }
  ]);
});

test("streamAssistantResponses records errors and fallback content", async () => {
  const assistant: Message = {
    id: "msg-2",
    role: "assistant",
    content: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    model: "qwen/qwen3-coder:free"
  };
  const updates: Array<Partial<Message>> = [];
  const emitted: Array<{ channel: string; payload?: string }> = [];

  await streamAssistantResponses({
    assistantMessages: [assistant],
    history: [{ role: "user", content: "Build it" }],
    chatId: "chat-1",
    fallbackModel: "qwen/qwen3-coder:free",
    signal: new AbortController().signal,
    getSettings: () => createSettings(),
    sendMessage: async (_history, model, _onChunk, _signal, options) => {
      assert.equal(model, "qwen/qwen3-coder:free");
      assert.equal(options.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(options.apiKey, "openrouter-key");
      assert.equal(options.skipAuth, false);
      throw new Error("router down");
    },
    updateMessage: async (_chatId, _messageId, patch) => {
      updates.push(patch);
    },
    emit: (channel, _chatId, _messageId, payload) => {
      emitted.push({ channel, payload });
    }
  });

  assert.equal(assistant.error, "router down");
  assert.deepEqual(updates, [{ error: "router down", content: "router down" }]);
  assert.deepEqual(emitted, [{ channel: "chat:error", payload: "router down" }]);
});

test("streamAssistantResponses honors explicit route overrides for persisted chat context", async () => {
  const assistant: Message = {
    id: "msg-3",
    role: "assistant",
    content: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    model: "meta/llama-3.1-70b-instruct"
  };

  await streamAssistantResponses({
    assistantMessages: [assistant],
    history: [{ role: "user", content: "Use the NVIDIA route" }],
    chatId: "chat-2",
    fallbackModel: "qwen/qwen3-coder:free",
    routeOptions: {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      cloudProvider: "nvidia",
      apiKey: "nvidia-key",
      skipAuth: false
    },
    signal: new AbortController().signal,
    getSettings: () => createSettings(),
    sendMessage: async (_history, model, onChunk, _signal, options) => {
      assert.equal(model, "meta/llama-3.1-70b-instruct");
      assert.equal(options.baseUrl, "https://integrate.api.nvidia.com/v1");
      assert.equal(options.cloudProvider, "nvidia");
      assert.equal(options.apiKey, "nvidia-key");
      assert.equal(options.skipAuth, false);
      await onChunk("done");
    },
    updateMessage: async () => {},
    emit: () => {}
  });

  assert.equal(assistant.content, "done");
});
