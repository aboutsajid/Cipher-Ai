import { app, BrowserWindow, shell } from "electron";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import { spawn } from "node:child_process";
import { extname, join, relative, resolve } from "node:path";
import type { AgentTaskRunner } from "./services/agentTaskRunner";

const previewServers = new Map<string, { server: http.Server; rootDir: string; url: string }>();
let previewWindow: BrowserWindow | null = null;

type OpenPathResult = { ok: boolean; message: string };
type OpenPreviewResult = OpenPathResult & { url?: string };

async function waitForPreviewReady(targetUrl: string, timeoutMs = 10_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  const attempt = (): Promise<boolean> => new Promise((resolveAttempt) => {
    try {
      const url = new URL(targetUrl);
      const client = url.protocol === "https:" ? https : http;
      const req = client.request(url, { method: "GET", timeout: 1500 }, (res) => {
        res.resume();
        resolveAttempt((res.statusCode ?? 0) > 0);
      });
      req.on("error", () => resolveAttempt(false));
      req.on("timeout", () => {
        req.destroy();
        resolveAttempt(false);
      });
      req.end();
    } catch {
      resolveAttempt(false);
    }
  });

  while (Date.now() < end) {
    if (await attempt()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
  }
  return false;
}

function getWindowIconPath(): string {
  return process.platform === "win32"
    ? (app.isPackaged
      ? join(process.resourcesPath, "assets", "cipher-ai-icon.ico")
      : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.ico"))
    : join(__dirname, "..", "renderer", "assets", "cipher-ai-icon.png");
}

function allowLocalPreviewShellNavigation(url: string): boolean {
  return url.startsWith("file://");
}

function allowExternalNavigation(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function quotePowershellArg(value: string): string {
  const normalized = String(value ?? "");
  return `'${normalized.replace(/'/g, "''")}'`;
}

function previewMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    default: return "application/octet-stream";
  }
}

async function runNpmCommandAndWait(cwd: string, args: string[], label: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = process.platform === "win32"
      ? spawn("powershell.exe", ["-NoProfile", "-Command", `& ${quotePowershellArg("npm.cmd")} ${args.join(" ")}`], {
        cwd,
        env: process.env,
        stdio: "ignore",
        windowsHide: true
      })
      : spawn("npm", args, {
        cwd,
        env: process.env,
        stdio: "ignore",
        windowsHide: true
      });

    proc.once("error", rejectPromise);
    proc.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${label} failed with code ${code ?? "unknown"}`));
    });
  });
}

async function runNpmScriptAndWait(cwd: string, scriptName: string): Promise<void> {
  await runNpmCommandAndWait(cwd, ["run", scriptName], `npm run ${scriptName}`);
}

function isLikelyMissingDependencyBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /vite\/client/i.test(message)
    || /Cannot find module 'vite'/i.test(message)
    || /Cannot find module '@vitejs\/plugin-react'/i.test(message)
    || /npm run build failed with code/i.test(message);
}

async function maybeRecoverPreviewDependencies(projectDir: string, forceInstall = false): Promise<boolean> {
  try {
    await stat(join(projectDir, "package.json"));
  } catch {
    return false;
  }

  let hasNodeModules = true;
  try {
    await access(join(projectDir, "node_modules"));
  } catch {
    hasNodeModules = false;
  }

  if (forceInstall || !hasNodeModules) {
    await runNpmCommandAndWait(projectDir, ["install"], "npm install");
    return true;
  }

  return false;
}

async function ensureManagedPreviewServer(targetPath: string, rootDir: string): Promise<string> {
  const existing = previewServers.get(targetPath);
  if (existing && existing.rootDir === rootDir) {
    const ready = await waitForPreviewReady(existing.url, 500);
    if (ready) return existing.url;
    await new Promise((resolvePromise) => existing.server.close(() => resolvePromise(undefined)));
    previewServers.delete(targetPath);
  } else if (existing) {
    await new Promise((resolvePromise) => existing.server.close(() => resolvePromise(undefined)));
    previewServers.delete(targetPath);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname || "/");
      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const requestedPath = resolve(rootDir, relativePath);
      const normalizedRoot = resolve(rootDir);
      if (!requestedPath.startsWith(normalizedRoot)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      let filePath = requestedPath;
      try {
        const fileStats = await stat(filePath);
        if (fileStats.isDirectory()) {
          filePath = join(filePath, "index.html");
        }
      } catch {
        filePath = join(normalizedRoot, "index.html");
      }

      try {
        await access(filePath);
      } catch {
        filePath = join(normalizedRoot, "index.html");
      }

      res.writeHead(200, { "Content-Type": previewMimeType(filePath), "Cache-Control": "no-store" });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Preview server error.");
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolvePromise) => server.close(() => resolvePromise(undefined)));
    throw new Error("Preview server failed to bind a TCP port.");
  }

  const url = `http://127.0.0.1:${address.port}/`;
  previewServers.set(targetPath, { server, rootDir, url });
  return url;
}

export async function openUrlInSystemBrowser(targetUrl: string): Promise<void> {
  const normalized = (targetUrl ?? "").trim();
  if (!normalized) {
    throw new Error("URL is required.");
  }
  await shell.openExternal(normalized);
}

export async function openExternalTarget(
  targetUrl?: string,
  openExternal: (target: string) => Promise<void> = openUrlInSystemBrowser
): Promise<OpenPathResult> {
  const normalized = (targetUrl ?? "").trim();
  if (!normalized) return { ok: false, message: "URL is required." };

  try {
    await openExternal(normalized);
    return { ok: true, message: "Opened preview." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to open preview."
    };
  }
}

export function buildMissingWorkspaceTargetMessage(targetPath: string): string {
  const normalized = (targetPath ?? "").trim();
  return `Target path not found: ${normalized}. The target is not in the current workspace state. If you restored a Before snapshot, that task output may have been removed.`;
}

export function resolveWorkspaceTargetPath(agentTaskRunner: AgentTaskRunner, targetPath: string): string {
  const normalized = (targetPath ?? "").trim();
  const workspaceRoot = resolve(agentTaskRunner.getWorkspaceRoot());
  const absolutePath = resolve(workspaceRoot, normalized);
  const relativePath = relative(workspaceRoot, absolutePath);
  if (relativePath.startsWith("..") || relativePath.includes("..\\") || relativePath.includes("../")) {
    throw new Error("Path escapes the workspace root.");
  }
  return absolutePath;
}

export async function workspaceTargetExists(
  agentTaskRunner: AgentTaskRunner,
  targetPath?: string
): Promise<boolean> {
  const normalized = (targetPath ?? "").trim();
  if (!normalized) return false;

  try {
    await stat(resolveWorkspaceTargetPath(agentTaskRunner, normalized));
    return true;
  } catch {
    return false;
  }
}

export async function openPreviewInWindow(targetUrl: string, title = "Cipher Preview"): Promise<void> {
  const normalized = targetUrl.trim();
  if (!normalized) throw new Error("Preview URL is required.");
  const normalizedTitle = title.trim() || "Cipher Preview";
  const previewIconPath = getWindowIconPath();
  const previewShellPath = join(__dirname, "..", "renderer", "preview-window.html");

  if (!previewWindow || previewWindow.isDestroyed()) {
    previewWindow = new BrowserWindow({
      width: 1480,
      height: 980,
      minWidth: 960,
      minHeight: 640,
      show: false,
      autoHideMenuBar: true,
      title: normalizedTitle,
      backgroundColor: "#0f1115",
      icon: previewIconPath,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    previewWindow.removeMenu();
    previewWindow.setMenuBarVisibility(false);
    previewWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (allowExternalNavigation(url)) {
        void openUrlInSystemBrowser(url);
      }
      return { action: "deny" };
    });
    previewWindow.webContents.on("will-navigate", (event, url) => {
      if (allowLocalPreviewShellNavigation(url)) return;
      event.preventDefault();
      if (allowExternalNavigation(url)) {
        void openUrlInSystemBrowser(url);
      }
    });
    previewWindow.on("closed", () => {
      previewWindow = null;
    });
  }

  previewWindow.setTitle(normalizedTitle);
  await previewWindow.loadFile(previewShellPath, {
    query: {
      url: normalized,
      title: normalizedTitle
    }
  });
  if (!previewWindow.isVisible()) previewWindow.show();
  if (previewWindow.isMinimized()) previewWindow.restore();
  previewWindow.focus();
}

export async function openManagedPreviewTarget(
  agentTaskRunner: AgentTaskRunner,
  targetPath?: string,
  openPreview: (runner: AgentTaskRunner, path: string) => Promise<string> = openManagedPreview
): Promise<OpenPreviewResult> {
  const normalizedPath = (targetPath ?? "").trim();
  if (!normalizedPath) return { ok: false, message: "Preview target is required." };

  try {
    const targetUrl = await openPreview(agentTaskRunner, normalizedPath);
    return {
      ok: true,
      message: "Task preview ready.",
      url: targetUrl
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { ok: false, message: buildMissingWorkspaceTargetMessage(normalizedPath) };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to open preview."
    };
  }
}

export async function openPreviewWindowTarget(
  targetUrl?: string,
  title?: string,
  openWindow: (url: string, windowTitle?: string) => Promise<void> = openPreviewInWindow
): Promise<OpenPathResult> {
  const normalized = (targetUrl ?? "").trim();
  if (!normalized) return { ok: false, message: "Preview URL is required." };

  try {
    await openWindow(normalized, (title ?? "Cipher Preview").trim() || "Cipher Preview");
    return { ok: true, message: "Opened detached preview." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to open detached preview."
    };
  }
}

export async function openWorkspaceTargetPath(
  agentTaskRunner: AgentTaskRunner,
  targetPath?: string,
  openPath?: (path: string) => Promise<string>
): Promise<OpenPathResult> {
  const normalized = (targetPath ?? "").trim();
  if (!normalized) return { ok: false, message: "Path is required." };

  try {
    const absolutePath = resolveWorkspaceTargetPath(agentTaskRunner, normalized);
    await stat(absolutePath);
    const openPathFn = openPath ?? ((path: string) => shell.openPath(path));
    const result = await openPathFn(absolutePath);
    if (result) return { ok: false, message: result };
    return { ok: true, message: "Opened task output folder." };
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { ok: false, message: buildMissingWorkspaceTargetMessage(normalized) };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to open task output folder."
    };
  }
}

export async function openManagedPreview(agentTaskRunner: AgentTaskRunner, targetPath: string): Promise<string> {
  const absolutePath = resolveWorkspaceTargetPath(agentTaskRunner, targetPath);
  await stat(absolutePath);

  let packageScripts: Record<string, string> = {};
  try {
    const raw = await readFile(join(absolutePath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    packageScripts = parsed.scripts ?? {};
  } catch {
    // ignore
  }

  const isStatic = Boolean(packageScripts["start"] && /http\.server/i.test(packageScripts["start"]));
  const previewRoot = isStatic ? absolutePath : join(absolutePath, "dist");
  if (!isStatic) {
    try {
      await runNpmScriptAndWait(absolutePath, "build");
    } catch (buildError) {
      const dependencyRecoveryNeeded = isLikelyMissingDependencyBuildError(buildError);
      if (await maybeRecoverPreviewDependencies(absolutePath, dependencyRecoveryNeeded)) {
        await runNpmScriptAndWait(absolutePath, "build");
      } else {
        throw buildError;
      }
    }
    await stat(previewRoot);
  }

  return ensureManagedPreviewServer(absolutePath, previewRoot);
}
