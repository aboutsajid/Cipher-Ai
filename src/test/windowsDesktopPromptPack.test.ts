import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeAgentSoakScenarios } from "../shared/agentSoak";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("windows desktop prompt pack stays desktop-only and marker-addressable", () => {
  const raw = JSON.parse(readProjectFile("prompts/agent-windows-desktop-pack.json")) as Array<Record<string, unknown>>;
  const scenarios = normalizeAgentSoakScenarios(raw);

  assert.equal(scenarios.length, 9);

  for (const scenario of scenarios) {
    assert.equal(scenario.category, "desktop-app");
    assert.equal(scenario.expectedArtifactType, "desktop-app");
    assert.match(scenario.prompt, /^\[SOAK:/);
    assert.match(scenario.prompt.toLowerCase(), /\bwindows\b/);
    assert.match(scenario.prompt.toLowerCase(), /\bdesktop\b/);
  }
});

test("windows desktop workflow points at the dedicated scenarios file and soak command", () => {
  const workflow = readProjectFile("prompts/agent-windows-desktop-workflow.md");

  assert.match(workflow, /agent-windows-desktop-pack\.json/);
  assert.match(workflow, /npm\.cmd run soak:agent:run/);
  assert.match(workflow, /--scenarios-file prompts\/agent-windows-desktop-pack\.json --local-only/);
});
