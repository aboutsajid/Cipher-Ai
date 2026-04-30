function formatAgentArtifactType(artifactType?: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Web app";
    case "api-service":
      return "API service";
    case "script-tool":
      return "Script tool";
    case "library":
      return "Library";
    case "desktop-app":
      return "Desktop app";
    case "workspace-change":
      return "Workspace change";
    default:
      return "Unknown artifact";
  }
}

function getArtifactResultTitle(artifactType?: AgentArtifactType, primaryAction?: AgentOutputPrimaryAction): string {
  if (primaryAction === "inspect-package") return "Prepared package output";
  if (primaryAction === "inspect-workspace") return "Prepared workspace changes";
  if (primaryAction === "run-service") return "Prepared API service";
  if (primaryAction === "run-tool") return "Prepared script tool";
  if (primaryAction === "run-desktop") return "Prepared desktop app";
  if (primaryAction === "run-web-app" || primaryAction === "preview-web") return "Prepared web app";

  switch (artifactType) {
    case "web-app":
      return "Prepared web app";
    case "api-service":
      return "Prepared API service";
    case "script-tool":
      return "Prepared script tool";
    case "library":
      return "Prepared library output";
    case "desktop-app":
      return "Prepared desktop app";
    case "workspace-change":
      return "Prepared workspace changes";
    default:
      return "Prepared task output";
  }
}

function parseAgentArtifactTypeLabel(value: string): AgentArtifactType | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "web app":
      return "web-app";
    case "api service":
      return "api-service";
    case "script tool":
      return "script-tool";
    case "library":
      return "library";
    case "desktop app":
      return "desktop-app";
    case "workspace change":
      return "workspace-change";
    case "unknown artifact":
      return "unknown";
    default:
      return undefined;
  }
}

function isWebArtifactType(artifactType?: AgentArtifactType): boolean {
  return artifactType === "web-app";
}

function isTaskPreviewable(task: AgentTask): boolean {
  if (!task.targetPath || !task.verification?.previewReady) return false;
  return task.artifactType ? isWebArtifactType(task.artifactType) : true;
}

function getArtifactOpenLabel(artifactType?: AgentArtifactType): string {
  switch (artifactType) {
    case "web-app":
      return "Open App Folder";
    case "api-service":
      return "Open Service Folder";
    case "script-tool":
      return "Open Tool Folder";
    case "library":
      return "Open Package Folder";
    case "desktop-app":
      return "Open App Folder";
    case "workspace-change":
      return "Open Changed Folder";
    default:
      return "Open Folder";
  }
}

function formatAgentPrimaryAction(action?: AgentOutputPrimaryAction): string {
  switch (action) {
    case "preview-web":
      return "Preview web app";
    case "run-web-app":
      return "Run web app";
    case "run-service":
      return "Run service";
    case "run-tool":
      return "Run tool";
    case "run-desktop":
      return "Run desktop app";
    case "inspect-package":
      return "Inspect package";
    case "inspect-workspace":
      return "Inspect workspace";
    case "preview":
      return "Preview";
    case "run-command":
      return "Run command";
    case "inspect":
      return "Inspect";
    case "open-folder":
      return "Open folder";
    default:
      return "Open folder";
  }
}

function getArtifactUsageCopy(artifactType?: AgentArtifactType): { title: string; detail: string } | null {
  switch (artifactType) {
    case "web-app":
      return {
        title: "Primary surface: browser preview.",
        detail: "Use Preview for the running app and Open App Folder when you need the source project."
      };
    case "api-service":
      return {
        title: "Primary surface: runnable service.",
        detail: "Open Service Folder to inspect the codebase and run the API from its project directory."
      };
    case "script-tool":
      return {
        title: "Primary surface: runnable tool.",
        detail: "Open Tool Folder to inspect the files and run the script or CLI locally."
      };
    case "library":
      return {
        title: "Primary surface: package source.",
        detail: "Open Package Folder to inspect the implementation, tests, and build outputs."
      };
    case "desktop-app":
      return {
        title: "Primary surface: desktop project.",
        detail: "Open App Folder to inspect the desktop project and run it from its local workspace."
      };
    case "workspace-change":
      return {
        title: "Primary surface: workspace files.",
        detail: "Open Changed Folder to inspect the files changed by this task inside the current workspace."
      };
    default:
      return null;
  }
}
