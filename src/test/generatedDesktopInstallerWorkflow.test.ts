import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("generated desktop app scaffolds include Windows packaging scripts and Electron builder dependencies", () => {
  const source = readProjectFile("src/main/services/agentTaskRunner.ts");

  assert.match(source, /main:\s*"electron\/main\.mjs"/);
  assert.match(source, /"package:win": "electron-builder --win nsis --publish never"/);
  assert.match(source, /electron: "\^35\.0\.0"/);
  assert.match(source, /"electron-builder": "\^26\.8\.1"/);
  assert.match(source, /signAndEditExecutable: false/);
  assert.match(source, /artifactName: "\$\{productName\}-Setup-\$\{version\}\.exe"/);
});

test("generated desktop app scaffolds include a packaged Electron main process entry", () => {
  const source = readProjectFile("src/main/services/agentTaskRunner.ts");

  assert.match(source, /this\.joinWorkspacePath\(workingDirectory, "electron\/main\.mjs"\)/);
  assert.match(source, /private buildGeneratedDesktopMainProcess\(projectName: string\): string/);
  assert.match(source, /window\.loadFile\(join\(__dirname, '\.\.', 'dist', 'index\.html'\)\)/);
});

test("generated desktop app verification includes Windows packaging", () => {
  const source = readProjectFile("src/main/services/agentTaskRunner.ts");

  assert.match(source, /private shouldVerifyWindowsPackaging\(artifactType: AgentArtifactType, plan: TaskExecutionPlan\): boolean/);
  assert.match(source, /private async verifyWindowsDesktopPackaging\(/);
  assert.match(source, /private getPackagingVerificationLabel\(artifactType: AgentArtifactType\): string/);
  assert.match(source, /return "Windows packaging";/);
  assert.match(source, /buildNpmScriptRequest\(scriptName, 300_000, workingDirectory\)/);
  assert.match(source, /return "App build, start, and Windows packaging passed\."/);
});
