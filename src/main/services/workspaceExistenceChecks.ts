import { stat } from "node:fs/promises";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function allFilesExist(
  paths: string[],
  options: { resolveWorkspacePath: (targetPath: string) => string }
): Promise<boolean> {
  for (const targetPath of paths) {
    if (!await pathExists(options.resolveWorkspacePath(targetPath))) {
      return false;
    }
  }
  return true;
}
