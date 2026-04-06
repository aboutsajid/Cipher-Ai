import { app, BrowserWindow, ipcMain, Menu, shell, WebContents } from "electron";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { registerIpcHandlers } from "./ipc";
import { ChatsStore } from "./services/chatsStore";
import { SettingsStore } from "./services/settingsStore";
import { CcrService } from "./services/ccrService";
import { AgentTaskRunner } from "./services/agentTaskRunner";
import { getDebugLogPath, initDebugLogger, writeDebugLog } from "./services/debugLogger";
import type { IpcChannel } from "../shared/types";

const workspaceWindows = new Set<BrowserWindow>();
let settingsStore: SettingsStore | null = null;
let chatsStore: ChatsStore | null = null;
let ccrService: CcrService | null = null;
let agentTaskRunner: AgentTaskRunner | null = null;
const APP_NAME = "Cipher Workspace";
const APP_USER_MODEL_ID = "com.cipher.ai";

function resolveAgentWorkspaceRoot(): string {
  const configured = (process.env["CIPHER_WORKSPACE_ROOT"] ?? "").trim();
  const root = configured
    ? resolve(configured)
    : app.isPackaged
      ? join(app.getPath("documents"), APP_NAME, "workspace")
      : process.cwd();
  mkdirSync(root, { recursive: true });
  return root;
}

const IPC_CHANNELS: IpcChannel[] = [
  "app:workspacePath",
  "app:newWindow",
  "app:openExternal",
  "app:openPreview",
  "app:openPreviewWindow",
  "chat:list",
  "chat:get",
  "chat:create",
  "chat:delete",
  "chat:rename",
  "chat:export",
  "chat:import",
  "chat:appendMessage",
  "chat:updateMessage",
  "chat:setSystemPrompt",
  "chat:summarize",
  "chat:generateTitle",
  "chat:transcribeAudio",
  "chat:send",
  "chat:stop",
  "stats:get",
  "attachments:pick",
  "templates:list",
  "templates:save",
  "templates:delete",
  "ollama:listModels",
  "mcp:list",
  "mcp:add",
  "mcp:remove",
  "mcp:start",
  "mcp:stop",
  "mcp:status",
  "claude:status",
  "claude:start",
  "claude:send",
  "claude:applyEdits",
  "claude:stop",
  "agent:listTasks",
  "agent:getTask",
  "agent:getLogs",
  "agent:getRouteDiagnostics",
  "agent:startTask",
  "agent:stopTask",
  "agent:listSnapshots",
  "agent:getRestoreState",
  "agent:restoreSnapshot",
  "terminal:run",
  "workspace:listFiles",
  "workspace:readFile",
  "workspace:writeFile",
  "workspace:search",
  "workspace:pathExists",
  "workspace:openPath",
  "ollama:check",
  "clipboard:writeText",
  "settings:get",
  "settings:save",
  "router:status",
  "router:start",
  "router:stop",
  "router:test",
  "router:logs"
];

