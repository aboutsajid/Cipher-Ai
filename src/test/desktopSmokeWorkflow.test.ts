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

test("desktop smoke workflow references npm scripts that exist", () => {
  const workflow = readProjectFile(".github/workflows/desktop-smoke.yml");
  const packageJson = readProjectJson("package.json");
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const referencedScripts = [...workflow.matchAll(/npm(?:\.cmd)?\s+run\s+([a-z0-9:-]+)/gi)].map((match) => match[1]);

  assert.ok(referencedScripts.length > 0, "expected desktop smoke workflow to reference npm scripts");
  for (const scriptName of referencedScripts) {
    assert.equal(typeof scripts[scriptName], "string", `workflow references missing npm script: ${scriptName}`);
  }

  assert.ok(referencedScripts.includes("smoke:electron:start"));
});

test("desktop smoke workflow runs tests before the Electron startup smoke", () => {
  const workflow = readProjectFile(".github/workflows/desktop-smoke.yml");

  assert.match(workflow, /Run unit and integration tests/);
  assert.match(workflow, /npm\.cmd test/);
  assert.match(workflow, /Run Electron startup smoke/);
  assert.match(workflow, /npm\.cmd run smoke:electron:start/);
});

test("electron startup smoke runner launches the built Electron main entry in smoke mode", () => {
  const script = readProjectFile("scripts/electron-startup-smoke.mjs");

  assert.match(script, /CIPHER_SMOKE_STARTUP:\s*"1"/);
  assert.match(script, /CIPHER_WORKSPACE_ROOT:\s*smokeWorkspaceRoot/);
  assert.match(script, /dist",\s*"main",\s*"main\.js"/);
  assert.match(script, /exitCode !== 0/);
  assert.match(script, /passing startup marker/);
});
