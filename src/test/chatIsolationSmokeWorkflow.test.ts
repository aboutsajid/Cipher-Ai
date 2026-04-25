import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("chat isolation smoke seeds image history and validates image mode interactions", () => {
  const script = readProjectFile("scripts/chat-isolation-electron.cjs");
  const launcher = readProjectFile("scripts/chat-isolation-smoke.mjs");

  assert.match(script, /seedImageHistory\(userDataPath\)/);
  assert.match(script, /"cipher-workspace", "generated-images"/);
  assert.match(script, /#image-studio-search-input/);
  assert.match(script, /#image-studio-sort-select/);
  assert.match(script, /image-history-reuse-btn/);
  assert.match(script, /window\.confirm = \(\) => \{\s*confirmCalls \+= 1;\s*return false;\s*\};/);
  assert.match(script, /window\.confirm = \(\) => \{\s*confirmCalls \+= 1;\s*return true;\s*\};/);
  assert.match(script, /Confirmed image delete did not remove the selected card\./);
  assert.match(script, /imageMode/);
  assert.match(launcher, /CIPHER_CHAT_ISOLATION_TIMEOUT_MS[\s\S]*45000/);
});
