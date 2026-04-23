import { app, BrowserWindow, ipcMain, Menu, screen, shell, WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { registerIpcHandlers } from "./ipc";
import { ChatsStore } from "./services/chatsStore";
import { SettingsStore } from "./services/settingsStore";
import { CcrService } from "./services/ccrService";
import { AgentTaskRunner } from "./services/agentTaskRunner";
import { ImageGenerationService } from "./services/imageGenerationService";
import { GeneratedImagesStore } from "./services/generatedImagesStore";
import { getDebugLogPath, initDebugLogger, writeDebugLog } from "./services/debugLogger";
import type { IpcChannel } from "../shared/types";

const workspaceWindows = new Set<BrowserWindow>();
let settingsStore: SettingsStore | null = null;
let chatsStore: ChatsStore | null = null;
let ccrService: CcrService | null = null;
let imageGenerationService: ImageGenerationService | null = null;
let generatedImagesStore: GeneratedImagesStore | null = null;
let agentTaskRunner: AgentTaskRunner | null = null;
const APP_NAME = "Cipher Workspace";
const APP_USER_MODEL_ID = "com.cipher.ai";
const STARTUP_SMOKE_ENABLED = (process.env["CIPHER_SMOKE_STARTUP"] ?? "").trim() === "1";
const STARTUP_SMOKE_EXIT_DELAY_MS = Number.parseInt(process.env["CIPHER_SMOKE_EXIT_DELAY_MS"] ?? "2500", 10);
const GENERATED_DESKTOP_URL = (process.env["CIPHER_GENERATED_DESKTOP_URL"] ?? "").trim();
const GENERATED_DESKTOP_TITLE = (process.env["CIPHER_GENERATED_DESKTOP_TITLE"] ?? "").trim() || "Generated Desktop App";
const GENERATED_DESKTOP_SHELL_ENABLED = GENERATED_DESKTOP_URL.length > 0;
const GENERATED_DESKTOP_READY_TIMEOUT_MS = Number.parseInt(process.env["CIPHER_GENERATED_DESKTOP_READY_TIMEOUT_MS"] ?? "8000", 10);
const OVERRIDE_USER_DATA_PATH = (process.env["CIPHER_USER_DATA_PATH"] ?? "").trim();
const SINGLE_INSTANCE_DISABLED = (process.env["CIPHER_DISABLE_SINGLE_INSTANCE"] ?? "").trim() === "1";
let startupSmokeCompleted = false;
let startupSmokeTimer: NodeJS.Timeout | null = null;
const DEFAULT_WORKSPACE_WINDOW_BOUNDS = {
  width: 1680,
  height: 1040
};
const DEFAULT_GENERATED_WINDOW_BOUNDS = {
  width: 1280,
  height: 860
};
const MIN_WORKSPACE_WINDOW_BOUNDS = {
  width: 1280,
  height: 780
};
const MIN_GENERATED_WINDOW_BOUNDS = {
  width: 980,
  height: 720
};

interface StoredWorkspaceWindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

if (STARTUP_SMOKE_ENABLED) {
  app.disableHardwareAcceleration();
}

function finishStartupSmoke(code: number, message: string, ...details: unknown[]): void {
  if (!STARTUP_SMOKE_ENABLED || startupSmokeCompleted) return;
  startupSmokeCompleted = true;
  if (startupSmokeTimer) {
    clearTimeout(startupSmokeTimer);
    startupSmokeTimer = null;
  }

  const level = code === 0 ? "SMOKE" : "SMOKE_FAIL";
  writeDebugLog(level, message, ...details);
  if (code === 0) {
    console.log(`[smoke] ${message}`);
  } else {
    console.error(`[smoke] ${message}`, ...details);
  }

  setTimeout(() => {
    app.exit(code);
  }, 0);
}

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

function resolveClaudeChatWorkingDirectory(userDataPath: string): string {
  const configured = (process.env["CIPHER_CLAUDE_CHAT_CWD"] ?? "").trim();
  const root = configured
    ? resolve(configured)
    : join(userDataPath, "cipher-workspace", "claude-chat-neutral");
  mkdirSync(root, { recursive: true });
  return root;
}

function resolveWorkspaceWindowStatePath(userDataPath: string): string {
  const stateDir = join(userDataPath, "cipher-workspace");
  mkdirSync(stateDir, { recursive: true });
  return join(stateDir, "workspace-window-state.json");
}

function clampWindowDimension(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.round(parsed));
}

