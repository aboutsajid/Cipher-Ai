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

export function getRequestedEntryPathAliasGroups(
  requestedPath: string,
  workingDirectory: string,
  workspaceKind: WorkspaceKind,
  artifactType: ArtifactKind
): string[][] {
  if (artifactType !== "desktop-app" || workspaceKind !== "react") {
    return [];
  }

  const fileName = requestedPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  switch (fileName) {
    case "main.js":
      return [
        [joinWorkspacePath(workingDirectory, "electron/main.mjs")],
        [joinWorkspacePath(workingDirectory, "electron/main.js")],
        [joinWorkspacePath(workingDirectory, "electron/main.ts")]
      ];
    case "preload.js":
      return [
        [joinWorkspacePath(workingDirectory, "electron/preload.mjs")],
        [joinWorkspacePath(workingDirectory, "electron/preload.js")],
        // Modern Electron React shells can wire preload behavior directly from the main process.
        [joinWorkspacePath(workingDirectory, "electron/main.mjs")]
      ];
    case "renderer.js":
      return [
        [joinWorkspacePath(workingDirectory, "src/main.tsx")],
        [joinWorkspacePath(workingDirectory, "src/main.jsx")],
        [joinWorkspacePath(workingDirectory, "src/App.tsx"), joinWorkspacePath(workingDirectory, "index.html")],
        [joinWorkspacePath(workingDirectory, "src/App.jsx"), joinWorkspacePath(workingDirectory, "index.html")]
      ];
    case "styles.css":
      return [
        [joinWorkspacePath(workingDirectory, "src/index.css")],
        [joinWorkspacePath(workingDirectory, "src/App.css")],
        [joinWorkspacePath(workingDirectory, "src/styles.css")],
        [joinWorkspacePath(workingDirectory, "dist/assets")]
      ];
    default:
      return [];
  }
}
