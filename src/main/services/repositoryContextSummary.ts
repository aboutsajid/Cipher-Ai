export type RepositoryWorkspaceShape = "single-package" | "monorepo" | "static-site" | "unknown";
export type RepositoryPackageManager = "npm" | "pnpm" | "yarn" | "unknown";
export type RepositoryLanguageStyle = "typescript" | "javascript" | "mixed" | "unknown";
export type RepositoryModuleFormat = "esm" | "commonjs" | "mixed" | "unknown";
export type RepositoryUiFramework = "react" | "nextjs" | "none" | "unknown";
export type RepositoryStyling = "css" | "tailwind" | "mixed" | "unknown";
export type RepositoryTesting = "vitest" | "jest" | "node:test" | "none" | "unknown";
export type RepositoryLinting = "eslint" | "biome" | "none" | "unknown";

export interface RepositoryContextSignals {
  workspaceShape: RepositoryWorkspaceShape;
  packageManager: RepositoryPackageManager;
  languageStyle: RepositoryLanguageStyle;
  moduleFormat: RepositoryModuleFormat;
  uiFramework: RepositoryUiFramework;
  styling: RepositoryStyling;
  testing: RepositoryTesting;
  linting: RepositoryLinting;
}

export interface RepositoryContextSummary extends RepositoryContextSignals {
  summary: string;
  conventions: string[];
}

export function buildRepositoryContextSummary(signals: RepositoryContextSignals): RepositoryContextSummary {
  const conventions = [
    signals.packageManager !== "unknown" ? `Use ${signals.packageManager} commands and lockfile conventions.` : "",
    signals.languageStyle === "typescript" ? "Prefer TypeScript files and typed interfaces." : "",
    signals.languageStyle === "javascript" ? "Prefer JavaScript files unless the repo already mixes TS." : "",
    signals.moduleFormat === "esm" ? "Keep Node-facing code in ESM format unless a file already uses CommonJS." : "",
    signals.moduleFormat === "commonjs" ? "Keep Node-facing code in CommonJS unless there is a strong reason to migrate." : "",
    signals.uiFramework === "react" ? "Preserve the existing React app structure and entrypoint style." : "",
    signals.uiFramework === "nextjs" ? "Preserve Next.js app conventions instead of adding parallel entrypoints." : "",
    signals.styling === "tailwind" ? "Prefer existing utility-class styling over introducing parallel CSS systems." : "",
    signals.styling === "css" ? "Prefer the existing CSS file approach over introducing a new styling stack." : "",
    signals.testing !== "none" && signals.testing !== "unknown" ? `Keep ${signals.testing} as the primary test style.` : "",
    signals.linting !== "none" && signals.linting !== "unknown" ? `Keep ${signals.linting} as the linting convention.` : "",
    signals.workspaceShape === "monorepo" ? "Respect the current multi-package workspace layout and avoid flattening packages." : ""
  ].filter(Boolean);

  const summaryParts = [
    signals.workspaceShape !== "unknown" ? signals.workspaceShape.replace(/-/g, " ") : "",
    signals.packageManager !== "unknown" ? signals.packageManager : "",
    signals.languageStyle !== "unknown" ? signals.languageStyle : "",
    signals.uiFramework !== "unknown" && signals.uiFramework !== "none" ? signals.uiFramework : "",
    signals.styling !== "unknown" ? signals.styling : "",
    signals.testing !== "unknown" && signals.testing !== "none" ? `tests: ${signals.testing}` : "",
    signals.linting !== "unknown" && signals.linting !== "none" ? `lint: ${signals.linting}` : ""
  ].filter(Boolean);

  return {
    summary: summaryParts.length > 0 ? `Repo conventions: ${summaryParts.join(", ")}.` : "Repo conventions are mostly unknown; prefer the current file layout.",
    workspaceShape: signals.workspaceShape,
    packageManager: signals.packageManager,
    languageStyle: signals.languageStyle,
    moduleFormat: signals.moduleFormat,
    uiFramework: signals.uiFramework,
    styling: signals.styling,
    testing: signals.testing,
    linting: signals.linting,
    conventions
  };
}
