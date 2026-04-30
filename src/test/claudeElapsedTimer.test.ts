import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function extractFunctionSource(source: string, functionName: string): string {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `expected to find ${functionName} in renderer source`);

  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `expected to find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Failed to extract ${functionName} from renderer source.`);
}

function loadClaudeElapsedFormatter(): (durationMs: number) => string {
  const rendererSource = [
    readProjectFile("dist/renderer/appClaudeSafetyUiUtils.js"),
    readProjectFile("dist/renderer/app.js")
  ].join("\n");
  const functionSource = extractFunctionSource(rendererSource, "formatClaudeElapsed");
  const factory = new Function(`${functionSource}; return formatClaudeElapsed;`) as () => (durationMs: number) => string;
  return factory();
}

test("Claude elapsed formatter renders seconds and minute-second labels", () => {
  const formatClaudeElapsed = loadClaudeElapsedFormatter();

  assert.equal(formatClaudeElapsed(0), "0s");
  assert.equal(formatClaudeElapsed(12_400), "12s");
  assert.equal(formatClaudeElapsed(65_000), "1m 05s");
});

test("renderer uses the shared streaming timer across app activity states", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appClaudeSafetyUiUtils.ts"),
    readProjectFile("src/renderer/appSendUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /function startClaudeElapsedTimer\(statusText: string\): void/);
  assert.match(rendererSource, /function stopClaudeElapsedTimer\(\): void/);
  assert.match(rendererSource, /if \(!claudeElapsedStartedAt\) \{\s*startClaudeElapsedTimer\(nextStatusText\);/);
  assert.match(rendererSource, /setStreamingUi\(true, compareModeEnabled \? "Comparing models\.\.\." : "Generating\.\.\."\);/);
  assert.match(rendererSource, /setStreamingUi\(true, "Generating image\.\.\."\);/);
  assert.match(rendererSource, /setStreamingUi\(true, activity\);/);
  assert.match(rendererSource, /stopClaudeElapsedTimer\(\);\s*\$\("send-btn"\)\.removeAttribute\("disabled"\);/);
});
