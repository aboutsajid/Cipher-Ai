import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ClaudeChatFilesystemSettings } from "../shared/types";

export type ClaudeChatFilesystemToolName = "list_files" | "read_file" | "search_files" | "write_file";

export interface ClaudeChatFilesystemToolCall {
  tool: ClaudeChatFilesystemToolName;
  args?: Record<string, unknown>;
}

export interface ClaudeChatFilesystemToolResult {
  ok: boolean;
  tool: ClaudeChatFilesystemToolName;
  data?: unknown;
  message?: string;
}

const MAX_LIST_DEPTH = 4;
const MAX_LIST_ENTRIES = 200;
const MAX_READ_BYTES = 220_000;
const MAX_SEARCH_FILES = 250;
const MAX_SEARCH_MATCHES = 120;
const MAX_SEARCH_PREVIEW = 220;
const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css", ".scss", ".py", ".go", ".rs", ".java", ".c",
  ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".yml", ".yaml", ".xml", ".env", ".sh", ".ps1", ".mjs", ".cjs"
]);

export function normalizeClaudeChatFilesystemSettings(
  raw: ClaudeChatFilesystemSettings | null | undefined
): ClaudeChatFilesystemSettings {
  const roots = Array.isArray(raw?.roots)
    ? [...new Set(raw!.roots.map((root) => resolve(String(root ?? "").trim())).filter(Boolean))]
    : [];
  return {
    roots,
    allowWrite: raw?.allowWrite === true
  };
}

function ensureRootsConfigured(settings: ClaudeChatFilesystemSettings): ClaudeChatFilesystemSettings {
  const normalized = normalizeClaudeChatFilesystemSettings(settings);
  if (normalized.roots.length === 0) {
    throw new Error("No Claude chat folders are approved yet.");
  }
  return normalized;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveAllowedPath(
  requestedPath: string,
  settings: ClaudeChatFilesystemSettings,
  options: { allowMissing?: boolean } = {}
): { absolutePath: string; root: string } {
  const normalizedSettings = ensureRootsConfigured(settings);
  const normalizedRequest = String(requestedPath ?? "").trim();

  if (!normalizedRequest) {
    throw new Error("Path is required. Ask the user which approved folder or file to inspect.");
  }

  let absolutePath = "";
  if (isAbsolute(normalizedRequest)) {
    absolutePath = resolve(normalizedRequest);
  } else if (normalizedSettings.roots.length === 1) {
    absolutePath = resolve(normalizedSettings.roots[0], normalizedRequest);
  } else {
    throw new Error("Use an absolute path when multiple Claude chat folders are approved.");
  }

  for (const root of normalizedSettings.roots) {
    const relativePath = relative(root, absolutePath);
    if (relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes("..\\") && !relativePath.includes("../"))) {
      return { absolutePath, root };
    }
  }

  if (options.allowMissing) {
    throw new Error("Path is outside the approved Claude chat folders.");
  }
  throw new Error("Path is outside the approved Claude chat folders.");
}

function isLikelyTextPath(path: string): boolean {
  const lower = path.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex < 0) return true;
  return TEXT_FILE_EXTENSIONS.has(lower.slice(dotIndex));
}

async function listFilesRecursive(
  currentPath: string,
  depth: number,
  remaining: { count: number },
  entries: Array<{ path: string; type: "file" | "directory"; size?: number }>
): Promise<void> {
  if (remaining.count <= 0) return;
  const children = await readdir(currentPath, { withFileTypes: true });
  children.sort((a, b) => a.name.localeCompare(b.name));

  for (const child of children) {
    if (remaining.count <= 0) break;
    const childPath = resolve(currentPath, child.name);
    if (child.isDirectory()) {
      entries.push({ path: childPath, type: "directory" });
      remaining.count -= 1;
      if (depth > 0) {
        await listFilesRecursive(childPath, depth - 1, remaining, entries);
      }
      continue;
    }
    if (child.isFile()) {
      let size: number | undefined;
      try {
        size = (await stat(childPath)).size;
      } catch {
        size = undefined;
      }
      entries.push({ path: childPath, type: "file", size });
      remaining.count -= 1;
    }
  }
}

