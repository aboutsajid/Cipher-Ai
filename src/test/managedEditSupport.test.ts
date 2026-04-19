import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyManagedClaudeEdits, inspectManagedClaudeEdits } from "../main/managedEditSupport";

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

test("applyManagedClaudeEdits rejects snippet-sized replacements for large existing files", async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "page.html");
    const currentContent = [
      "<!doctype html>",
      "<html>",
      "<head><title>Cipher Lens</title></head>",
      "<body>",
      "<main>",
      "  <section class=\"hero\">",
      "    <h1>Cipher Lens</h1>",
      "    <p>Premium analytics workspace for desktop review.</p>",
      "  </section>",
      "  <section class=\"cards\">",
        "    <div class=\"card\">A</div>",
        "    <div class=\"card\">B</div>",
        "    <div class=\"card\">C</div>",
        "    <div class=\"card\">D</div>",
        "    <div class=\"card\">E</div>",
        "    <div class=\"card\">F</div>",
        "  </section>",
        "  <section class=\"details\">",
        "    <p>Desktop analytics, notifications, channel health, and editorial workflow previews.</p>",
        "    <p>Includes premium cards, badges, trend indicators, and responsive shell sections.</p>",
        "    <p>Used for internal UI review snapshots before implementation.</p>",
        "  </section>",
        "</main>",
        "</body>",
        "</html>"
    ].join("\n") + "\n".repeat(30);
    assert.equal(currentContent.length > 400, true);
    await writeFile(targetPath, currentContent, "utf8");

    const result = await applyManagedClaudeEdits(
      [{ path: targetPath, content: "<h2 class=\"sr-only\">Cipher Claude</h2>" }],
      { allowedPaths: [targetPath], allowedRoots: [] }
    );

    assert.equal(result.ok, false);
    assert.equal(result.savedFiles.length, 0);
    assert.equal(result.backupFiles.length, 0);
    assert.equal(result.failedFiles.length, 1);
    assert.match(result.failedFiles[0]?.reason ?? "", /small snippet|full updated file/i);
    assert.equal(await readFile(targetPath, "utf8"), currentContent);
  });
});

test("inspectManagedClaudeEdits rejects snippet-sized replacements before review", async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "page.html");
    const currentContent = [
      "<!doctype html>",
      "<html>",
      "<head><title>Cipher Lens</title></head>",
      "<body>",
      "<main>",
      "  <section class=\"hero\">",
      "    <h1>Cipher Lens</h1>",
      "    <p>Premium analytics workspace for desktop review.</p>",
      "  </section>",
      "  <section class=\"cards\">",
      "    <div class=\"card\">A</div>",
      "    <div class=\"card\">B</div>",
      "    <div class=\"card\">C</div>",
      "    <div class=\"card\">D</div>",
      "    <div class=\"card\">E</div>",
      "    <div class=\"card\">F</div>",
      "  </section>",
      "</main>",
      "</body>",
      "</html>"
    ].join("\n") + "\n".repeat(40);
    await writeFile(targetPath, currentContent, "utf8");

    const result = await inspectManagedClaudeEdits(
      [{ path: targetPath, content: "<h2 class=\"sr-only\">Cipher Ali</h2>" }],
      { allowedPaths: [targetPath], allowedRoots: [] }
    );

    assert.equal(result.ok, false);
    assert.equal(result.failedFiles.length, 1);
    assert.match(result.failedFiles[0]?.reason ?? "", /small snippet|full updated file/i);
    assert.equal(result.message, "Save blocked because Claude returned a snippet instead of the full updated file.");
    assert.equal(await readFile(targetPath, "utf8"), currentContent);
  });
});

test("inspectManagedClaudeEdits uses attached baseline content even when disk file is already truncated", { concurrency: false }, async () => {
  await withTempDir(async (dir) => {
    const targetPath = join(dir, "page.html");
    const baselineContent = [
      "<!doctype html>",
      "<html>",
      "<head><title>Cipher Lens</title></head>",
      "<body>",
      "<main>",
      "  <section class=\"hero\">",
      "    <h1>Cipher Lens</h1>",
      "    <p>Premium analytics workspace for desktop review.</p>",
      "  </section>",
      "  <section class=\"details\">",
      "    <p>Longer attached baseline content for strict validation.</p>",
      "  </section>",
      "</main>",
      "</body>",
      "</html>"
    ].join("\n") + "\n".repeat(80) + "dashboard-card\n".repeat(30);
    await writeFile(targetPath, "<h2 class=\"sr-only\">Cipher Ali</h2>", "utf8");

    const result = await inspectManagedClaudeEdits(
      [{ path: targetPath, content: "<h2 class=\"sr-only\">Cipher Zahid</h2>" }],
      { allowedPaths: [targetPath], allowedRoots: [] },
      [{ path: targetPath, content: baselineContent }]
    );

    assert.equal(result.ok, false);
    assert.equal(result.failedFiles.length, 1);
    assert.match(result.failedFiles[0]?.reason ?? "", /small snippet|full updated file/i);
  });
});
