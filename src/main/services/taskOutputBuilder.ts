import type { AgentArtifactType, AgentTaskOutput } from "../../shared/types";

type VerificationCheckLike = {
  label: string;
  status: "passed" | "failed" | "skipped";
  details: string;
};

function buildRunHandoff(runCommand?: string, workingDirectory?: string): string | undefined {
  if (!runCommand) return undefined;
  return workingDirectory ? `${runCommand} (from ${workingDirectory})` : runCommand;
}

function buildInstallerHandoff(
  artifactType: AgentArtifactType,
  hasPackagingScript: boolean,
  workingDirectory?: string
): string | undefined {
  if (artifactType !== "desktop-app") return undefined;
  if (!hasPackagingScript) return undefined;
  return workingDirectory ? `npm run package:win (from ${workingDirectory})` : "npm run package:win";
}

function buildKnownLimitations(checks: VerificationCheckLike[] | undefined): string[] {
  if (!checks || checks.length === 0) {
    return ["Verification details were not available."];
  }
  const failed = checks.filter((check) => check.status === "failed");
  const skipped = checks.filter((check) => check.status === "skipped");
  if (failed.length === 0 && skipped.length === 0) {
    return ["No known limitations reported by verification."];
  }

  return [
    ...failed.map((check) => `${check.label}: ${check.details || "failed"}`),
    ...skipped.map((check) => `${check.label}: ${check.details || "skipped"}`)
  ];
}

function buildNextFixes(
  checks: VerificationCheckLike[] | undefined,
  options: { artifactType: AgentArtifactType; hasPackagingScript: boolean }
): string[] {
  const fixes: string[] = [];
  for (const check of checks ?? []) {
    if (check.status === "passed") continue;
    const label = (check.label ?? "").toLowerCase();
    if (label.includes("packaging")) {
      fixes.push("Fix Windows packaging checks and rerun packaging verification.");
      continue;
    }
    if (label.includes("build")) {
      fixes.push("Fix build failures and rerun build verification.");
      continue;
    }
    if (label.includes("launch") || label.includes("runtime") || label.includes("smoke")) {
      fixes.push("Fix runtime startup and rerun runtime/smoke verification.");
      continue;
    }
    fixes.push(`Resolve ${check.label} and rerun verification.`);
  }
  if (options.artifactType === "desktop-app" && !options.hasPackagingScript) {
    fixes.push("Add a package:win script so Windows installer packaging can run.");
  }
  return [...new Set(fixes)];
}

export function buildTaskOutput(
  artifactType: AgentArtifactType,
  options: {
    packageName?: string;
    workingDirectory?: string;
    runCommand?: string;
    hasPreview?: boolean;
    hasPackagingScript?: boolean;
    verificationChecks?: VerificationCheckLike[];
    prompt?: string;
  }
): AgentTaskOutput {
  const hasPackagingScript = Boolean(options.hasPackagingScript);
  const packageCommand = hasPackagingScript ? "npm run package:win" : undefined;
  const hasPreview = artifactType === "web-app" && Boolean(options.hasPreview);
  const runCommand = options.runCommand;
  const workingDirectory = options.workingDirectory;
  const packageName = options.packageName;
  const prompt = options.prompt ?? "";
  const run = buildRunHandoff(runCommand, workingDirectory);
  const installer = buildInstallerHandoff(artifactType, hasPackagingScript, workingDirectory);
  const knownLimitations = buildKnownLimitations(options.verificationChecks);
  const nextFixes = buildNextFixes(options.verificationChecks, { artifactType, hasPackagingScript });

  switch (artifactType) {
    case "web-app":
      return {
        primaryAction: hasPreview ? "preview-web" : (runCommand ? "run-web-app" : "open-folder"),
        packageName,
        workingDirectory,
        runCommand,
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
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
        run,
        installer,
        knownLimitations,
        nextFixes,
        usageTitle: "Primary action: inspect the task output.",
        usageDetail: prompt.trim()
          ? "Open the target folder to inspect what the task produced."
          : "Inspect the output files and run the project locally if needed."
      };
  }
}
