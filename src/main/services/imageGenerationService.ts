import { dialog, type BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  getCloudProviderDisplayName,
  inferCloudProvider
} from "../../shared/modelCatalog";
import type {
  GeneratedImageHistoryItem,
  GeneratedImageAsset,
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
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message?: string }).message ?? "").trim()
      : "";
    const details = typeof (error as { details?: unknown }).details === "string"
      ? ((error as { details?: string }).details ?? "").trim()
      : "";
    if (message && details) return `${message}: ${details}`;
    if (message) return message;
    if (details) return details;
  }

  const nodeErrors = payload.node_errors;
  if (nodeErrors && typeof nodeErrors === "object") {
    for (const value of Object.values(nodeErrors as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const errors = (value as { errors?: unknown }).errors;
      if (!Array.isArray(errors) || errors.length === 0) continue;
      const first = errors[0];
      if (!first || typeof first !== "object") continue;
      const message = typeof (first as { message?: unknown }).message === "string"
        ? ((first as { message?: string }).message ?? "").trim()
        : "";
      const details = typeof (first as { details?: unknown }).details === "string"
        ? ((first as { details?: string }).details ?? "").trim()
        : "";
      if (message && details) return `${message}: ${details}`;
      if (message) return message;
      if (details) return details;
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
    if (Array.isArray(entry) && entry.length > 1 && typeof entry[1] === "string" && entry[1].trim()) {
      return entry[1].trim();
    }
    if (entry && typeof entry === "object") {
      const message = typeof (entry as { message?: unknown }).message === "string"
        ? ((entry as { message?: string }).message ?? "").trim()
        : "";
      if (message) return message;
    }
  }
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
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly generatedImagesStore?: GeneratedImagesStore
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
      try {
        const response = await fetch(`${candidate}/system_stats`, {
          method: "GET",
          signal: AbortSignal.timeout(3_000)
        });
        if (response.ok) return candidate;
      } catch {
        continue;
      }
    }

    throw new Error(`ComfyUI is not reachable. Start ComfyUI and check the base URL. Tried ${candidates.join(", ")}.`);
  }

  private async waitForComfyUiHistory(baseUrl: string, promptId: string): Promise<ComfyUiHistoryItem> {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < IMAGE_GENERATION_TIMEOUT_MS) {
      const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
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
      const response = await fetch(`${baseUrl}/view?${params.toString()}`, {
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
    const workflow = buildComfyUiWorkflow(prompt, model, aspectRatio);
    const submitResponse = await fetch(`${baseUrl}/prompt`, {
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
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
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
    const response = await fetch(getNvidiaImageEndpoint(model), {
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
