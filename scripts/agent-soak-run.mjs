import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);

function loadCompiledModule(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  try {
    return require(absolutePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${relativePath}. Run "npm run build" first. ${detail}`);
  }
}

const { AgentTaskRunner } = loadCompiledModule("dist/main/services/agentTaskRunner.js");
const { AGENT_SOAK_SCENARIOS } = loadCompiledModule("dist/shared/agentSoakScenarios.js");
const {
  appendAgentSoakHistory,
  attachAgentSoakTrendSummary,
  buildAgentSoakReport,
  formatAgentSoakMarkdown,
  normalizeAgentSoakHistory,
  normalizeAgentSoakScenarios
} = loadCompiledModule("dist/shared/agentSoak.js");

const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "qwen/qwen3-coder:free",
  routerPort: 3456,
  models: [
    "qwen/qwen3-coder:free",
    "qwen/qwen-2.5-coder-32b-instruct",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-14b",
    "deepseek/deepseek-chat-v3-0324"
  ],
  customTemplates: [],
  ollamaEnabled: false,
  ollamaBaseUrl: "http://localhost:11434/v1",
  ollamaModels: [],
  localVoiceEnabled: false,
  localVoiceModel: "base",
  mcpServers: [],
  routing: {
    default: "qwen/qwen3-coder:free",
    think: "meta-llama/llama-3.3-70b-instruct:free",
    longContext: "google/gemini-2.0-flash-001"
  }
};

function stripUtf8Bom(value) {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : value;
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    workspace: process.cwd(),
    markdown: null,
    json: null,
    settings: null,
    scenariosFile: null,
    scenario: null,
    limit: null,
    delayMs: 0,
    timeoutMs: 15 * 60 * 1000,
    restoreBetween: true,
    preferLocal: false,
    localOnly: false,
    dryRun: false
  };

  while (args.length > 0) {
    const key = args.shift();
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }

    if (key === "--no-restore-between") {
      options.restoreBetween = false;
      continue;
    }
    if (key === "--prefer-local") {
      options.preferLocal = true;
      continue;
    }
    if (key === "--local-only") {
      options.preferLocal = true;
      options.localOnly = true;
      continue;
    }
    if (key === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const value = args.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }

    if (key === "--workspace") options.workspace = value;
    else if (key === "--markdown") options.markdown = value;
    else if (key === "--json") options.json = value;
    else if (key === "--settings") options.settings = value;
    else if (key === "--scenarios-file") options.scenariosFile = value;
    else if (key === "--scenario") options.scenario = value;
    else if (key === "--limit") options.limit = Math.max(1, Number.parseInt(value, 10) || 0);
    else if (key === "--delay-ms") options.delayMs = Math.max(0, Number.parseInt(value, 10) || 0);
    else if (key === "--timeout-ms") options.timeoutMs = Math.max(5_000, Number.parseInt(value, 10) || 0);
    else throw new Error(`Unsupported option: ${key}`);
  }

  return options;
}

function getSettingsCandidatePaths() {
  const appData = process.env.APPDATA || "";
  const userHome = os.homedir();
  const appNames = ["Cipher Workspace", "cipher-ai", "cipher-chat", "Cipher Chat", "CipherChat", "Electron"];
  const paths = new Set();

  for (const appName of appNames) {
    if (appData) {
      paths.add(join(appData, appName, "cipher-workspace", "cipher-workspace-settings.json"));
      paths.add(join(appData, appName, "cipher-workspace-settings.json"));
      paths.add(join(appData, appName, "cipher-chat", "cipher-chat-settings.json"));
      paths.add(join(appData, appName, "cipher-chat-settings.json"));
    }
  }

  if (appData) {
    paths.add(join(appData, "cipher-workspace", "cipher-workspace-settings.json"));
    paths.add(join(appData, "cipher-chat", "cipher-chat-settings.json"));
  }
  if (userHome) {
    paths.add(join(userHome, "AppData", "Roaming", "Cipher Workspace", "cipher-workspace", "cipher-workspace-settings.json"));
  }

  return [...paths].map((item) => resolve(item));
}

async function findSettingsPath(explicitPath) {
  if (explicitPath) return resolve(explicitPath);
  for (const candidate of getSettingsCandidatePaths()) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // keep searching
    }
  }
  return null;
}

function normalizeSettings(raw, warnings) {
  const parsed = raw && typeof raw === "object" ? raw : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    models: Array.isArray(parsed.models) ? parsed.models.filter((item) => typeof item === "string" && item.trim()) : DEFAULT_SETTINGS.models,
    ollamaModels: Array.isArray(parsed.ollamaModels) ? parsed.ollamaModels.filter((item) => typeof item === "string" && item.trim()) : DEFAULT_SETTINGS.ollamaModels,
    customTemplates: Array.isArray(parsed.customTemplates) ? parsed.customTemplates : DEFAULT_SETTINGS.customTemplates,
    mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : DEFAULT_SETTINGS.mcpServers,
    routing: parsed.routing && typeof parsed.routing === "object"
      ? {
        default: String(parsed.routing.default ?? DEFAULT_SETTINGS.routing.default).trim() || DEFAULT_SETTINGS.routing.default,
        think: String(parsed.routing.think ?? DEFAULT_SETTINGS.routing.think).trim() || DEFAULT_SETTINGS.routing.think,
        longContext: String(parsed.routing.longContext ?? DEFAULT_SETTINGS.routing.longContext).trim() || DEFAULT_SETTINGS.routing.longContext
      }
      : { ...DEFAULT_SETTINGS.routing }
  };

  const envApiKey = (process.env.CIPHER_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "").trim();
  const fileApiKey = String(settings.apiKey ?? "").trim();
  if (envApiKey) {
    settings.apiKey = envApiKey;
  } else if (fileApiKey.startsWith("cipher-protected:")) {
    settings.apiKey = "";
    warnings.push("Saved API key is encrypted for Electron safeStorage. Set CIPHER_OPENROUTER_API_KEY or OPENROUTER_API_KEY to use cloud routes in the soak runner.");
  } else {
    settings.apiKey = fileApiKey;
  }

  settings.baseUrl = String(settings.baseUrl ?? DEFAULT_SETTINGS.baseUrl).trim() || DEFAULT_SETTINGS.baseUrl;
  settings.defaultModel = String(settings.defaultModel ?? DEFAULT_SETTINGS.defaultModel).trim() || DEFAULT_SETTINGS.defaultModel;
  settings.ollamaEnabled = Boolean(settings.ollamaEnabled);
  settings.ollamaBaseUrl = String(settings.ollamaBaseUrl ?? DEFAULT_SETTINGS.ollamaBaseUrl).trim() || DEFAULT_SETTINGS.ollamaBaseUrl;
  return settings;
}

async function loadSettings(settingsPath) {
  const warnings = [];
  const resolvedPath = await findSettingsPath(settingsPath);
  if (!resolvedPath) {
    const settings = normalizeSettings({}, warnings);
    return { settings, settingsPath: null, warnings };
  }

  const raw = JSON.parse(stripUtf8Bom(await readFile(resolvedPath, "utf8")));
  const settings = normalizeSettings(raw, warnings);
  return { settings, settingsPath: resolvedPath, warnings };
}

function getConfiguredLocalModels(settings) {
  return [...new Set([
    ...(String(settings.defaultModel ?? "").startsWith("ollama/")
      ? [String(settings.defaultModel).slice("ollama/".length).trim()]
      : []),
    ...(Array.isArray(settings.ollamaModels) ? settings.ollamaModels : []).map((model) => String(model ?? "").trim())
  ].filter(Boolean))];
}

function parseModelScaleBillions(model) {
  const match = String(model ?? "").toLowerCase().match(/(\d+(?:\.\d+)?)b\b/);
  return match ? Number.parseFloat(match[1]) : null;
}

function isSoakFriendlyLocalModel(model) {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (/(^|[-_/])vl([:-]|$)|vision/.test(normalized)) {
    return false;
  }
  const scale = parseModelScaleBillions(normalized);
  if (scale !== null && scale > 20) {
    return false;
  }
  return true;
}

function getSoakLocalCodeModelBias(model) {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (!normalized) return 0;
  if (/coder|code|codellama|starcoder|deepcoder|granite-code|devstral/.test(normalized)) {
    return 3;
  }
  if (/gemma/.test(normalized)) {
    return 2;
  }
  if (/r1|reason|gpt-oss/.test(normalized)) {
    return -2;
  }
  return 0;
}

function rankSoakLocalModels(models) {
  return [...models].sort((left, right) => {
    const biasDelta = getSoakLocalCodeModelBias(right) - getSoakLocalCodeModelBias(left);
    if (biasDelta !== 0) return biasDelta;
    const leftScale = parseModelScaleBillions(left);
    const rightScale = parseModelScaleBillions(right);
    if (leftScale !== null && rightScale !== null && leftScale !== rightScale) {
      return leftScale - rightScale;
    }
    if (leftScale === null && rightScale !== null) return 1;
    if (leftScale !== null && rightScale === null) return -1;
    return left.localeCompare(right);
  });
}

function applyRoutePreference(settings, options, warnings) {
  if (!options.preferLocal && !options.localOnly) {
    return settings;
  }

  const localModels = getConfiguredLocalModels(settings);
  if (!settings.ollamaEnabled || localModels.length === 0) {
    warnings.push("Local route preference was requested, but no Ollama models are configured. Keeping existing route order.");
    return settings;
  }

  const preferredLocalModels = localModels.filter(isSoakFriendlyLocalModel);
  const codeBiasedLocalModels = rankSoakLocalModels(preferredLocalModels);
  const codeFocusedLocalModels = codeBiasedLocalModels.filter((model) => getSoakLocalCodeModelBias(model) > 0);
  const selectedLocalModels = rankSoakLocalModels(
    codeFocusedLocalModels.length > 0
      ? codeFocusedLocalModels
      : preferredLocalModels.length > 0
        ? preferredLocalModels
        : localModels
  );
  const localRefs = selectedLocalModels.map((model) => `ollama/${model}`);
  const nextSettings = {
    ...settings,
    defaultModel: localRefs[0],
    ollamaModels: selectedLocalModels,
    models: options.localOnly
      ? localRefs
      : [...new Set([...localRefs, ...(settings.models ?? [])])],
    routing: {
      default: localRefs[0],
      think: localRefs[1] ?? localRefs[0],
      longContext: localRefs[2] ?? localRefs[0]
    }
  };

  if (options.localOnly) {
    nextSettings.apiKey = "";
    warnings.push(`Using local-only soak routing via ${selectedLocalModels.join(", ")}.`);
  } else {
    warnings.push(`Biasing soak routing toward local Ollama models via ${selectedLocalModels.join(", ")}.`);
  }

  const skippedLocalModels = localModels.filter((model) => !selectedLocalModels.includes(model));
  if (skippedLocalModels.length > 0) {
    warnings.push(`Skipped slower or less suitable local soak routes: ${skippedLocalModels.join(", ")}.`);
  }

  return nextSettings;
}

function createSettingsStore(settings) {
  return {
    get: () => settings
  };
}

function createCcrShim(settingsStore) {
  return {
    async sendMessageAdvanced(messages, model, onChunk, signal, options = {}) {
      const settings = settingsStore.get();
      const baseUrl = String(options.baseUrl ?? settings.baseUrl).replace(/\/+$/, "");
      const apiKey = String(options.apiKey ?? settings.apiKey ?? "").trim();
      const skipAuth = Boolean(options.skipAuth);
      const timeoutMs = Math.max(5_000, Number.parseInt(String(options.timeoutMs ?? 120_000), 10) || 120_000);

      if (!skipAuth && !apiKey) {
        throw new Error("No API key set. Set CIPHER_OPENROUTER_API_KEY or configure an ollama route.");
      }

      const headers = { "Content-Type": "application/json" };
      if (!skipAuth && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
        headers["HTTP-Referer"] = "https://cipher-ai.local";
        headers["X-Title"] = "Cipher Workspace";
      }

      const requestUrl = `${baseUrl}/chat/completions`;
      const requestBody = JSON.stringify({ model, messages, stream: true, max_tokens: 8192 });
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      let response = await fetch(requestUrl, {
        method: "POST",
        headers,
        body: requestBody,
        signal: requestSignal
      });

      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        response = await fetch(requestUrl, {
          method: "POST",
          headers,
          body: requestBody,
          signal: requestSignal
        });
      }

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401 || response.status === 403) throw new Error("Invalid API key for soak run.");
        if (response.status === 402) throw new Error("Insufficient OpenRouter credits/budget for soak run.");
        if (response.status === 429) throw new Error("Rate limit hit during soak run.");
        throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error("API returned an empty response body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.replace(/^data:\s*/, "");
          if (payload === "[DONE]") return result;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              result += delta;
              onChunk(delta);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }

      return result;
    }
  };
}

function filterScenarios(scenarioCatalog, rawIds, limit) {
  let scenarios = [...scenarioCatalog];
  if (rawIds) {
    const requested = new Set(
      rawIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    scenarios = scenarios.filter((scenario) => requested.has(scenario.id));
  }
  if (limit) {
    scenarios = scenarios.slice(0, limit);
  }
  return scenarios;
}

async function waitForTaskCompletion(runner, taskId, timeoutMs) {
  const startedAt = Date.now();
  let lastStatus = "";
  let lastSummary = "";

  while (true) {
    const task = runner.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} disappeared during soak run.`);
    if (task.status !== lastStatus || task.summary !== lastSummary) {
      lastStatus = task.status;
      lastSummary = task.summary ?? "";
      const tail = task.summary?.trim() ? ` | ${task.summary.trim()}` : "";
      console.log(`[task ${task.id}] ${task.status}${tail}`);
    }
    if (task.status !== "running") return task;
    if ((Date.now() - startedAt) > timeoutMs) {
      await runner.stopTask(taskId);
      throw new Error(`Task ${taskId} exceeded timeout of ${timeoutMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function writeOutputFile(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(stripUtf8Bom(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function loadScenarioCatalog(scenariosFile) {
  if (!scenariosFile) return [...AGENT_SOAK_SCENARIOS];
  const raw = await readJsonFile(resolve(scenariosFile), []);
  const scenarios = normalizeAgentSoakScenarios(raw);
  if (scenarios.length === 0) {
    throw new Error(`No valid agent soak scenarios were found in ${resolve(scenariosFile)}.`);
  }
  return scenarios;
}

async function writeReport(workspaceRoot, markdownPath, jsonPath, historyPath, historyLimit, runner, scenarioCatalog) {
  const existingHistory = normalizeAgentSoakHistory(await readJsonFile(historyPath, { version: 1, runs: [] }));
  const currentReport = buildAgentSoakReport(scenarioCatalog, runner.listTasks(), new Date().toISOString());
  const nextHistory = appendAgentSoakHistory(existingHistory, currentReport, historyLimit);
  const report = attachAgentSoakTrendSummary(currentReport, nextHistory);
  await writeOutputFile(markdownPath, formatAgentSoakMarkdown(report));
  await writeOutputFile(jsonPath, JSON.stringify(report, null, 2));
  await writeOutputFile(historyPath, JSON.stringify(nextHistory, null, 2));
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolve(options.workspace);
  const markdownPath = resolve(options.markdown ?? join(workspaceRoot, "tmp", "agent-soak-report.md"));
  const jsonPath = resolve(options.json ?? join(workspaceRoot, "tmp", "agent-soak-report.json"));
  const historyPath = resolve(join(workspaceRoot, "tmp", "agent-soak-history.json"));
  const historyLimit = 30;
  const scenarioCatalog = await loadScenarioCatalog(options.scenariosFile);
  const scenarios = filterScenarios(scenarioCatalog, options.scenario, options.limit);

  if (scenarios.length === 0) {
    throw new Error("No soak scenarios selected.");
  }

  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Scenarios selected: ${scenarios.length}`);

  if (options.dryRun) {
    for (const scenario of scenarios) {
      console.log(`- ${scenario.id}: ${scenario.title}`);
    }
    return;
  }

  const { settings: loadedSettings, settingsPath, warnings } = await loadSettings(options.settings);
  const settings = applyRoutePreference(loadedSettings, options, warnings);
  if (settingsPath) {
    console.log(`Settings: ${settingsPath}`);
  } else {
    console.log("Settings: using defaults/env only");
  }
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  const canRunCloud = Boolean(settings.apiKey);
  const canRunLocal = settings.ollamaEnabled && (settings.ollamaModels?.length ?? 0) > 0;
  if (!canRunCloud && !canRunLocal) {
    throw new Error("No usable agent routes found. Provide an API key or enable Ollama models in the loaded settings.");
  }

  const settingsStore = createSettingsStore(settings);
  const ccrService = createCcrShim(settingsStore);
  const runner = new AgentTaskRunner(workspaceRoot, settingsStore, ccrService);

  for (const [index, scenario] of scenarios.entries()) {
    console.log(`\n[${index + 1}/${scenarios.length}] ${scenario.id} :: ${scenario.title}`);
    const task = await runner.startTask(scenario.prompt);
    let completedTask = null;
    try {
      completedTask = await waitForTaskCompletion(runner, task.id, options.timeoutMs);
      console.log(`Completed ${scenario.id}: ${completedTask.status}${completedTask.summary ? ` | ${completedTask.summary}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Scenario ${scenario.id} failed to finish cleanly: ${message}`);
    } finally {
      if (options.restoreBetween) {
        const rollbackSnapshotId = runner.getTask(task.id)?.rollbackSnapshotId;
        if (rollbackSnapshotId) {
          const restore = await runner.restoreSnapshot(rollbackSnapshotId);
          console.log(`Restore ${scenario.id}: ${restore.ok ? "ok" : "failed"} | ${restore.message}`);
        }
      }
    }

    if (options.delayMs > 0 && index < scenarios.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  const report = await writeReport(workspaceRoot, markdownPath, jsonPath, historyPath, historyLimit, runner, scenarioCatalog);
  console.log(`\nSoak run finished. Report: ${markdownPath}`);
  console.log(`Run: ${report.totals.run}/${report.totals.scenarios}, failed: ${report.totals.failed}, blacklisted scenarios: ${report.totals.blacklistedScenarios}`);
  if (report.trends) {
    console.log(`History: ${report.trends.runsTracked} run(s) tracked, avg failed ${report.trends.averageFailed.toFixed(2)}`);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
