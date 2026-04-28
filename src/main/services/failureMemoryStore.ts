export interface FailureMemoryRecord {
  key: string;
  artifactType: string;
  category: string;
  stage: string;
  signature: string;
  guidance: string;
  example: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export function selectRelevantFailureMemory(
  entries: FailureMemoryRecord[],
  options: {
    failureCategory: string;
    stageLabel: string;
    currentArtifact: string;
    maxEntries?: number;
    minRecurringCount?: number;
  }
): FailureMemoryRecord[] {
  const {
    failureCategory,
    stageLabel,
    currentArtifact,
    maxEntries = 3,
    minRecurringCount = 2
  } = options;
  const normalizedStage = (stageLabel ?? "").trim().toLowerCase();

  return entries
    .filter((entry) => entry.count >= minRecurringCount || entry.category === failureCategory)
    .filter((entry) => entry.category === failureCategory || normalizedStage.includes(entry.stage.toLowerCase().split(" ")[0] ?? ""))
    .filter((entry) => entry.artifactType === "unknown" || currentArtifact === "unknown" || entry.artifactType === currentArtifact)
    .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, maxEntries);
}

export function formatFailureMemoryForPrompt(entries: FailureMemoryRecord[]): string[] {
  if (entries.length === 0) return [];
  return [
    "Recurring failure memory:",
    ...entries.map((entry) => `- ${entry.count}x ${entry.category}/${entry.signature}: ${entry.guidance}`)
  ];
}

export function trimFailureMemoryStore(memory: Map<string, FailureMemoryRecord>, maxEntries: number): void {
  const entries = [...memory.values()];
  if (entries.length <= maxEntries) return;
  entries
    .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(maxEntries)
    .forEach((entry) => {
      memory.delete(entry.key);
    });
}
