import { dialog, type BrowserWindow } from "electron";
import { createWriteStream } from "node:fs";
import { access, mkdir, open, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  getCloudProviderDisplayName,
  inferCloudProvider
} from "../../shared/modelCatalog";
import type {
  GeneratedImageHistoryPage,
  GeneratedImageHistoryItem,
  GeneratedImageAsset,
  ImageHistoryListRequest,
  ImageGenerationAspectRatio,
  ImageProvider,
  ImageGenerationRequest,
  ImageHistoryMutationResult,
  ImageGenerationResult,
  ImageSaveResult
} from "../../shared/types";
import type { GeneratedImagesStore } from "./generatedImagesStore";
import type { SettingsStore } from "./settingsStore";

const DEFAULT_OPENROUTER_IMAGE_MODEL = "google/gemini-2.5-flash-image";
const DEFAULT_NVIDIA_IMAGE_MODEL = "black-forest-labs/flux.1-schnell";
const DEFAULT_COMFYUI_IMAGE_MODEL = "sd_xl_base_1.0.safetensors";
const LEGACY_NVIDIA_IMAGE_MODEL_ALIASES: Record<string, string> = {
  "black-forest-labs/flux_1-schnell": DEFAULT_NVIDIA_IMAGE_MODEL
};
const DEFAULT_ASPECT_RATIO: ImageGenerationAspectRatio = "1:1";
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
const NVIDIA_IMAGE_API_BASE_URL = "https://ai.api.nvidia.com/v1/genai";
const COMFYUI_DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const COMFYUI_FALLBACK_BASE_URL = "http://127.0.0.1:8188";
const COMFYUI_POLL_INTERVAL_MS = 1_000;
const COMFYUI_NEGATIVE_PROMPT = "blurry, low quality, deformed, extra fingers, extra limbs, bad anatomy, text, watermark, logo";
const COMFYUI_STARTUP_TIMEOUT_MS = 45_000;
const COMFYUI_AUTO_LAUNCH_CONFIG_NAME = "cipher-comfyui-extra-model-paths.yaml";
const COMFYUI_STDOUT_LOG_NAME = "cipher-comfyui-stdout.log";
const COMFYUI_STDERR_LOG_NAME = "cipher-comfyui-stderr.log";
const COMFYUI_DISABLE_ALL_CUSTOM_NODES_ARG = "--disable-all-custom-nodes";

