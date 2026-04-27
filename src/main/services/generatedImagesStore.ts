import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GeneratedImageHistoryPage,
  GeneratedImageAsset,
  GeneratedImageHistoryItem,
  ImageHistoryListRequest,
  ImageGenerationAspectRatio
} from "../../shared/types";

interface StoredGeneratedImageHistoryItem {
  id: string;
  generationId: string;
  prompt: string;
  model: string;
  aspectRatio: ImageGenerationAspectRatio;
  text: string;
  mimeType: string;
  assetFileName: string;
  createdAt: string;
  updatedAt: string;
  saveCount: number;
  lastSavedAt?: string;
  lastSavedPath?: string;
}

interface PersistedGeneratedImagesStore {
  history?: StoredGeneratedImageHistoryItem[];
}

function now(): string {
  return new Date().toISOString();
}

function buildDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
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

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

export class GeneratedImagesStore {
  private readonly rootDir: string;
  private readonly assetsDir: string;
  private readonly filePath: string;
  private history: StoredGeneratedImageHistoryItem[] = [];

  constructor(userDataPath: string) {
    this.rootDir = join(userDataPath, "cipher-workspace", "generated-images");
    this.assetsDir = join(this.rootDir, "assets");
    this.filePath = join(this.rootDir, "history.json");
  }

  async init(): Promise<void> {
    await mkdir(this.assetsDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedGeneratedImagesStore;
      this.history = Array.isArray(parsed.history) ? parsed.history : [];
    } catch {
      this.history = [];
      await this.persist();
    }
  }

  async list(): Promise<GeneratedImageHistoryItem[]> {
    const page = await this.listPage();
    return page.items;
  }

  async listPage(request?: ImageHistoryListRequest): Promise<GeneratedImageHistoryPage> {
    const sorted = [...this.history].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const offset = Math.max(0, Math.floor(Number(request?.offset ?? 0) || 0));
    const requestedLimit = Math.floor(Number(request?.limit ?? 0) || 0);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 200) : sorted.length;
    const selected = sorted.slice(offset, offset + limit);
    const hydrated = await Promise.all(selected.map((entry) => this.hydrateEntry(entry)));
    const nextOffset = Math.min(offset + selected.length, sorted.length);
    return {
      items: hydrated.filter((entry): entry is GeneratedImageHistoryItem => Boolean(entry)),
      hasMore: nextOffset < sorted.length,
      nextOffset,
      total: sorted.length
    };
  }

  async recordGeneration(input: {
    prompt: string;
    model: string;
    aspectRatio: ImageGenerationAspectRatio;
    text: string;
    images: GeneratedImageAsset[];
  }): Promise<GeneratedImageHistoryItem[]> {
    const createdAt = now();
    const generationId = `imggen_${randomUUID()}`;
    const nextEntries: StoredGeneratedImageHistoryItem[] = [];

    for (const image of input.images) {
      const parsed = parseDataUrl(image.dataUrl);
      const id = `img_${randomUUID()}`;
      const assetFileName = `${id}${extensionForMimeType(parsed.mimeType)}`;
      await writeFile(join(this.assetsDir, assetFileName), parsed.bytes);
      nextEntries.push({
        id,
        generationId,
        prompt: input.prompt,
        model: input.model,
        aspectRatio: input.aspectRatio,
        text: input.text,
        mimeType: parsed.mimeType,
        assetFileName,
        createdAt,
        updatedAt: createdAt,
        saveCount: 0
      });
    }

    this.history.unshift(...nextEntries);
    await this.persist();
    return Promise.all(nextEntries.map((entry) => this.hydrateEntry(entry))).then((entries) => entries.filter((entry): entry is GeneratedImageHistoryItem => Boolean(entry)));
  }

  async markSaved(id: string, savedPath: string): Promise<GeneratedImageHistoryItem | null> {
    const entry = this.history.find((item) => item.id === id);
    if (!entry) return null;
    entry.updatedAt = now();
    entry.lastSavedAt = entry.updatedAt;
    entry.lastSavedPath = savedPath;
    entry.saveCount += 1;
    await this.persist();
    return this.hydrateEntry(entry);
  }

  async delete(id: string): Promise<boolean> {
    const index = this.history.findIndex((entry) => entry.id === id);
    if (index < 0) return false;

    const [removed] = this.history.splice(index, 1);
    if (removed) {
      await rm(join(this.assetsDir, removed.assetFileName), { force: true });
    }
    await this.persist();
    return true;
  }

  private async hydrateEntry(entry: StoredGeneratedImageHistoryItem): Promise<GeneratedImageHistoryItem | null> {
    try {
      const bytes = await readFile(join(this.assetsDir, entry.assetFileName));
      return {
        id: entry.id,
        generationId: entry.generationId,
        prompt: entry.prompt,
        model: entry.model,
        aspectRatio: entry.aspectRatio,
        text: entry.text,
        mimeType: entry.mimeType,
        dataUrl: buildDataUrl(entry.mimeType, bytes),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        saveCount: entry.saveCount,
        lastSavedAt: entry.lastSavedAt,
        lastSavedPath: entry.lastSavedPath
      };
    } catch {
      return null;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ history: this.history }, null, 2), "utf8");
  }
}