async function listFiles(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const target = resolveAllowedPath(String(args?.path ?? ""), settings);
  const targetStats = await stat(target.absolutePath);
  const depth = clampInteger(args?.depth, 2, 0, MAX_LIST_DEPTH);

  if (targetStats.isFile()) {
    return {
      ok: true,
      tool: "list_files",
      data: {
        root: target.root,
        targetPath: target.absolutePath,
        entries: [{ path: target.absolutePath, type: "file", size: targetStats.size }]
      }
    };
  }

  const entries: Array<{ path: string; type: "file" | "directory"; size?: number }> = [];
  const remaining = { count: MAX_LIST_ENTRIES };
  await listFilesRecursive(target.absolutePath, depth, remaining, entries);
  return {
    ok: true,
    tool: "list_files",
    data: {
      root: target.root,
      targetPath: target.absolutePath,
      depth,
      truncated: remaining.count <= 0,
      entries
    }
  };
}

async function readTextFile(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const target = resolveAllowedPath(String(args?.path ?? ""), settings);
  const targetStats = await stat(target.absolutePath);
  if (!targetStats.isFile()) {
    throw new Error("read_file requires a file path.");
  }

  const buffer = await readFile(target.absolutePath);
  const truncated = buffer.byteLength > MAX_READ_BYTES;
  const content = buffer.subarray(0, MAX_READ_BYTES).toString("utf8");
  return {
    ok: true,
    tool: "read_file",
    data: {
      path: target.absolutePath,
      size: targetStats.size,
      truncated,
      content
    }
  };
}

async function collectSearchableFiles(
  targetPath: string,
  remainingFiles: { count: number },
  files: string[]
): Promise<void> {
  if (remainingFiles.count <= 0) return;
  const targetStats = await stat(targetPath);
  if (targetStats.isFile()) {
    if (isLikelyTextPath(targetPath)) {
      files.push(targetPath);
      remainingFiles.count -= 1;
    }
    return;
  }

  const children = await readdir(targetPath, { withFileTypes: true });
  children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    if (remainingFiles.count <= 0) break;
    const childPath = resolve(targetPath, child.name);
    if (child.isDirectory()) {
      await collectSearchableFiles(childPath, remainingFiles, files);
      continue;
    }
    if (child.isFile() && isLikelyTextPath(childPath)) {
      files.push(childPath);
      remainingFiles.count -= 1;
    }
  }
}

async function searchFiles(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const pattern = String(args?.pattern ?? "").trim();
  if (!pattern) {
    throw new Error("search_files requires a non-empty pattern.");
  }

  const target = resolveAllowedPath(String(args?.path ?? ""), settings);
  const files: string[] = [];
  await collectSearchableFiles(target.absolutePath, { count: MAX_SEARCH_FILES }, files);
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  const needle = pattern.toLowerCase();

  for (const filePath of files) {
    if (matches.length >= MAX_SEARCH_MATCHES) break;
    let content = "";
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.toLowerCase().includes(needle)) continue;
      matches.push({
        path: filePath,
        line: index + 1,
        preview: line.length > MAX_SEARCH_PREVIEW ? `${line.slice(0, MAX_SEARCH_PREVIEW)}...` : line
      });
      if (matches.length >= MAX_SEARCH_MATCHES) break;
    }
  }

  return {
    ok: true,
    tool: "search_files",
    data: {
      targetPath: target.absolutePath,
      pattern,
      truncated: matches.length >= MAX_SEARCH_MATCHES,
      matches
    }
  };
}

async function writeTextFile(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  if (!normalizedSettings.allowWrite) {
    throw new Error("Claude chat write access is disabled.");
  }

  const target = resolveAllowedPath(String(args?.path ?? ""), normalizedSettings, { allowMissing: true });
  const content = typeof args?.content === "string" ? args.content : String(args?.content ?? "");
  await mkdir(dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, content, "utf8");
  return {
    ok: true,
    tool: "write_file",
    data: {
      path: target.absolutePath,
      size: Buffer.byteLength(content, "utf8")
    }
  };
}

export async function executeClaudeChatFilesystemTool(
  call: ClaudeChatFilesystemToolCall,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  switch (call.tool) {
    case "list_files":
      return listFiles(call.args, normalizedSettings);
    case "read_file":
      return readTextFile(call.args, normalizedSettings);
    case "search_files":
      return searchFiles(call.args, normalizedSettings);
    case "write_file":
      return writeTextFile(call.args, normalizedSettings);
    default:
      throw new Error(`Unsupported Claude chat filesystem tool: ${String((call as { tool?: unknown }).tool ?? "")}`);
  }
}
