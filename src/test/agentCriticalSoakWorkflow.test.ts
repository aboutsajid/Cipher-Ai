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

test("agent critical soak workflow supports OpenRouter or a custom endpoint and publishes artifacts", () => {
  const workflow = readProjectFile(".github/workflows/agent-critical-soak.yml");

  assert.match(workflow, /CIPHER_OPENROUTER_API_KEY:\s*\$\{\{\s*secrets\.OPENROUTER_API_KEY\s*\}\}/);
  assert.match(workflow, /CIPHER_API_KEY:\s*\$\{\{\s*secrets\.CIPHER_API_KEY\s*\}\}/);
  assert.match(workflow, /CIPHER_BASE_URL:\s*\$\{\{\s*vars\.CIPHER_BASE_URL\s*\}\}/);
  assert.match(workflow, /CIPHER_MODEL:\s*\$\{\{\s*vars\.CIPHER_MODEL\s*\}\}/);
  assert.match(workflow, /CIPHER_SKIP_AUTH:\s*\$\{\{\s*vars\.CIPHER_SKIP_AUTH\s*\}\}/);
  assert.match(workflow, /Set OPENROUTER_API_KEY or configure CIPHER_BASE_URL/);
  assert.match(workflow, /CIPHER_API_KEY is required when CIPHER_BASE_URL is set unless CIPHER_SKIP_AUTH=true/);
  assert.match(workflow, /Run critical agent soak/);
  assert.match(workflow, /Upload critical soak prompt catalog/);
  assert.match(workflow, /agent-critical-prompts/);
  assert.match(workflow, /agent-critical-report-markdown/);
  assert.match(workflow, /agent-critical-report-json/);
  assert.match(workflow, /agent-critical-history/);
});
