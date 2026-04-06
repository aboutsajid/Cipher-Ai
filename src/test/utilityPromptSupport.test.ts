import test from "node:test";
import assert from "node:assert/strict";
import { pickOllamaModel, pickOpenRouterModel, resolveUtilityRoute, sendUtilityPrompt } from "../main/utilityPromptSupport";
import type { Settings } from "../shared/types";

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiKey: "",
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

test("pickOpenRouterModel ignores ollama-prefixed entries", () => {
  const model = pickOpenRouterModel(createSettings({
    defaultModel: "ollama/codellama",
    models: ["ollama/mistral", "openai/gpt-4.1-mini"]
  }));

  assert.equal(model, "openai/gpt-4.1-mini");
});

test("pickOllamaModel prefers prefixed models then discovered models", () => {
  const fromPrefixed = pickOllamaModel(createSettings({
    defaultModel: "ollama/codellama",
    models: ["openai/gpt-4.1-mini"]
  }));
  const fromDiscovered = pickOllamaModel(createSettings({
    defaultModel: "openai/gpt-4.1-mini",
    models: [],
    ollamaModels: ["llama3.2"]
  }));

  assert.equal(fromPrefixed, "codellama");
  assert.equal(fromDiscovered, "llama3.2");
});

test("resolveUtilityRoute prefers ollama default when enabled", () => {
  const route = resolveUtilityRoute(createSettings({
    ollamaEnabled: true,
    defaultModel: "ollama/codellama"
  }));

  assert.deepEqual(route, {
    model: "codellama",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "",
    skipAuth: true
  });
});

test("sendUtilityPrompt streams chunks and trims final output", async () => {
  const result = await sendUtilityPrompt(
    createSettings({ apiKey: "key-123" }),
    async (_history, model, onChunk, _signal, options) => {
      assert.equal(model, "qwen/qwen3-coder:free");
      assert.equal(options.apiKey, "key-123");
      onChunk("  hello");
      onChunk(" world  ");
    },
    "Summarize this"
  );

  assert.equal(result, "hello world");
});

test("sendUtilityPrompt rejects empty model responses", async () => {
  await assert.rejects(
    () => sendUtilityPrompt(
      createSettings({ apiKey: "key-123" }),
      async () => {},
      "Summarize this"
    ),
    /Received empty response from model/
  );
});
