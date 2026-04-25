import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  ClaudeChatFilesystemBudgets,
  ClaudeChatFilesystemRootConfig,
  ClaudeChatFilesystemSettings,
  ClaudeChatOverwritePolicy
} from "../shared/types";

export type ClaudeChatFilesystemToolName =
  | "list_files"
  | "read_file"
  | "search_files"
  | "write_plan"
  | "write_file"
  | "write_files"
  | "write_binary"
  | "write_binaries"
  | "mkdir_path"
  | "move_path"
  | "delete_path";

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

interface NormalizedClaudeRoot {
  path: string;
  label: string;
  allowWrite: boolean;
  overwritePolicy: ClaudeChatOverwritePolicy;
  temporary: boolean;
}

interface NormalizedClaudeSettings {
  roots: string[];
  allowWrite: boolean;
  rootEntries: NormalizedClaudeRoot[];
  overwritePolicy: ClaudeChatOverwritePolicy;
  budgets: Required<ClaudeChatFilesystemBudgets>;
  auditEnabled: boolean;
  requireWritePlan: boolean;
}

interface ResolvedClaudePath {
  absolutePath: string;
  root: string;
  rootEntry: NormalizedClaudeRoot;
}

interface ClaudeFilesystemRuntimeHooks {
  onProgress?: (message: string) => void;
  onAudit?: (entry: {
    tool: ClaudeChatFilesystemToolName;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }) => Promise<void> | void;
}

const MAX_LIST_DEPTH = 4;
const MAX_LIST_ENTRIES = 200;
const MAX_READ_BYTES = 220_000;
const MAX_SEARCH_FILES = 250;
const MAX_SEARCH_MATCHES = 120;
const MAX_SEARCH_PREVIEW = 220;
const DEFAULT_WRITE_FILES = 80;
const DEFAULT_WRITE_BYTES = 2_000_000;
const DEFAULT_TOOL_CALLS = 24;
const MAX_BINARY_BYTES = 5_000_000;
const PLAN_PREVIEW_LIMIT = 24;
const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css", ".scss", ".py", ".go", ".rs", ".java", ".c",
  ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".yml", ".yaml", ".xml", ".env", ".sh", ".ps1", ".mjs", ".cjs"
]);

export function normalizeClaudeChatFilesystemSettings(
  raw: ClaudeChatFilesystemSettings | null | undefined
): ClaudeChatFilesystemSettings {
  const roots = Array.isArray(raw?.roots)
    ? [...new Set(raw!.roots
      .map((root) => String(root ?? "").trim())
      .filter(Boolean)
      .map((root) => resolve(root)))]
    : [];
  const rootConfigs = Array.isArray(raw?.rootConfigs)
    ? raw!.rootConfigs
      .filter((root): root is ClaudeChatFilesystemRootConfig => Boolean(root && typeof root === "object"))
      .map((root) => ({
        path: String(root.path ?? "").trim(),
        label: typeof root.label === "string" ? root.label.trim() : undefined,
        allowWrite: root.allowWrite === true,
        overwritePolicy: root.overwritePolicy
      }))
      .filter((root) => Boolean(root.path))
      .map((root) => ({
        ...root,
        path: resolve(root.path)
      }))
    : [];
  const temporaryRoots = Array.isArray(raw?.temporaryRoots)
    ? [...new Set(raw!.temporaryRoots
      .map((root) => String(root ?? "").trim())
      .filter(Boolean)
      .map((root) => resolve(root)))]
    : [];
  return {
    roots,
    allowWrite: raw?.allowWrite === true,
    overwritePolicy: raw?.overwritePolicy === "create-only" || raw?.overwritePolicy === "ask-before-overwrite"
      ? raw.overwritePolicy
      : "allow-overwrite",
    rootConfigs,
    temporaryRoots,
    budgets: {
      maxFilesPerTurn: clampInteger(raw?.budgets?.maxFilesPerTurn, DEFAULT_WRITE_FILES, 1, 500),
      maxBytesPerTurn: clampInteger(raw?.budgets?.maxBytesPerTurn, DEFAULT_WRITE_BYTES, 20_000, 20_000_000),
      maxToolCallsPerTurn: clampInteger(raw?.budgets?.maxToolCallsPerTurn, DEFAULT_TOOL_CALLS, 1, 100)
    },
    auditEnabled: raw?.auditEnabled !== false,
    requireWritePlan: raw?.requireWritePlan === true
  };
}

