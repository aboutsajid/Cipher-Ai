import type { Settings } from "./types";

export type CloudProvider = "openrouter" | "nvidia";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const OPENROUTER_DEFAULT_MODEL = "qwen/qwen3.6-plus";
export const OPENROUTER_THINK_MODEL = "deepseek/deepseek-v3.2";
export const OPENROUTER_LONG_CONTEXT_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";
export const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
export const NVIDIA_THINK_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5";
export const NVIDIA_LONG_CONTEXT_MODEL = "meta/llama-3.3-70b-instruct";
export type CloudModelSelectionStage = "general" | "planner" | "generator" | "repair" | "verification" | "approval";
export interface CloudModelSelectionOptions {
  requiresVision?: boolean;
}
export interface ModelCapabilityHints {
  coding: number;
  reasoning: number;
  longContext: number;
  vision: boolean;
}

export const OPENROUTER_RECOMMENDED_MODELS = [
  OPENROUTER_DEFAULT_MODEL,
  "qwen/qwen3.6-plus-preview",
  "qwen/qwen3-coder-flash",
  "qwen/qwen3-coder:free",
  OPENROUTER_LONG_CONTEXT_MODEL,
  "google/gemma-4-31b-it",
  OPENROUTER_THINK_MODEL
] as const;
export const NVIDIA_RECOMMENDED_MODELS = [
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_THINK_MODEL,
  NVIDIA_LONG_CONTEXT_MODEL,
  "nvidia/nemotron-3-nano-30b-a3b",
  "deepseek-ai/deepseek-r1-distill-qwen-32b"
] as const;

export const LOCAL_CODER_PRIMARY_MODEL = "qwen2.5-coder:14b";
export const LOCAL_CODER_FALLBACK_MODEL = "qwen2.5-coder:7b";

export const OPENROUTER_DEFAULT_ROUTING: Settings["routing"] = {
  default: OPENROUTER_DEFAULT_MODEL,
  think: OPENROUTER_THINK_MODEL,
  longContext: OPENROUTER_LONG_CONTEXT_MODEL
};
export const NVIDIA_DEFAULT_ROUTING: Settings["routing"] = {
  default: NVIDIA_DEFAULT_MODEL,
  think: NVIDIA_THINK_MODEL,
  longContext: NVIDIA_LONG_CONTEXT_MODEL
};

const LEGACY_OPENROUTER_DEFAULT_MODEL = "qwen/qwen3-coder:free";
const LEGACY_OPENROUTER_MODELS = [
  "qwen/qwen3-coder:free",
  "qwen/qwen-2.5-coder-32b-instruct",
  "google/gemma-4-31b-it",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-14b",
  "deepseek/deepseek-chat-v3-0324"
];
const LEGACY_OPENROUTER_ROUTING: Settings["routing"] = {
  default: LEGACY_OPENROUTER_DEFAULT_MODEL,
  think: "meta-llama/llama-3.3-70b-instruct:free",
  longContext: "google/gemini-2.0-flash-001"
};

function sameOrderedValues(left: string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function normalizeModelId(model: string): string {
  const normalized = (model ?? "").trim().toLowerCase();
  return normalized.startsWith("ollama/") ? normalized.slice("ollama/".length) : normalized;
}

export function inferCloudProvider(baseUrl: string, preferredProvider?: string): CloudProvider {
  const normalizedPreferred = (preferredProvider ?? "").trim().toLowerCase();
  if (normalizedPreferred === "nvidia") return "nvidia";
  if (normalizedPreferred === "openrouter") return "openrouter";

  const normalizedBaseUrl = (baseUrl ?? "").trim().toLowerCase();
  return normalizedBaseUrl.includes("nvidia.com") ? "nvidia" : "openrouter";
}

export function getCloudProviderDisplayName(provider: CloudProvider): "OpenRouter" | "NVIDIA" {
  return provider === "nvidia" ? "NVIDIA" : "OpenRouter";
}

export function getDefaultBaseUrlForCloudProvider(provider: CloudProvider): string {
  return provider === "nvidia" ? NVIDIA_BASE_URL : OPENROUTER_BASE_URL;
}

export function getModelCapabilityHints(model: string): ModelCapabilityHints {
  const normalized = normalizeModelId(model);
  if (!normalized) {
    return {
      coding: 0,
      reasoning: 0,
      longContext: 0,
      vision: false
    };
  }

  const coding = /coder|code|devstral|starcoder|codellama|granite-code|deepcoder|program|software/.test(normalized)
    ? 8
    : /qwen|deepseek|gpt-oss/.test(normalized)
      ? 2
      : 0;
  const reasoning = /r1|reason|think|o1|o3|deepseek|claude|gemini|gpt-oss|terminus/.test(normalized)
    ? 6
    : /llama-3\.[13]|qwen3/.test(normalized)
      ? 2
      : 0;
  const longContext = /gemini|claude|gpt-4\.1|gpt-4o|long|128k|200k|1m/.test(normalized)
    ? 8
    : /llama-3\.[13]|qwen3|deepseek/.test(normalized)
      ? 3
      : 0;
  const vision = /(^|[-_/])vl([:-]|$)|vision|ocr|image|video|pixtral|llava|minicpm-v|gpt-4o|gpt-4\.1|gemini|claude/.test(normalized);

  return {
    coding,
    reasoning,
    longContext,
    vision
  };
}

export function getModelCapabilityTags(model: string): string[] {
  const hints = getModelCapabilityHints(model);
  const tags: string[] = [];
  if (hints.coding > 0) tags.push("coder");
  if (hints.reasoning >= 6) tags.push("reasoning");
  if (hints.longContext >= 8) tags.push("long-context");
  if (hints.vision) tags.push("vision");
  return tags;
}

export function scoreCloudModelForStage(
  model: string,
  stage: CloudModelSelectionStage,
  options: CloudModelSelectionOptions = {}
): number {
  const hints = getModelCapabilityHints(model);
  const stageScore = stage === "planner"
    ? (hints.longContext * 3) + (hints.reasoning * 2) + hints.coding
    : stage === "generator"
      ? (hints.coding * 3) + hints.reasoning + hints.longContext
      : stage === "repair"
        ? (hints.coding * 3) + (hints.reasoning * 2) + hints.longContext
        : stage === "verification" || stage === "approval"
        ? (hints.reasoning * 3) + (hints.coding * 2) + hints.longContext
          : (hints.coding * 2) + (hints.reasoning * 2) + hints.longContext;
  const visionPenalty = !options.requiresVision && hints.vision && hints.coding === 0 && stage !== "planner" ? -4 : 0;
  const visionBias = options.requiresVision
    ? (hints.vision ? (stage === "planner" ? 14 : 18) : -24)
    : 0;
  return stageScore + visionPenalty + visionBias;
}

export function isCodingFocusedModel(model: string): boolean {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized || normalized.startsWith("ollama/")) return false;
  if (/(^|[-_/])vl([:-]|$)|vision|ocr|image|video|tts|asr/.test(normalized)) return false;
  return /coder|code|devstral|starcoder|codellama|granite-code|program|software/.test(normalized);
}

