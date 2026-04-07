import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("generated desktop shells wait for rendered preview content before showing the window", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /const GENERATED_DESKTOP_READY_TIMEOUT_MS = Number\.parseInt\(process\.env\["CIPHER_GENERATED_DESKTOP_READY_TIMEOUT_MS"\] \?\? "8000", 10\);/);
  assert.match(mainSource, /async function waitForGeneratedDesktopPreview\(window: BrowserWindow, timeoutMs = GENERATED_DESKTOP_READY_TIMEOUT_MS\): Promise<boolean>/);
  assert.match(mainSource, /rootChildren > 0 && \(text\.length > 40 \|\| headingCount > 0\)/);
  assert.match(mainSource, /await delay\(250\);/);
});

test("generated desktop shells fall back to the browser preview if the shell does not render in time", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /async function ensureGeneratedDesktopPreviewVisible\(window: BrowserWindow, showWindow: \(\) => void\): Promise<void>/);
  assert.match(mainSource, /generated desktop preview timed out; opening browser fallback/);
  assert.match(mainSource, /await shell\.openExternal\(GENERATED_DESKTOP_URL\);/);
  assert.match(mainSource, /void ensureGeneratedDesktopPreviewVisible\(window, showWindow\);/);
});

test("generated desktop shells keep the generated title instead of the Vite document title", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /window\.on\("page-title-updated", \(event\) => \{/);
  assert.match(mainSource, /window\.setTitle\(GENERATED_DESKTOP_TITLE\);/);
});
