import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeClaudeChatFilesystemTool } from "../main/claudeChatFilesystem";

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
});
