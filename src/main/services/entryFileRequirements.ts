import { joinWorkspacePath } from "./heuristicWorkspacePathHelpers";

type WorkspaceKind = "static" | "react" | "generic";
type ArtifactKind =
  | "web-app"
  | "desktop-app"
  | "api-service"
  | "script-tool"
  | "library"
  | "workspace-change"
  | "unknown"
  | null;

export function buildRequiredEntryPaths(options: {
  workingDirectory: string;
  workspaceKind: WorkspaceKind;
  artifactType: ArtifactKind;
}): string[] {
  const requiredPaths = new Set<string>();
  const workingDirectory = (options.workingDirectory ?? ".").replace(/\\/g, "/");

  if (options.workspaceKind === "static") {
    requiredPaths.add(joinWorkspacePath(workingDirectory, "index.html"));
    requiredPaths.add(joinWorkspacePath(workingDirectory, "styles.css"));
  } else if (options.workspaceKind === "react") {
    requiredPaths.add(joinWorkspacePath(workingDirectory, "package.json"));
    requiredPaths.add(joinWorkspacePath(workingDirectory, "index.html"));
    requiredPaths.add(joinWorkspacePath(workingDirectory, "src/main.tsx"));
    requiredPaths.add(joinWorkspacePath(workingDirectory, "src/App.tsx"));
    if (options.artifactType === "desktop-app") {
      requiredPaths.add(joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
      requiredPaths.add(joinWorkspacePath(workingDirectory, "electron/main.mjs"));
    }
  } else {
    requiredPaths.add(joinWorkspacePath(workingDirectory, "package.json"));
  }

  return [...requiredPaths];
}
