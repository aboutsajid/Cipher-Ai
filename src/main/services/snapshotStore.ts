import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentSnapshotRestoreResult,
  AgentTask,
  WorkspaceSnapshot
} from "../../shared/types";

export interface StoredSnapshotEntry {
  directoryName: string;
  directoryPath: string;
  snapshot: WorkspaceSnapshot | null;
}

export function collectReferencedSnapshotIds(
  tasks: Iterable<AgentTask>,
  lastRestoreState: AgentSnapshotRestoreResult | null
): Set<string> {
  const referencedIds = new Set<string>();

  for (const task of tasks) {
    const rollbackSnapshotId = (task.rollbackSnapshotId ?? "").trim();
    const completionSnapshotId = (task.completionSnapshotId ?? "").trim();
    if (rollbackSnapshotId) referencedIds.add(rollbackSnapshotId);
    if (completionSnapshotId) referencedIds.add(completionSnapshotId);
  }

  const restoredSnapshotId = (lastRestoreState?.snapshotId ?? "").trim();
  if (restoredSnapshotId) referencedIds.add(restoredSnapshotId);

  return referencedIds;
}

function parseSnapshot(raw: string): WorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export async function listSnapshots(snapshotRoot: string): Promise<WorkspaceSnapshot[]> {
  try {
    const entries = await readdir(snapshotRoot, { withFileTypes: true });
    const snapshots: WorkspaceSnapshot[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(snapshotRoot, entry.name, "meta.json");
      try {
        const raw = await readFile(metaPath, "utf8");
        const parsed = parseSnapshot(raw);
        if (parsed) snapshots.push(parsed);
      } catch {
        // Ignore malformed snapshots.
      }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function listStoredSnapshotEntries(snapshotRoot: string): Promise<StoredSnapshotEntry[]> {
  try {
    const entries = await readdir(snapshotRoot, { withFileTypes: true });
    const snapshots: StoredSnapshotEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const directoryPath = join(snapshotRoot, entry.name);
      const metaPath = join(directoryPath, "meta.json");
      let snapshot: WorkspaceSnapshot | null = null;

      try {
        const raw = await readFile(metaPath, "utf8");
        snapshot = parseSnapshot(raw);
      } catch {
        snapshot = null;
      }

      snapshots.push({
        directoryName: entry.name,
        directoryPath,
        snapshot
      });
    }

    return snapshots;
  } catch {
    return [];
  }
}
