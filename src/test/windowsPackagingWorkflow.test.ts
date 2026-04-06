import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

function readProjectJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<string, unknown>;
}

test("windows packaging workflow only references npm scripts that exist", () => {
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/windows-packaging.yml"), "utf8");
  const packageJson = readProjectJson("package.json");
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;

  const referencedScripts = [...workflow.matchAll(/npm\.cmd run ([a-z0-9:-]+)/gi)].map((match) => match[1]);
  assert.ok(referencedScripts.length > 0, "expected workflow to reference npm scripts");

  for (const scriptName of referencedScripts) {
    assert.equal(
      typeof scripts[scriptName],
      "string",
      `workflow references missing npm script: ${scriptName}`
    );
  }

  assert.ok(referencedScripts.includes("smoke:electron:start"));
  assert.ok(referencedScripts.includes("smoke:win:install"));
  assert.ok(referencedScripts.includes("smoke:win:update"));
  assert.ok(referencedScripts.includes("smoke:win:summary"));
});

test("windows packaging npm script disables publish during CI packaging", () => {
  const packageJson = readProjectJson("package.json");
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;

  assert.match(
    scripts["pack:win"] ?? "",
    /--publish\s+never/,
    "pack:win should disable publish so CI packaging does not require GH_TOKEN"
  );
});

test("windows packaging workflow publishes smoke summaries to step summary and artifacts", () => {
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/windows-packaging.yml"), "utf8");

  assert.match(workflow, /Run Electron startup smoke/);
  assert.match(workflow, /npm\.cmd run smoke:electron:start/);
  assert.match(workflow, /Render install smoke summary/);
  assert.match(workflow, /windows-install-smoke-summary/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /Render update smoke summary/);
  assert.match(workflow, /windows-update-smoke-summary/);
});

test("windows installer smoke script uses a multiline PowerShell process query", () => {
  const script = readFileSync(resolve(process.cwd(), "scripts/smoke-win-installer.mjs"), "utf8");

  assert.match(
    script,
    /\$name = \$\{toPowerShellStringLiteral\(imageName\)\}[\s\S]*\]\.join\("\\n"\)/,
    "process listing should use a real multiline PowerShell script so the assignment and query stay separated"
  );
});

test("windows smoke formatter renders markdown from json report", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cipher-win-smoke-"));
  const reportPath = join(tempDir, "report.json");
  const outputPath = join(tempDir, "summary.md");

  try {
    writeFileSync(reportPath, JSON.stringify({
      generatedAt: "2026-04-06T10:00:00.000Z",
      status: "passed",
      installerPath: "C:\\release\\Cipher-Workspace-Setup-1.1.0.exe",
      steps: [
        { name: "install", status: "passed", details: { executablePath: "C:\\Cipher Workspace\\Cipher Workspace.exe" } },
        { name: "launch", status: "passed", details: { processCount: 1 } }
      ]
    }, null, 2));

    const result = spawnSync(process.execPath, [
      "scripts/format-win-smoke-report.mjs",
      reportPath,
      "--title",
      "Windows Install Smoke",
      "--output",
      outputPath
    ], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const markdown = readFileSync(outputPath, "utf8");
    assert.match(markdown, /# Windows Install Smoke/);
    assert.match(markdown, /Status: passed/);
    assert.match(markdown, /Installer: Cipher-Workspace-Setup-1\.1\.0\.exe/);
    assert.match(markdown, /- install: passed/);
    assert.match(markdown, /- launch: passed/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
