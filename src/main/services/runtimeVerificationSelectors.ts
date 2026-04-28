import type { AgentArtifactType } from "../../shared/types";

export function usesStartupVerification(artifactType: AgentArtifactType): boolean {
  return artifactType === "web-app" || artifactType === "api-service" || artifactType === "desktop-app";
}

export function shouldVerifyLaunch(artifactType: AgentArtifactType): boolean {
  return artifactType !== "library" && artifactType !== "workspace-change";
}

export function shouldVerifyPreviewHealth(artifactType: AgentArtifactType): boolean {
  return artifactType === "web-app";
}

export function shouldVerifyUiSmoke(artifactType: AgentArtifactType): boolean {
  return artifactType === "web-app";
}

export function shouldVerifyServedWebPage(artifactType: AgentArtifactType): boolean {
  return artifactType === "web-app";
}

export function shouldVerifyRuntimeDepth(artifactType: AgentArtifactType): boolean {
  return artifactType === "api-service" || artifactType === "script-tool" || artifactType === "desktop-app";
}
