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

function loadClaudeResumePromptBuilder(): (projectPath: string) => string {
  const rendererSource = readProjectFile("dist/renderer/app.js");
  const functionSource = extractFunctionSource(rendererSource, "buildClaudeRateLimitResumePrompt");
  const factory = new Function(`${functionSource}; return buildClaudeRateLimitResumePrompt;`) as () => (projectPath: string) => string;
  return factory();
}

test("Claude rate-limit resume prompt includes the touched project path when available", () => {
  const buildClaudeRateLimitResumePrompt = loadClaudeResumePromptBuilder();

  assert.equal(
    buildClaudeRateLimitResumePrompt("D:\\Cipher Agent\\pc-agent"),
    "Continue the existing project in D:\\Cipher Agent\\pc-agent. List what is already created, identify what is still missing, then complete only the remaining files using Claude filesystem tools."
  );
});

test("renderer appends Claude rate-limit guidance from the Claude error path", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /function isClaudeRateLimitError\(message: string\): boolean/);
  assert.match(rendererSource, /function maybeShowClaudeRateLimitResumeGuidance\(message: string\): void/);
  assert.match(rendererSource, /\[Claude rate limit\]/);
  assert.match(rendererSource, /Resume prompt:/);
  assert.match(rendererSource, /maybeShowClaudeRateLimitResumeGuidance\(message\);/);
});
