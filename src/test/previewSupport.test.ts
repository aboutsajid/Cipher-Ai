import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMissingWorkspaceTargetMessage,
  isPathInsideRoot,
  openExternalTarget,
  openManagedPreviewTarget,
  openPreviewWindowTarget,
  openWorkspaceTargetPath,
  resolveWorkspaceTargetPath,
  workspaceTargetExists
} from "../main/previewSupport";

test("buildMissingWorkspaceTargetMessage includes the missing target path", () => {
  const message = buildMissingWorkspaceTargetMessage("generated-apps/demo");
  assert.match(message, /generated-apps\/demo/);
  assert.match(message, /restored a Before snapshot/i);
});

test("resolveWorkspaceTargetPath keeps paths inside the workspace root", () => {
  const agentTaskRunner = {
    getWorkspaceRoot: () => "D:\\workspace"
  };

  const resolved = resolveWorkspaceTargetPath(agentTaskRunner as never, "generated-apps/demo");
  assert.equal(resolved, "D:\\workspace\\generated-apps\\demo");
});

test("resolveWorkspaceTargetPath rejects paths that escape the workspace root", () => {
  const agentTaskRunner = {
    getWorkspaceRoot: () => "D:\\workspace"
  };

  assert.throws(
    () => resolveWorkspaceTargetPath(agentTaskRunner as never, "..\\outside"),
    /Path escapes the workspace root\./
  );
});

test("isPathInsideRoot blocks prefix-based sibling escapes", () => {
  assert.equal(
    isPathInsideRoot("D:\\workspace\\generated-apps\\demo", "D:\\workspace\\generated-apps\\demo\\dist\\index.html"),
    true
  );
  assert.equal(
    isPathInsideRoot("D:\\workspace\\generated-apps\\demo", "D:\\workspace\\generated-apps\\demo-evil\\index.html"),
    false
  );
  assert.equal(
    isPathInsideRoot("D:\\workspace\\generated-apps\\demo", "D:\\workspace\\generated-apps\\demo\\..\\demo-evil\\index.html"),
    false
  );
});

test("openExternalTarget validates input and shapes errors", async () => {
  const missing = await openExternalTarget("");
  const ok = await openExternalTarget("https://example.com", async () => {});
  const failed = await openExternalTarget("https://example.com", async () => {
    throw new Error("boom");
  });

  assert.deepEqual(missing, { ok: false, message: "URL is required." });
  assert.deepEqual(ok, { ok: true, message: "Opened preview." });
  assert.deepEqual(failed, { ok: false, message: "boom" });
});

test("openManagedPreviewTarget returns preview url and missing-path errors", async () => {
  const agentTaskRunner = {
    getWorkspaceRoot: () => "D:\\workspace"
  };

  const missing = await openManagedPreviewTarget(agentTaskRunner as never, "");
  const ok = await openManagedPreviewTarget(agentTaskRunner as never, "generated-apps/demo", async () => "http://127.0.0.1:4173/");
  const enoent = Object.assign(new Error("missing"), { code: "ENOENT" });
  const failed = await openManagedPreviewTarget(agentTaskRunner as never, "generated-apps/demo", async () => {
    throw enoent;
  });

  assert.deepEqual(missing, { ok: false, message: "Preview target is required." });
  assert.deepEqual(ok, { ok: true, message: "Task preview ready.", url: "http://127.0.0.1:4173/" });
  assert.match(failed.message, /Target path not found: generated-apps\/demo/);
});

test("openPreviewWindowTarget validates input and shapes errors", async () => {
  const missing = await openPreviewWindowTarget("", "Demo");
  const ok = await openPreviewWindowTarget("http://127.0.0.1:4173/", " Demo ", async () => {});
  const failed = await openPreviewWindowTarget("http://127.0.0.1:4173/", "Demo", async () => {
    throw new Error("no window");
  });

  assert.deepEqual(missing, { ok: false, message: "Preview URL is required." });
  assert.deepEqual(ok, { ok: true, message: "Opened detached preview." });
  assert.deepEqual(failed, { ok: false, message: "no window" });
});

test("workspaceTargetExists fails closed for empty or missing paths", async () => {
  const agentTaskRunner = {
    getWorkspaceRoot: () => "D:\\workspace"
  };

  const empty = await workspaceTargetExists(agentTaskRunner as never, "");
  const missing = await workspaceTargetExists(agentTaskRunner as never, "generated-apps/demo");

  assert.equal(empty, false);
  assert.equal(missing, false);
});

test("openWorkspaceTargetPath validates input and maps missing-path errors", async () => {
  const agentTaskRunner = {
    getWorkspaceRoot: () => "D:\\workspace"
  };

  const missingInput = await openWorkspaceTargetPath(agentTaskRunner as never, "");
  const missingTarget = await openWorkspaceTargetPath(agentTaskRunner as never, "generated-apps/demo");

  assert.deepEqual(missingInput, { ok: false, message: "Path is required." });
  assert.match(missingTarget.message, /Target path not found: generated-apps\/demo/);
});
