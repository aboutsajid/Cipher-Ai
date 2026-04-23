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

test("renderer keeps Claude chat output in exact plain-text mode and binds Claude sessions to a chat id", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /function shouldRenderMessageAsPlainText\(msg: Message \| undefined\): boolean/);
  assert.match(rendererSource, /msg\.model === CLAUDE_MODEL_LABEL/);
  assert.match(rendererSource, /contentEl\.dataset\["renderMode"\] = shouldRenderMessageAsPlainText\(message\) \? "plain" : "markdown"/);
  assert.match(rendererSource, /const ready = await ensureClaudeChatSessionReady\(chatId\);/);
  assert.match(rendererSource, /window\.api\.claude\.send\(claudePrompt, \{\s*chatId,/);
});

test("renderer preserves Claude system notices and applies sparse-chat density state", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /role: "system"/);
  assert.match(rendererSource, /metadata:\s*\{\s*systemNotice: true\s*\}/);
  assert.match(rendererSource, /renderedMessages = \[\.\.\.chat\.messages\];/);
  assert.match(rendererSource, /function updateMessageDensityState\(\): void/);
  assert.match(rendererSource, /container\.classList\.toggle\("messages-sparse", sparseConversation\)/);
});

test("main window restores saved bounds and no longer force-maximizes on every launch", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /function loadWorkspaceWindowState\(userDataPath: string\): StoredWorkspaceWindowState \| null/);
  assert.match(mainSource, /function registerWorkspaceWindowStatePersistence\(window: BrowserWindow, userDataPath: string\): void/);
  assert.match(mainSource, /const savedWindowState = GENERATED_DESKTOP_SHELL_ENABLED \? null : loadWorkspaceWindowState\(app\.getPath\("userData"\)\);/);
  assert.match(mainSource, /if \(!GENERATED_DESKTOP_SHELL_ENABLED && savedWindowState\?\.isMaximized === true && !window\.isMaximized\(\)\) \{\s*window\.maximize\(\);/);
  assert.doesNotMatch(mainSource, /if \(!GENERATED_DESKTOP_SHELL_ENABLED && !window\.isMaximized\(\)\) window\.maximize\(\);/);
});