function attachEditableContextMenu(window: BrowserWindow): void {
  window.webContents.on("context-menu", (_event, params) => {
    const selection = (params.selectionText ?? "").trim();
    const hasSelection = selection.length > 0;
    const isEditable = Boolean(params.isEditable);

    if (!isEditable && !hasSelection) return;

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      template.push(
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      );
    } else if (hasSelection) {
      template.push(
        { role: "copy" },
        { type: "separator" },
        { role: "selectAll" }
      );
    }

    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
}

function allowLocalRendererNavigation(url: string): boolean {
  return url.startsWith("file://");
}

function allowExternalNavigation(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function createWindow(): Promise<BrowserWindow> {
  const appIconPath = process.platform === "win32"
    ? (app.isPackaged
      ? join(process.resourcesPath, "assets", "cipher-ai-icon.ico")
      : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.ico"))
    : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.png");

  const window = new BrowserWindow({
    width: 1680,
    height: 1040,
    minWidth: 1280,
    minHeight: 780,
    show: false,
    center: true,
    autoHideMenuBar: true,
    title: "Cipher Workspace",
    icon: appIconPath,
    backgroundColor: "#0a0e17",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  workspaceWindows.add(window);

  window.removeMenu();
  window.setMenuBarVisibility(false);
  attachEditableContextMenu(window);
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);

  window.webContents.on("console-message", (event) => {
    const levelTag = event.level === "error"
      ? "RENDERER_ERROR"
      : event.level === "warning"
        ? "RENDERER_WARN"
        : "RENDERER_INFO";
    writeDebugLog(levelTag, `${event.sourceId}:${event.lineNumber}`, event.message);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    writeDebugLog("RENDERER_GONE", details);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowExternalNavigation(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (allowLocalRendererNavigation(url)) return;
    event.preventDefault();
    if (allowExternalNavigation(url)) {
      void shell.openExternal(url);
    }
  });
  window.on("unresponsive", () => {
    writeDebugLog("WINDOW", "workspace window became unresponsive");
  });
  window.on("responsive", () => {
    writeDebugLog("WINDOW", "workspace window responsive again");
  });

  const showWindow = () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    if (!window.isMaximized()) window.maximize();
    if (!window.isVisible()) window.show();
    window.focus();
  };

  await window.loadFile(join(__dirname, "..", "renderer", "index.html"));

  window.once("ready-to-show", showWindow);
  window.webContents.once("did-finish-load", showWindow);
  setTimeout(showWindow, 1500);

  window.on("closed", () => {
    workspaceWindows.delete(window);
  });

  return window;
}

function getPrimaryWindow(): BrowserWindow | null {
  for (const window of workspaceWindows) {
    if (!window.isDestroyed()) return window;
  }
  return null;
}

function getWindowForSender(sender: WebContents): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed() || !workspaceWindows.has(window)) {
    return null;
  }
  return window;
}

function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const window of workspaceWindows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel, ...args);
  }
}

function registerIpcHandlersOnce(): void {
  if (!settingsStore || !chatsStore || !ccrService || !agentTaskRunner) {
    throw new Error("Services not initialized.");
  }

  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  registerIpcHandlers({
    settingsStore,
    chatsStore,
    ccrService,
    agentTaskRunner,
    createWindow,
    getWindowForSender,
    getPrimaryWindow,
    broadcastToWindows
  });
}

function focusPrimaryWindow(): void {
  const window = getPrimaryWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

async function bootstrap(): Promise<boolean> {
  app.setName(APP_NAME);
  if (process.platform === "win32") {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
  Menu.setApplicationMenu(null);
  app.setPath("userData", join(app.getPath("appData"), APP_NAME));
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    return false;
  }

  app.removeAllListeners("second-instance");
  app.on("second-instance", () => {
    void createWindow().catch((err) => {
      console.error("Failed to open new window:", err);
      writeDebugLog("ERROR", "failed to open new window on second instance", err);
      focusPrimaryWindow();
    });
  });

  const userDataPath = app.getPath("userData");
  const debugLogPath = initDebugLogger(userDataPath);
  console.log(`[debug] main log: ${debugLogPath}`);
  const workspaceRoot = resolveAgentWorkspaceRoot();
  writeDebugLog("WORKSPACE", `workspace root: ${workspaceRoot}`);
  settingsStore = new SettingsStore(userDataPath);
  chatsStore = new ChatsStore(userDataPath);
  ccrService = new CcrService(settingsStore);
  agentTaskRunner = new AgentTaskRunner(workspaceRoot, settingsStore, ccrService);

  await settingsStore.init();
  await chatsStore.init();

  registerIpcHandlersOnce();
  await createWindow();
  return true;
}

app.whenReady().then(async () => {
  try {
    const bootstrapped = await bootstrap();
    if (!bootstrapped) {
      app.quit();
    }
  } catch (err) {
    console.error("Bootstrap failed:", err);
    writeDebugLog("FATAL", "bootstrap failed", err);
    app.exit(1);
  }
});

app.on("activate", async () => {
  if (workspaceWindows.size !== 0) return;
  try {
    await createWindow();
  } catch (err) {
    console.error("Activate failed:", err);
    writeDebugLog("ERROR", "activate failed", err, "logPath", getDebugLogPath());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
