function normalizePathForComparison(input: string): string {
  return String(input ?? "").trim().replace(/\//g, "\\").replace(/[\\]+$/, "");
}

function isSameOrInsidePath(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePathForComparison(candidate).toLowerCase();
  const normalizedRoot = normalizePathForComparison(root).toLowerCase();
  if (!normalizedCandidate || !normalizedRoot) return false;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

function getParentPath(input: string): string {
  const normalized = String(input ?? "").trim().replace(/[\\/]+$/, "");
  if (!normalized) return "";
  const match = normalized.match(/^(.*)[\\/][^\\/]+$/);
  return (match?.[1] ?? normalized).trim();
}

function findCommonPath(paths: string[]): string {
  const normalized = paths
    .map((path) => String(path ?? "").trim().replace(/\//g, "\\").replace(/[\\]+$/, ""))
    .filter(Boolean);
  if (normalized.length === 0) return "";
  if (normalized.length === 1) return normalized[0];

  const segmented = normalized.map((path) => path.split("\\").filter((segment, index) => index === 0 || segment.length > 0));
  const shared: string[] = [];
  const maxLength = Math.min(...segmented.map((parts) => parts.length));
  for (let index = 0; index < maxLength; index += 1) {
    const candidate = segmented[0][index];
    if (!segmented.every((parts) => parts[index]?.toLowerCase() === candidate?.toLowerCase())) break;
    shared.push(candidate);
  }
  return shared.join("\\");
}

function getPathDisplayName(path: string): string {
  const normalized = normalizePathForComparison(path);
  return normalized.split("\\").filter(Boolean).pop() ?? normalized;
}

function formatClaudeTimelinePath(path: string, target: string): string {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedTarget = normalizePathForComparison(target);
  if (normalizedTarget && isSameOrInsidePath(normalizedPath, normalizedTarget)) {
    const relative = normalizedPath.slice(normalizedTarget.length).replace(/^[\\]+/, "");
    return relative || getPathDisplayName(normalizedTarget);
  }
  return normalizedPath;
}
