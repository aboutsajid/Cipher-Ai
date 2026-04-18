import type { Settings } from "../shared/types";
import { buildStagePreferredCloudModelList } from "../shared/modelCatalog";

export interface UtilityRoute {
  model: string;
  baseUrl: string;
  cloudProvider?: "openrouter" | "nvidia";
  apiKey: string;
  skipAuth: boolean;
}

export type UtilityRouteStage = "general" | "verification" | "repair" | "approval";

export interface UtilityPromptSender {
  (
    history: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal | undefined,
    options: UtilityRoute
  ): Promise<unknown>;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const normalized = (value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function getLocalCodingBias(model: string): number {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized) return 0;
  if (/(^|[-_/])vl([:-]|$)|vision|ocr|image|video/.test(normalized)) return -5;
  if (/coder|code|codellama|starcoder|granite-code|devstral/.test(normalized)) return 4;
  if (/qwen|deepseek|gpt-oss|gemma/.test(normalized)) return 1;
  return 0;
}

function rankLocalUtilityModels(models: string[], stage: UtilityRouteStage): string[] {
  return [...models].sort((left, right) => {
    const leftBias = getLocalCodingBias(left);
    const rightBias = getLocalCodingBias(right);
    if (stage === "repair") {
      if (rightBias !== leftBias) return rightBias - leftBias;
    } else if (stage === "verification" || stage === "approval") {
      const rightNonVision = rightBias < 0 ? -1 : 0;
      const leftNonVision = leftBias < 0 ? -1 : 0;
      if (rightNonVision !== leftNonVision) return rightNonVision - leftNonVision;
    }
    return left.localeCompare(right);
  });
}

export function pickCloudModel(settings: Settings, stage: UtilityRouteStage = "general"): string {
  const candidates = buildStagePreferredCloudModelList(settings, stage);

  if (candidates.length === 0) {
    throw new Error("No cloud model configured.");
  }
  return candidates[0];
}

export const pickOpenRouterModel = pickCloudModel;

export function pickOllamaModel(settings: Settings, stage: UtilityRouteStage = "general"): string {
  const prefixed = [settings.routing?.default, settings.defaultModel, ...settings.models]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .filter((value) => value.startsWith("ollama/"))
    .map((value) => value.slice("ollama/".length))
    .filter(Boolean);

  const discovered = (settings.ollamaModels ?? [])
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  const ranked = rankLocalUtilityModels(uniqueNonEmpty([...prefixed, ...discovered]), stage);
  if (ranked.length > 0) return ranked[0];

  throw new Error("No Ollama model configured. Add an ollama/... model or click Refresh in Ollama settings.");
}

export function resolveUtilityRoute(settings: Settings, stage: UtilityRouteStage = "general"): UtilityRoute {
  const apiKey = (settings.apiKey ?? "").trim();
  const defaultModel = (settings.defaultModel ?? "").trim();

  if (settings.ollamaEnabled && defaultModel.startsWith("ollama/")) {
    return {
      model: pickOllamaModel(settings, stage),
      baseUrl: (settings.ollamaBaseUrl ?? "").trim() || "http://localhost:11434/v1",
      apiKey: "",
      skipAuth: true
    };
  }

  if (apiKey) {
    return {
      model: pickCloudModel(settings, stage),
      baseUrl: (settings.baseUrl ?? "").trim(),
      ...(settings.cloudProvider ? { cloudProvider: settings.cloudProvider } : {}),
      apiKey,
      skipAuth: false
    };
  }

  if (settings.ollamaEnabled) {
    return {
      model: pickOllamaModel(settings, stage),
      baseUrl: (settings.ollamaBaseUrl ?? "").trim() || "http://localhost:11434/v1",
      apiKey: "",
      skipAuth: true
    };
  }

  throw new Error("Summary requires a cloud API key or Ollama enabled with an ollama/... model.");
}

export async function sendUtilityPrompt(
  settings: Settings,
  sendMessage: UtilityPromptSender,
  prompt: string,
  stage: UtilityRouteStage = "general"
): Promise<string> {
  const route = resolveUtilityRoute(settings, stage);
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