export function buildRecommendedCloudModelList(preferred: string[] = [], provider: CloudProvider = "openrouter"): string[] {
  const stockModels = provider === "nvidia" ? NVIDIA_RECOMMENDED_MODELS : OPENROUTER_RECOMMENDED_MODELS;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const model of [...preferred, ...stockModels]) {
    const normalized = (model ?? "").trim();
    if (!normalized || normalized.startsWith("ollama/") || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

export function getDefaultCloudModelStrategy(provider: CloudProvider = "openrouter"): Pick<Settings, "defaultModel" | "models" | "routing"> {
  const defaults = provider === "nvidia"
    ? {
      defaultModel: NVIDIA_DEFAULT_MODEL,
      routing: NVIDIA_DEFAULT_ROUTING
    }
    : {
      defaultModel: OPENROUTER_DEFAULT_MODEL,
      routing: OPENROUTER_DEFAULT_ROUTING
    };
  return {
    defaultModel: defaults.defaultModel,
    models: buildRecommendedCloudModelList([], provider),
    routing: { ...defaults.routing }
  };
}

export function buildStagePreferredCloudModelList(
  settings: Pick<Settings, "defaultModel" | "models" | "routing">,
  stage: CloudModelSelectionStage,
  options: CloudModelSelectionOptions = {}
): string[] {
  const pool = uniqueNonEmpty([
    (settings.defaultModel ?? "").trim(),
    (settings.routing?.default ?? "").trim(),
    (settings.routing?.think ?? "").trim(),
    (settings.routing?.longContext ?? "").trim(),
    ...((settings.models ?? []).map((model) => (model ?? "").trim()))
  ].filter((model) => !model.startsWith("ollama/")));
  const routeBoost = (model: string): number => {
    if (!model) return 0;
    if (stage === "planner") {
      if (model === (settings.routing?.longContext ?? "").trim()) return 8;
      if (model === (settings.routing?.think ?? "").trim()) return 3;
      if (model === (settings.defaultModel ?? "").trim()) return 1;
      if (model === (settings.routing?.default ?? "").trim()) return 1;
      return 0;
    }
    if (stage === "repair") {
      if (model === (settings.routing?.think ?? "").trim()) return 4;
      if (model === (settings.defaultModel ?? "").trim()) return 2;
      if (model === (settings.routing?.default ?? "").trim()) return 2;
      if (model === (settings.routing?.longContext ?? "").trim()) return 1;
      return 0;
    }
    if (stage === "verification" || stage === "approval") {
      if (model === (settings.routing?.think ?? "").trim()) return 5;
      if (model === (settings.routing?.default ?? "").trim()) return 2;
      if (model === (settings.defaultModel ?? "").trim()) return 2;
      if (model === (settings.routing?.longContext ?? "").trim()) return 1;
      return 0;
    }
    if (model === (settings.defaultModel ?? "").trim()) return 4;
    if (model === (settings.routing?.default ?? "").trim()) return 4;
    if (model === (settings.routing?.think ?? "").trim()) return 1;
    if (model === (settings.routing?.longContext ?? "").trim()) return 1;
    return 0;
  };

  return [...pool]
    .map((model, index) => ({
      model,
      index,
      score: scoreCloudModelForStage(model, stage, options) + routeBoost(model)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.model);
}

export function isLegacyDefaultCloudModelStrategy(settings: Pick<Settings, "defaultModel" | "models" | "routing">): boolean {
  return (settings.defaultModel ?? "").trim() === LEGACY_OPENROUTER_DEFAULT_MODEL
    && sameOrderedValues((settings.models ?? []).map((value) => (value ?? "").trim()), LEGACY_OPENROUTER_MODELS)
    && (settings.routing?.default ?? "").trim() === LEGACY_OPENROUTER_ROUTING.default
    && (settings.routing?.think ?? "").trim() === LEGACY_OPENROUTER_ROUTING.think
    && (settings.routing?.longContext ?? "").trim() === LEGACY_OPENROUTER_ROUTING.longContext;
}
