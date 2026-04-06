import type { PromptTemplate, Settings } from "../shared/types";

interface SettingsTemplateStore {
  get(): Settings;
  save(partial: Partial<Settings>): Promise<void>;
  listTemplates(): PromptTemplate[];
  saveTemplate(template: PromptTemplate): Promise<PromptTemplate[]>;
  deleteTemplate(name: string): Promise<PromptTemplate[]>;
}

interface OllamaModelSource {
  listOllamaModels(baseUrl: string): Promise<string[]>;
}

export async function saveSettingsPartial(
  settingsStore: SettingsTemplateStore,
  partial: Record<string, unknown>
): Promise<Settings> {
  await settingsStore.save(partial as Partial<Settings>);
  return settingsStore.get();
}

export function listTemplates(settingsStore: SettingsTemplateStore): PromptTemplate[] {
  return settingsStore.listTemplates();
}

export async function saveTemplate(
  settingsStore: SettingsTemplateStore,
  name: string,
  content: string
): Promise<PromptTemplate[]> {
  return settingsStore.saveTemplate({ name, content });
}

export async function deleteTemplate(
  settingsStore: SettingsTemplateStore,
  name: string
): Promise<PromptTemplate[]> {
  return settingsStore.deleteTemplate(name);
}

export async function refreshOllamaModels(
  settingsStore: SettingsTemplateStore,
  ccrService: OllamaModelSource,
  baseUrl?: string
): Promise<string[]> {
  const sourceUrl = (baseUrl ?? settingsStore.get().ollamaBaseUrl).trim() || "http://localhost:11434/v1";
  const models = await ccrService.listOllamaModels(sourceUrl);
  await settingsStore.save({ ollamaModels: models });
  return models;
}
