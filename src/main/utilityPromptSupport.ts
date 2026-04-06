import type { Settings } from "../shared/types";

export interface UtilityRoute {
  model: string;
  baseUrl: string;
  apiKey: string;
  skipAuth: boolean;
}

export interface UtilityPromptSender {
  (
    history: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal | undefined,
    options: UtilityRoute
  ): Promise<unknown>;
}

export function pickOpenRouterModel(settings: Settings): string {
  const candidates = [settings.defaultModel, ...settings.models]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .filter((value) => !value.startsWith("ollama/"));

  if (candidates.length === 0) {
    throw new Error("No OpenRouter model configured.");
  }
  return candidates[0];
}

export function pickOllamaModel(settings: Settings): string {
  const prefixed = [settings.defaultModel, ...settings.models]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .filter((value) => value.startsWith("ollama/"))
    .map((value) => value.slice("ollama/".length))
    .filter(Boolean);

  if (prefixed.length > 0) return prefixed[0];

  const discovered = (settings.ollamaModels ?? [])
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  if (discovered.length > 0) return discovered[0];

  throw new Error("No Ollama model configured. Add an ollama/... model or click Refresh in Ollama settings.");
}

export function resolveUtilityRoute(settings: Settings): UtilityRoute {
  const apiKey = (settings.apiKey ?? "").trim();
  const defaultModel = (settings.defaultModel ?? "").trim();

  if (settings.ollamaEnabled && defaultModel.startsWith("ollama/")) {
    return {
      model: defaultModel.slice("ollama/".length),
      baseUrl: (settings.ollamaBaseUrl ?? "").trim() || "http://localhost:11434/v1",
      apiKey: "",
      skipAuth: true
    };
  }

  if (apiKey) {
    return {
      model: pickOpenRouterModel(settings),
      baseUrl: (settings.baseUrl ?? "").trim(),
      apiKey,
      skipAuth: false
    };
  }

  if (settings.ollamaEnabled) {
    return {
      model: pickOllamaModel(settings),
      baseUrl: (settings.ollamaBaseUrl ?? "").trim() || "http://localhost:11434/v1",
      apiKey: "",
      skipAuth: true
    };
  }

  throw new Error("Summary requires OpenRouter API key or Ollama enabled with an ollama/... model.");
}

export async function sendUtilityPrompt(settings: Settings, sendMessage: UtilityPromptSender, prompt: string): Promise<string> {
  const route = resolveUtilityRoute(settings);
  const history: Array<{ role: string; content: string }> = [{ role: "user", content: prompt }];
  let result = "";

  await sendMessage(
    history,
    route.model,
    (chunk) => {
      result += chunk;
    },
    undefined,
    route
  );

  const normalized = result.trim();
  if (!normalized) {
    throw new Error("Received empty response from model.");
  }
  return normalized;
}
