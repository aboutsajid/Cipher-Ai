import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { ClaudeApplyEditsResult, ClaudeManagedEdit, ClaudeManagedEditPermissions } from "../shared/types";

const PARTIAL_REPLACEMENT_MIN_EXISTING_CHARS = 400;
const PARTIAL_REPLACEMENT_MAX_PROPOSED_CHARS = 240;
const PARTIAL_REPLACEMENT_RATIO = 0.35;
const PARTIAL_SNIPPET_FAILURE_REASON = "Claude returned only a small snippet for an existing file. Nothing was saved. Ask Claude to send the full updated file content.";

async function createManagedEditBackup(targetPath: string, content: string): Promise<string> {
  const backupDir = join(dirname(targetPath), ".cipher-backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${basename(targetPath)}.${stamp}.bak`;
  const backupPath = join(backupDir, backupName);
  await mkdir(backupDir, { recursive: true });
  await writeFile(backupPath, content, "utf8");
  return backupPath;
}

function normalizeComparablePath(targetPath: string): string {
  const resolved = resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(targetPath));
  return Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !relativePath.includes(":")
    && relativePath !== ".";
}

function isPathAllowed(targetPath: string, permissions: ClaudeManagedEditPermissions): boolean {
  const allowedPaths = new Set((permissions.allowedPaths ?? []).map(normalizeComparablePath));
  if (allowedPaths.has(normalizeComparablePath(targetPath))) {
    return true;
  }

  return (permissions.allowedRoots ?? [])
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .some((rootPath) => isPathInsideRoot(targetPath, rootPath));
}

function looksLikePartialReplacement(currentContent: string, proposedContent: string): boolean {
  const current = currentContent.trim();
  const proposed = proposedContent.trim();
  if (!current || !proposed) return false;
  if (current.length < PARTIAL_REPLACEMENT_MIN_EXISTING_CHARS) return false;
  if (proposed.length > PARTIAL_REPLACEMENT_MAX_PROPOSED_CHARS) return false;
  if (proposed.length >= current.length * PARTIAL_REPLACEMENT_RATIO) return false;

  const looksStructural = /<(html|body|head|main|div|section|script|style)\b|function\s+\w+|export\s+|module\.exports|{\s*"[\w-]+":|<!doctype html>/i.test(proposed);
  if (looksStructural) return false;

  return true;
}

function isPartialSnippetFailureReason(reason: string): boolean {
  return reason === PARTIAL_SNIPPET_FAILURE_REASON;
}

function buildBaselineContentMap(
  baselineContents: Array<{ path: string; content: string }> = []
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of baselineContents) {
    const path = (item?.path ?? "").trim();
    if (!path) continue;
    map.set(normalizeComparablePath(path), typeof item?.content === "string" ? item.content : "");
  }
  return map;
}

export async function inspectManagedClaudeEdits(
  rawEdits: ClaudeManagedEdit[],
  permissions: ClaudeManagedEditPermissions,
  baselineContents: Array<{ path: string; content: string }> = []
): Promise<ClaudeApplyEditsResult> {
  const edits = Array.isArray(rawEdits) ? rawEdits : [];
  const actionableFiles: string[] = [];
  const unchangedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];
  const baselineContentMap = buildBaselineContentMap(baselineContents);

  for (const edit of edits) {
    const path = (edit?.path ?? "").trim();
    const content = typeof edit?.content === "string" ? edit.content : "";
    if (!path || !isPathAllowed(path, permissions)) {
      failedFiles.push({ path: path || "(unknown)", reason: "Path is not allowed." });
      continue;
    }

    try {
      let currentContent: string | null = null;
      try {
        currentContent = await readFile(path, "utf8");
      } catch (err) {
        if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
          throw err;
        }
      }

      const baselineContent = baselineContentMap.get(normalizeComparablePath(path)) ?? currentContent;

      if (baselineContent !== null && looksLikePartialReplacement(baselineContent, content)) {
        failedFiles.push({
          path,
          reason: PARTIAL_SNIPPET_FAILURE_REASON
        });
        continue;
      }

      if (currentContent === content) {
        unchangedFiles.push(path);
        continue;
      }

      actionableFiles.push(path);
    } catch (err) {
      failedFiles.push({
        path,
        reason: err instanceof Error ? err.message : "Unknown read error."
      });
    }
  }

  const allFailuresAreSnippetRejects = failedFiles.length > 0 && failedFiles.every((item) => isPartialSnippetFailureReason(item.reason));
  const hasActionableChanges = actionableFiles.length > 0;

  return {
    ok: failedFiles.length === 0 && hasActionableChanges,
    savedFiles: [],
    backupFiles: [],
    unchangedFiles,
    failedFiles,
    message: allFailuresAreSnippetRejects
      ? "Save blocked because Claude returned a snippet instead of the full updated file."
      : failedFiles.length > 0
        ? `Local safety checks rejected ${failedFiles.length} file(s) before save preview.`
        : hasActionableChanges
          ? `Ready to review ${actionableFiles.length} file(s).`
          : "No actionable file changes were proposed."
  };
}

export async function applyManagedClaudeEdits(
  rawEdits: ClaudeManagedEdit[],
  permissions: ClaudeManagedEditPermissions,
  baselineContents: Array<{ path: string; content: string }> = []
): Promise<ClaudeApplyEditsResult> {
  const edits = Array.isArray(rawEdits) ? rawEdits : [];
  const savedFiles: string[] = [];
  const backupFiles: Array<{ path: string; backupPath: string }> = [];
  const unchangedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];
  const baselineContentMap = buildBaselineContentMap(baselineContents);

  for (const edit of edits) {
    const path = (edit?.path ?? "").trim();
    const content = typeof edit?.content === "string" ? edit.content : "";
    if (!path || !isPathAllowed(path, permissions)) {
      failedFiles.push({ path: path || "(unknown)", reason: "Path is not allowed." });
      continue;
    }

    try {
      let currentContent: string | null = null;
      try {
        currentContent = await readFile(path, "utf8");
      } catch (err) {
        if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
          throw err;
        }
      }

      const baselineContent = baselineContentMap.get(normalizeComparablePath(path)) ?? currentContent;

      if (baselineContent !== null && looksLikePartialReplacement(baselineContent, content)) {
        failedFiles.push({
          path,
          reason: PARTIAL_SNIPPET_FAILURE_REASON
        });
        continue;
      }

      if (currentContent === content) {
        unchangedFiles.push(path);
        continue;
      }

      if (currentContent !== null) {
        const backupPath = await createManagedEditBackup(path, currentContent);
        backupFiles.push({ path, backupPath });
      } else {
        await mkdir(dirname(path), { recursive: true });
      }

      await writeFile(path, content, "utf8");
      savedFiles.push(path);
    } catch (err) {
      failedFiles.push({
        path,
        reason: err instanceof Error ? err.message : "Unknown write error."
      });
    }
  }

  const allFailuresAreSnippetRejects = failedFiles.length > 0 && failedFiles.every((item) => isPartialSnippetFailureReason(item.reason));

  return {
    ok: failedFiles.length === 0 && savedFiles.length > 0,
    savedFiles,
    backupFiles,
    unchangedFiles,
    failedFiles,
    message: allFailuresAreSnippetRejects
      ? "Save blocked because Claude returned a snippet instead of the full updated file."
      : failedFiles.length === 0
        ? `Saved ${savedFiles.length} file(s), backed up ${backupFiles.length}, unchanged ${unchangedFiles.length}.`
        : `Saved ${savedFiles.length} file(s), backed up ${backupFiles.length}, unchanged ${unchangedFiles.length}, failed ${failedFiles.length}.`
  };
}
