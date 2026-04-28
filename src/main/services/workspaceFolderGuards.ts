const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  "release-stage",
  "release-package",
  "build",
  "coverage",
  ".next",
  ".cache",
  "tmp",
  ".cipher-snapshots",
  "models"
]);

const SNAPSHOT_PRESERVE_FOLDERS = new Set([
  ".git",
  "node_modules",
  ".cipher-snapshots",
  "models",
  "release-package"
]);

export function isIgnoredWorkspaceFolder(name: string): boolean {
  const normalized = (name ?? "").trim().toLowerCase();
  return IGNORED_FOLDERS.has(name) || normalized.startsWith("release-package-");
}

export function isSnapshotPreserveFolder(name: string): boolean {
  const normalized = (name ?? "").trim().toLowerCase();
  return SNAPSHOT_PRESERVE_FOLDERS.has(name) || normalized.startsWith("release-package-");
}
