import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteTemplate,
  listTemplates,
  refreshOllamaModels,
  saveSettingsPartial,
  saveTemplate
} from "../main/settingsSupport";
import type { PromptTemplate, Settings } from "../shared/types";

function createSettingsStore(initial: Partial<Settings> = {}) {
  let settings: Settings = {
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
    ...initial
  };
  let templates: PromptTemplate[] = [];

  return {
    get: () => settings,
    save: async (partial: Partial<Settings>) => {
      settings = { ...settings, ...partial };
    },
    listTemplates: () => [...templates],
    saveTemplate: async (template: PromptTemplate) => {
      templates = [...templates.filter((item) => item.name !== template.name), template];
      return [...templates];
    },
    deleteTemplate: async (name: string) => {
      templates = templates.filter((item) => item.name !== name);
      return [...templates];
    }
  };
}

test("saveSettingsPartial persists and returns updated settings", async () => {
  const settingsStore = createSettingsStore();

  const updated = await saveSettingsPartial(settingsStore, {
    apiKey: "secret",
    ollamaEnabled: true
  });

  assert.equal(updated.apiKey, "secret");
  assert.equal(updated.ollamaEnabled, true);
});

test("template helpers delegate to the settings store", async () => {
  const settingsStore = createSettingsStore();

  assert.deepEqual(listTemplates(settingsStore), []);
  assert.deepEqual(await saveTemplate(settingsStore, "Demo", "Body"), [{ name: "Demo", content: "Body" }]);
  assert.deepEqual(await deleteTemplate(settingsStore, "Demo"), []);
});

test("refreshOllamaModels uses explicit or stored base url and saves discovered models", async () => {
  const settingsStore = createSettingsStore({ ollamaBaseUrl: "http://localhost:11435/v1" });
  const seenUrls: string[] = [];

  const discovered = await refreshOllamaModels(settingsStore, {
    listOllamaModels: async (baseUrl: string) => {
      seenUrls.push(baseUrl);
      return ["llama3.2", "codellama"];
    }
  });

  const fallbackDiscovered = await refreshOllamaModels(settingsStore, {
    listOllamaModels: async (baseUrl: string) => {
      seenUrls.push(baseUrl);
      return ["mistral"];
    }
  }, " ");

  assert.deepEqual(discovered, ["llama3.2", "codellama"]);
  assert.deepEqual(fallbackDiscovered, ["mistral"]);
  assert.deepEqual(seenUrls, ["http://localhost:11435/v1", "http://localhost:11434/v1"]);
  assert.deepEqual(settingsStore.get().ollamaModels, ["mistral"]);
});
