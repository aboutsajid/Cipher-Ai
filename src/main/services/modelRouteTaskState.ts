import type { AgentTaskModelAttemptOutcome } from "../../shared/types";

export type TrackableTaskModelFailureOutcome = Extract<AgentTaskModelAttemptOutcome, "transient-error" | "error" | "semantic-error">;

export interface TaskStageRouteState<Route> {
  route: Route;
  routeIndex: number;
  attempt: number;
}

export function recordTaskModelFailureState(options: {
  taskId: string;
  model: string;
  outcome: TrackableTaskModelFailureOutcome;
  taskModelFailureCounts: Map<string, Map<string, number>>;
  taskModelBlacklist: Map<string, Set<string>>;
  hardFailureThreshold: number;
  transientFailureThreshold: number;
}): { updated: boolean; blacklisted: boolean } {
  const {
    taskId,
    model,
    outcome,
    taskModelFailureCounts,
    taskModelBlacklist,
    hardFailureThreshold,
    transientFailureThreshold
  } = options;

  const normalizedModel = (model ?? "").trim();
  if (!taskId || !normalizedModel) {
    return { updated: false, blacklisted: false };
  }

  const taskFailures = taskModelFailureCounts.get(taskId) ?? new Map<string, number>();
  const nextCount = (taskFailures.get(normalizedModel) ?? 0) + 1;
  taskFailures.set(normalizedModel, nextCount);
  taskModelFailureCounts.set(taskId, taskFailures);

  const threshold = outcome === "transient-error"
    ? transientFailureThreshold
    : hardFailureThreshold;
  if (nextCount < threshold) {
    return { updated: true, blacklisted: false };
  }

  const blacklist = taskModelBlacklist.get(taskId) ?? new Set<string>();
  blacklist.add(normalizedModel);
  taskModelBlacklist.set(taskId, blacklist);
  return { updated: true, blacklisted: true };
}

export function isTaskModelBlacklisted(
  taskModelBlacklist: ReadonlyMap<string, ReadonlySet<string>>,
  taskId: string,
  model: string
): boolean {
  return taskModelBlacklist.get(taskId)?.has((model ?? "").trim()) ?? false;
}

export function rememberTaskStageRouteState<Route extends object>(options: {
  taskId: string;
  stage: string;
  route: Route;
  routeIndex: number;
  attempt: number;
  taskStageRoutes: Map<string, Map<string, TaskStageRouteState<Route>>>;
}): boolean {
  const { taskId, stage, route, routeIndex, attempt, taskStageRoutes } = options;
  const normalizedStage = (stage ?? "").trim();
  if (!taskId || !normalizedStage) return false;

  const taskRoutes = taskStageRoutes.get(taskId) ?? new Map<string, TaskStageRouteState<Route>>();
  taskRoutes.set(normalizedStage, {
    route: { ...route },
    routeIndex,
    attempt
  });
  taskStageRoutes.set(taskId, taskRoutes);
  return true;
}

export function clearTaskRouteState<Route extends object>(
  taskId: string,
  taskModelFailureCounts: Map<string, Map<string, number>>,
  taskModelBlacklist: Map<string, Set<string>>,
  taskStageRoutes: Map<string, Map<string, TaskStageRouteState<Route>>>
): void {
  taskModelFailureCounts.delete(taskId);
  taskModelBlacklist.delete(taskId);
  taskStageRoutes.delete(taskId);
}
