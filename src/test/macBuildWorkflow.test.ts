import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readProjectJson(path: string): Record<string, unknown> {
  return JSON.parse(readProjectFile(path)) as Record<string, unknown>;
}

test("mac build workflow only references npm scripts that exist", () => {
  const workflow = readProjectFile(".github/workflows/mac-build.yml");
  const packageJson = readProjectJson("package.json");
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const referencedScripts = [...workflow.matchAll(/npm(?:\.cmd)?\s+run\s+([a-z0-9:-]+)/gi)].map((match) => match[1]);

  assert.ok(referencedScripts.length > 0, "expected mac build workflow to reference npm scripts");
  for (const scriptName of referencedScripts) {
    assert.equal(typeof scripts[scriptName], "string", `workflow references missing npm script: ${scriptName}`);
  }

  assert.ok(referencedScripts.includes("build:ts"));
  assert.ok(referencedScripts.includes("build:assets"));
});

test("mac build workflow packages without publish and uploads dmg and zip artifacts", () => {
  const workflow = readProjectFile(".github/workflows/mac-build.yml");

  assert.match(workflow, /electron-builder --mac dmg zip --publish never/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(workflow, /Upload macOS artifacts/);
  assert.match(workflow, /release\/\*\.dmg/);
  assert.match(workflow, /release\/\*\.zip/);
  assert.match(workflow, /actions\/upload-artifact@v6/);
});
