import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function collectRendererIdReferences(source: string): string[] {
  const ids = new Set<string>();

  for (const match of source.matchAll(/\$\("([^"]+)"\)/g)) {
    ids.add(match[1]);
  }

  for (const match of source.matchAll(/document\.getElementById\("([^"]+)"\)/g)) {
    ids.add(match[1]);
  }

  return [...ids].sort();
}

function collectHtmlIds(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

test("renderer index html provides every id referenced by renderer app bindings", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  const rendererHtml = readProjectFile("src/renderer/index.html");

  const referencedIds = collectRendererIdReferences(rendererSource);
  const htmlIds = collectHtmlIds(rendererHtml);
  const missingIds = referencedIds.filter((id) => !htmlIds.has(id));

  assert.deepEqual(
    missingIds,
    [],
    `renderer app references missing HTML ids: ${missingIds.join(", ")}`
  );
  assert.ok(referencedIds.includes("agent-refresh-route-health-btn"));
  assert.ok(referencedIds.includes("agent-history-toggle-btn"));
  assert.ok(referencedIds.includes("agent-target-modal-suggest-btn"));
  assert.ok(referencedIds.includes("generate-image-btn"));
  assert.ok(referencedIds.includes("image-history-btn"));
  assert.ok(referencedIds.includes("claude-chat-safety-panel"));
  assert.ok(referencedIds.includes("claude-target-chip"));
  assert.ok(referencedIds.includes("claude-resume-btn"));
  assert.ok(referencedIds.includes("claude-fs-timeline"));
  assert.ok(referencedIds.includes("sidebar-resize-handle"));
  assert.ok(referencedIds.includes("panel-resize-handle"));
});

test("renderer IPC listener setup is idempotent to avoid duplicate subscriptions", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  assert.match(rendererSource, /function setupIpcListeners\(\)\s*\{\s*if \(ipcListenersInitialized\) return;\s*ipcListenersInitialized = true;/);
});

test("router status refresh only loads logs when explicitly requested", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  assert.match(rendererSource, /async function refreshRouterStatus\(options\?: \{ includeLogs\?: boolean \}\)/);
  assert.match(rendererSource, /if \(options\?\.includeLogs\) \{\s*await loadRouterLogs\(\);\s*\}/);
  assert.match(rendererSource, /if \(tab === "router"\) \{\s*void refreshRouterStatus\(\{ includeLogs: true \}\);/);
});

test("renderer tracks IPC unsubscriptions and tears listeners down on unload", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  assert.match(rendererSource, /const ipcListenerUnsubscribers: Array<\(\) => void> = \[\];/);
  assert.match(rendererSource, /function teardownIpcListeners\(\): void/);
  assert.match(rendererSource, /window\.addEventListener\("beforeunload", teardownIpcListeners, \{ once: true \}\);/);
});
