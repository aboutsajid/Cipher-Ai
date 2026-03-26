import Store from "electron-store";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { McpServerConfig, PromptTemplate, Settings } from "../../shared/types";

const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  { name: "Review this code", content: "Review this code and list issues by severity with actionable fixes:\n\n```" },
  { name: "Explain this code", content: "Explain what this code does, step by step, including key tradeoffs and edge cases:\n\n```" },
  { name: "Write unit tests for this", content: "Write unit tests for this code. Include happy paths and edge cases:\n\n```" },
  { name: "Find bugs in this code", content: "Find likely bugs in this code and propose minimal fixes:\n\n```" },
  { name: "Refactor this code", content: "Refactor this code for readability and maintainability while preserving behavior:\n\n```" },
  { name: "Explain this error", content: "Explain this error and provide a concrete fix:\n\n" }
];

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "qwen/qwen-coder-32b-instruct",
  routerPort: 3456,
  customTemplates: [],
  ollamaEnabled: false,
  ollamaBaseUrl: "http://localhost:11434/v1",
  ollamaModels: [],
  mcpServers: [],
  models: [
    "qwen/qwen-coder-32b-instruct",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-14b:free",
    "deepseek/deepseek-chat-v3-0324:free"
  ],
  routing: {
    default: "qwen/qwen-coder-32b-instruct",
    think: "meta-llama/llama-3.3-70b-instruct:free",
    longContext: "google/gemini-2.0-flash-exp:free"
  }
};

export class SettingsStore {
  private store: Store<Settings>;
  private settings: Settings;
  private userDataPath: string;

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    this.store = new Store<Settings>({
      name: "cipher-chat-settings",
      cwd: join(userDataPath, "cipher-chat"),
      defaults: DEFAULT_SETTINGS
    });
    this.settings = DEFAULT_SETTINGS;
  }

  async init(): Promise<void> {
    this.settings = {
      apiKey: this.store.get("apiKey", DEFAULT_SETTINGS.apiKey),
      baseUrl: this.store.get("baseUrl", DEFAULT_SETTINGS.baseUrl),
      defaultModel: this.store.get("defaultModel", DEFAULT_SETTINGS.defaultModel),
      routerPort: this.store.get("routerPort", DEFAULT_SETTINGS.routerPort),
      models: this.store.get("models", DEFAULT_SETTINGS.models),
      customTemplates: this.store.get("customTemplates", DEFAULT_SETTINGS.customTemplates),
      ollamaEnabled: this.store.get("ollamaEnabled", DEFAULT_SETTINGS.ollamaEnabled),
      ollamaBaseUrl: this.store.get("ollamaBaseUrl", DEFAULT_SETTINGS.ollamaBaseUrl),
      ollamaModels: this.store.get("ollamaModels", DEFAULT_SETTINGS.ollamaModels),
      mcpServers: this.store.get("mcpServers", DEFAULT_SETTINGS.mcpServers),
      routing: this.store.get("routing", DEFAULT_SETTINGS.routing)
    };

    if (this.settings.apiKey) return;

    const legacy = await this.loadLegacySettings();
    if (!legacy?.apiKey) return;

    this.settings = {
      ...this.settings,
      ...legacy,
      routing: legacy.routing ?? this.settings.routing
    };

    for (const [k, v] of Object.entries(this.settings)) {
      this.store.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
  }

  get(): Settings {
    return {
      ...this.settings,
      models: [...this.settings.models],
      customTemplates: this.settings.customTemplates.map((template) => ({ ...template })),
      ollamaModels: [...this.settings.ollamaModels],
      mcpServers: this.settings.mcpServers.map((server) => ({ ...server, args: [...server.args] }))
    };
  }

  getApiKey(): string {
    return this.settings.apiKey;
  }

  async save(partial: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    for (const [k, v] of Object.entries(partial)) {
      this.store.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
  }

  listTemplates(): PromptTemplate[] {
    const merged = new Map<string, PromptTemplate>();
    for (const template of BUILT_IN_TEMPLATES) {
      merged.set(template.name.toLowerCase(), { ...template });
    }
    for (const template of this.settings.customTemplates) {
      const name = (template.name ?? "").trim();
      const content = template.content ?? "";
      if (!name || !content) continue;
      merged.set(name.toLowerCase(), { name, content });
    }
    return [...merged.values()];
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
    return join(this.userDataPath, "cipher-chat", "cipher-chat-settings.json");
  }

  private getLegacySettingsPaths(): string[] {
    const appDataPath = dirname(this.userDataPath);
    const appNames = ["Electron", "cipher-chat", "Cipher Chat", "CipherChat"];
    const paths = new Set<string>();

    for (const appName of appNames) {
      paths.add(join(appDataPath, appName, "cipher-chat", "cipher-chat-settings.json"));
      paths.add(join(appDataPath, appName, "cipher-chat-settings.json"));
    }

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

  private async loadLegacySettings(): Promise<Partial<Settings> | null> {
    for (const path of this.getLegacySettingsPaths()) {
      const parsed = await this.readSettingsFile(path);
      if (!parsed) continue;

      const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
      if (!apiKey) continue;

      const baseUrl = typeof parsed.baseUrl === "string" && parsed.baseUrl ? parsed.baseUrl : undefined;
      const defaultModel = typeof parsed.defaultModel === "string" && parsed.defaultModel ? parsed.defaultModel : undefined;
      const routerPort = typeof parsed.routerPort === "number" ? parsed.routerPort : undefined;
      const models = Array.isArray(parsed.models) ? parsed.models.filter((m): m is string => typeof m === "string" && m.length > 0) : undefined;
      const routing = parsed.routing && typeof parsed.routing === "object"
        && typeof parsed.routing.default === "string"
        && typeof parsed.routing.think === "string"
        && typeof parsed.routing.longContext === "string"
        ? parsed.routing
        : undefined;

      return { apiKey, baseUrl, defaultModel, routerPort, models, routing };
    }

    return null;
  }
}