function normalizeClaudeSettings(settings: ClaudeChatFilesystemSettings | NormalizedClaudeSettings): NormalizedClaudeSettings {
  if ("rootEntries" in settings && Array.isArray(settings.rootEntries)) {
    return settings;
  }
  const normalized = normalizeClaudeChatFilesystemSettings(settings);
  const rootMap = new Map<string, NormalizedClaudeRoot>();

  for (const rootPath of normalized.roots) {
    rootMap.set(rootPath, {
      path: rootPath,
      label: basename(rootPath) || rootPath,
      allowWrite: normalized.allowWrite,
      overwritePolicy: normalized.overwritePolicy ?? "allow-overwrite",
      temporary: false
    });
  }

  for (const config of normalized.rootConfigs ?? []) {
    const prior = rootMap.get(config.path);
    rootMap.set(config.path, {
      path: config.path,
      label: config.label || prior?.label || basename(config.path) || config.path,
      allowWrite: config.allowWrite === true || (config.allowWrite !== false && (prior?.allowWrite ?? normalized.allowWrite)),
      overwritePolicy: config.overwritePolicy ?? prior?.overwritePolicy ?? normalized.overwritePolicy ?? "allow-overwrite",
      temporary: prior?.temporary ?? false
    });
  }

  for (const tempRoot of normalized.temporaryRoots ?? []) {
    const prior = rootMap.get(tempRoot);
    rootMap.set(tempRoot, {
      path: tempRoot,
      label: prior?.label || basename(tempRoot) || tempRoot,
      allowWrite: prior?.allowWrite ?? normalized.allowWrite,
      overwritePolicy: prior?.overwritePolicy ?? normalized.overwritePolicy ?? "allow-overwrite",
      temporary: true
    });
  }

  const rootEntries = [...rootMap.values()].sort((a, b) => b.path.length - a.path.length || a.path.localeCompare(b.path));
  return {
    roots: rootEntries.map((root) => root.path),
    allowWrite: normalized.allowWrite,
    rootEntries,
    overwritePolicy: normalized.overwritePolicy ?? "allow-overwrite",
    budgets: {
      maxFilesPerTurn: clampInteger(normalized.budgets?.maxFilesPerTurn, DEFAULT_WRITE_FILES, 1, 500),
      maxBytesPerTurn: clampInteger(normalized.budgets?.maxBytesPerTurn, DEFAULT_WRITE_BYTES, 20_000, 20_000_000),
      maxToolCallsPerTurn: clampInteger(normalized.budgets?.maxToolCallsPerTurn, DEFAULT_TOOL_CALLS, 1, 100)
    },
    auditEnabled: normalized.auditEnabled !== false,
    requireWritePlan: normalized.requireWritePlan === true
  };
}

function ensureRootsConfigured(settings: ClaudeChatFilesystemSettings | NormalizedClaudeSettings): NormalizedClaudeSettings {
  const normalized = normalizeClaudeSettings(settings);
  if (normalized.rootEntries.length === 0) {
    throw new Error("No Claude chat folders are approved yet.");
  }
  return normalized;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isPathWithinRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes("..\\") && !relativePath.includes("../"));
}

function isSamePath(left: string, right: string): boolean {
  return relative(left, right) === "";
}

