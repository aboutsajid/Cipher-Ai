import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("real usage log initializer writes a dated markdown log with baseline totals", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "cipher-real-usage-"));
  const tmpPath = join(workspaceRoot, "tmp");
  const outputPath = join(tmpPath, "agent-real-usage-log.md");

  try {
    mkdirSync(tmpPath, { recursive: true });
    writeFileSync(
      join(tmpPath, "agent-soak-report.json"),
      JSON.stringify({
        totals: {
          scenarios: 28,
          run: 28,
          failed: 0,
          fallbackUsed: 0,
          blacklistedScenarios: 0,
          verificationPassed: 28
        }
      }, null, 2)
    );
    writeFileSync(
      join(tmpPath, "agent-realworld-report.json"),
      JSON.stringify({
        totals: {
          scenarios: 7,
          run: 7,
          failed: 0,
          fallbackUsed: 0,
          blacklistedScenarios: 0,
          verificationPassed: 7
        }
      }, null, 2)
    );

    const result = spawnSync(process.execPath, [
      "scripts/init-real-usage-log.mjs",
      "--workspace-root",
      workspaceRoot,
      "--output",
      "tmp/agent-real-usage-log.md",
      "--date",
      "2026-04-06"
    ], {
      cwd: resolve(process.cwd()),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const markdown = readFileSync(outputPath, "utf8");
    assert.match(markdown, /# Real Usage Prompt Log/);
    assert.match(markdown, /Date: 2026-04-06/);
    assert.match(markdown, /- Core soak: 28\/28 run, 0 failed, 0 fallback, 0 blacklisted, 28 verification passed/);
    assert.match(markdown, /- Realworld: 7\/7 run, 0 failed, 0 fallback, 0 blacklisted, 7 verification passed/);
    assert.match(markdown, /- Messy: unavailable/);
    assert.match(markdown, /## Triage Labels/);
    assert.match(markdown, /## Entry Template/);
    assert.match(markdown, /## Follow-Up Backlog/);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
