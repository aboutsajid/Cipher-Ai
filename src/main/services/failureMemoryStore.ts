export interface FailureMemoryRecord<ArtifactType extends string = string, Category extends string = string> {
  key: string;
  artifactType: ArtifactType;
  category: Category;
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

export function upsertFailureMemoryEntry<ArtifactType extends string, Category extends string>(options: {
  current: FailureMemoryRecord<ArtifactType, Category> | undefined;
  key: string;
  artifactType: ArtifactType;
  category: Category;
  stage: string;
  signature: string;
  guidance: string;
  example: string;
  now?: string;
}): { entry: FailureMemoryRecord<ArtifactType, Category>; created: boolean } {
  const {
    current,
    key,
    artifactType,
    category,
    stage,
    signature,
    guidance,
    example,
    now = new Date().toISOString()
  } = options;

  if (current) {
    return {
      created: false,
      entry: {
        ...current,
        count: current.count + 1,
        lastSeenAt: now,
        example,
        guidance,
        stage
      }
    };
  }

  return {
    created: true,
    entry: {
      key,
      artifactType,
      category,
      stage,
      signature,
      guidance,
      example,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now
    }
  };
}
