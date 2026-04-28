import type { AgentArtifactType, AgentTaskOutput } from "../../shared/types";

export function buildTaskOutput(
  artifactType: AgentArtifactType,
  options: {
    packageName?: string;
    workingDirectory?: string;
    runCommand?: string;
    hasPreview?: boolean;
    hasPackagingScript?: boolean;
    prompt?: string;
  }
): AgentTaskOutput {
  const packageCommand = options.hasPackagingScript ? "npm run package:win" : undefined;
  const hasPreview = artifactType === "web-app" && Boolean(options.hasPreview);
  const runCommand = options.runCommand;
  const workingDirectory = options.workingDirectory;
  const packageName = options.packageName;
  const prompt = options.prompt ?? "";

  switch (artifactType) {
    case "web-app":
      return {
        primaryAction: hasPreview ? "preview-web" : (runCommand ? "run-web-app" : "open-folder"),
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: hasPreview ? "Primary action: preview the web app." : "Primary action: run the web app locally.",
        usageDetail: hasPreview
          ? "Use Preview to inspect the running app. Open the app folder when you need the project files."
          : runCommand
            ? `Run ${runCommand} from ${workingDirectory ?? "the project folder"} to start the app locally.`
            : "Open the app folder to inspect or run the project locally."
      };
    case "api-service":
      return {
        primaryAction: runCommand ? "run-service" : "open-folder",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: run the service locally.",
        usageDetail: runCommand
          ? `Run ${runCommand} from ${workingDirectory ?? "the service folder"} to boot the API.`
          : "Open the service folder to inspect the codebase and start the API manually."
      };
    case "script-tool":
      return {
        primaryAction: runCommand ? "run-tool" : "open-folder",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: run the tool locally.",
        usageDetail: runCommand
          ? `Run ${runCommand} from ${workingDirectory ?? "the tool folder"} to execute the tool.`
          : "Open the tool folder to inspect and run the script or CLI manually."
      };
    case "library":
      return {
        primaryAction: "inspect-package",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: inspect the package source.",
        usageDetail: runCommand
          ? `Open the package folder to inspect the source. ${runCommand} is the most relevant package command right now.`
          : "Open the package folder to inspect the source, tests, and build configuration."
      };
    case "desktop-app":
      return {
        primaryAction: runCommand ? "run-desktop" : "open-folder",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: run the desktop project locally.",
        usageDetail: runCommand
          ? `Run ${runCommand} from ${workingDirectory ?? "the app folder"} to start the desktop app.${packageCommand ? ` Use ${packageCommand} there to build a Windows installer.` : ""}`
          : "Open the app folder to inspect and run the desktop project manually."
      };
    case "workspace-change":
      return {
        primaryAction: "inspect-workspace",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: inspect the changed workspace files.",
        usageDetail: workingDirectory
          ? `Open ${workingDirectory} to review the files changed by this task.`
          : "Open the relevant workspace folder to review the files changed by this task."
      };
    default:
      return {
        primaryAction: runCommand ? "run-command" : "open-folder",
        packageName,
        workingDirectory,
        runCommand,
        usageTitle: "Primary action: inspect the task output.",
        usageDetail: prompt.trim()
          ? "Open the target folder to inspect what the task produced."
          : "Inspect the output files and run the project locally if needed."
      };
  }
}