async function findNearestExistingPath(targetPath: string): Promise<string> {
  let current = targetPath;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

async function assertResolvedPathStaysInsideRoot(
  target: ResolvedClaudePath,
  options: { allowMissing?: boolean } = {}
): Promise<void> {
  let realRoot = "";
  try {
    realRoot = await realpath(target.rootEntry.path);
  } catch {
    throw new Error(`Approved Claude chat folder does not exist: ${target.rootEntry.path}`);
  }

  const pathToCheck = options.allowMissing
    ? await findNearestExistingPath(target.absolutePath)
    : target.absolutePath;
  let realCandidate = "";
  try {
    realCandidate = await realpath(pathToCheck);
  } catch {
    throw new Error(`Path does not exist: ${target.absolutePath}`);
  }

  if (!isPathWithinRoot(realRoot, realCandidate)) {
    throw new Error("Path resolves outside the approved Claude chat folders.");
  }
}

function resolveAllowedPath(
  requestedPath: string,
  settings: ClaudeChatFilesystemSettings | NormalizedClaudeSettings,
  options: { allowMissing?: boolean } = {}
): ResolvedClaudePath {
  const normalizedSettings = ensureRootsConfigured(settings);
  const normalizedRequest = String(requestedPath ?? "").trim();

  if (!normalizedRequest) {
    throw new Error("Path is required. Ask the user which approved folder or file to inspect.");
  }

  let absolutePath = "";
  if (isAbsolute(normalizedRequest)) {
    absolutePath = resolve(normalizedRequest);
  } else if (normalizedSettings.rootEntries.length === 1) {
    absolutePath = resolve(normalizedSettings.rootEntries[0].path, normalizedRequest);
  } else {
    throw new Error("Use an absolute path when multiple Claude chat folders are approved.");
  }

  for (const rootEntry of normalizedSettings.rootEntries) {
    if (isPathWithinRoot(rootEntry.path, absolutePath)) {
      return { absolutePath, root: rootEntry.path, rootEntry };
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

function emitProgress(hooks: ClaudeFilesystemRuntimeHooks | undefined, message: string): void {
  hooks?.onProgress?.(message);
}

async function emitAudit(
  hooks: ClaudeFilesystemRuntimeHooks | undefined,
  payload: { tool: ClaudeChatFilesystemToolName; args?: Record<string, unknown>; result?: unknown; error?: string }
): Promise<void> {
  await hooks?.onAudit?.(payload);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function decodeBase64Payload(value: unknown): Buffer {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error("Binary contentBase64 is required.");
  }
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.byteLength > MAX_BINARY_BYTES) {
    throw new Error(`Binary payload exceeds the ${MAX_BINARY_BYTES} byte limit.`);
  }
  return buffer;
}

function enforceOverwritePolicy(policy: ClaudeChatOverwritePolicy, targetPath: string, exists: boolean): void {
  if (!exists) return;
  if (policy === "create-only") {
    throw new Error(`Overwrite blocked by create-only policy: ${targetPath}`);
  }
  if (policy === "ask-before-overwrite") {
    throw new Error(`Overwrite requires explicit user review for: ${targetPath}`);
  }
}

function ensureWriteEnabled(
  targets: Array<{ rootEntry: NormalizedClaudeRoot }>,
  settings: NormalizedClaudeSettings
): void {
  if (!settings.allowWrite && !targets.some((target) => target.rootEntry.allowWrite)) {
    throw new Error("Claude chat write access is disabled.");
  }
  for (const target of targets) {
    if (!target.rootEntry.allowWrite) {
      throw new Error(`Write access is disabled for approved root: ${target.rootEntry.path}`);
    }
  }
}

async function verifyWrittenFiles(files: Array<{ path: string; size: number }>): Promise<{
  ok: boolean;
  findings: string[];
  summary: string;
  scaffold: { hasPackageJson: boolean; hasReadme: boolean; hasSourceDirectory: boolean };
}> {
  const findings: string[] = [];
  let hasPackageJson = false;
  let hasReadme = false;
  let hasSourceDirectory = false;
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith("package.json") || lower.endsWith("tsconfig.json") || lower.endsWith("jsconfig.json")) {
      try {
        JSON.parse(await readFile(file.path, "utf8"));
      } catch {
        findings.push(`Invalid JSON in ${file.path}`);
      }
    }
    if (lower.endsWith("package.json")) hasPackageJson = true;
    if (lower.endsWith("readme.md")) hasReadme = true;
    if (lower.includes("\\src\\") || lower.includes("/src/")) hasSourceDirectory = true;
  }
  return {
    ok: findings.length === 0,
    findings,
    summary: findings.length === 0
      ? `Verified ${files.length} written file${files.length === 1 ? "" : "s"}.`
      : `Verification found ${findings.length} issue${findings.length === 1 ? "" : "s"}.`,
    scaffold: { hasPackageJson, hasReadme, hasSourceDirectory }
  };
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
  await assertResolvedPathStaysInsideRoot(target);
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
  await assertResolvedPathStaysInsideRoot(target);
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
  await assertResolvedPathStaysInsideRoot(target);
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

async function buildWritePlan(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const rawFiles = Array.isArray(args?.files) ? args.files : [];
  const targetPath = typeof args?.path === "string" ? args.path.trim() : "";
  if (!targetPath && rawFiles.length === 0) {
    throw new Error("write_plan requires a target path or files array.");
  }

  const files = rawFiles
    .filter((entry): entry is { path?: unknown; content?: unknown; contentBase64?: unknown } => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const path = String(entry.path ?? "").trim();
      const bytes = typeof entry.content === "string"
        ? Buffer.byteLength(entry.content, "utf8")
        : typeof entry.contentBase64 === "string"
          ? Buffer.from(entry.contentBase64, "base64").byteLength
          : 0;
      return { path, bytes };
    })
    .filter((entry) => Boolean(entry.path));

  const targets = targetPath
    ? [resolveAllowedPath(targetPath, normalizedSettings, { allowMissing: true })]
    : files.map((file) => resolveAllowedPath(file.path, normalizedSettings, { allowMissing: true }));
  await Promise.all(targets.map((target) => assertResolvedPathStaysInsideRoot(target, { allowMissing: true })));
  const uniqueRoots = [...new Set(targets.map((target) => target.root))];
  const overwriteCandidates: string[] = [];
  const newFiles: string[] = [];
  for (const file of files) {
    const resolvedTarget = resolveAllowedPath(file.path, normalizedSettings, { allowMissing: true });
    await assertResolvedPathStaysInsideRoot(resolvedTarget, { allowMissing: true });
    if (await pathExists(resolvedTarget.absolutePath)) {
      overwriteCandidates.push(resolvedTarget.absolutePath);
    } else {
      newFiles.push(resolvedTarget.absolutePath);
    }
  }

  return {
    ok: true,
    tool: "write_plan",
    data: {
      approvedRoots: normalizedSettings.rootEntries.map((root) => ({
        path: root.path,
        label: root.label,
        allowWrite: root.allowWrite,
        overwritePolicy: root.overwritePolicy,
        temporary: root.temporary
      })),
      budgets: normalizedSettings.budgets,
      requireWritePlan: normalizedSettings.requireWritePlan,
      plannedFileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      newFiles: newFiles.slice(0, PLAN_PREVIEW_LIMIT),
      overwriteCandidates: overwriteCandidates.slice(0, PLAN_PREVIEW_LIMIT),
      rootPreviews: await Promise.all(uniqueRoots.map(async (root) => ({
        root,
        entries: (await readdir(root).catch(() => [])).slice(0, PLAN_PREVIEW_LIMIT)
      })))
    }
  };
}

async function writeTextFile(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const target = resolveAllowedPath(String(args?.path ?? ""), normalizedSettings, { allowMissing: true });
  await assertResolvedPathStaysInsideRoot(target, { allowMissing: true });
  ensureWriteEnabled([target], normalizedSettings);
  const content = typeof args?.content === "string" ? args.content : String(args?.content ?? "");
  if (Buffer.byteLength(content, "utf8") > normalizedSettings.budgets.maxBytesPerTurn) {
    throw new Error(`write_file exceeds the ${normalizedSettings.budgets.maxBytesPerTurn} byte limit for one call.`);
  }
  const saved = await writeSingleFile(target.absolutePath, Buffer.from(content, "utf8"), target.rootEntry.overwritePolicy, hooks);
  const verification = await verifyWrittenFiles([{ path: saved.path, size: saved.size }]);
  return {
    ok: true,
    tool: "write_file",
    data: {
      path: saved.path,
      size: saved.size,
      replaced: saved.replaced,
      verification
    }
  };
}

async function writeSingleFile(
  path: string,
  content: Buffer,
  overwritePolicy: ClaudeChatOverwritePolicy,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<{ path: string; size: number; replaced: boolean }> {
  await mkdir(dirname(path), { recursive: true });
  const existedBefore = await pathExists(path);
  enforceOverwritePolicy(overwritePolicy, path, existedBefore);
  emitProgress(hooks, `staging ${path}`);
  const stageDir = await mkdtemp(join(dirname(path), ".cipher-stage-"));
  const stagePath = join(stageDir, basename(path));
  await writeFile(stagePath, content);

  let backupPath = "";
  try {
    emitProgress(hooks, `writing ${path}`);
    if (existedBefore) {
      backupPath = `${path}.cipher-backup-${Date.now()}`;
      await rename(path, backupPath);
    }
    await rename(stagePath, path);
  } catch (error) {
    if (backupPath && await pathExists(backupPath)) {
      await rename(backupPath, path).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(stageDir, { recursive: true, force: true }).catch(() => undefined);
    if (backupPath) {
      await rm(backupPath, { force: true }).catch(() => undefined);
    }
  }
  return { path, size: content.byteLength, replaced: existedBefore };
}

async function writeTextFiles(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const rawFiles = Array.isArray(args?.files) ? args.files : [];
  if (rawFiles.length === 0) {
    throw new Error("write_files requires a non-empty files array.");
  }
  if (rawFiles.length > normalizedSettings.budgets.maxFilesPerTurn) {
    throw new Error(`write_files supports at most ${normalizedSettings.budgets.maxFilesPerTurn} files per call.`);
  }

  const targets = rawFiles.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each write_files entry must be an object with path and content.");
    }
    const typed = entry as { path?: unknown; content?: unknown };
    return {
      target: resolveAllowedPath(String(typed.path ?? ""), normalizedSettings, { allowMissing: true }),
      content: typeof typed.content === "string" ? typed.content : String(typed.content ?? "")
    };
  });
  await Promise.all(targets.map((entry) => assertResolvedPathStaysInsideRoot(entry.target, { allowMissing: true })));
  ensureWriteEnabled(targets.map((entry) => entry.target), normalizedSettings);

  const saved: Array<{ path: string; size: number; replaced: boolean }> = [];
  let totalBytes = 0;
  for (const entry of targets) {
    const size = Buffer.byteLength(entry.content, "utf8");
    totalBytes += size;
    if (totalBytes > normalizedSettings.budgets.maxBytesPerTurn) {
      throw new Error(`write_files exceeds the ${normalizedSettings.budgets.maxBytesPerTurn} byte limit for one call.`);
    }
    saved.push(await writeSingleFile(
      entry.target.absolutePath,
      Buffer.from(entry.content, "utf8"),
      entry.target.rootEntry.overwritePolicy,
      hooks
    ));
  }
  const verification = await verifyWrittenFiles(saved);

  return {
    ok: true,
    tool: "write_files",
    data: {
      count: saved.length,
      totalBytes,
      files: saved,
      verification
    }
  };
}

