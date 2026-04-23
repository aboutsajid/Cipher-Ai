import { safeStorage } from "electron";
import Store from "electron-store";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildRecommendedCloudModelList,
  getDefaultBaseUrlForCloudProvider,
  getDefaultCloudModelStrategy,
  inferCloudProvider,
  isLegacyDefaultCloudModelStrategy
} from "../../shared/modelCatalog";
import type { McpServerConfig, PromptTemplate, Settings } from "../../shared/types";

const MODEL_ID_MIGRATIONS: Record<string, string> = {
  "google/gemini-2.5-flash-lite-": "google/gemini-2.5-flash-lite-preview-09-2025",
  "google/gemini-2.5-flash-lite-preview": "google/gemini-2.5-flash-lite-preview-09-2025",
  "gemma4:31b-cloud": "google/gemma-4-31b-it",
  "google/gemma4:31b-cloud": "google/gemma-4-31b-it",
  "qwen/qwen3-coder-next": "qwen/qwen3.6-plus",
  "qwen/qwen-coder-32b-instruct": "qwen/qwen-2.5-coder-32b-instruct",
  "qwen/qwen2.5-coder-32b-instruct": "qwen/qwen-2.5-coder-32b-instruct"
};

const ENCRYPTED_SECRET_PREFIX = "cipher-protected:";
const DEFAULT_CLAUDE_CHAT_FILESYSTEM = {
  roots: [],
  allowWrite: false
};
const SMOKE_SENTINEL_BASE_URLS = new Set([
  "http://127.0.0.1:9",
  "http://127.0.0.1:9/v1",
  "http://localhost:9",
  "http://localhost:9/v1"
]);

