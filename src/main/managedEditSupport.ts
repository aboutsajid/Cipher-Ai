import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ClaudeApplyEditsResult, ClaudeManagedEdit } from "../shared/types";

async function createManagedEditBackup(targetPath: string, content: string): Promise<string> {
  const backupDir = join(dirname(targetPath), ".cipher-backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${basename(targetPath)}.${stamp}.bak`;
  const backupPath = join(backupDir, backupName);
  await mkdir(backupDir, { recursive: true });
  await writeFile(backupPath, content, "utf8");
  return backupPath;
}

export async function applyManagedClaudeEdits(rawEdits: ClaudeManagedEdit[], allowedPaths: string[]): Promise<ClaudeApplyEditsResult> {
  const allowed = new Set((allowedPaths ?? []).map((value) => (value ?? "").trim()).filter(Boolean));
  const edits = Array.isArray(rawEdits) ? rawEdits : [];
  const savedFiles: string[] = [];
  const backupFiles: Array<{ path: string; backupPath: string }> = [];
  const unchangedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];

  for (const edit of edits) {
    const path = (edit?.path ?? "").trim();
    const content = typeof edit?.content === "string" ? edit.content : "";
    if (!path || !allowed.has(path)) {
      failedFiles.push({ path: path || "(unknown)", reason: "Path is not allowed." });
      continue;
    }

    try {
      const currentContent = await readFile(path, "utf8");
      if (currentContent === content) {
        unchangedFiles.push(path);
        continue;
      }
      const backupPath = await createManagedEditBackup(path, currentContent);
      await writeFile(path, content, "utf8");
      backupFiles.push({ path, backupPath });
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