async function writeBinaryFile(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const target = resolveAllowedPath(String(args?.path ?? ""), normalizedSettings, { allowMissing: true });
  await assertResolvedPathStaysInsideRoot(target, { allowMissing: true });
  ensureWriteEnabled([target], normalizedSettings);
  const content = decodeBase64Payload(args?.contentBase64);
  if (content.byteLength > normalizedSettings.budgets.maxBytesPerTurn) {
    throw new Error(`write_binary exceeds the ${normalizedSettings.budgets.maxBytesPerTurn} byte limit for one call.`);
  }
  const saved = await writeSingleFile(target.absolutePath, content, target.rootEntry.overwritePolicy, hooks);
  return {
    ok: true,
    tool: "write_binary",
    data: saved
  };
}

async function writeBinaryFiles(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const rawFiles = Array.isArray(args?.files) ? args.files : [];
  if (rawFiles.length === 0) {
    throw new Error("write_binaries requires a non-empty files array.");
  }
  if (rawFiles.length > normalizedSettings.budgets.maxFilesPerTurn) {
    throw new Error(`write_binaries supports at most ${normalizedSettings.budgets.maxFilesPerTurn} files per call.`);
  }
  const targets = rawFiles.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each write_binaries entry must be an object with path and contentBase64.");
    }
    const typed = entry as { path?: unknown; contentBase64?: unknown };
    return {
      target: resolveAllowedPath(String(typed.path ?? ""), normalizedSettings, { allowMissing: true }),
      content: decodeBase64Payload(typed.contentBase64)
    };
  });
  await Promise.all(targets.map((entry) => assertResolvedPathStaysInsideRoot(entry.target, { allowMissing: true })));
  ensureWriteEnabled(targets.map((entry) => entry.target), normalizedSettings);
  const saved: Array<{ path: string; size: number; replaced: boolean }> = [];
  let totalBytes = 0;
  for (const entry of targets) {
    totalBytes += entry.content.byteLength;
    if (totalBytes > normalizedSettings.budgets.maxBytesPerTurn) {
      throw new Error(`write_binaries exceeds the ${normalizedSettings.budgets.maxBytesPerTurn} byte limit for one call.`);
    }
    saved.push(await writeSingleFile(entry.target.absolutePath, entry.content, entry.target.rootEntry.overwritePolicy, hooks));
  }
  return {
    ok: true,
    tool: "write_binaries",
    data: {
      count: saved.length,
      totalBytes,
      files: saved
    }
  };
}

