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

test("agent critical soak workflow only references npm scripts that exist", () => {
  const workflow = readProjectFile(".github/workflows/agent-critical-soak.yml");
  const packageJson = readProjectJson("package.json");
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const referencedScripts = [...workflow.matchAll(/npm(?:\.cmd)?\s+run\s+([a-z0-9:-]+)/gi)].map((match) => match[1]);

  assert.ok(referencedScripts.length > 0, "expected agent critical soak workflow to reference npm scripts");
  for (const scriptName of referencedScripts) {
    assert.equal(typeof scripts[scriptName], "string", `workflow references missing npm script: ${scriptName}`);
  }

  assert.ok(referencedScripts.includes("soak:agent:critical:prompts"));
  assert.ok(referencedScripts.includes("soak:agent:critical:report"));
});

test("agent critical soak workflow requires the OpenRouter secret and publishes artifacts", () => {
  const workflow = readProjectFile(".github/workflows/agent-critical-soak.yml");

  assert.match(workflow, /CIPHER_OPENROUTER_API_KEY:\s*\$\{\{\s*secrets\.OPENROUTER_API_KEY\s*\}\}/);
  assert.match(workflow, /OPENROUTER_API_KEY secret is required/);
  assert.match(workflow, /Run critical agent soak/);
  assert.match(workflow, /Upload critical soak prompt catalog/);
  assert.match(workflow, /agent-critical-prompts/);
  assert.match(workflow, /agent-critical-report-markdown/);
  assert.match(workflow, /agent-critical-report-json/);
  assert.match(workflow, /agent-critical-history/);
});