interface ImageGenerationServiceRuntime {
  fetch: typeof fetch;
  spawn: typeof spawn;
  createWriteStream: typeof createWriteStream;
  access(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  readSafetensorsHeader?(
    path: string
  ): Promise<{ fileSize: number; headerLength: number; header: Buffer }>;
}

interface ComfyUiLaunchSpec {
  pythonPath: string;
  mainPath: string;
  workingDirectory: string;
  documentsRoot: string;
}

const defaultImageGenerationServiceRuntime: ImageGenerationServiceRuntime = {
  fetch: (input: URL | RequestInfo, init?: RequestInit) => globalThis.fetch(input, init),
  spawn,
  createWriteStream,
  access,
  mkdir: async (path: string, options?: { recursive?: boolean }) => {
    await mkdir(path, options);
  },
  writeFile: async (path: string, data: string) => {
    await writeFile(path, data, "utf8");
  },
  sleep: (ms: number) => sleep(ms),
  readSafetensorsHeader: async (path: string) => {
    const stats = await stat(path);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${path}`);
    }
    const handle = await open(path, "r");
    try {
      if (stats.size < 8) {
        return {
          fileSize: stats.size,
          headerLength: 0,
          header: Buffer.alloc(0)
        };
      }
      const lenBuffer = Buffer.alloc(8);
      await handle.read(lenBuffer, 0, 8, 0);
      const headerLengthBig = lenBuffer.readBigUInt64LE(0);
      if (headerLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        return {
          fileSize: stats.size,
          headerLength: Number.MAX_SAFE_INTEGER,
          header: Buffer.alloc(0)
        };
      }
      const headerLength = Number(headerLengthBig);
      const maxHeaderBytes = 8 * 1024 * 1024;
      const readableHeaderBytes = headerLength > 0
        ? Math.min(headerLength, Math.max(0, stats.size - 8), maxHeaderBytes)
        : 0;
      const header = Buffer.alloc(readableHeaderBytes);
      if (readableHeaderBytes > 0) {
        await handle.read(header, 0, readableHeaderBytes, 8);
      }
      return {
        fileSize: stats.size,
        headerLength,
        header
      };
    } finally {
      await handle.close();
    }
  }
};

const NVIDIA_IMAGE_ENDPOINTS: Record<string, string> = {
  [DEFAULT_NVIDIA_IMAGE_MODEL]: `${NVIDIA_IMAGE_API_BASE_URL}/black-forest-labs/flux.1-schnell`,
  "black-forest-labs/flux.1-dev": `${NVIDIA_IMAGE_API_BASE_URL}/black-forest-labs/flux.1-dev`
};

interface ImageGenerationResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      images?: Array<{
        image_url?: { url?: unknown };
      }>;
    };
  }>;
}

interface NvidiaArtifactLike {
  base64?: unknown;
  b64_json?: unknown;
  mime_type?: unknown;
  media_type?: unknown;
}

interface NvidiaImageGenerationResponse {
  artifacts?: NvidiaArtifactLike[];
  image?: unknown;
  images?: unknown;
  data?: unknown;
}

interface ComfyUiPromptResponse {
  prompt_id?: unknown;
  error?: unknown;
  node_errors?: unknown;
}

interface ComfyUiImageRef {
  filename?: unknown;
  subfolder?: unknown;
  type?: unknown;
}

interface ComfyUiHistoryItem {
  outputs?: Record<string, { images?: ComfyUiImageRef[] }>;
  status?: {
    completed?: unknown;
    status_str?: unknown;
    messages?: unknown;
  };
}

function toComfyUiOptionStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => toComfyUiOptionStringList(item));
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const nested = record["options"] ?? record["choices"] ?? record["values"];
    if (nested !== undefined) return toComfyUiOptionStringList(nested);
  }
  return [];
}

function extractComfyUiCheckpointOptionsFromNode(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const input = (record["input"] ?? record["inputs"]) as Record<string, unknown> | undefined;
  if (!input || typeof input !== "object") return [];
  const required = input["required"] as Record<string, unknown> | undefined;
  const optional = input["optional"] as Record<string, unknown> | undefined;

  const candidates: unknown[] = [];
  if (required?.["ckpt_name"] !== undefined) candidates.push(required["ckpt_name"]);
  if (optional?.["ckpt_name"] !== undefined) candidates.push(optional["ckpt_name"]);

  const extracted = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((entry) => toComfyUiOptionStringList(entry));
    }
    return toComfyUiOptionStringList(candidate);
  });

  return [...new Set(
    extracted.filter((name) => /\.(safetensors|ckpt)$/i.test(name))
  )];
}

function extractComfyUiCheckpointChoices(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = extractComfyUiCheckpointOptionsFromNode(root);
  if (direct.length > 0) return direct;

  const checkpointNode = root["CheckpointLoaderSimple"];
  const fromCheckpointNode = extractComfyUiCheckpointOptionsFromNode(checkpointNode);
  if (fromCheckpointNode.length > 0) return fromCheckpointNode;

  const aggregated = Object.values(root).flatMap((value) => extractComfyUiCheckpointOptionsFromNode(value));
  return [...new Set(aggregated)];
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUsefulComfyUiErrorText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== "error"
    && normalized !== "failed"
    && normalized !== "failure"
    && normalized !== "execution error"
    && normalized !== "execution_error"
    && normalized !== "execution start"
    && normalized !== "execution_start";
}

function normalizeComfyUiEventLabel(value: string): string {
  return value.replace(/_/g, " ").trim();
}

function parseComfyUiTracebackText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isComfyUiStderrFlushErrno22(tracebackText: string, detail: string): boolean {
  if (!/\[errno\s*22\]|invalid argument/i.test(detail)) return false;
  const normalizedTrace = tracebackText.toLowerCase();
  if (!normalizedTrace.includes("flush")) return false;
  return normalizedTrace.includes("custom_nodes\\comfyui-manager\\prestartup_script.py")
    || normalizedTrace.includes("custom_nodes/comfyui-manager/prestartup_script.py")
    || normalizedTrace.includes("\\app\\logger.py")
    || normalizedTrace.includes("/app/logger.py");
}

function extractComfyUiErrorFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    const direct = value.trim();
    return isUsefulComfyUiErrorText(direct) ? direct : "";
  }

  if (Array.isArray(value)) {
    if (value.length > 1) {
      const event = asTrimmedString(value[0]);
      const detail = extractComfyUiErrorFromUnknown(value[1]);
      if (detail) {
        const eventLabel = normalizeComfyUiEventLabel(event);
        if (!eventLabel || /execution error/i.test(eventLabel)) return detail;
        if (detail.toLowerCase().includes(eventLabel.toLowerCase())) return detail;
        return `${eventLabel}: ${detail}`;
      }
    }

    const startIndex = typeof value[0] === "string" ? 1 : 0;
    for (let index = startIndex; index < value.length; index += 1) {
      const detail = extractComfyUiErrorFromUnknown(value[index]);
      if (detail) return detail;
    }
    return "";
  }

  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;

  const direct = [
    record["exception_message"],
    record["message"],
    record["details"],
    record["error"],
    record["reason"]
  ]
    .map((entry) => asTrimmedString(entry))
    .find((entry) => isUsefulComfyUiErrorText(entry))
    ?? "";

  let detail = direct;
  if (!detail) {
    const errors = Array.isArray(record["errors"]) ? record["errors"] : [];
    for (const entry of errors) {
      detail = extractComfyUiErrorFromUnknown(entry);
      if (detail) break;
    }
  }

  if (!detail) {
    const nestedKeys = ["node_errors", "payload", "data", "result", "status", "current_inputs"];
    for (const key of nestedKeys) {
      detail = extractComfyUiErrorFromUnknown(record[key]);
      if (detail) break;
    }
  }

  if (!detail) return "";
  const tracebackText = parseComfyUiTracebackText(record["traceback"]);
  if (tracebackText && isComfyUiStderrFlushErrno22(tracebackText, detail)) {
    detail = "ComfyUI runtime log stream failed during sampling ([Errno 22]). Restart ComfyUI with custom nodes disabled and try again.";
  }

  const nodeType = asTrimmedString(record["node_type"]);
  const nodeIdValue = record["node_id"];
  const nodeId = typeof nodeIdValue === "number" && Number.isFinite(nodeIdValue)
    ? String(nodeIdValue)
    : asTrimmedString(nodeIdValue);
  const currentInputs = record["current_inputs"] && typeof record["current_inputs"] === "object"
    ? (record["current_inputs"] as Record<string, unknown>)
    : null;
  const checkpointName = currentInputs ? asTrimmedString(currentInputs["ckpt_name"]) : "";

  let enriched = detail;
  if (nodeType && !enriched.toLowerCase().includes(nodeType.toLowerCase())) {
    const nodeLabel = nodeId ? `${nodeType} #${nodeId}` : nodeType;
    enriched = `${nodeLabel}: ${enriched}`;
  }
  if (checkpointName && !enriched.includes(checkpointName)) {
    enriched = `${enriched} (checkpoint: ${checkpointName})`;
  }
  return enriched;
}

function sanitizeFileName(value: string): string {
  const compact = (value ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-");
  return compact.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function buildSuggestedImageFileName(prompt: string, mimeType: string): string {
  const base = sanitizeFileName(prompt).slice(0, 48) || "cipher-generated-image";
  const ext = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/webp" ? ".webp" : ".png";
  return `${base}${ext}`;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } {
  const match = (dataUrl ?? "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Generated image is not a valid base64 data URL.");
  }

  return {
    mimeType: match[1] ?? "image/png",
    bytes: Buffer.from(match[2] ?? "", "base64")
  };
}

function normalizeImageAssets(rawImages: unknown): GeneratedImageAsset[] {
  if (!Array.isArray(rawImages)) return [];

  return rawImages
    .map((entry) => {
      const url = typeof entry === "object" && entry
        ? (entry as { image_url?: { url?: unknown } }).image_url?.url
        : undefined;
      const dataUrl = typeof url === "string" ? url.trim() : "";
      if (!dataUrl.startsWith("data:image/")) return null;
      const mimeType = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
      return { dataUrl, mimeType };
    })
    .filter((entry): entry is GeneratedImageAsset => Boolean(entry));
}

function buildDataUrlFromBase64(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function normalizeNvidiaImageAssets(payload: NvidiaImageGenerationResponse): GeneratedImageAsset[] {
  const fromArtifacts = Array.isArray(payload.artifacts)
    ? payload.artifacts
      .map((artifact) => {
        const base64 = typeof artifact?.base64 === "string"
          ? artifact.base64.trim()
          : typeof artifact?.b64_json === "string"
            ? artifact.b64_json.trim()
            : "";
        if (!base64) return null;
        const mimeType = typeof artifact?.mime_type === "string"
          ? artifact.mime_type.trim()
          : typeof artifact?.media_type === "string"
            ? artifact.media_type.trim()
            : "image/png";
        return {
          dataUrl: buildDataUrlFromBase64(base64, mimeType || "image/png"),
          mimeType: mimeType || "image/png"
        };
      })
      .filter((entry): entry is GeneratedImageAsset => Boolean(entry))
    : [];

  if (fromArtifacts.length > 0) return fromArtifacts;

  const fromDataArray = Array.isArray(payload.data)
    ? payload.data
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const b64 = typeof (entry as { b64_json?: unknown }).b64_json === "string"
          ? ((entry as { b64_json?: string }).b64_json ?? "").trim()
          : "";
        if (!b64) return null;
        return {
          dataUrl: buildDataUrlFromBase64(b64, "image/png"),
          mimeType: "image/png"
        };
      })
      .filter((entry): entry is GeneratedImageAsset => Boolean(entry))
    : [];

  if (fromDataArray.length > 0) return fromDataArray;

  const directImage = typeof payload.image === "string" ? payload.image.trim() : "";
  if (directImage) {
    return [{
      dataUrl: directImage.startsWith("data:image/")
        ? directImage
        : buildDataUrlFromBase64(directImage, "image/png"),
      mimeType: directImage.match(/^data:([^;,]+)/)?.[1] ?? "image/png"
    }];
  }

  if (Array.isArray(payload.images)) {
    return payload.images
      .map((entry) => {
        if (typeof entry === "string") {
          const normalized = entry.trim();
          if (!normalized) return null;
          return {
            dataUrl: normalized.startsWith("data:image/")
              ? normalized
              : buildDataUrlFromBase64(normalized, "image/png"),
            mimeType: normalized.match(/^data:([^;,]+)/)?.[1] ?? "image/png"
          };
        }
        if (!entry || typeof entry !== "object") return null;
        const image = typeof (entry as { image?: unknown }).image === "string"
          ? ((entry as { image?: string }).image ?? "").trim()
          : typeof (entry as { b64_json?: unknown }).b64_json === "string"
            ? ((entry as { b64_json?: string }).b64_json ?? "").trim()
            : "";
        if (!image) return null;
        const mimeType = typeof (entry as { mime_type?: unknown }).mime_type === "string"
          ? ((entry as { mime_type?: string }).mime_type ?? "").trim()
          : "image/png";
        return {
          dataUrl: image.startsWith("data:image/")
            ? image
            : buildDataUrlFromBase64(image, mimeType || "image/png"),
          mimeType: mimeType || "image/png"
        };
      })
      .filter((entry): entry is GeneratedImageAsset => Boolean(entry));
  }

  return [];
}

function normalizeAssistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

function getNvidiaImageEndpoint(model: string): string {
  const normalized = normalizeNvidiaImageModelId(model);
  return NVIDIA_IMAGE_ENDPOINTS[normalized] ?? NVIDIA_IMAGE_ENDPOINTS[DEFAULT_NVIDIA_IMAGE_MODEL];
}

function normalizeNvidiaImageModelId(model: string): string {
  const normalized = (model ?? "").trim();
  return LEGACY_NVIDIA_IMAGE_MODEL_ALIASES[normalized] ?? normalized;
}

function isNvidiaImageModel(model: string): boolean {
  const normalized = normalizeNvidiaImageModelId(model);
  return Boolean(NVIDIA_IMAGE_ENDPOINTS[normalized]);
}

function resolveImageModelForProvider(
  provider: ImageProvider,
  requestedModel: string
): string {
  const normalized = (requestedModel ?? "").trim();
  if (provider === "comfyui") {
    return normalized || DEFAULT_COMFYUI_IMAGE_MODEL;
  }
  if (provider === "nvidia") {
    const resolved = normalizeNvidiaImageModelId(normalized);
    return NVIDIA_IMAGE_ENDPOINTS[resolved] ? resolved : DEFAULT_NVIDIA_IMAGE_MODEL;
  }
  if (!normalized || isNvidiaImageModel(normalized)) return DEFAULT_OPENROUTER_IMAGE_MODEL;
  return normalized;
}

function mapAspectRatioToImageDimensions(aspectRatio: ImageGenerationAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case "2:1":
      return { width: 1408, height: 704 };
    case "1:2":
      return { width: 704, height: 1408 };
    case "16:9":
      return { width: 1344, height: 768 };
    case "9:16":
      return { width: 768, height: 1344 };
    case "4:3":
      return { width: 1280, height: 960 };
    case "3:2":
      return { width: 1152, height: 768 };
    case "2:3":
      return { width: 768, height: 1152 };
    case "4:5":
      return { width: 1024, height: 1280 };
    case "5:4":
      return { width: 1280, height: 1024 };
    case "3:4":
      return { width: 960, height: 1280 };
    case "21:9":
      return { width: 1344, height: 576 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

function normalizeConfiguredComfyUiBaseUrl(value: string): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return /^https?:\/\//i.test(normalized) ? normalized.replace(/\/+$/, "") : `http://${normalized.replace(/\/+$/, "")}`;
}

function buildComfyUiWorkflow(
  prompt: string,
  model: string,
  aspectRatio: ImageGenerationAspectRatio
): Record<string, unknown> {
  const { width, height } = mapAspectRatioToImageDimensions(aspectRatio);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  return {
    "4": {
      inputs: {
        ckpt_name: model
      },
      class_type: "CheckpointLoaderSimple"
    },
    "5": {
      inputs: {
        width,
        height,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "6": {
      inputs: {
        text: prompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "7": {
      inputs: {
        text: COMFYUI_NEGATIVE_PROMPT,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "8": {
      inputs: {
        seed,
        steps: 30,
        cfg: 6,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      },
      class_type: "KSampler"
    },
    "9": {
      inputs: {
        samples: ["8", 0],
        vae: ["4", 2]
      },
      class_type: "VAEDecode"
    },
    "10": {
      inputs: {
        filename_prefix: "cipher_comfyui",
        images: ["9", 0]
      },
      class_type: "SaveImage"
    }
  };
}

function extractComfyUiPromptError(payload: ComfyUiPromptResponse): string {
  const directError = extractComfyUiErrorFromUnknown(payload.error);
  if (directError) return directError;

  const nodeErrors = payload.node_errors;
  if (nodeErrors && typeof nodeErrors === "object") {
    for (const value of Object.values(nodeErrors as Record<string, unknown>)) {
      const nodeError = extractComfyUiErrorFromUnknown(value);
      if (nodeError) return nodeError;
    }
  }

  return "ComfyUI rejected the workflow. Check the selected checkpoint and local workflow nodes.";
}

function normalizeComfyUiImageRefs(history: ComfyUiHistoryItem | undefined): Array<{ filename: string; subfolder: string; type: string }> {
  if (!history?.outputs || typeof history.outputs !== "object") return [];
  const refs: Array<{ filename: string; subfolder: string; type: string }> = [];
  for (const output of Object.values(history.outputs)) {
    const images = output?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      const filename = typeof image?.filename === "string" ? image.filename.trim() : "";
      if (!filename) continue;
      refs.push({
        filename,
        subfolder: typeof image?.subfolder === "string" ? image.subfolder.trim() : "",
        type: typeof image?.type === "string" && image.type.trim() ? image.type.trim() : "output"
      });
    }
  }
  return refs;
}

function extractComfyUiHistoryError(history: ComfyUiHistoryItem | undefined): string {
  const status = history?.status;
  const messages = Array.isArray(status?.messages) ? status.messages : [];
  for (const entry of messages) {
    const detail = extractComfyUiErrorFromUnknown(entry);
    if (detail) return detail;
  }
  const statusDetail = extractComfyUiErrorFromUnknown(status);
  if (statusDetail) return statusDetail;
  return "ComfyUI failed while executing the workflow.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProviderKeyMissingMessage(provider: "openrouter" | "nvidia"): string {
  return provider === "nvidia"
    ? "No API key set. Add your NVIDIA key in Settings."
    : "No API key set. Add your OpenRouter key in Settings.";
}

function buildProviderAuthErrorMessage(provider: "openrouter" | "nvidia"): string {
  return provider === "nvidia"
    ? "Invalid API key. Check your NVIDIA key in Settings."
    : "Invalid API key. Check your OpenRouter key in Settings.";
}

function buildProviderRateLimitMessage(provider: "openrouter" | "nvidia"): string {
  return provider === "nvidia"
    ? "NVIDIA rate limit hit while generating the image. Try again in a moment."
    : "Rate limit hit while generating the image. Try again in a moment.";
}

function buildProviderBudgetMessage(provider: "openrouter" | "nvidia"): string {
  return provider === "nvidia"
    ? "NVIDIA image generation credits or free-tier capacity are unavailable right now."
    : "Insufficient OpenRouter credits/budget for image generation.";
}

export class ImageGenerationService {
  private comfyUiLaunchPromise: Promise<void> | null = null;
  private comfyUiProcess: ChildProcess | null = null;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly generatedImagesStore?: GeneratedImagesStore,
    private readonly runtime: ImageGenerationServiceRuntime = defaultImageGenerationServiceRuntime
  ) {}

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const settings = this.settingsStore.get();
    const provider = request.provider
      ?? settings.imageProvider
      ?? inferCloudProvider(settings.baseUrl, settings.cloudProvider);
    const prompt = (request.prompt ?? "").trim();
    const model = resolveImageModelForProvider(
      provider,
      (request.model ?? "").trim()
        || (provider === "comfyui"
          ? DEFAULT_COMFYUI_IMAGE_MODEL
          : provider === "nvidia"
            ? DEFAULT_NVIDIA_IMAGE_MODEL
            : DEFAULT_OPENROUTER_IMAGE_MODEL)
    );
    const aspectRatio = request.aspectRatio ?? DEFAULT_ASPECT_RATIO;

    if (!prompt) throw new Error("Image prompt is required.");
    if (provider !== "comfyui" && !settings.apiKey.trim()) {
      throw new Error(buildProviderKeyMissingMessage(provider));
    }
    if (provider === "comfyui") {
      await this.validateLocalComfyUiCheckpoint(model);
    }

    const result = provider === "comfyui"
      ? await this.generateWithComfyUi(prompt, model, aspectRatio, settings.comfyuiBaseUrl)
      : provider === "nvidia"
        ? await this.generateWithNvidia(prompt, model, aspectRatio, settings.apiKey)
        : await this.generateWithOpenRouter(prompt, model, aspectRatio, settings.apiKey, settings.baseUrl);
    const images = result.images;
    if (images.length === 0) {
      throw new Error("The provider returned no generated image assets.");
    }

    const historyItems = this.generatedImagesStore
      ? await this.generatedImagesStore.recordGeneration({
        prompt,
        model,
        aspectRatio,
        text: result.text,
        images
      })
      : [];

    const hydratedImages = historyItems.length === images.length
      ? historyItems.map((item) => ({
        id: item.id,
        dataUrl: item.dataUrl,
        mimeType: item.mimeType
      }))
      : images;

    return {
      provider,
      model,
      prompt,
      aspectRatio,
      text: result.text,
      images: hydratedImages
    };
  }

  private async resolveComfyUiBaseUrl(configuredBaseUrl?: string): Promise<string> {
    const candidates = [
      normalizeConfiguredComfyUiBaseUrl(configuredBaseUrl ?? ""),
      COMFYUI_DEFAULT_BASE_URL,
      COMFYUI_FALLBACK_BASE_URL
    ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

    for (const candidate of candidates) {
      if (await this.canReachComfyUi(candidate)) return candidate;
    }

    await this.ensureComfyUiStarted(candidates[0] ?? COMFYUI_DEFAULT_BASE_URL);

    for (const candidate of candidates) {
      if (await this.canReachComfyUi(candidate)) return candidate;
    }

    throw new Error(`ComfyUI is not reachable. Start ComfyUI and check the base URL. Tried ${candidates.join(", ")}.`);
  }

  private async canReachComfyUi(baseUrl: string): Promise<boolean> {
    try {
      const response = await this.runtime.fetch(`${baseUrl}/system_stats`, {
        method: "GET",
        signal: AbortSignal.timeout(3_000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await this.runtime.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async validateLocalComfyUiCheckpoint(model: string): Promise<void> {
    const checkpointName = (model ?? "").trim();
    if (!checkpointName || !/\.safetensors$/i.test(checkpointName)) return;
    const checkpointPath = join(process.cwd(), "models", "comfyui", "checkpoints", checkpointName);
    if (!await this.pathExists(checkpointPath)) return;
    if (!this.runtime.readSafetensorsHeader) return;

    let inspected: { fileSize: number; headerLength: number; header: Buffer };
    try {
      inspected = await this.runtime.readSafetensorsHeader(checkpointPath);
    } catch {
      throw new Error(`Local ComfyUI checkpoint "${checkpointName}" could not be read as safetensors. Re-download the checkpoint.`);
    }

    const { fileSize, headerLength, header } = inspected;
    if (fileSize < 8) {
      throw new Error(`Local ComfyUI checkpoint "${checkpointName}" is too small (${fileSize} bytes). Re-download the checkpoint.`);
    }
    if (!Number.isFinite(headerLength) || headerLength <= 0) {
      throw new Error(`Local ComfyUI checkpoint "${checkpointName}" has an invalid safetensors header. Re-download the checkpoint.`);
    }
    if (headerLength > (fileSize - 8)) {
      throw new Error(
        `Local ComfyUI checkpoint "${checkpointName}" appears incomplete/corrupt (header expects ${headerLength} bytes, file has ${fileSize} bytes). Re-download the checkpoint.`
      );
    }
    if (headerLength > header.length) return;

    let maxDataEnd = 0n;
    const dataOffsetPattern = /"data_offsets"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
    const headerText = header.toString("utf8");
    let match: RegExpExecArray | null = null;
    while ((match = dataOffsetPattern.exec(headerText)) !== null) {
      const end = BigInt(match[2] ?? "0");
      if (end > maxDataEnd) maxDataEnd = end;
    }
    if (maxDataEnd > BigInt(fileSize)) {
      throw new Error(
        `Local ComfyUI checkpoint "${checkpointName}" appears incomplete/corrupt (tensor data needs ${maxDataEnd} bytes, file has ${fileSize} bytes). Re-download the checkpoint.`
      );
    }
  }

  private async fetchComfyUiCheckpointChoices(baseUrl: string): Promise<string[] | null> {
    const endpoints = [
      `${baseUrl}/object_info/CheckpointLoaderSimple`,
      `${baseUrl}/object_info`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.runtime.fetch(endpoint, {
          method: "GET",
          signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) continue;
        const payload = await response.json();
        const choices = extractComfyUiCheckpointChoices(payload);
        if (choices.length > 0) return choices;
      } catch {
        // Best-effort preflight: keep generation flow running when metadata endpoints are unavailable.
      }
    }

    return null;
  }

  private async validateComfyUiCheckpointSelection(baseUrl: string, model: string): Promise<void> {
    const checkpointName = (model ?? "").trim();
    if (!checkpointName || !/\.(safetensors|ckpt)$/i.test(checkpointName)) return;

    const choices = await this.fetchComfyUiCheckpointChoices(baseUrl);
    if (!choices || choices.length === 0) return;

    const exactMatch = choices.includes(checkpointName);
    const caseInsensitiveMatch = choices.some((candidate) => candidate.toLowerCase() === checkpointName.toLowerCase());
    if (exactMatch || caseInsensitiveMatch) return;

    const preview = choices.slice(0, 8).join(", ");
    const suffix = choices.length > 8 ? ", ..." : "";
    throw new Error(
      `Local ComfyUI checkpoint "${checkpointName}" is not available in CheckpointLoaderSimple. Available checkpoints: ${preview}${suffix}`
    );
  }

  private parseComfyUiPort(baseUrl: string): number {
    try {
      const parsed = new URL(baseUrl);
      const explicitPort = Number.parseInt(parsed.port || "", 10);
      if (Number.isFinite(explicitPort) && explicitPort > 0) return explicitPort;
      return parsed.protocol === "https:" ? 443 : 80;
    } catch {
      return 8000;
    }
  }

  private async detectComfyUiLaunchSpec(): Promise<ComfyUiLaunchSpec | null> {
    const docsRoot = join(homedir(), "Documents", "ComfyUI");
    const localPrograms = process.env["LOCALAPPDATA"]?.trim()
      ? join(process.env["LOCALAPPDATA"].trim(), "Programs", "ComfyUI", "resources", "ComfyUI")
      : "";
    const pythonCandidates = [
      join(docsRoot, ".venv", "Scripts", "python.exe")
    ];
    const mainCandidates = [
      localPrograms ? join(localPrograms, "main.py") : "",
      join(docsRoot, "main.py")
    ].filter(Boolean);

    for (const pythonPath of pythonCandidates) {
      if (!await this.pathExists(pythonPath)) continue;
      for (const mainPath of mainCandidates) {
        if (!await this.pathExists(mainPath)) continue;
        return {
          pythonPath,
          mainPath,
          workingDirectory: dirname(mainPath) || docsRoot,
          documentsRoot: docsRoot
        };
      }
    }

    return null;
  }

  private async ensureComfyUiExtraModelConfig(spec: ComfyUiLaunchSpec): Promise<string | null> {
    const checkpointsPath = join(process.cwd(), "models", "comfyui", "checkpoints");
    if (!await this.pathExists(checkpointsPath)) return null;

    const configPath = join(tmpdir(), COMFYUI_AUTO_LAUNCH_CONFIG_NAME);
    const config = [
      "cipher_workspace:",
      `    base_path: ${join(process.cwd(), "models", "comfyui").replace(/\\/g, "/")}`,
      "    checkpoints: checkpoints"
    ].join("\n");
    await this.runtime.writeFile(configPath, `${config}\n`);
    return configPath;
  }

  private async ensureComfyUiStarted(baseUrl: string): Promise<void> {
    if (this.comfyUiLaunchPromise) {
      await this.comfyUiLaunchPromise;
      return;
    }

    this.comfyUiLaunchPromise = (async () => {
      if (await this.canReachComfyUi(baseUrl)) return;

      const spec = await this.detectComfyUiLaunchSpec();
      if (!spec) return;

      const port = this.parseComfyUiPort(baseUrl);
      const extraModelConfig = await this.ensureComfyUiExtraModelConfig(spec);
      const args = [spec.mainPath, "--port", String(port), COMFYUI_DISABLE_ALL_CUSTOM_NODES_ARG];
      if (extraModelConfig) {
        args.push("--extra-model-paths-config", extraModelConfig);
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        try {
          const child = this.runtime.spawn(spec.pythonPath, args, {
            cwd: spec.workingDirectory,
            detached: true,
            windowsHide: true,
            stdio: "ignore"
          });
          this.comfyUiProcess = child;
          child.once("error", (error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
          child.once("spawn", () => {
            if (settled) return;
            settled = true;
            child.unref();
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });

      const startedAt = Date.now();
      while ((Date.now() - startedAt) < COMFYUI_STARTUP_TIMEOUT_MS) {
        if (await this.canReachComfyUi(baseUrl)) return;
        await this.runtime.sleep(COMFYUI_POLL_INTERVAL_MS);
      }
    })().finally(() => {
      this.comfyUiLaunchPromise = null;
    });

    await this.comfyUiLaunchPromise;
  }

  private async waitForComfyUiHistory(baseUrl: string, promptId: string): Promise<ComfyUiHistoryItem> {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < IMAGE_GENERATION_TIMEOUT_MS) {
      const response = await this.runtime.fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        method: "GET",
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        throw new Error(`ComfyUI history lookup failed with HTTP ${response.status}.`);
      }

      const payload = await response.json() as Record<string, ComfyUiHistoryItem>;
      const history = payload[promptId];
      if (history) {
        const status = history.status;
        const refs = normalizeComfyUiImageRefs(history);
        if (refs.length > 0) return history;
        if (status?.completed === false || status?.status_str === "error") {
          throw new Error(extractComfyUiHistoryError(history));
        }
        if (status?.completed === true) {
          throw new Error("ComfyUI finished the workflow but returned no images.");
        }
      }

      await sleep(COMFYUI_POLL_INTERVAL_MS);
    }

    throw new Error("ComfyUI timed out before returning generated images.");
  }

  private async fetchComfyUiImages(baseUrl: string, history: ComfyUiHistoryItem): Promise<GeneratedImageAsset[]> {
    const refs = normalizeComfyUiImageRefs(history);
    const assets: GeneratedImageAsset[] = [];

    for (const ref of refs) {
      const params = new URLSearchParams({
        filename: ref.filename,
        type: ref.type
      });
      if (ref.subfolder) params.set("subfolder", ref.subfolder);
      const response = await this.runtime.fetch(`${baseUrl}/view?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS)
      });
      if (!response.ok) {
        throw new Error(`ComfyUI image download failed with HTTP ${response.status}.`);
      }

      const mimeType = response.headers.get("content-type")?.trim() || "image/png";
      const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
      assets.push({
        dataUrl: buildDataUrlFromBase64(bytes, mimeType),
        mimeType
      });
    }

    return assets;
  }

  private async generateWithComfyUi(
    prompt: string,
    model: string,
    aspectRatio: ImageGenerationAspectRatio,
    configuredBaseUrl?: string
  ): Promise<{ text: string; images: GeneratedImageAsset[] }> {
    const baseUrl = await this.resolveComfyUiBaseUrl(configuredBaseUrl);
    await this.validateComfyUiCheckpointSelection(baseUrl, model);
    const workflow = buildComfyUiWorkflow(prompt, model, aspectRatio);
    const submitResponse = await this.runtime.fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: "cipher-workspace"
      }),
      signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS)
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      throw new Error(`ComfyUI prompt submission failed with HTTP ${submitResponse.status}: ${text.slice(0, 200)}`);
    }

    const submitPayload = await submitResponse.json() as ComfyUiPromptResponse;
    const promptId = typeof submitPayload.prompt_id === "string" ? submitPayload.prompt_id.trim() : "";
    if (!promptId) {
      throw new Error(extractComfyUiPromptError(submitPayload));
    }

    const history = await this.waitForComfyUiHistory(baseUrl, promptId);
    return {
      text: `Generated ${normalizeComfyUiImageRefs(history).length} image${normalizeComfyUiImageRefs(history).length === 1 ? "" : "s"} with ComfyUI ${model}.`,
      images: await this.fetchComfyUiImages(baseUrl, history)
    };
  }

  private async generateWithOpenRouter(
    prompt: string,
    model: string,
    aspectRatio: ImageGenerationAspectRatio,
    apiKey: string,
    baseUrl: string
  ): Promise<{ text: string; images: GeneratedImageAsset[] }> {
    const response = await this.runtime.fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cipher-ai.local",
        "X-Title": "Cipher Workspace"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        modalities: ["image", "text"],
        image_config: {
          aspect_ratio: aspectRatio
        },
        stream: false
      }),
      signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS)
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(buildProviderAuthErrorMessage("openrouter"));
      }
      if (response.status === 402) {
        throw new Error(buildProviderBudgetMessage("openrouter"));
      }
      if (response.status === 429) {
        throw new Error(buildProviderRateLimitMessage("openrouter"));
      }
      throw new Error(`Image generation failed with API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = await response.json() as ImageGenerationResponse;
    const message = payload.choices?.[0]?.message;
    return {
      text: normalizeAssistantText(message?.content),
      images: normalizeImageAssets(message?.images)
    };
  }

  private async generateWithNvidia(
    prompt: string,
    model: string,
    aspectRatio: ImageGenerationAspectRatio,
    apiKey: string
  ): Promise<{ text: string; images: GeneratedImageAsset[] }> {
    const dimensions = mapAspectRatioToImageDimensions(aspectRatio);
    const resolvedModel = resolveImageModelForProvider("nvidia", model);
    const response = await this.runtime.fetch(getNvidiaImageEndpoint(model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        prompt,
        width: dimensions.width,
        height: dimensions.height,
        samples: 1,
        seed: 0,
        steps: resolvedModel.includes("schnell") ? 4 : 28,
        ...(resolvedModel.includes("dev") ? { cfg_scale: 5 } : { cfg_scale: 0 }),
        mode: "base"
      }),
      signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS)
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(buildProviderAuthErrorMessage("nvidia"));
      }
      if (response.status === 402) {
        throw new Error(buildProviderBudgetMessage("nvidia"));
      }
      if (response.status === 429) {
        throw new Error(buildProviderRateLimitMessage("nvidia"));
      }
      throw new Error(`Image generation failed with NVIDIA API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = await response.json() as NvidiaImageGenerationResponse;
    return {
      text: `Generated 1 image with NVIDIA ${resolvedModel}.`,
      images: normalizeNvidiaImageAssets(payload)
    };
  }

  async listHistory(): Promise<GeneratedImageHistoryItem[]> {
    if (!this.generatedImagesStore) return [];
    return this.generatedImagesStore.list();
  }

  async listHistoryPage(request?: ImageHistoryListRequest): Promise<GeneratedImageHistoryPage> {
    if (!this.generatedImagesStore) {
      return {
        items: [],
        hasMore: false,
        nextOffset: 0,
        total: 0
      };
    }
    return this.generatedImagesStore.listPage(request);
  }

  async deleteHistoryItem(id: string): Promise<ImageHistoryMutationResult> {
    if (!this.generatedImagesStore) {
      return { ok: false, message: "Generated image history is not available." };
    }

    const deleted = await this.generatedImagesStore.delete((id ?? "").trim());
    return deleted
      ? { ok: true, message: "Deleted image from history." }
      : { ok: false, message: "Image history item not found." };
  }

  async saveImage(mainWindow: BrowserWindow, dataUrl: string, suggestedName?: string, historyId?: string): Promise<ImageSaveResult> {
    const { mimeType, bytes } = parseDataUrl(dataUrl);
    const defaultPath = buildSuggestedImageFileName(suggestedName || "cipher-generated-image", mimeType);
    const save = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [
        {
          name: "Image",
          extensions: [extname(defaultPath).replace(/^\./, "") || "png"]
        }
      ]
    });

    if (save.canceled || !save.filePath) {
      return { ok: false, message: "Image save cancelled." };
    }

    await writeFile(save.filePath, bytes);
    const normalizedHistoryId = (historyId ?? "").trim();
    if (this.generatedImagesStore && normalizedHistoryId) {
      await this.generatedImagesStore.markSaved(normalizedHistoryId, save.filePath);
    }
    return {
      ok: true,
      message: `Saved image to ${basename(save.filePath)}.`,
      path: save.filePath
    };
  }
}
