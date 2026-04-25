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

function loadRendererFunction<T>(functionNames: string[], returnName: string): T {
  const rendererSource = readProjectFile("dist/renderer/app.js");
  const functionSources = functionNames
    .map((functionName) => extractFunctionSource(rendererSource, functionName))
    .join("\n");
  const factory = new Function(`${functionSources}; return ${returnName};`) as () => T;
  return factory();
}

test("Claude rate-limit resume prompt includes the touched project path when available", () => {
  const buildClaudeRateLimitResumePrompt = loadClaudeResumePromptBuilder();

  assert.equal(
    buildClaudeRateLimitResumePrompt("D:\\Cipher Agent\\pc-agent"),
    "Continue the existing project in D:\\Cipher Agent\\pc-agent. First list the existing files in that target, identify what is still missing, then complete only the remaining files using Claude filesystem tools. Do not create a sibling project folder."
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

test("renderer exposes Claude target lock, resume action, and filesystem timeline hooks", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  const rendererHtml = readProjectFile("src/renderer/index.html");

  assert.match(rendererHtml, /id="claude-chat-safety-panel"/);
  assert.match(rendererHtml, /id="claude-target-chip"/);
  assert.match(rendererHtml, /id="claude-resume-btn"/);
  assert.match(rendererHtml, /id="claude-fs-timeline"/);
  assert.match(rendererSource, /function getClaudeLockedProjectTarget\(\): string/);
  assert.match(rendererSource, /function buildLockedClaudeFilesystemAccess/);
  assert.match(rendererSource, /function refreshClaudeSafetyPanel\(\): void/);
  assert.match(rendererSource, /fillClaudeResumePrompt/);
});

test("renderer infers project target without locking to root-level project folders", () => {
  const getClaudeProjectCandidateForPath = loadRendererFunction<(path: string, roots: string[]) => string>([
    "normalizePathForComparison",
    "isSameOrInsidePath",
    "getParentPath",
    "isLikelyClaudeProjectRootRelativePath",
    "getClaudeProjectCandidateForPath"
  ], "getClaudeProjectCandidateForPath");

  assert.equal(
    getClaudeProjectCandidateForPath("D:\\Projects\\Selected App\\README.md", ["D:\\Projects\\Selected App"]),
    "D:\\Projects\\Selected App"
  );
  assert.equal(
    getClaudeProjectCandidateForPath("D:\\Projects\\Selected App\\src\\App.tsx", ["D:\\Projects\\Selected App"]),
    "D:\\Projects\\Selected App"
  );
  assert.equal(
    getClaudeProjectCandidateForPath("D:\\Projects\\pc-agent\\README.md", ["D:\\Projects"]),
    "D:\\Projects\\pc-agent"
  );
});

test("renderer includes temporary Claude roots when building writable root drafts", () => {
  const getClaudeWritableRootDraftsFromFilesystem = loadRendererFunction<(filesystem: {
    roots: string[];
    allowWrite: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
    temporaryRoots?: string[];
  }) => Array<{ path: string; allowWrite: boolean }>>([
    "normalizeClaudeChatFilesystemRoots",
    "normalizeClaudeChatFilesystemRootDrafts",
    "getClaudeWritableRootDraftsFromFilesystem"
  ], "getClaudeWritableRootDraftsFromFilesystem");

  assert.deepEqual(
    getClaudeWritableRootDraftsFromFilesystem({
      roots: [],
      allowWrite: true,
      temporaryRoots: ["D:\\Temp Claude Target"]
    }).map((root) => root.path),
    ["D:\\Temp Claude Target"]
  );
});
