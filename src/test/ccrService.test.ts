import test from "node:test";
import assert from "node:assert/strict";
import { CcrService } from "../main/services/ccrService";
import type { Settings } from "../shared/types";

function createSettings(overrides: Partial<Settings> = {}) {
  const settings: Settings = {
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
  return { get: () => settings };
}

function withMockFetch(
  impl: typeof fetch,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function createSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

test("CcrService rejects chat sends when no API key is configured", async () => {
  const service = new CcrService(createSettings() as never);

  await assert.rejects(
    () => service.sendMessageAdvanced([{ role: "user", content: "hello" }], "model", () => undefined),
    /No API key set/
  );
});

test("CcrService parses streamed SSE content and emits chunks", async () => {
  const chunks: string[] = [];
  const service = new CcrService(createSettings({ apiKey: "sk-or-v1-secret" }) as never);

  await withMockFetch(async (_input, init) => {
    assert.equal(String(init?.headers && (init.headers as Record<string, string>)["Authorization"]), "Bearer sk-or-v1-secret");
    return createSseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n',
      "data: [DONE]\n"
    ]);
  }, async () => {
    const result = await service.sendMessageAdvanced(
      [{ role: "user", content: "hello" }],
      "model",
      (chunk) => chunks.push(chunk)
    );

    assert.equal(result, "Hello world!");
    assert.deepEqual(chunks, ["Hello", " world", "!"]);
  });
});

test("CcrService sends NVIDIA-compatible chat requests without OpenRouter-only headers", async () => {
  const chunks: string[] = [];
  const service = new CcrService(createSettings({
    apiKey: "nvapi-test-secret",
    baseUrl: "https://integrate.api.nvidia.com/v1"
  }) as never);

  await withMockFetch(async (_input, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer nvapi-test-secret");
    assert.equal(Object.hasOwn(headers, "HTTP-Referer"), false);
    assert.equal(Object.hasOwn(headers, "X-Title"), false);
    return createSseResponse([
      'data: {"choices":[{"delta":{"content":"NVIDIA"}}]}\n',
      "data: [DONE]\n"
    ]);
  }, async () => {
    const result = await service.sendMessageAdvanced(
      [{ role: "user", content: "hello" }],
      "meta/llama-3.1-70b-instruct",
      (chunk) => chunks.push(chunk)
    );

    assert.equal(result, "NVIDIA");
    assert.deepEqual(chunks, ["NVIDIA"]);
  });
});

test("CcrService respects an explicit NVIDIA provider on custom cloud endpoints", async () => {
  const service = new CcrService(createSettings({
    apiKey: "nvapi-test-secret",
    baseUrl: "https://gateway.example.com/v1",
    cloudProvider: "nvidia"
  }) as never);

  await withMockFetch(async (_input, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer nvapi-test-secret");
    assert.equal(Object.hasOwn(headers, "HTTP-Referer"), false);
    assert.equal(Object.hasOwn(headers, "X-Title"), false);
    return createSseResponse([
      'data: {"choices":[{"delta":{"content":"custom nvidia"}}]}\n',
      "data: [DONE]\n"
    ]);
  }, async () => {
    const result = await service.sendMessageAdvanced(
      [{ role: "user", content: "hello" }],
      "meta/llama-3.1-70b-instruct",
      () => undefined
    );

    assert.equal(result, "custom nvidia");
  });
});

test("CcrService sendMessageAdvanced respects an explicit timeout override", async () => {
  const service = new CcrService(createSettings({ apiKey: "sk-or-v1-secret" }) as never);
  let capturedTimeoutMs = 0;
  const originalTimeout = AbortSignal.timeout;

  try {
    (AbortSignal as typeof AbortSignal & {
      timeout: (ms: number) => AbortSignal;
    }).timeout = ((ms: number) => {
      capturedTimeoutMs = ms;
      return originalTimeout(50);
    }) as typeof AbortSignal.timeout;

    await withMockFetch(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
      "data: [DONE]\n"
    ]), async () => {
      const result = await service.sendMessageAdvanced(
        [{ role: "user", content: "hello" }],
        "model",
        () => undefined,
        undefined,
        { timeoutMs: 12345 }
      );

      assert.equal(result, "ok");
      assert.equal(capturedTimeoutMs, 12345);
    });
  } finally {
    (AbortSignal as typeof AbortSignal & {
      timeout: typeof AbortSignal.timeout;
    }).timeout = originalTimeout;
  }
});

test("CcrService fails clearly when chat completion returns no response body", async () => {
  const service = new CcrService(createSettings({ apiKey: "sk-or-v1-secret" }) as never);

  await withMockFetch(async () => new Response(null, { status: 200 }), async () => {
    await assert.rejects(
      () => service.sendMessageAdvanced([{ role: "user", content: "hello" }], "model", () => undefined),
      /empty response body/
    );
  });
});

test("CcrService maps OpenRouter credit failures to a specific message", async () => {
  const service = new CcrService(createSettings({ apiKey: "sk-or-v1-secret" }) as never);

  await withMockFetch(async () => new Response("payment required", { status: 402 }), async () => {
    await assert.rejects(
      () => service.sendMessageAdvanced([{ role: "user", content: "hello" }], "model", () => undefined),
      /Insufficient OpenRouter credits\/budget/
    );
  });
});

test("CcrService lists Ollama models from /api/tags and trims names", async () => {
  const service = new CcrService(createSettings() as never);

  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "http://localhost:11434/api/tags");
    assert.equal(init?.method, "GET");
    return Response.json({
      models: [
        { name: " qwen2.5-coder:14b " },
        { name: "" },
        {},
        { name: "llama3.1:8b" }
      ]
    });
  }, async () => {
    const models = await service.listOllamaModels("http://localhost:11434/v1");
    assert.deepEqual(models, ["qwen2.5-coder:14b", "llama3.1:8b"]);
  });
});

test("CcrService testConnection reports missing API keys without calling fetch", async () => {
  const service = new CcrService(createSettings({ apiKey: "" }) as never);
  let called = false;

  await withMockFetch(async () => {
    called = true;
    throw new Error("should not be called");
  }, async () => {
    const result = await service.testConnection();
    assert.equal(result.ok, false);
    assert.match(result.message, /No API key set/);
    assert.equal(called, false);
  });
});
