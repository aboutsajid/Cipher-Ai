import test from "node:test";
import assert from "node:assert/strict";
import { pickCloudModel, pickOllamaModel, pickOpenRouterModel, resolveUtilityRoute, sendUtilityPrompt } from "../main/utilityPromptSupport";
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

test("pickCloudModel ignores ollama-prefixed entries", () => {
  const model = pickCloudModel(createSettings({
    defaultModel: "ollama/codellama",
    models: ["ollama/mistral", "openai/gpt-4.1-mini"],
    routing: {
      default: "ollama/codellama",
      think: "ollama/mistral",
      longContext: "openai/gpt-4.1-mini"
    }
  }));

  assert.equal(model, "openai/gpt-4.1-mini");
});

test("pickCloudModel prefers the configured default route before the generic default model", () => {
  const model = pickCloudModel(createSettings({
    defaultModel: "openai/gpt-4.1-mini",
    models: ["openai/gpt-4.1-mini", "google/gemini-2.5-flash-lite-preview-09-2025"],
    routing: {
      default: "google/gemini-2.5-flash-lite-preview-09-2025",
      think: "openai/gpt-4.1-mini",
      longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
    }
  }));

  assert.equal(model, "google/gemini-2.5-flash-lite-preview-09-2025");
});

test("pickCloudModel prefers coding-focused models for repair routes", () => {
  const model = pickCloudModel(createSettings({
    defaultModel: "deepseek/deepseek-v3.2",
    models: ["deepseek/deepseek-v3.2", "qwen/qwen3-coder-next"],
    routing: {
      default: "deepseek/deepseek-v3.2",
      think: "deepseek/deepseek-v3.2",
      longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
    }
  }), "repair");

  assert.equal(model, "qwen/qwen3-coder-next");
});

test("pickOpenRouterModel remains an alias for backward compatibility", () => {
  const settings = createSettings({
    defaultModel: "openai/gpt-4.1-mini",
    models: ["openai/gpt-4.1-mini", "google/gemini-2.5-flash-lite-preview-09-2025"]
  });

  assert.equal(pickOpenRouterModel(settings), pickCloudModel(settings));
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

test("pickOllamaModel prefers coding-focused local models for repair", () => {
  const model = pickOllamaModel(createSettings({
    defaultModel: "ollama/gpt-oss:20b",
    ollamaModels: ["gpt-oss:20b", "qwen2.5-coder:14b", "qwen3-vl:30b"]
  }), "repair");

  assert.equal(model, "qwen2.5-coder:14b");
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

test("resolveUtilityRoute uses the think route for verification when cloud auth is configured", () => {
  const route = resolveUtilityRoute(createSettings({
    apiKey: "key-123",
    defaultModel: "qwen/qwen3-coder-next",
    models: ["qwen/qwen3-coder-next", "deepseek/deepseek-v3.2"],
    routing: {
      default: "qwen/qwen3-coder-next",
      think: "deepseek/deepseek-v3.2",
      longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
    }
  }), "verification");

  assert.equal(route.model, "deepseek/deepseek-v3.2");
});

test("resolveUtilityRoute preserves the saved cloud provider for custom endpoints", () => {
  const route = resolveUtilityRoute(createSettings({
    apiKey: "key-123",
    baseUrl: "https://gateway.example.com/v1",
    cloudProvider: "nvidia",
    defaultModel: "meta/llama-3.3-70b-instruct"
  }));

  assert.equal(route.baseUrl, "https://gateway.example.com/v1");
  assert.equal(route.cloudProvider, "nvidia");
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
