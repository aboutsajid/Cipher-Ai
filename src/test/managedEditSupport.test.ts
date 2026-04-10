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
      { allowedPaths: [targetPath], allowedRoots: [] }
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
      { allowedPaths: [targetPath], allowedRoots: [] }
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.unchangedFiles, [targetPath]);
    assert.equal(result.failedFiles.length, 1);
    assert.match(result.failedFiles[0]?.reason ?? "", /not allowed/i);
  });
});

test("applyManagedClaudeEdits creates new files inside allowed writable roots", async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "cipher-agent", "README.md");

    const result = await applyManagedClaudeEdits(
      [{ path: targetPath, content: "# Cipher Agent\n" }],
      { allowedPaths: [], allowedRoots: [dir] }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.savedFiles, [targetPath]);
    assert.equal(result.backupFiles.length, 0);
    assert.equal(await readFile(targetPath, "utf8"), "# Cipher Agent\n");
  });
});

test("applyManagedClaudeEdits blocks new files outside allowed writable roots", async () => {
  await withTempDir(async (dir) => {
    const siblingDir = await mkdtemp(join(tmpdir(), "cipher-managed-edit-outside-"));
    const targetPath = join(siblingDir, "outside.txt");

    try {
      const result = await applyManagedClaudeEdits(
        [{ path: targetPath, content: "blocked" }],
        { allowedPaths: [], allowedRoots: [dir] }
      );

      assert.equal(result.ok, false);
      assert.equal(result.savedFiles.length, 0);
      assert.equal(result.failedFiles.length, 1);
      assert.match(result.failedFiles[0]?.reason ?? "", /not allowed/i);
    } finally {
      await rm(siblingDir, { recursive: true, force: true });
    }
  });
});
