import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { ClaudeApplyEditsResult, ClaudeManagedEdit, ClaudeManagedEditPermissions } from "../shared/types";

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

export async function applyManagedClaudeEdits(
  rawEdits: ClaudeManagedEdit[],
  permissions: ClaudeManagedEditPermissions
): Promise<ClaudeApplyEditsResult> {
  const edits = Array.isArray(rawEdits) ? rawEdits : [];
  const savedFiles: string[] = [];
  const backupFiles: Array<{ path: string; backupPath: string }> = [];
  const unchangedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];

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

  return {
    ok: failedFiles.length === 0 && savedFiles.length > 0,
    savedFiles,
    backupFiles,
    unchangedFiles,
    failedFiles,
    message: failedFiles.length === 0
      ? `Saved ${savedFiles.length} file(s), backed up ${backupFiles.length}, unchanged ${unchangedFiles.length}.`
      : `Saved ${savedFiles.length} file(s), backed up ${backupFiles.length}, unchanged ${unchangedFiles.length}, failed ${failedFiles.length}.`
  };
}
