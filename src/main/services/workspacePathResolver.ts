import { isAbsolute, normalize, relative, resolve } from "node:path";

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const rawTarget = (targetPath ?? ".").trim() || ".";
  const fullPath = isAbsolute(rawTarget) ? resolve(rawTarget) : resolve(workspaceRoot, rawTarget);
  const relativePath = relative(workspaceRoot, fullPath);
  if (relativePath.startsWith("..") || normalize(relativePath) === "..") {
    throw new Error("Path escapes the workspace root.");
  }
  return fullPath;
}

export function toWorkspaceRelative(workspaceRoot: string, fullPath: string): string {
  const relPath = relative(workspaceRoot, fullPath) || ".";
  return relPath.split("\\").join("/");
}

export function normalizeTaskTargetPath(workspaceRoot: string, targetPath?: string): string | undefined {
  const normalizedTarget = (targetPath ?? "").trim();
  if (!normalizedTarget) return undefined;
  return toWorkspaceRelative(workspaceRoot, resolveWorkspacePath(workspaceRoot, normalizedTarget));
}
