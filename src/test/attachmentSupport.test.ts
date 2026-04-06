import test from "node:test";
import assert from "node:assert/strict";
import { buildClaudeMessageContent, normalizeAttachments } from "../main/attachmentSupport";

test("normalizeAttachments trims and filters invalid attachment payloads", () => {
  const normalized = normalizeAttachments([
    { name: "  notes.md  ", type: "text", content: "hello", sourcePath: "  C:\\tmp\\notes.md  " },
    { name: "empty.txt", type: "text", content: "" },
    { name: "photo.png", type: "image", content: "data:image/png;base64,abc", mimeType: "image/png" }
  ]);

  assert.deepEqual(normalized, [
    { name: "notes.md", type: "text", content: "hello", sourcePath: "C:\\tmp\\notes.md", mimeType: undefined },
    { name: "photo.png", type: "image", content: "data:image/png;base64,abc", mimeType: "image/png", sourcePath: undefined }
  ]);
});

test("buildClaudeMessageContent includes text attachments and valid image blocks", () => {
  const content = buildClaudeMessageContent("Review this", [
    {
      name: "src/app.ts",
      type: "text",
      content: "console.log('hello');",
      sourcePath: "src/app.ts"
    },
    {
      name: "mock.png",
      type: "image",
      content: "data:image/png;base64,YWJj",
      mimeType: "image/png"
    }
  ], ["workspace.search"]);

  assert.ok(Array.isArray(content));
  assert.equal(content.length, 2);
  assert.equal(content[0]?.type, "text");
  assert.match(content[0]?.text ?? "", /FILE: src\/app\.ts/);
  assert.match(content[0]?.text ?? "", /workspace\.search/);
  assert.equal(content[1]?.type, "image");
});

test("buildClaudeMessageContent reports skipped unsupported images in the text block", () => {
  const content = buildClaudeMessageContent("Review this", [
    {
      name: "bad.bmp",
      type: "image",
      content: "data:image/bmp;base64,YWJj",
      mimeType: "image/bmp"
    }
  ]);

  assert.ok(Array.isArray(content));
  assert.equal(content.length, 1);
  assert.equal(content[0]?.type, "text");
  assert.match(content[0]?.text ?? "", /Skipped images: bad\.bmp/);
});
