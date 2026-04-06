import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("new window flow opens another workspace window in draft-chat mode without creating a saved chat", () => {
  const ipcSource = readProjectFile("src/main/chatAppIpc.ts");

  assert.match(ipcSource, /ipcMain\.handle\("app:newWindow", async \(\) => \{\s*await createWindow\(undefined, true\);/);
  assert.match(ipcSource, /await createWindow\(undefined, true\);/);
});

test("renderer startup honors the chatId query parameter for initial chat selection", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /new URLSearchParams\(window\.location\.search\)\.get\("chatId"\)/);
  assert.match(rendererSource, /const initialChatId = getInitialChatIdFromLocation\(\);/);
  assert.match(rendererSource, /await loadChat\(initialChatId\);/);
});

test("main window loader passes draft-chat state into the renderer query string when requested", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /async function createWindow\(initialChatId\?: string, startDraftChat = false\)/);
  assert.match(mainSource, /await window\.loadFile\(rendererEntry, \{/);
  assert.match(mainSource, /chatId: initialChatId\.trim\(\)/);
  assert.match(mainSource, /draftChat: "1"/);
});

test("second instance flow also opens another workspace window in draft-chat mode", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /async function createFreshChatWindow\(\): Promise<BrowserWindow>/);
  assert.match(mainSource, /return createWindow\(undefined, true\);/);
  assert.match(mainSource, /app\.on\("second-instance", \(\) => \{\s*void createFreshChatWindow\(\)/);
});

test("renderer can open an unsaved draft chat from the window query string", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /function shouldOpenDraftChatFromLocation\(\): boolean/);
  assert.match(rendererSource, /new URLSearchParams\(window\.location\.search\)\.get\("draftChat"\)/);
  assert.match(rendererSource, /openDraftChat\(\);/);
});
