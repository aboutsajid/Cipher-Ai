import test from "node:test";
import assert from "node:assert/strict";
import { getRouterLogs, getRouterStatus, startRouter, stopRouter, testRouter } from "../main/routerIpcSupport";

test("router ipc helpers delegate to the router service", async () => {
  const ccrService = {
    getStatus: () => ({ running: true }),
    getLogs: () => ["a", "b"],
    startRouter: async () => ({ ok: true, message: "started" }),
    stopRouter: () => ({ ok: true, message: "stopped" }),
    testConnection: async () => ({ ok: true, latencyMs: 10 })
  };

  assert.deepEqual(getRouterStatus(ccrService), { running: true });
  assert.deepEqual(getRouterLogs(ccrService), ["a", "b"]);
  assert.deepEqual(await startRouter(ccrService), { ok: true, message: "started" });
  assert.deepEqual(stopRouter(ccrService), { ok: true, message: "stopped" });
  assert.deepEqual(await testRouter(ccrService), { ok: true, latencyMs: 10 });
});
