import { getModelCapabilityHints } from "../../shared/modelCatalog";
import type {
  AgentModelRouteScoreFactor,
  AgentTaskRouteTelemetrySummary
} from "../../shared/types";

export interface TaskRouteModel {
  model: string;
  baseUrl: string;
  apiKey: string;
  skipAuth: boolean;
}

export interface TaskStageRouteState {
  route: TaskRouteModel;
  routeIndex: number;
  attempt: number;
}

export interface TaskModelFailureStatus {
  count: number;
  blacklisted: boolean;
  hardFailuresUntilBlacklist: number;
  transientFailuresUntilBlacklist: number;
}

export function buildTaskRouteTelemetrySummary(options: {
  taskId: string;
  taskModelBlacklist: ReadonlyMap<string, ReadonlySet<string>>;
  taskModelFailureCounts: ReadonlyMap<string, ReadonlyMap<string, number>>;
  taskStageRoutes: ReadonlyMap<string, ReadonlyMap<string, TaskStageRouteState>>;
  visionRequested: boolean;
  buildTaskModelFailureStatus: (taskId: string, model: string) => TaskModelFailureStatus;
  getModelRouteScore: (route: TaskRouteModel) => number;
  buildModelRouteScoreFactors: (route: TaskRouteModel) => AgentModelRouteScoreFactor[];
  buildTaskStageSelectionReason: (taskId: string, stage: string, route: TaskRouteModel, routeIndex: number) => string;
}): AgentTaskRouteTelemetrySummary {
  const {
    taskId,
    taskModelBlacklist,
    taskModelFailureCounts,
    taskStageRoutes,
    visionRequested,
    buildTaskModelFailureStatus,
    getModelRouteScore,
    buildModelRouteScoreFactors,
    buildTaskStageSelectionReason
  } = options;

  const blacklistedModels = [...(taskModelBlacklist.get(taskId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
  const failureCounts = [...(taskModelFailureCounts.get(taskId)?.entries() ?? [])]
    .map(([model, count]) => {
      const status = buildTaskModelFailureStatus(taskId, model);
      return {
        model,
        count,
        blacklisted: status.blacklisted,
        hardFailuresUntilBlacklist: status.hardFailuresUntilBlacklist,
        transientFailuresUntilBlacklist: status.transientFailuresUntilBlacklist
      };
    })
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
  const activeStageRoutes = [...(taskStageRoutes.get(taskId)?.entries() ?? [])]
    .map(([stage, state]) => {
      const failureStatus = buildTaskModelFailureStatus(taskId, state.route.model);
      return {
        stage,
        model: state.route.model,
        baseUrl: state.route.baseUrl,
        provider: state.route.skipAuth ? "local" as const : "remote" as const,
        routeIndex: state.routeIndex,
        attempt: state.attempt,
        score: getModelRouteScore(state.route),
        scoreFactors: buildModelRouteScoreFactors(state.route),
        failureCount: failureStatus.count,
        blacklisted: failureStatus.blacklisted,
        hardFailuresUntilBlacklist: failureStatus.hardFailuresUntilBlacklist,
        transientFailuresUntilBlacklist: failureStatus.transientFailuresUntilBlacklist,
        visionRequested,
        visionCapable: getModelCapabilityHints(state.route.model).vision,
        selectionReason: buildTaskStageSelectionReason(taskId, stage, state.route, state.routeIndex)
      };
    })
    .sort((a, b) => a.stage.localeCompare(b.stage));

  return {
    blacklistedModels,
    failureCounts,
    visionRequested,
    activeStageRoutes
  };
}
