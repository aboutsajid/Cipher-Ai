import type { AgentTaskModelAttemptOutcome } from "../../shared/types";
import type { ModelRouteReliabilityStats } from "./modelRouteScoring";

export function normalizeModelRouteReliabilityStats(
  stats: Partial<ModelRouteReliabilityStats>
): ModelRouteReliabilityStats {
  return {
    successes: Math.max(0, Number(stats.successes) || 0),
    failures: Math.max(0, Number(stats.failures) || 0),
    transientFailures: Math.max(0, Number(stats.transientFailures) || 0),
    semanticFailures: Math.max(0, Number(stats.semanticFailures) || 0),
    lastUsedAt: typeof stats.lastUsedAt === "string" ? stats.lastUsedAt : undefined
  };
}

export function buildNextModelRouteReliabilityStats(
  current: ModelRouteReliabilityStats | undefined,
  outcome: AgentTaskModelAttemptOutcome,
  nowIso = new Date().toISOString()
): ModelRouteReliabilityStats {
  const baseline = normalizeModelRouteReliabilityStats(current ?? {});
  const next: ModelRouteReliabilityStats = {
    ...baseline,
    lastUsedAt: nowIso
  };
  if (outcome === "success") {
    next.successes += 1;
  } else if (outcome === "transient-error") {
    next.transientFailures += 1;
  } else if (outcome === "semantic-error") {
    next.semanticFailures += 1;
  } else {
    next.failures += 1;
  }
  return next;
}
