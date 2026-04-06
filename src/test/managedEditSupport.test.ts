import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyManagedClaudeEdits } from "../main/managedEditSupport";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cipher-managed-edit-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("applyManagedClaudeEdits saves changed files and writes backups", async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "note.txt");
    await writeFile(targetPath, "before", "utf8");

    const result = await applyManagedClaudeEdits(
      [{ path: targetPath, content: "after" }],
      [targetPath]
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.savedFiles, [targetPath]);
    assert.equal(result.backupFiles.length, 1);
    assert.equal(await readFile(targetPath, "utf8"), "after");

    const backupDir = join(dir, ".cipher-backups");
    const backupEntries = await readdir(backupDir);
    assert.equal(backupEntries.length, 1);
  });
});

test("applyManagedClaudeEdits reports unchanged and rejected paths", async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "note.txt");
    await writeFile(targetPath, "same", "utf8");

    const result = await applyManagedClaudeEdits(
      [
        { path: targetPath, content: "same" },
        { path: join(dir, "blocked.txt"), content: "nope" }
      ],
      [targetPath]
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.unchangedFiles, [targetPath]);
    assert.equal(result.failedFiles.length, 1);
    assert.match(result.failedFiles[0]?.reason ?? "", /not allowed/i);
  });
});