async function mkdirPath(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const target = resolveAllowedPath(String(args?.path ?? ""), normalizedSettings, { allowMissing: true });
  await assertResolvedPathStaysInsideRoot(target, { allowMissing: true });
  ensureWriteEnabled([target], normalizedSettings);
  emitProgress(hooks, `creating directory ${target.absolutePath}`);
  await mkdir(target.absolutePath, { recursive: true });
  return { ok: true, tool: "mkdir_path", data: { path: target.absolutePath } };
}

async function movePath(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const fromTarget = resolveAllowedPath(String(args?.fromPath ?? ""), normalizedSettings);
  const toTarget = resolveAllowedPath(String(args?.toPath ?? ""), normalizedSettings, { allowMissing: true });
  await assertResolvedPathStaysInsideRoot(fromTarget);
  await assertResolvedPathStaysInsideRoot(toTarget, { allowMissing: true });
  ensureWriteEnabled([fromTarget, toTarget], normalizedSettings);
  if (!await pathExists(fromTarget.absolutePath)) {
    throw new Error(`Source path does not exist: ${fromTarget.absolutePath}`);
  }
  enforceOverwritePolicy(toTarget.rootEntry.overwritePolicy, toTarget.absolutePath, await pathExists(toTarget.absolutePath));
  emitProgress(hooks, `moving ${fromTarget.absolutePath} -> ${toTarget.absolutePath}`);
  await mkdir(dirname(toTarget.absolutePath), { recursive: true });
  await rename(fromTarget.absolutePath, toTarget.absolutePath);
  return { ok: true, tool: "move_path", data: { fromPath: fromTarget.absolutePath, toPath: toTarget.absolutePath } };
}

