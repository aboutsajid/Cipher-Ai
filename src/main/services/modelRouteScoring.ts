import type { AgentModelRouteScoreFactor } from "../../shared/types";

export interface ModelRouteKeyInput {
  model: string;
  baseUrl: string;
  skipAuth: boolean;
}

export interface ModelRouteReliabilityStats {
  successes: number;
  failures: number;
  transientFailures: number;
  semanticFailures: number;
  lastUsedAt?: string;
}

export type AgentRoutingStage = "planner" | "generator" | "repair";

const TRANSIENT_MODEL_FAILURE_TERMS = [
  "timed out",
  "aborted",
  "timeout",
  "api error 429",
  "api error 502",
  "api error 503",
  "api error 504",
  "api error 500",
  "rate limit",
  "overloaded",
  "temporarily unavailable",
  "requires more system memory",
  "not enough memory",
  "insufficient memory",
  "out of memory",
  "econnreset",
  "socket hang up",
  "fetch failed"
];

export function isTransientModelFailure(message: string): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return TRANSIENT_MODEL_FAILURE_TERMS.some((term) => normalized.includes(term));
}

export function buildModelRouteKey(route: ModelRouteKeyInput): string {
  return `${route.skipAuth ? "local" : "remote"}|${route.baseUrl}|${route.model}`;
}

export function getModelRouteScore(
  routeStats: ReadonlyMap<string, ModelRouteReliabilityStats>,
  route: ModelRouteKeyInput
): number {
  const stats = routeStats.get(buildModelRouteKey(route));
  if (!stats) return 0;
  return (stats.successes * 3) - (stats.failures * 4) - (stats.semanticFailures * 5) - (stats.transientFailures * 2);
}

export function buildModelRouteScoreFactors(
  routeStats: ReadonlyMap<string, ModelRouteReliabilityStats>,
  route: ModelRouteKeyInput
): AgentModelRouteScoreFactor[] {
  const stats = routeStats.get(buildModelRouteKey(route));
  if (!stats) {
    return [{ label: "No reliability history", delta: 0 }];
  }

  const factors: AgentModelRouteScoreFactor[] = [];
  if (stats.successes > 0) {
    factors.push({ label: `${stats.successes} success${stats.successes === 1 ? "" : "es"}`, delta: stats.successes * 3 });
  }
  if (stats.failures > 0) {
    factors.push({ label: `${stats.failures} hard fail${stats.failures === 1 ? "" : "s"}`, delta: stats.failures * -4 });
  }
  if (stats.transientFailures > 0) {
    factors.push({
      label: `${stats.transientFailures} transient fail${stats.transientFailures === 1 ? "ure" : "ures"}`,
      delta: stats.transientFailures * -2
    });
  }
  if (stats.semanticFailures > 0) {
    factors.push({
      label: `${stats.semanticFailures} semantic fail${stats.semanticFailures === 1 ? "ure" : "ures"}`,
      delta: stats.semanticFailures * -5
    });
  }
  return factors.length > 0 ? factors : [{ label: "No reliability history", delta: 0 }];
}

export function inferRoutingStage(stageLabel: string): AgentRoutingStage {
  const normalized = (stageLabel ?? "").trim().toLowerCase();
  if (normalized.includes("plan")) return "planner";
  if (normalized.includes("repair") || normalized.includes("fix") || normalized.includes("recovery")) return "repair";
  return "generator";
}
