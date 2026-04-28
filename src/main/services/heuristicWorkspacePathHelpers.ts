export function joinWorkspacePath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    || ".";
}

export function isPathInsideWorkingDirectory(path: string, workingDirectory: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\.?\//, "");
  const normalizedWorkingDirectory = workingDirectory.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normalizedPath) return false;
  if (!normalizedWorkingDirectory || normalizedWorkingDirectory === ".") return true;
  return normalizedPath === normalizedWorkingDirectory || normalizedPath.startsWith(`${normalizedWorkingDirectory}/`);
}

export function extractExplicitPromptFilePaths(prompt: string, workingDirectory: string): string[] {
  const normalized = (prompt ?? "")
    .replace(/\[SOAK:[^\]]+\]/gi, " ")
    .replace(/\\/g, "/");
  if (!normalized.trim()) return [];

  const matches = normalized.match(/\b(?:[\w.-]+\/)*[\w.-]+\.(?:html|css|js|jsx|ts|tsx|json|md)\b/gi) ?? [];
  const requested = new Set<string>();

  for (const rawMatch of matches) {
    const cleaned = rawMatch.trim().replace(/^\.?\//, "");
    if (/^node\.js$/i.test(cleaned)) continue;
    if (!cleaned || cleaned.startsWith("../")) continue;
    const normalizedPath = cleaned.includes("/")
      ? cleaned
      : joinWorkspacePath(workingDirectory, cleaned);
    if (!isPathInsideWorkingDirectory(normalizedPath, workingDirectory)) continue;
    requested.add(normalizedPath);
  }

  return [...requested];
}
