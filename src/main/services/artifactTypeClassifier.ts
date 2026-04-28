type ArtifactKind =
  | "web-app"
  | "desktop-app"
  | "api-service"
  | "script-tool"
  | "library"
  | "workspace-change"
  | "unknown"
  | null;

type WorkspaceKind = "static" | "react" | "generic" | null;

export function classifyArtifactType(
  prompt: string,
  options: {
    previewReady: boolean;
    workspaceKind: WorkspaceKind;
    promptArtifact: ArtifactKind;
    packageArtifact: ArtifactKind;
  }
): Exclude<ArtifactKind, null> {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (options.previewReady) return "web-app";

  const promptArtifact = options.promptArtifact;
  const packageArtifact = options.packageArtifact;
  if (promptArtifact === "desktop-app") return promptArtifact;
  if (promptArtifact === "api-service" || promptArtifact === "script-tool" || promptArtifact === "library") return promptArtifact;
  if (promptArtifact === "web-app") return promptArtifact;
  if (packageArtifact === "desktop-app") return packageArtifact;
  if (packageArtifact) return packageArtifact;
  if (options.workspaceKind === "static" || options.workspaceKind === "react") return "web-app";
  if (promptArtifact) return promptArtifact;
  if (normalized.length > 0) return "workspace-change";
  return "unknown";
}