function parseWorkspaceWindowState(raw: unknown): StoredWorkspaceWindowState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const width = clampWindowDimension(candidate.width, DEFAULT_WORKSPACE_WINDOW_BOUNDS.width, MIN_WORKSPACE_WINDOW_BOUNDS.width);
  const height = clampWindowDimension(candidate.height, DEFAULT_WORKSPACE_WINDOW_BOUNDS.height, MIN_WORKSPACE_WINDOW_BOUNDS.height);
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  return {
    width,
    height,
    x: Number.isFinite(x) ? Math.round(x) : undefined,
    y: Number.isFinite(y) ? Math.round(y) : undefined,
    isMaximized: candidate.isMaximized === true
  };
}

function isVisibleWindowState(state: StoredWorkspaceWindowState): boolean {
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) return false;
  const area = { x: state.x!, y: state.y!, width: state.width, height: state.height };
  const display = screen.getDisplayMatching(area);
  const workArea = display.workArea;
  return area.x < workArea.x + workArea.width
    && area.x + area.width > workArea.x
    && area.y < workArea.y + workArea.height
    && area.y + area.height > workArea.y;
}

function loadWorkspaceWindowState(userDataPath: string): StoredWorkspaceWindowState | null {
  try {
    const filePath = resolveWorkspaceWindowStatePath(userDataPath);
    return parseWorkspaceWindowState(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function persistWorkspaceWindowState(window: BrowserWindow, userDataPath: string): void {
  if (window.isDestroyed()) return;
  const bounds = window.isMaximized() || window.isMinimized()
    ? window.getNormalBounds()
    : window.getBounds();
  const state: StoredWorkspaceWindowState = {
    width: clampWindowDimension(bounds.width, DEFAULT_WORKSPACE_WINDOW_BOUNDS.width, MIN_WORKSPACE_WINDOW_BOUNDS.width),
    height: clampWindowDimension(bounds.height, DEFAULT_WORKSPACE_WINDOW_BOUNDS.height, MIN_WORKSPACE_WINDOW_BOUNDS.height),
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
    isMaximized: window.isMaximized()
  };
  try {
    writeFileSync(resolveWorkspaceWindowStatePath(userDataPath), JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    writeDebugLog("WINDOW", "failed to persist workspace window state", error);
  }
}

function registerWorkspaceWindowStatePersistence(window: BrowserWindow, userDataPath: string): void {
  const persist = () => persistWorkspaceWindowState(window, userDataPath);
  window.on("resize", persist);
  window.on("move", persist);
  window.on("maximize", persist);
  window.on("unmaximize", persist);
  window.on("close", persist);
}

const IPC_CHANNELS: IpcChannel[] = [
  "app:workspacePath",
  "app:getInfo",
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
  "chat:setContext",
  "chat:setSystemPrompt",
  "chat:summarize",
  "chat:generateTitle",
  "chat:transcribeAudio",
  "chat:send",
  "chat:stop",
  "stats:get",
  "images:generate",
  "images:listHistory",
  "images:save",
  "images:deleteHistory",
  "attachments:pick",
  "attachments:pickWritableRoots",
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
  "agent:restartTask",
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
    const misspelledWord = (params.misspelledWord ?? "").trim();
    const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions.filter(Boolean) : [];

    if (!isEditable && !hasSelection && !misspelledWord) return;

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable && misspelledWord) {
      if (suggestions.length > 0) {
        template.push(...suggestions.slice(0, 6).map((suggestion) => ({
          label: suggestion,
          click: () => {
            window.webContents.replaceMisspelling(suggestion);
          }
        })));
      } else {
        template.push({
          label: "No spelling suggestions",
          enabled: false
        });
      }

      template.push(
        {
          label: "Add to Dictionary",
          click: () => {
            window.webContents.session.addWordToSpellCheckerDictionary(misspelledWord);
          }
        },
        { type: "separator" }
      );
    }

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

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function waitForGeneratedDesktopPreview(window: BrowserWindow, timeoutMs = GENERATED_DESKTOP_READY_TIMEOUT_MS): Promise<boolean> {
  const startedAt = Date.now();
  const script = `(() => {
    const root = document.getElementById("root");
    const text = (document.body?.innerText ?? "").trim();
    const headingCount = document.querySelectorAll("h1, h2, h3, h4, [role='heading']").length;
    const rootChildren = root?.children?.length ?? 0;
    return rootChildren > 0 && (text.length > 40 || headingCount > 0);
  })()`;

  while (!window.isDestroyed() && (Date.now() - startedAt) < timeoutMs) {
    try {
      const ready = await window.webContents.executeJavaScript(script, true);
      if (ready === true) return true;
    } catch {
      // Keep polling until the renderer is ready or we time out.
    }
    await delay(250);
  }

  return false;
}

async function ensureGeneratedDesktopPreviewVisible(window: BrowserWindow, showWindow: () => void): Promise<void> {
  const ready = await waitForGeneratedDesktopPreview(window);
  if (window.isDestroyed()) return;

  if (ready) {
    writeDebugLog("WORKSPACE", "generated desktop preview ready", GENERATED_DESKTOP_URL);
    showWindow();
    return;
  }

  writeDebugLog("WORKSPACE", "generated desktop preview timed out; opening browser fallback", GENERATED_DESKTOP_URL);
  try {
    await shell.openExternal(GENERATED_DESKTOP_URL);
  } catch (error) {
    writeDebugLog("WORKSPACE", "generated desktop browser fallback failed", error);
  }
  showWindow();
}

async function createWindow(initialChatId?: string, startDraftChat = false): Promise<BrowserWindow> {
  const savedWindowState = GENERATED_DESKTOP_SHELL_ENABLED ? null : loadWorkspaceWindowState(app.getPath("userData"));
  const defaultBounds = GENERATED_DESKTOP_SHELL_ENABLED ? DEFAULT_GENERATED_WINDOW_BOUNDS : DEFAULT_WORKSPACE_WINDOW_BOUNDS;
  const minBounds = GENERATED_DESKTOP_SHELL_ENABLED ? MIN_GENERATED_WINDOW_BOUNDS : MIN_WORKSPACE_WINDOW_BOUNDS;
  const shouldUseSavedPosition = Boolean(savedWindowState && isVisibleWindowState(savedWindowState));
  const appIconPath = process.platform === "win32"
    ? (app.isPackaged
      ? join(process.resourcesPath, "assets", "cipher-ai-icon.ico")
      : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.ico"))
    : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.png");

  const window = new BrowserWindow({
    width: savedWindowState?.width ?? defaultBounds.width,
    height: savedWindowState?.height ?? defaultBounds.height,
    minWidth: minBounds.width,
    minHeight: minBounds.height,
    show: false,
    center: !shouldUseSavedPosition,
    ...(shouldUseSavedPosition
      ? {
        x: savedWindowState!.x,
        y: savedWindowState!.y
      }
      : {}),
    autoHideMenuBar: true,
    title: GENERATED_DESKTOP_SHELL_ENABLED ? GENERATED_DESKTOP_TITLE : "Cipher Workspace",
    icon: appIconPath,
    backgroundColor: GENERATED_DESKTOP_SHELL_ENABLED ? "#f4f6fb" : "#0a0e17",
    titleBarStyle: GENERATED_DESKTOP_SHELL_ENABLED ? "default" : "hiddenInset",
    webPreferences: {
      ...(GENERATED_DESKTOP_SHELL_ENABLED
        ? {}
        : { preload: join(__dirname, "..", "preload", "preload.js") }),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  workspaceWindows.add(window);
  if (!GENERATED_DESKTOP_SHELL_ENABLED) {
    registerWorkspaceWindowStatePersistence(window, app.getPath("userData"));
  }

  window.removeMenu();
  window.setMenuBarVisibility(false);
  attachEditableContextMenu(window);
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);

  if (GENERATED_DESKTOP_SHELL_ENABLED) {
    window.on("page-title-updated", (event) => {
      event.preventDefault();
      window.setTitle(GENERATED_DESKTOP_TITLE);
    });
  }

  window.webContents.on("console-message", (event) => {
    const levelTag = event.level === "error"
      ? "RENDERER_ERROR"
      : event.level === "warning"
        ? "RENDERER_WARN"
        : "RENDERER_INFO";
    writeDebugLog(levelTag, `${event.sourceId}:${event.lineNumber}`, event.message);
    if (STARTUP_SMOKE_ENABLED && event.level === "error") {
      finishStartupSmoke(
        1,
        `Renderer reported a console error during startup at ${event.sourceId}:${event.lineNumber}.`,
        event.message
      );
    }
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    writeDebugLog("RENDERER_GONE", details);
    if (STARTUP_SMOKE_ENABLED) {
      finishStartupSmoke(1, "Renderer process exited during startup smoke.", details);
    }
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeDebugLog("RENDERER_LOAD_FAIL", { errorCode, errorDescription, validatedURL, isMainFrame });
    if (STARTUP_SMOKE_ENABLED && isMainFrame) {
      finishStartupSmoke(
        1,
        `Renderer failed to load the main frame during startup smoke (${errorCode}).`,
        errorDescription,
        validatedURL
      );
    }
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
    if (STARTUP_SMOKE_ENABLED) {
      finishStartupSmoke(1, "Workspace window became unresponsive during startup smoke.");
    }
  });
  window.on("responsive", () => {
    writeDebugLog("WINDOW", "workspace window responsive again");
  });

  const showWindow = () => {
    if (STARTUP_SMOKE_ENABLED) return;
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    if (!GENERATED_DESKTOP_SHELL_ENABLED && savedWindowState?.isMaximized === true && !window.isMaximized()) {
      window.maximize();
    }
    if (!window.isVisible()) window.show();
    window.focus();
  };

  if (STARTUP_SMOKE_ENABLED) {
    window.webContents.once("did-finish-load", () => {
      writeDebugLog("SMOKE", `renderer finished loading; waiting ${STARTUP_SMOKE_EXIT_DELAY_MS}ms for stability`);
      startupSmokeTimer = setTimeout(() => {
        finishStartupSmoke(0, "Electron startup smoke passed.");
      }, Number.isFinite(STARTUP_SMOKE_EXIT_DELAY_MS) && STARTUP_SMOKE_EXIT_DELAY_MS > 0
        ? STARTUP_SMOKE_EXIT_DELAY_MS
        : 2500);
    });
  }

  if (GENERATED_DESKTOP_SHELL_ENABLED) {
    await window.loadURL(GENERATED_DESKTOP_URL);
    void ensureGeneratedDesktopPreviewVisible(window, showWindow);
  } else {
    window.once("ready-to-show", showWindow);
    window.webContents.once("did-finish-load", showWindow);
    setTimeout(showWindow, 1500);
    const rendererEntry = join(__dirname, "..", "renderer", "index.html");
    if (initialChatId?.trim()) {
      await window.loadFile(rendererEntry, {
        query: {
          chatId: initialChatId.trim()
        }
      });
    } else if (startDraftChat) {
      await window.loadFile(rendererEntry, {
        query: {
          draftChat: "1"
        }
      });
    } else {
      await window.loadFile(rendererEntry);
    }
  }

  window.on("closed", () => {
    workspaceWindows.delete(window);
    if (STARTUP_SMOKE_ENABLED && !startupSmokeCompleted) {
      finishStartupSmoke(1, "Workspace window closed before startup smoke completed.");
    }
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

async function createFreshChatWindow(): Promise<BrowserWindow> {
  return createWindow(undefined, true);
}

function registerIpcHandlersOnce(): void {
  if (!settingsStore || !chatsStore || !ccrService || !imageGenerationService || !agentTaskRunner) {
    throw new Error("Services not initialized.");
  }

  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  registerIpcHandlers({
    settingsStore,
    chatsStore,
    ccrService,
    imageGenerationService,
    agentTaskRunner,
    claudeChatWorkingDirectory: resolveClaudeChatWorkingDirectory(app.getPath("userData")),
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
  const userDataPath = STARTUP_SMOKE_ENABLED
    ? join(app.getPath("appData"), APP_NAME, "startup-smoke")
    : GENERATED_DESKTOP_SHELL_ENABLED
      ? join(app.getPath("appData"), APP_NAME, "generated-desktop-shell")
      : join(app.getPath("appData"), APP_NAME);
  app.setPath("userData", OVERRIDE_USER_DATA_PATH || userDataPath);

  if (!STARTUP_SMOKE_ENABLED && !GENERATED_DESKTOP_SHELL_ENABLED && !SINGLE_INSTANCE_DISABLED) {
    const hasSingleInstanceLock = app.requestSingleInstanceLock();
    if (!hasSingleInstanceLock) {
      return false;
    }
  }

  app.removeAllListeners("second-instance");
  app.on("second-instance", () => {
    void createFreshChatWindow().catch((err) => {
      console.error("Failed to open new window:", err);
      writeDebugLog("ERROR", "failed to open new window on second instance", err);
      focusPrimaryWindow();
    });
  });

  const resolvedUserDataPath = app.getPath("userData");
  const debugLogPath = initDebugLogger(resolvedUserDataPath);
  console.log(`[debug] main log: ${debugLogPath}`);
  if (GENERATED_DESKTOP_SHELL_ENABLED) {
    writeDebugLog("WORKSPACE", "starting generated desktop shell", GENERATED_DESKTOP_URL, GENERATED_DESKTOP_TITLE);
    await createWindow();
    return true;
  }
  const workspaceRoot = resolveAgentWorkspaceRoot();
  writeDebugLog("WORKSPACE", `workspace root: ${workspaceRoot}`);
  settingsStore = new SettingsStore(resolvedUserDataPath);
  chatsStore = new ChatsStore(resolvedUserDataPath);
  generatedImagesStore = new GeneratedImagesStore(resolvedUserDataPath);
  ccrService = new CcrService(settingsStore);
  imageGenerationService = new ImageGenerationService(settingsStore, generatedImagesStore);
  agentTaskRunner = new AgentTaskRunner(workspaceRoot, settingsStore, ccrService);

  await settingsStore.init();
  await chatsStore.init();
  await generatedImagesStore.init();

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
  if (STARTUP_SMOKE_ENABLED && !startupSmokeCompleted) {
    finishStartupSmoke(1, "Electron quit before startup smoke completed.");
    return;
  }
  if (process.platform !== "darwin") app.quit();
});
