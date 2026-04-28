import type { AgentArtifactType } from "../../shared/types";
import { usesStartupVerification } from "./runtimeVerificationSelectors";

export function buildRuntimeVerificationDetails(
  artifactType: AgentArtifactType,
  scriptName: "start" | "dev",
  ok: boolean
): string {
  if (usesStartupVerification(artifactType)) {
    return ok
      ? `${scriptName} responded during startup verification.`
      : `${scriptName} still failed during startup verification.`;
  }
  return ok
    ? `${scriptName} completed successfully during runtime verification.`
    : `${scriptName} failed during runtime verification.`;
}

export function buildRuntimeVerificationAfterRepairDetails(
  artifactType: AgentArtifactType,
  scriptName: "start" | "dev"
): string {
  if (usesStartupVerification(artifactType)) {
    return `${scriptName} responded after requirement repair.`;
  }
  return `${scriptName} completed successfully after requirement repair.`;
}
