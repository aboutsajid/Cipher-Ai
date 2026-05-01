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
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appChatContextProviderUiUtils.ts")
  ].join("\n");

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
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appChatContextProviderUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /function shouldOpenDraftChatFromLocation\(\): boolean/);
  assert.match(rendererSource, /new URLSearchParams\(window\.location\.search\)\.get\("draftChat"\)/);
  assert.match(rendererSource, /openDraftChat\(\);/);
});

test("renderer binds Claude sessions to a chat id without forcing Claude assistant output into plain-text mode", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appMessageRenderUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /function shouldRenderMessageAsPlainText\(msg: Message \| undefined\): boolean/);
  assert.match(rendererSource, /return msg\?\.role === "system";/);
  assert.doesNotMatch(rendererSource, /msg\.model === CLAUDE_MODEL_LABEL/);
  assert.match(rendererSource, /contentEl\.dataset\["renderMode"\] = shouldRenderMessageAsPlainText\(message\) \? "plain" : "markdown"/);
  assert.match(rendererSource, /const ready = await ensureClaudeChatSessionReady\(chatId\);/);
  assert.match(rendererSource, /window\.api\.claude\.send\(claudePrompt, \{\s*chatId,/);
});

test("renderer only enables Claude managed write mode when prompts include explicit workspace or file write signals", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /function isClaudeManagedWriteRequest\(prompt: string, attachments: AttachmentPayload\[\] = \[\]\): boolean/);
  assert.match(rendererSource, /const hasWriteContext = editableAttachmentPaths\.length > 0 \|\| writableAttachmentRoots\.length > 0;/);
  assert.match(rendererSource, /const explicitWriteIntent = requestLead \|\| imperativeLead;/);
  assert.match(rendererSource, /const fileTarget = \/\\b\(workspace\|repo\|repository\|package\|file\|files\|folder\|folders\|directory\|directories\|component\|components\|module\|modules\|script\|scripts\|source\|src\|readme\|package\\\.json\)\\b\//);
  assert.match(rendererSource, /const productTarget = \/\\b\(project\|app\|application\|service\|api\|library\|tool\|website\|site\)\\b\//);
  assert.match(rendererSource, /const workspaceScopeHint = \/\\b\(in\|inside\|within\|under\)\\s\+\(\?:this\\s\+\)\?\(workspace\|repo\|repository\|folder\|directory\|project\)\\b\//);
  assert.doesNotMatch(rendererSource, /if \(pathHint\) return true;/);
  assert.match(rendererSource, /isClaudeManagedWriteRequest\(prompt, attachmentsToSend\)/);
});

test("renderer preserves Claude system notices and applies sparse-chat density state", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appChatLoadUiUtils.ts"),
    readProjectFile("src/renderer/appMessageRenderUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /role: "system"/);
  assert.match(rendererSource, /metadata:\s*\{\s*systemNotice: true\s*\}/);
  assert.match(rendererSource, /renderedMessages = \[\.\.\.chat\.messages\];/);
  assert.match(rendererSource, /function updateMessageDensityState\(\): void/);
  assert.match(rendererSource, /container\.classList\.toggle\("messages-sparse", sparseConversation\)/);
});

test("renderer keeps chat loading resilient when restoring provider context fails", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appChatLoadUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /const storedContext = getStoredChatContext\(chat\);/);
  assert.match(rendererSource, /try \{\s*applyChatContextToUi\(storedContext\);\s*\} catch \(err\) \{/);
  assert.match(rendererSource, /console\.error\("Failed to apply chat context:", err\);/);
  assert.match(rendererSource, /updateChatHeaderTitle\(chat\.title\);/);
});

test("renderer falls back to saved Ollama models when refresh fails during provider switching", () => {
  const rendererSource = [
    readProjectFile("src/renderer/app.ts"),
    readProjectFile("src/renderer/appChatContextProviderUiUtils.ts")
  ].join("\n");

  assert.match(rendererSource, /try \{\s*models = await window\.api\.ollama\.listModels\(baseUrl\);\s*\} catch \(err\) \{/);
  assert.match(rendererSource, /models = \(base\.ollamaModels \?\? \[\]\)\.map\(\(model\) => model\.trim\(\)\)\.filter\(Boolean\);/);
  assert.match(rendererSource, /showToast\(models\.length > 0 \? "Ollama refresh failed\. Using saved local models\." : "Ollama models refresh failed\.", 3600\);/);
});

test("renderer top stop button stops active Claude sessions", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");

  assert.match(rendererSource, /async function stopClaudeSessionFromUi\(toastMessage = "Claude stop requested\."\): Promise<boolean>/);
  assert.match(rendererSource, /suppressClaudeExitNotice = true;\s*setClaudeStatus\("Stopping Claude Code\.\.\.", "busy"\);/);
  assert.match(rendererSource, /const res = await window\.api\.claude\.stop\(\);/);
  assert.match(rendererSource, /\$\("stop-btn"\)\.onclick = async \(\) => \{[\s\S]*currentMode === "claude" \|\| currentMode === "edit" \|\| activeClaudeAssistantMessageId[\s\S]*await stopClaudeSessionFromUi\(\);[\s\S]*return;/);
});

test("main window restores saved bounds and no longer force-maximizes on every launch", () => {
  const mainSource = readProjectFile("src/main/main.ts");

  assert.match(mainSource, /function loadWorkspaceWindowState\(userDataPath: string\): StoredWorkspaceWindowState \| null/);
  assert.match(mainSource, /function registerWorkspaceWindowStatePersistence\(window: BrowserWindow, userDataPath: string\): void/);
  assert.match(mainSource, /const savedWindowState = GENERATED_DESKTOP_SHELL_ENABLED \? null : loadWorkspaceWindowState\(app\.getPath\("userData"\)\);/);
  assert.match(mainSource, /if \(!GENERATED_DESKTOP_SHELL_ENABLED && savedWindowState\?\.isMaximized === true && !window\.isMaximized\(\)\) \{\s*window\.maximize\(\);/);
  assert.doesNotMatch(mainSource, /if \(!GENERATED_DESKTOP_SHELL_ENABLED && !window\.isMaximized\(\)\) window\.maximize\(\);/);
});
