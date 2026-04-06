import type { McpServerConfig } from "../shared/types";
import type { McpRuntimeManager } from "./mcpSupport";

interface McpServerStore {
  listMcpServers(): McpServerConfig[];
  addMcpServer(server: McpServerConfig): Promise<McpServerConfig[]>;
  removeMcpServer(name: string): Promise<McpServerConfig[]>;
}

export function listMcpServers(settingsStore: McpServerStore): McpServerConfig[] {
  return settingsStore.listMcpServers();
}

export async function addMcpServer(
  settingsStore: McpServerStore,
  server: McpServerConfig
): Promise<McpServerConfig[]> {
  return settingsStore.addMcpServer(server);
}

export async function removeMcpServer(
  settingsStore: McpServerStore,
  mcpRuntimeManager: Pick<McpRuntimeManager, "stopIfRunning">,
  name: string
): Promise<McpServerConfig[]> {
  await mcpRuntimeManager.stopIfRunning(name);
  return settingsStore.removeMcpServer(name);
}
