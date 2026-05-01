import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readRendererBindingSource(): string {
  return [
    "src/renderer/app.ts",
    "src/renderer/appClaudeSafetyUiUtils.ts",
    "src/renderer/appComposerAttachmentUiUtils.ts",
    "src/renderer/appMessageMetaUiUtils.ts",
    "src/renderer/appMessageResendUiUtils.ts",
    "src/renderer/appChatListSearchUiUtils.ts",
    "src/renderer/appChatRenameActionsUtils.ts",
    "src/renderer/appHeaderMenusUiUtils.ts",
    "src/renderer/appClipboardImageUtils.ts",
    "src/renderer/appGuidedEmptyStateUiUtils.ts",
    "src/renderer/appChatLifecycleUiUtils.ts",
    "src/renderer/appChatDraftUiUtils.ts",
    "src/renderer/appChatListRenderUiUtils.ts",
    "src/renderer/appChatLoadUiUtils.ts",
    "src/renderer/appSendUiUtils.ts",
    "src/renderer/appChatSummaryUiUtils.ts",
    "src/renderer/appPreviewModalUiUtils.ts",
    "src/renderer/appPreviewExecutionUiUtils.ts",
    "src/renderer/appScrollUiUtils.ts",
    "src/renderer/appImageStudioUiUtils.ts",
    "src/renderer/appShellLayoutUiUtils.ts",
    "src/renderer/appPanelResizeUiUtils.ts",
    "src/renderer/appPanelBodyPreviewUiUtils.ts",
    "src/renderer/appPanelToggleUiUtils.ts",
    "src/renderer/appRouterStatusUiUtils.ts",
    "src/renderer/appFeedbackUiUtils.ts",
    "src/renderer/appMessageOrderUiUtils.ts",
    "src/renderer/appProviderSettingsUiUtils.ts",
    "src/renderer/appModelProviderRoutingUiUtils.ts",
    "src/renderer/appLocalAgentSetupUiUtils.ts",
    "src/renderer/appChatContextProviderUiUtils.ts",
    "src/renderer/appDirectSaveVisionUiUtils.ts",
    "src/renderer/appComposerVoiceUiUtils.ts",
    "src/renderer/appComposerToolsUiUtils.ts",
    "src/renderer/appAgentArtifactUiUtils.ts",
    "src/renderer/appAgentMessageParserUiUtils.ts",
    "src/renderer/appSnapshotRestoreUiUtils.ts",
    "src/renderer/appAgentRouteSummaryUiUtils.ts",
    "src/renderer/appAgentRouteHealthUiUtils.ts",
    "src/renderer/appAgentRouteDiagnosticsUiUtils.ts",
    "src/renderer/appAgentTaskResultsUiUtils.ts",
    "src/renderer/appAgentHistoryUiUtils.ts",
    "src/renderer/appAgentSnapshotsUiUtils.ts",
    "src/renderer/appAgentTaskChatUiUtils.ts",
    "src/renderer/appAgentTaskRefreshUiUtils.ts",
    "src/renderer/appAgentTaskRenderUiUtils.ts",
    "src/renderer/appAgentTaskActionsUiUtils.ts",
    "src/renderer/appAgentControlsUiUtils.ts",
    "src/renderer/appWindowSyncUiUtils.ts",
    "src/renderer/appSettingsUiUtils.ts",
    "src/renderer/appDesktopLaunchUiUtils.ts",
    "src/renderer/appRuntimeSetupUiUtils.ts",
    "src/renderer/appKeyboardShortcutsUiUtils.ts"
  ]
    .map((path) => readProjectFile(path))
    .join("\n");
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
  const rendererSource = readRendererBindingSource();
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
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appPanelToggleUiUtils.ts"),
    readProjectFile("src/renderer/appRouterStatusUiUtils.ts")
  ].join("\n");
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

test("agent polling falls back only when task change events are stale", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appAgentTaskRefreshUiUtils.ts")
  ].join("\n");
  assert.match(rendererSource, /let lastAgentTaskChangeAt = 0;/);
  assert.match(rendererSource, /const AGENT_EVENT_STALE_FALLBACK_MS = AGENT_POLL_FALLBACK_MS;/);
  assert.match(rendererSource, /lastAgentTaskChangeAt = Date\.now\(\);/);
  assert.match(rendererSource, /const staleMs = Date\.now\(\) - lastAgentTaskChangeAt;/);
  assert.match(rendererSource, /if \(staleMs < AGENT_EVENT_STALE_FALLBACK_MS\) return;/);
});
