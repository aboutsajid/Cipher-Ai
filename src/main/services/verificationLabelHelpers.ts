import type { AgentArtifactType } from "../../shared/types";

interface ScriptsLike {
  start?: string;
  dev?: string;
}

export function getEntryVerificationLabel(artifactType: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Entry files";
    case "api-service":
      return "Service entry";
    case "script-tool":
      return "Tool entry";
    case "library":
      return "Package entry";
    case "desktop-app":
      return "App entry";
    case "workspace-change":
      return "Workspace target";
    default:
      return "Entry files";
  }
}

export function getBuildVerificationLabel(artifactType: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Web build";
    case "api-service":
      return "Service build";
    case "script-tool":
      return "Tool build";
    case "library":
      return "Package build";
    case "desktop-app":
      return "App build";
    default:
      return "Build";
  }
}

export function getLintVerificationLabel(artifactType: AgentArtifactType): string {
  switch (artifactType) {
    case "api-service":
      return "Service lint";
    case "script-tool":
      return "Tool lint";
    case "library":
      return "Package lint";
    case "desktop-app":
      return "App lint";
    case "web-app":
      return "Web lint";
    default:
      return "Lint";
  }
}

export function getTestVerificationLabel(artifactType: AgentArtifactType): string {
  switch (artifactType) {
    case "api-service":
      return "Service tests";
    case "script-tool":
      return "Tool tests";
    case "library":
      return "Package tests";
    case "desktop-app":
      return "App tests";
    case "web-app":
      return "Web tests";
    default:
      return "Tests";
  }
}

export function getLaunchVerificationLabel(artifactType: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Launch";
    case "api-service":
      return "Service boot";
    case "script-tool":
      return "Run";
    case "desktop-app":
      return "App start";
    default:
      return "Launch";
  }
}

export function resolveRuntimeVerificationScript(scripts: ScriptsLike): "start" | "dev" | null {
  if (scripts.start) return "start";
  if (scripts.dev) return "dev";
  return null;
}
