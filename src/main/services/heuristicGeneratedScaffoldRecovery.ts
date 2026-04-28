import { joinWorkspacePath } from "./heuristicWorkspacePathHelpers";

type WorkspaceKind = "static" | "react" | "generic";
type BuilderMode = "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;

export function isBuilderRecoveryPrimaryPlan(builderMode: BuilderMode): boolean {
  return builderMode === "crud" || builderMode === "dashboard" || builderMode === "landing" || builderMode === "kanban";
}

export function getConflictingScaffoldPaths(plan: { workingDirectory: string; workspaceKind: WorkspaceKind }): string[] {
  const workingDirectory = (plan.workingDirectory ?? ".").replace(/\\/g, "/");
  if (plan.workspaceKind === "static") {
    return [
      joinWorkspacePath(workingDirectory, "src/main.tsx"),
      joinWorkspacePath(workingDirectory, "src/App.tsx"),
      joinWorkspacePath(workingDirectory, "src/App.css"),
      joinWorkspacePath(workingDirectory, "src/index.css"),
      joinWorkspacePath(workingDirectory, "vite.config.ts"),
      joinWorkspacePath(workingDirectory, "eslint.config.js"),
      joinWorkspacePath(workingDirectory, "tsconfig.json"),
      joinWorkspacePath(workingDirectory, "tsconfig.app.json"),
      joinWorkspacePath(workingDirectory, "tsconfig.node.json")
    ];
  }

  if (plan.workspaceKind === "react") {
    return [
      joinWorkspacePath(workingDirectory, "styles.css"),
      joinWorkspacePath(workingDirectory, "app.js")
    ];
  }

  return [];
}

export function isUnexpectedGeneratedAppFile(path: string, workingDirectory: string, allowed: Set<string>): boolean {
  if (allowed.has(path)) return false;

  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith(`${workingDirectory}/`)) return false;
  if (
    normalized === `${workingDirectory}/vite.config.ts` ||
    normalized === `${workingDirectory}/eslint.config.js` ||
    normalized === `${workingDirectory}/tsconfig.json` ||
    normalized === `${workingDirectory}/tsconfig.app.json` ||
    normalized === `${workingDirectory}/tsconfig.node.json`
  ) return false;

  if (/\/node_modules\//i.test(normalized) || /\/dist\//i.test(normalized) || /\/public\//i.test(normalized)) return false;
  if (/\/src\/assets\//i.test(normalized)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|lock|md|json)$/i.test(normalized)) return false;

  return (
    /\.(ts|tsx|js|jsx|css|scss|html)$/i.test(normalized) &&
    (
      normalized.startsWith(`${workingDirectory}/src/`) ||
      /^[^/]+\.(ts|tsx|js|jsx)$/i.test(normalized.slice(workingDirectory.length + 1))
    )
  );
}
