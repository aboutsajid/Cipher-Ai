import test from "node:test";
import assert from "node:assert/strict";
import { addMcpServer, listMcpServers, removeMcpServer } from "../main/mcpIpcSupport";
import type { McpServerConfig } from "../shared/types";

function createStore(initial: McpServerConfig[] = []) {
  let servers = [...initial];
  return {
    listMcpServers: () => [...servers],
    addMcpServer: async (server: McpServerConfig) => {
      servers = [...servers, server];
      return [...servers];
    },
    removeMcpServer: async (name: string) => {
      servers = servers.filter((server) => server.name !== name);
      return [...servers];
    }
  };
}

test("mcp ipc helpers delegate list/add/remove and stop runtime before removal", async () => {
  const store = createStore();
  const stopped: string[] = [];

  assert.deepEqual(listMcpServers(store), []);
  assert.deepEqual(await addMcpServer(store, { name: "fs", command: "node", args: ["server.js"] }), [
    { name: "fs", command: "node", args: ["server.js"] }
  ]);
  assert.deepEqual(await removeMcpServer(store, {
    stopIfRunning: async (name: string) => {
      stopped.push(name);
    }
  } as never, "fs"), []);
  assert.deepEqual(stopped, ["fs"]);
});