function isSafeStorageEncryptionAvailable(): boolean {
  try {
    return typeof safeStorage?.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function isSmokeSentinelBaseUrl(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
  return SMOKE_SENTINEL_BASE_URLS.has(normalized);
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: getDefaultBaseUrlForCloudProvider("openrouter"),
  cloudProvider: "openrouter",
  imageProvider: "openrouter",
  ...getDefaultCloudModelStrategy(),
  routerPort: 3456,
  customTemplates: [],
  ollamaEnabled: false,
  ollamaBaseUrl: "http://localhost:11434/v1",
  ollamaModels: [],
  comfyuiBaseUrl: "http://127.0.0.1:8000",
  localVoiceEnabled: false,
  localVoiceModel: "base",
  claudeChatFilesystem: DEFAULT_CLAUDE_CHAT_FILESYSTEM,
  mcpServers: [],
};

export class SettingsStore {
  private store: Store<Settings>;
  private settings: Settings;
  private userDataPath: string;

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    this.store = new Store<Settings>({
      name: "cipher-workspace-settings",
      cwd: join(userDataPath, "cipher-workspace"),
      defaults: DEFAULT_SETTINGS
    });
    this.settings = DEFAULT_SETTINGS;
  }

  async init(): Promise<void> {
    const storedApiKey = this.store.get("apiKey", DEFAULT_SETTINGS.apiKey);
    const storedBaseUrl = this.store.get("baseUrl", DEFAULT_SETTINGS.baseUrl);
    const cloudProvider = inferCloudProvider(
      storedBaseUrl,
      this.store.has("cloudProvider") ? this.store.get("cloudProvider") : undefined
    );
    const baseUrl = isSmokeSentinelBaseUrl(storedBaseUrl)
      ? getDefaultBaseUrlForCloudProvider(cloudProvider)
      : storedBaseUrl;
    const imageProvider = this.store.has("imageProvider")
      ? this.store.get("imageProvider")
      : cloudProvider;
    const storedOllamaBaseUrl = this.store.get("ollamaBaseUrl", DEFAULT_SETTINGS.ollamaBaseUrl);
    const ollamaBaseUrl = isSmokeSentinelBaseUrl(storedOllamaBaseUrl)
      ? DEFAULT_SETTINGS.ollamaBaseUrl
      : storedOllamaBaseUrl;
    this.settings = {
      apiKey: this.readStoredApiKey(storedApiKey),
      baseUrl,
      cloudProvider,
      imageProvider: imageProvider ?? DEFAULT_SETTINGS.imageProvider,
      defaultModel: this.store.get("defaultModel", DEFAULT_SETTINGS.defaultModel),
      routerPort: this.store.get("routerPort", DEFAULT_SETTINGS.routerPort),
      models: this.store.get("models", DEFAULT_SETTINGS.models),
      customTemplates: this.store.get("customTemplates", DEFAULT_SETTINGS.customTemplates),
      ollamaEnabled: this.store.get("ollamaEnabled", DEFAULT_SETTINGS.ollamaEnabled),
      ollamaBaseUrl,
      ollamaModels: this.store.get("ollamaModels", DEFAULT_SETTINGS.ollamaModels),
      comfyuiBaseUrl: this.store.get("comfyuiBaseUrl") ?? DEFAULT_SETTINGS.comfyuiBaseUrl,
      localVoiceEnabled: false,
      localVoiceModel: this.store.get("localVoiceModel", DEFAULT_SETTINGS.localVoiceModel),
      claudeChatFilesystem: this.store.get("claudeChatFilesystem", DEFAULT_CLAUDE_CHAT_FILESYSTEM),
      mcpServers: this.store.get("mcpServers", DEFAULT_SETTINGS.mcpServers),
      routing: this.store.get("routing", DEFAULT_SETTINGS.routing)
    };

    const shouldImportLegacy = !this.settings.apiKey
      && this.settings.baseUrl === DEFAULT_SETTINGS.baseUrl
      && this.settings.defaultModel === DEFAULT_SETTINGS.defaultModel
      && this.settings.models.join("\n") === DEFAULT_SETTINGS.models.join("\n")
      && this.settings.ollamaEnabled === DEFAULT_SETTINGS.ollamaEnabled
      && this.settings.ollamaBaseUrl === DEFAULT_SETTINGS.ollamaBaseUrl
      && this.settings.ollamaModels.length === 0
      && this.settings.localVoiceEnabled === DEFAULT_SETTINGS.localVoiceEnabled
      && this.settings.localVoiceModel === DEFAULT_SETTINGS.localVoiceModel
      && this.settings.mcpServers.length === 0
      && this.settings.customTemplates.length === 0;

    if (shouldImportLegacy || !this.settings.apiKey) {
      const legacy = await this.loadLegacySettings();
      if (legacy) {
        this.settings = {
          ...this.settings,
          ...legacy,
          cloudProvider: inferCloudProvider(legacy.baseUrl ?? this.settings.baseUrl, legacy.cloudProvider),
          routing: legacy.routing ?? this.settings.routing,
          apiKey: ""
        };

        for (const [k, v] of Object.entries(this.settings)) {
          this.store.set(k as keyof Settings, v as Settings[keyof Settings]);
        }
      }
    }

    if (baseUrl !== storedBaseUrl) {
      this.store.set("baseUrl", baseUrl);
    }
    if (ollamaBaseUrl !== storedOllamaBaseUrl) {
      this.store.set("ollamaBaseUrl", ollamaBaseUrl);
    }

    this.applyModelIdMigration();
    this.applyRecommendedModelStrategyMigration();
    this.store.set("apiKey", this.serializeApiKey(this.settings.apiKey));
    this.store.set("localVoiceEnabled", false);
  }

  get(): Settings {
    return {
      ...this.settings,
      models: [...this.settings.models],
      customTemplates: this.settings.customTemplates.map((template) => ({ ...template })),
      ollamaModels: [...this.settings.ollamaModels],
      claudeChatFilesystem: {
        roots: [...(this.settings.claudeChatFilesystem?.roots ?? [])],
        allowWrite: this.settings.claudeChatFilesystem?.allowWrite === true
      },
      mcpServers: this.settings.mcpServers.map((server) => ({ ...server, args: [...server.args] }))
    };
  }

  getApiKey(): string {
    return this.settings.apiKey;
  }

  async save(partial: Partial<Settings>): Promise<void> {
    const normalizedPartial: Partial<Settings> = Object.prototype.hasOwnProperty.call(partial, "localVoiceEnabled")
      ? { ...partial, localVoiceEnabled: false }
      : partial;
    const normalizedBaseUrl = typeof normalizedPartial.baseUrl === "string"
      ? normalizedPartial.baseUrl
      : this.settings.baseUrl;
    normalizedPartial.cloudProvider = inferCloudProvider(normalizedBaseUrl, normalizedPartial.cloudProvider ?? this.settings.cloudProvider);
    this.settings = { ...this.settings, ...normalizedPartial };
    for (const [k, v] of Object.entries(normalizedPartial)) {
      if (k === "apiKey") {
        this.store.set("apiKey", this.serializeApiKey(typeof v === "string" ? v : ""));
        continue;
      }
      this.store.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
  }

  private readStoredApiKey(value: string): string {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    if (!normalized.startsWith(ENCRYPTED_SECRET_PREFIX)) return normalized;
    if (!isSafeStorageEncryptionAvailable()) return "";

    try {
      const payload = normalized.slice(ENCRYPTED_SECRET_PREFIX.length);
      if (!payload) return "";
      return safeStorage.decryptString(Buffer.from(payload, "base64"));
    } catch {
      return "";
    }
  }

  private serializeApiKey(value: string): string {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    if (!isSafeStorageEncryptionAvailable()) return normalized;

    try {
      return `${ENCRYPTED_SECRET_PREFIX}${safeStorage.encryptString(normalized).toString("base64")}`;
    } catch {
      return normalized;
    }
  }

  listTemplates(): PromptTemplate[] {
    return this.settings.customTemplates
      .map((template) => ({
        name: (template.name ?? "").trim(),
        content: (template.content ?? "").trim()
      }))
      .filter((template) => Boolean(template.name) && Boolean(template.content));
  }

  async saveTemplate(template: PromptTemplate): Promise<PromptTemplate[]> {
    const name = (template.name ?? "").trim();
    const content = (template.content ?? "").trim();
    if (!name || !content) return this.listTemplates();

    const others = this.settings.customTemplates.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    this.settings.customTemplates = [...others, { name, content }];
    this.store.set("customTemplates", this.settings.customTemplates);
    return this.listTemplates();
  }

  async deleteTemplate(name: string): Promise<PromptTemplate[]> {
    const target = (name ?? "").trim().toLowerCase();
    if (!target) return this.listTemplates();

    this.settings.customTemplates = this.settings.customTemplates.filter((template) => template.name.toLowerCase() !== target);
    this.store.set("customTemplates", this.settings.customTemplates);
    return this.listTemplates();
  }

  listMcpServers(): McpServerConfig[] {
    return this.settings.mcpServers.map((server) => ({ ...server, args: [...server.args] }));
  }

  async addMcpServer(server: McpServerConfig): Promise<McpServerConfig[]> {
    const normalized: McpServerConfig = {
      name: (server.name ?? "").trim(),
      command: (server.command ?? "").trim(),
      args: Array.isArray(server.args) ? server.args.map((arg) => String(arg)).filter(Boolean) : []
    };
    if (!normalized.name || !normalized.command) return this.listMcpServers();

    const filtered = this.settings.mcpServers.filter((item) => item.name.toLowerCase() !== normalized.name.toLowerCase());
    this.settings.mcpServers = [...filtered, normalized];
    this.store.set("mcpServers", this.settings.mcpServers);
    return this.listMcpServers();
  }

  async removeMcpServer(name: string): Promise<McpServerConfig[]> {
    const target = (name ?? "").trim().toLowerCase();
    if (!target) return this.listMcpServers();

    this.settings.mcpServers = this.settings.mcpServers.filter((server) => server.name.toLowerCase() !== target);
    this.store.set("mcpServers", this.settings.mcpServers);
    return this.listMcpServers();
  }

  private getCurrentSettingsPath(): string {
    return join(this.userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
  }

  private getLegacySettingsPaths(): string[] {
    const appDataPath = dirname(this.userDataPath);
    const appNames = ["Electron", "cipher-ai", "cipher-chat", "Cipher Chat", "CipherChat", "Cipher Workspace"];
    const paths = new Set<string>();

    for (const appName of appNames) {
      paths.add(join(appDataPath, appName, "cipher-workspace", "cipher-workspace-settings.json"));
      paths.add(join(appDataPath, appName, "cipher-workspace-settings.json"));
      paths.add(join(appDataPath, appName, "cipher-chat", "cipher-chat-settings.json"));
      paths.add(join(appDataPath, appName, "cipher-chat-settings.json"));
    }

    paths.add(join(this.userDataPath, "cipher-workspace-settings.json"));
    paths.add(join(dirname(this.userDataPath), "cipher-workspace", "cipher-workspace-settings.json"));
    paths.add(join(this.userDataPath, "cipher-chat-settings.json"));
    paths.add(join(dirname(this.userDataPath), "cipher-chat", "cipher-chat-settings.json"));

    const current = resolve(this.getCurrentSettingsPath());
    return [...paths].map((p) => resolve(p)).filter((p) => p !== current);
  }

  private async readSettingsFile(path: string): Promise<Partial<Settings> | null> {
    try {
      await access(path);
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async loadLegacySettings(): Promise<Partial<Omit<Settings, "apiKey">> | null> {
    for (const path of this.getLegacySettingsPaths()) {
      const parsed = await this.readSettingsFile(path);
      if (!parsed) continue;

      const baseUrl = typeof parsed.baseUrl === "string" && parsed.baseUrl ? parsed.baseUrl : undefined;
      const cloudProvider = typeof parsed.cloudProvider === "string" ? parsed.cloudProvider : undefined;
      const defaultModel = typeof parsed.defaultModel === "string" && parsed.defaultModel ? parsed.defaultModel : undefined;
      const routerPort = typeof parsed.routerPort === "number" ? parsed.routerPort : undefined;
      const models = Array.isArray(parsed.models) ? parsed.models.filter((m): m is string => typeof m === "string" && m.length > 0) : undefined;
      const imageProvider = typeof parsed.imageProvider === "string" ? parsed.imageProvider as Settings["imageProvider"] : undefined;
      const comfyuiBaseUrl = typeof parsed.comfyuiBaseUrl === "string" && parsed.comfyuiBaseUrl ? parsed.comfyuiBaseUrl : undefined;
      const routing = parsed.routing && typeof parsed.routing === "object"
        && typeof parsed.routing.default === "string"
        && typeof parsed.routing.think === "string"
        && typeof parsed.routing.longContext === "string"
        ? parsed.routing
        : undefined;

      if (!baseUrl && !defaultModel && routerPort === undefined && !models?.length && !routing && !imageProvider && !comfyuiBaseUrl) continue;

      return { baseUrl, cloudProvider, imageProvider, defaultModel, routerPort, models, comfyuiBaseUrl, routing };
    }

    return null;
  }

  private migrateModelId(value: string): string {
    const direct = MODEL_ID_MIGRATIONS[value];
    if (direct) return direct;
    const trimmed = value.trim();
    return MODEL_ID_MIGRATIONS[trimmed] ?? value;
  }

  private applyModelIdMigration(): void {
    let changed = false;
    const migrate = (value: string): string => {
      const migrated = this.migrateModelId(value);
      if (migrated !== value) changed = true;
      return migrated;
    };

    this.settings.defaultModel = migrate(this.settings.defaultModel);
    this.settings.models = this.settings.models.map((model) => migrate(model));
    this.settings.routing = {
      default: migrate(this.settings.routing.default),
      think: migrate(this.settings.routing.think),
      longContext: migrate(this.settings.routing.longContext)
    };

    if (!changed) return;
    this.store.set("defaultModel", this.settings.defaultModel);
    this.store.set("models", this.settings.models);
    this.store.set("routing", this.settings.routing);
  }

  private applyRecommendedModelStrategyMigration(): void {
    if (!isLegacyDefaultCloudModelStrategy(this.settings)) {
      return;
    }

    const provider = inferCloudProvider(this.settings.baseUrl, this.settings.cloudProvider);
    const next = getDefaultCloudModelStrategy(provider);
    this.settings.defaultModel = next.defaultModel;
    this.settings.models = buildRecommendedCloudModelList(next.models, provider);
    this.settings.routing = { ...next.routing };
    this.store.set("defaultModel", this.settings.defaultModel);
    this.store.set("models", this.settings.models);
    this.store.set("routing", this.settings.routing);
  }
}