async function deletePath(
  args: Record<string, unknown> | undefined,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  const target = resolveAllowedPath(String(args?.path ?? ""), normalizedSettings);
  await assertResolvedPathStaysInsideRoot(target);
  ensureWriteEnabled([target], normalizedSettings);
  if (isSamePath(target.absolutePath, target.rootEntry.path)) {
    throw new Error("Deleting an approved Claude chat folder root is blocked.");
  }
  emitProgress(hooks, `deleting ${target.absolutePath}`);
  await rm(target.absolutePath, { recursive: args?.recursive === true, force: false });
  return { ok: true, tool: "delete_path", data: { path: target.absolutePath, recursive: args?.recursive === true } };
}

export async function executeClaudeChatFilesystemTool(
  call: ClaudeChatFilesystemToolCall,
  settings: ClaudeChatFilesystemSettings,
  hooks?: ClaudeFilesystemRuntimeHooks
): Promise<ClaudeChatFilesystemToolResult> {
  const normalizedSettings = ensureRootsConfigured(settings);
  try {
    let result: ClaudeChatFilesystemToolResult;
    switch (call.tool) {
      case "list_files":
        result = await listFiles(call.args, normalizedSettings);
        break;
      case "read_file":
        result = await readTextFile(call.args, normalizedSettings);
        break;
      case "search_files":
        result = await searchFiles(call.args, normalizedSettings);
        break;
      case "write_plan":
        result = await buildWritePlan(call.args, normalizedSettings);
        break;
      case "write_file":
        result = await writeTextFile(call.args, normalizedSettings, hooks);
        break;
      case "write_files":
        result = await writeTextFiles(call.args, normalizedSettings, hooks);
        break;
      case "write_binary":
        result = await writeBinaryFile(call.args, normalizedSettings, hooks);
        break;
      case "write_binaries":
        result = await writeBinaryFiles(call.args, normalizedSettings, hooks);
        break;
      case "mkdir_path":
        result = await mkdirPath(call.args, normalizedSettings, hooks);
        break;
      case "move_path":
        result = await movePath(call.args, normalizedSettings, hooks);
        break;
      case "delete_path":
        result = await deletePath(call.args, normalizedSettings, hooks);
        break;
      default:
        throw new Error(`Unsupported Claude chat filesystem tool: ${String((call as { tool?: unknown }).tool ?? "")}`);
    }
    await emitAudit(hooks, { tool: call.tool, args: call.args, result: result.data });
    return result;
  } catch (error) {
    await emitAudit(hooks, {
      tool: call.tool,
      args: call.args,
      error: error instanceof Error ? error.message : "Unknown filesystem tool error."
    });
    throw error;
  }
}
