import type { AgentArtifactType } from "../../shared/types";
import type { BuilderMode, DomainFocus, StarterProfile, WorkspaceKind } from "./starterDomainFocusHeuristics";

export interface TaskExecutionSpecScriptGroup {
  label: string;
  options: string[];
}

export function buildSpecRequiredFiles(
  workingDirectory: string,
  workspaceKind: WorkspaceKind,
  starterProfile: StarterProfile,
  expectsReadme: boolean,
  requestedPaths: string[],
  options: {
    isPathInsideWorkingDirectory: (path: string, workingDirectory: string) => boolean;
    joinWorkspacePath: (...parts: string[]) => string;
  }
): string[] {
  const required = new Set<string>();
  const add = (path: string): void => {
    if (options.isPathInsideWorkingDirectory(path, workingDirectory)) {
      required.add(path);
    }
  };

  if (workspaceKind === "static") {
    add(options.joinWorkspacePath(workingDirectory, "index.html"));
    add(options.joinWorkspacePath(workingDirectory, "styles.css"));
    add(options.joinWorkspacePath(workingDirectory, "app.js"));
  } else if (workspaceKind === "react") {
    add(options.joinWorkspacePath(workingDirectory, "package.json"));
    add(options.joinWorkspacePath(workingDirectory, "index.html"));
    add(options.joinWorkspacePath(workingDirectory, "src/main.tsx"));
    add(options.joinWorkspacePath(workingDirectory, "src/App.tsx"));
  } else if (starterProfile !== "workspace-change") {
    add(options.joinWorkspacePath(workingDirectory, "package.json"));
  }

  if (starterProfile === "electron-desktop") {
    add(options.joinWorkspacePath(workingDirectory, "electron/main.mjs"));
    add(options.joinWorkspacePath(workingDirectory, "electron/preload.mjs"));
    add(options.joinWorkspacePath(workingDirectory, "scripts/desktop-launch.mjs"));
  }
  if (starterProfile === "node-api-service") {
    add(options.joinWorkspacePath(workingDirectory, "src/server.js"));
  }
  if (starterProfile === "node-cli" || starterProfile === "node-library") {
    add(options.joinWorkspacePath(workingDirectory, "src/index.js"));
  }
  if (expectsReadme) {
    add(options.joinWorkspacePath(workingDirectory, "README.md"));
  }
  for (const path of requestedPaths) {
    add(path);
  }
  return [...required];
}

export function buildSpecRequiredScriptGroups(
  starterProfile: StarterProfile,
  workspaceKind: WorkspaceKind
): TaskExecutionSpecScriptGroup[] {
  if (workspaceKind === "static") {
    return [
      { label: "build", options: ["build"] },
      { label: "serve", options: ["start"] }
    ];
  }
  if (starterProfile === "workspace-change") return [];
  if (starterProfile === "node-library") {
    return [{ label: "build", options: ["build"] }];
  }
  if (starterProfile === "electron-desktop") {
    return [
      { label: "build", options: ["build"] },
      { label: "run", options: ["start"] },
      { label: "package", options: ["package:win"] }
    ];
  }
  return [
    { label: "build", options: ["build"] },
    { label: "run", options: ["start", "dev"] }
  ];
}

export function buildSpecDeliverables(
  starterProfile: StarterProfile,
  workspaceKind: WorkspaceKind,
  expectsReadme: boolean
): string[] {
  const deliverables = new Set<string>();
  if (workspaceKind === "static") {
    deliverables.add("Browser entry page");
    deliverables.add("Stylesheet");
    deliverables.add("Client-side interaction script");
  }
  if (workspaceKind === "react") {
    deliverables.add("React application shell");
    deliverables.add("Typed entrypoint and UI component");
  }
  if (starterProfile === "electron-desktop") {
    deliverables.add("Desktop main process and launch script");
    deliverables.add("Installer-ready package configuration");
  } else if (starterProfile === "node-api-service") {
    deliverables.add("HTTP service entrypoint");
    deliverables.add("Runnable package manifest");
  } else if (starterProfile === "node-cli") {
    deliverables.add("Runnable CLI entrypoint");
    deliverables.add("Runnable package manifest");
  } else if (starterProfile === "node-library") {
    deliverables.add("Library entrypoint");
    deliverables.add("Buildable package manifest");
  }
  if (expectsReadme) {
    deliverables.add("Project README");
  }
  if (deliverables.size === 0) {
    deliverables.add("Scoped workspace changes");
  }
  return [...deliverables];
}

