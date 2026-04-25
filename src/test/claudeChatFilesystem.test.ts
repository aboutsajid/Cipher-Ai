import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { executeClaudeChatFilesystemTool, normalizeClaudeChatFilesystemSettings } from "../main/claudeChatFilesystem";

test("executeClaudeChatFilesystemTool reads, searches, lists, and writes only inside approved roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));
  const nestedDir = join(root, "docs");
  const filePath = join(nestedDir, "notes.txt");
  await mkdir(nestedDir, { recursive: true });
  await writeFile(filePath, "alpha\nbeta keyword\n", "utf8");

  const listResult = await executeClaudeChatFilesystemTool({
    tool: "list_files",
    args: { path: root, depth: 2 }
  }, {
    roots: [root],
    allowWrite: false
  });
  assert.equal(listResult.ok, true);
  assert.match(JSON.stringify(listResult.data), /notes\.txt/);

  const readResult = await executeClaudeChatFilesystemTool({
    tool: "read_file",
    args: { path: filePath }
  }, {
    roots: [root],
    allowWrite: false
  });
  assert.equal(readResult.ok, true);
  assert.match(JSON.stringify(readResult.data), /beta keyword/);

  const searchResult = await executeClaudeChatFilesystemTool({
    tool: "search_files",
    args: { path: root, pattern: "keyword" }
  }, {
    roots: [root],
    allowWrite: false
  });
  assert.equal(searchResult.ok, true);
  assert.match(JSON.stringify(searchResult.data), /keyword/);

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "write_file",
    args: { path: join(root, "new.txt"), content: "blocked" }
  }, {
    roots: [root],
    allowWrite: false
  }), /write access is disabled/i);

  const writePath = join(root, "written.txt");
  const writeResult = await executeClaudeChatFilesystemTool({
    tool: "write_file",
    args: { path: writePath, content: "saved" }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(writeResult.ok, true);
  assert.equal(await readFile(writePath, "utf8"), "saved");

  const batchResult = await executeClaudeChatFilesystemTool({
    tool: "write_files",
    args: {
      files: [
        { path: join(root, "project", "src", "main.ts"), content: "console.log('main');\n" },
        { path: join(root, "project", "package.json"), content: "{\n  \"name\": \"demo\"\n}\n" }
      ]
    }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(batchResult.ok, true);
  assert.equal(await readFile(join(root, "project", "src", "main.ts"), "utf8"), "console.log('main');\n");
  assert.equal(await readFile(join(root, "project", "package.json"), "utf8"), "{\n  \"name\": \"demo\"\n}\n");

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "read_file",
    args: { path: join(root, "..", "escape.txt") }
  }, {
    roots: [root],
    allowWrite: false
  }), /outside the approved claude chat folders/i);

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "list_files",
    args: {}
  }, {
    roots: [root],
    allowWrite: false
  }), /path is required/i);

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "write_files",
    args: {
      files: [{ path: join(root, "..", "escape.txt"), content: "blocked" }]
    }
  }, {
    roots: [root],
    allowWrite: true
  }), /outside the approved claude chat folders/i);
});

test("executeClaudeChatFilesystemTool supports write plans, binary writes, mkdir, move, and delete", async () => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));

  const planResult = await executeClaudeChatFilesystemTool({
    tool: "write_plan",
    args: {
      files: [
        { path: join(root, "src", "index.ts"), content: "console.log('ok');\n" },
        { path: join(root, "package.json"), content: "{\n  \"name\": \"demo\"\n}\n" }
      ]
    }
  }, {
    roots: [root],
    allowWrite: true,
    requireWritePlan: true
  });
  assert.equal(planResult.ok, true);
  assert.match(JSON.stringify(planResult.data), /plannedFileCount/);

  const mkdirResult = await executeClaudeChatFilesystemTool({
    tool: "mkdir_path",
    args: { path: join(root, "assets") }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(mkdirResult.ok, true);

  const binaryResult = await executeClaudeChatFilesystemTool({
    tool: "write_binary",
    args: {
      path: join(root, "assets", "logo.bin"),
      contentBase64: Buffer.from("binary").toString("base64")
    }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(binaryResult.ok, true);

  const moveResult = await executeClaudeChatFilesystemTool({
    tool: "move_path",
    args: {
      fromPath: join(root, "assets", "logo.bin"),
      toPath: join(root, "assets", "logo-moved.bin")
    }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(moveResult.ok, true);

  const deleteResult = await executeClaudeChatFilesystemTool({
    tool: "delete_path",
    args: { path: join(root, "assets", "logo-moved.bin") }
  }, {
    roots: [root],
    allowWrite: true
  });
  assert.equal(deleteResult.ok, true);
  await assert.rejects(() => readFile(join(root, "assets", "logo-moved.bin"), "utf8"));
});

test("executeClaudeChatFilesystemTool enforces create-only overwrite policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));
  const filePath = join(root, "notes.txt");
  await writeFile(filePath, "first", "utf8");

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "write_file",
    args: { path: filePath, content: "second" }
  }, {
    roots: [root],
    allowWrite: true,
    overwritePolicy: "create-only"
  }), /create-only policy/i);
});

test("normalizeClaudeChatFilesystemSettings ignores blank roots instead of resolving the workspace", () => {
  const root = resolve("approved-folder");
  const normalized = normalizeClaudeChatFilesystemSettings({
    roots: [" ", root],
    allowWrite: true,
    rootConfigs: [
      { path: "", allowWrite: true },
      { path: root, allowWrite: true }
    ],
    temporaryRoots: ["", "   "]
  });

  assert.deepEqual(normalized.roots, [root]);
  assert.deepEqual(normalized.rootConfigs?.map((entry) => entry.path), [root]);
  assert.deepEqual(normalized.temporaryRoots, []);
});

test("executeClaudeChatFilesystemTool applies the most specific root permissions first", async () => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));
  const lockedChild = join(root, "locked");
  await mkdir(lockedChild, { recursive: true });

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "write_file",
    args: { path: join(lockedChild, "note.txt"), content: "blocked" }
  }, {
    roots: [root, lockedChild],
    allowWrite: true,
    rootConfigs: [
      { path: root, allowWrite: true },
      { path: lockedChild, allowWrite: false }
    ]
  }), /write access is disabled/i);
});

test("executeClaudeChatFilesystemTool blocks symlink and junction escapes from approved roots", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));
  const outside = await mkdtemp(join(tmpdir(), "cipher-claude-outside-"));
  const linkPath = join(root, "linked");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    await symlink(outside, linkPath, linkType);
  } catch {
    t.skip("symlink creation is not available in this environment");
    return;
  }

  await writeFile(join(outside, "secret.txt"), "secret", "utf8");

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "read_file",
    args: { path: join(linkPath, "secret.txt") }
  }, {
    roots: [root],
    allowWrite: false
  }), /resolves outside the approved claude chat folders/i);

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "write_file",
    args: { path: join(linkPath, "new.txt"), content: "blocked" }
  }, {
    roots: [root],
    allowWrite: true
  }), /resolves outside the approved claude chat folders/i);
});

test("executeClaudeChatFilesystemTool blocks deleting an approved root", async () => {
  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));

  await assert.rejects(() => executeClaudeChatFilesystemTool({
    tool: "delete_path",
    args: { path: root, recursive: true }
  }, {
    roots: [root],
    allowWrite: true
  }), /deleting an approved claude chat folder root is blocked/i);
});
