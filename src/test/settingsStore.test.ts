import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_LONG_CONTEXT_MODEL,
  NVIDIA_THINK_MODEL,
  OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_LONG_CONTEXT_MODEL,
  OPENROUTER_THINK_MODEL
} from "../shared/modelCatalog";
import { SettingsStore } from "../main/services/settingsStore";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cipher-settings-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("SettingsStore forces local voice off even when saved as enabled", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new SettingsStore(userDataPath);
    await store.init();

    await store.save({
      localVoiceEnabled: true,
      localVoiceModel: "medium"
    });

    const current = store.get();
    assert.equal(current.localVoiceEnabled, false);
    assert.equal(current.localVoiceModel, "medium");

    const persistedPath = join(userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { localVoiceEnabled?: boolean };
    assert.equal(persisted.localVoiceEnabled, false);
  });
});

test("SettingsStore degrades cleanly without Electron safeStorage", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new SettingsStore(userDataPath);
    await store.init();

    await store.save({
      apiKey: "sk-or-v1-example-secret",
      baseUrl: "https://openrouter.ai/api/v1"
    });

    const current = store.get();
    assert.equal(current.apiKey, "sk-or-v1-example-secret");

    const persistedPath = join(userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { apiKey?: string };
    assert.equal(persisted.apiKey, "sk-or-v1-example-secret");
  });
});

test("SettingsStore persists image provider and ComfyUI base URL", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new SettingsStore(userDataPath);
    await store.init();

    await store.save({
      imageProvider: "comfyui",
      comfyuiBaseUrl: "http://127.0.0.1:8000"
    });

    const current = store.get();
    assert.equal(current.imageProvider, "comfyui");
    assert.equal(current.comfyuiBaseUrl, "http://127.0.0.1:8000");

    const persistedPath = join(userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { imageProvider?: string; comfyuiBaseUrl?: string };
    assert.equal(persisted.imageProvider, "comfyui");
    assert.equal(persisted.comfyuiBaseUrl, "http://127.0.0.1:8000");
  });
});

test("SettingsStore migrates gemma shorthand ids to the supported OpenRouter model id", async () => {
  await withTempDir(async (userDataPath) => {
    const settingsDir = join(userDataPath, "cipher-workspace");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, "cipher-workspace-settings.json"), JSON.stringify({
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "gemma4:31b-cloud",
      models: ["gemma4:31b-cloud", "qwen/qwen3-coder:free"],
      routing: {
        default: "gemma4:31b-cloud",
        think: "qwen/qwen3-coder:free",
        longContext: "gemma4:31b-cloud"
      }
    }, null, 2), "utf8");

    const store = new SettingsStore(userDataPath);
    await store.init();

    const current = store.get();
    assert.equal(current.defaultModel, "google/gemma-4-31b-it");
    assert.equal(current.models.includes("google/gemma-4-31b-it"), true);
    assert.equal(current.routing.default, "google/gemma-4-31b-it");
    assert.equal(current.routing.longContext, "google/gemma-4-31b-it");
  });
});

test("SettingsStore upgrades legacy stock model strategy to the curated defaults", async () => {
  await withTempDir(async (userDataPath) => {
    const settingsDir = join(userDataPath, "cipher-workspace");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, "cipher-workspace-settings.json"), JSON.stringify({
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "qwen/qwen3-coder:free",
      models: [
        "qwen/qwen3-coder:free",
        "qwen/qwen-2.5-coder-32b-instruct",
        "google/gemma-4-31b-it",
        "google/gemini-2.0-flash-001",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen3-14b",
        "deepseek/deepseek-chat-v3-0324"
      ],
      routing: {
        default: "qwen/qwen3-coder:free",
        think: "meta-llama/llama-3.3-70b-instruct:free",
        longContext: "google/gemini-2.0-flash-001"
      }
    }, null, 2), "utf8");

    const store = new SettingsStore(userDataPath);
    await store.init();

    const current = store.get();
    assert.equal(current.defaultModel, OPENROUTER_DEFAULT_MODEL);
    assert.equal(current.models.includes(OPENROUTER_DEFAULT_MODEL), true);
    assert.equal(current.routing.default, OPENROUTER_DEFAULT_MODEL);
    assert.equal(current.routing.think, OPENROUTER_THINK_MODEL);
    assert.equal(current.routing.longContext, OPENROUTER_LONG_CONTEXT_MODEL);
  });
});

test("SettingsStore upgrades legacy stock model strategy to NVIDIA defaults when the saved provider is NVIDIA", async () => {
  await withTempDir(async (userDataPath) => {
    const settingsDir = join(userDataPath, "cipher-workspace");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, "cipher-workspace-settings.json"), JSON.stringify({
      apiKey: "",
      baseUrl: "https://gateway.example.com/v1",
      cloudProvider: "nvidia",
      defaultModel: "qwen/qwen3-coder:free",
      models: [
        "qwen/qwen3-coder:free",
        "qwen/qwen-2.5-coder-32b-instruct",
        "google/gemma-4-31b-it",
        "google/gemini-2.0-flash-001",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen3-14b",
        "deepseek/deepseek-chat-v3-0324"
      ],
      routing: {
        default: "qwen/qwen3-coder:free",
        think: "meta-llama/llama-3.3-70b-instruct:free",
        longContext: "google/gemini-2.0-flash-001"
      }
    }, null, 2), "utf8");

    const store = new SettingsStore(userDataPath);
    await store.init();

    const current = store.get();
    assert.equal(current.cloudProvider, "nvidia");
    assert.equal(current.defaultModel, NVIDIA_DEFAULT_MODEL);
    assert.equal(current.models.includes(NVIDIA_DEFAULT_MODEL), true);
    assert.equal(current.routing.default, NVIDIA_DEFAULT_MODEL);
    assert.equal(current.routing.think, NVIDIA_THINK_MODEL);
    assert.equal(current.routing.longContext, NVIDIA_LONG_CONTEXT_MODEL);
  });
});
