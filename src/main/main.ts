import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc";
import { ChatsStore } from "./services/chatsStore";
import { SettingsStore } from "./services/settingsStore";
import { CcrService } from "./services/ccrService";
import { getDebugLogPath, initDebugLogger, writeDebugLog } from "./services/debugLogger";
import type { IpcChannel } from "../shared/types";

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let settingsStore: SettingsStore | null = null;
let chatsStore: ChatsStore | null = null;
let ccrService: CcrService | null = null;
const APP_USER_MODEL_ID = "com.cipher.ai";

const IPC_CHANNELS: IpcChannel[] = [
  "chat:list",
  "chat:get",
  "chat:create",
  "chat:delete",
  "chat:rename",
  "chat:send",
  "chat:stop",
  "settings:get",
  "settings:save",
  "router:status",
  "router:start",
  "router:stop",
  "router:test",
  "router:logs"
];

async function createWindow(): Promise<void> {
  const appIconPath = process.platform === "win32"
    ? (app.isPackaged
      ? join(process.resourcesPath, "assets", "cipher-ai-icon.ico")
      : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.ico"))
    : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.png");

  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1040,
    minWidth: 1280,
    minHeight: 780,
    show: true,
    center: true,
    autoHideMenuBar: true,
    title: "Cipher Ai",
    icon: appIconPath,
    backgroundColor: "#0a0e17",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelTag = level >= 2 ? "RENDERER_ERROR" : level === 1 ? "RENDERER_WARN" : "RENDERER_INFO";
    writeDebugLog(levelTag, `${sourceId}:${line}`, message);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeDebugLog("RENDERER_GONE", details);
  });
  mainWindow.on("unresponsive", () => {
    writeDebugLog("WINDOW", "main window became unresponsive");
  });
  mainWindow.on("responsive", () => {
    writeDebugLog("WINDOW", "main window responsive again");
  });

  // Allow local renderer microphone access for voice input (Web Speech API).
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const permissionName = String(permission);
    const isLocalOrigin = requestingOrigin.startsWith("file://");
    if (!isLocalOrigin) return false;
    if (permissionName === "media" || permissionName === "microphone" || permissionName === "audioCapture" || permissionName === "unknown") {
      return true;
    }
    return false;
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const permissionName = String(permission);
    const requestingUrl = String(details?.requestingUrl ?? "");
    const isLocalOrigin = requestingUrl.startsWith("file://");
    if (
      isLocalOrigin
      && (permissionName === "media" || permissionName === "microphone" || permissionName === "audioCapture" || permissionName === "unknown")
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  const showMainWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  };

  // Register IPC handlers before renderer loads to avoid early invoke races.
  if (settingsStore && chatsStore && ccrService) {
    rebindIpcHandlers();
  }

  await mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));

  mainWindow.once("ready-to-show", showMainWindow);
  mainWindow.webContents.once("did-finish-load", showMainWindow);
  setTimeout(showMainWindow, 1500);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function rebindIpcHandlers(): void {
  if (!mainWindow || !settingsStore || !chatsStore || !ccrService) {
    throw new Error("Services or window not initialized.");
  }

  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  registerIpcHandlers({ mainWindow, settingsStore, chatsStore, ccrService });
}

async function createAndRegister(): Promise<void> {
  await createWindow();
}

async function bootstrap(): Promise<void> {
  app.setName("Cipher Ai");
  if (process.platform === "win32") {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
  Menu.setApplicationMenu(null);

  const userDataPath = app.getPath("userData");
  const debugLogPath = initDebugLogger(userDataPath);
  console.log(`[debug] main log: ${debugLogPath}`);
  settingsStore = new SettingsStore(userDataPath);
  chatsStore = new ChatsStore(userDataPath);
  ccrService = new CcrService(settingsStore);

  await settingsStore.init();
  await chatsStore.init();

  await createAndRegister();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error("Bootstrap failed:", err);
    writeDebugLog("FATAL", "bootstrap failed", err);
    app.exit(1);
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length !== 0) return;
  try {
    await createAndRegister();
  } catch (err) {
    console.error("Activate failed:", err);
    writeDebugLog("ERROR", "activate failed", err, "logPath", getDebugLogPath());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