export function buildSpecAcceptanceCriteria(
  starterProfile: StarterProfile,
  builderMode: BuilderMode,
  promptArtifact: AgentArtifactType | null,
  domainFocus: DomainFocus
): string[] {
  const criteria: string[] = [];
  if (starterProfile === "static-marketing") {
    criteria.push("The page has complete sections and a visible call to action.");
    criteria.push("The generated page remains responsive without depending on external assets.");
  }
  if (builderMode === "dashboard") {
    criteria.push("The UI shows metrics, recent activity, and a scan-friendly summary view.");
  }
  if (builderMode === "crud" || builderMode === "notes" || builderMode === "kanban") {
    criteria.push("Users can create and update visible records without placeholder-only UI.");
    criteria.push("State changes are reflected in the rendered collection view.");
  }
  if (starterProfile === "electron-desktop") {
    criteria.push("The desktop project boots locally and is suitable for Windows packaging.");
  }
  if (promptArtifact === "web-app" || promptArtifact === "desktop-app") {
    criteria.push("The app implements the prompt's primary user workflow instead of a generic starter shell.");
  }
  if (starterProfile === "node-api-service") {
    criteria.push("The service boots cleanly and responds from a server entrypoint.");
  }
  if (starterProfile === "node-cli") {
    criteria.push("The CLI runs from the package scripts without extra manual wiring.");
  }
  if (starterProfile === "node-library") {
    criteria.push("The package exposes a usable library entrypoint.");
  }
  if (domainFocus === "crm") {
    criteria.push("The starter reflects customer, pipeline, or account management language instead of generic filler.");
  }
  if (domainFocus === "inventory") {
    criteria.push("The starter reflects stock, supplier, or item management workflows instead of generic filler.");
  }
  if (domainFocus === "scheduling") {
    criteria.push("The starter reflects appointments, calendars, or dispatch workflows instead of generic filler.");
  }
  if (domainFocus === "finance") {
    criteria.push("The starter reflects budgets, invoices, revenue, or payment workflows instead of generic filler.");
  }
  if (domainFocus === "operations") {
    criteria.push("The starter reflects incidents, service health, or operational queue workflows instead of generic filler.");
  }
  if (domainFocus === "admin") {
    criteria.push("The starter reflects approvals, moderation, or internal admin workflows instead of generic filler.");
  }
  if (promptArtifact === "web-app" && criteria.length === 0) {
    criteria.push("The app presents a coherent user-facing experience instead of starter filler.");
  }
  if (criteria.length === 0) {
    criteria.push("The requested changes are implemented inside the scoped workspace.");
  }
  return criteria;
}

export function buildSpecQualityGates(
  starterProfile: StarterProfile,
  workspaceKind: WorkspaceKind,
  expectsReadme: boolean
): string[] {
  const gates = [
    "Required entry files exist in the target workspace.",
    "Package manifest and scripts are internally consistent for the project type."
  ];
  if (workspaceKind === "react" || workspaceKind === "static") {
    gates.push("The UI includes a real bootstrap flow instead of disconnected assets.");
    gates.push("Starter shells and placeholder-only labels are removed from the shipped UI.");
  }
  if (starterProfile === "electron-desktop") {
    gates.push("Desktop packaging remains available for generated Windows apps.");
  }
  if (expectsReadme) {
    gates.push("The project includes a README with run instructions.");
  }
  return gates;
}
