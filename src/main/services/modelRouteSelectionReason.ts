import { getModelCapabilityHints } from "../../shared/modelCatalog";

interface RouteLike {
  model: string;
  skipAuth?: boolean;
}

type RoutingStage = "planner" | "repair" | "generator";

export function buildTaskStageSelectionReason(options: {
  routingStage: RoutingStage;
  route: RouteLike;
  routeIndex: number;
  requiresVision: boolean;
}): string {
  const { routingStage, route, routeIndex, requiresVision } = options;
  const providerLabel = route.skipAuth ? "local" : "cloud";
  const hints = getModelCapabilityHints(route.model);
  const capabilityHints: string[] = [];
  if (hints.coding > 0) capabilityHints.push("coder");
  if (hints.reasoning >= 6) capabilityHints.push("reasoning");
  if (hints.longContext >= 8) capabilityHints.push("long-context");
  if (hints.vision) capabilityHints.push("vision");

  const stageBias = routingStage === "planner"
    ? "Planner stages favor long-context and reasoning models."
    : routingStage === "repair"
      ? "Repair stages favor coder and reasoning models."
      : "Implementation stages favor coder-first routes.";
  const capabilityDetail = capabilityHints.length > 0
    ? `Matched ${capabilityHints.join(", ")} capability hints on this ${providerLabel} route.`
    : `No strong capability hints were detected, so this ${providerLabel} route stayed available as a fallback.`;
  const visionBias = requiresVision
    ? (hints.vision
      ? " This task includes image attachments, so vision-capable routes are preferred."
      : " This task includes image attachments, but no vision signal was detected on this fallback route.")
    : "";
  const routePosition = routeIndex > 0
    ? ` It is currently using route ${routeIndex + 1}, so earlier candidates already failed, were blacklisted, or ranked lower.`
    : " It is currently the top remaining route for this stage.";
  return `${stageBias} ${capabilityDetail}${visionBias}${routePosition}`;
}
