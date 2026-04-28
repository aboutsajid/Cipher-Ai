export type WorkspaceKind = "static" | "react" | "generic";

export type RepositoryModuleFormat = "esm" | "commonjs" | "mixed" | "unknown";
export type RepositoryUiFramework = "react" | "nextjs" | "none" | "unknown";
export type RepositoryStyling = "css" | "tailwind" | "mixed" | "unknown";
export type RepositoryTesting = "vitest" | "jest" | "node:test" | "none" | "unknown";
export type RepositoryLinting = "eslint" | "biome" | "none" | "unknown";

export interface RepositoryConventionPackageManifest {
  type?: string;
  main?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string | undefined>;
}

function collectDependencyKeys(packageManifest: RepositoryConventionPackageManifest | null): Set<string> {
  return new Set([
    ...Object.keys(packageManifest?.dependencies ?? {}),
    ...Object.keys(packageManifest?.devDependencies ?? {})
  ].map((item) => item.toLowerCase()));
}

export function detectModuleFormat(
  packageManifest: RepositoryConventionPackageManifest | null
): RepositoryModuleFormat {
  const type = (packageManifest?.type ?? "").trim().toLowerCase();
  if (type === "module") return "esm";
  if (type === "commonjs") return "commonjs";
  const main = (packageManifest?.main ?? "").trim().toLowerCase();
  if (main.endsWith(".mjs")) return "esm";
  if (main.endsWith(".cjs")) return "commonjs";
  return "unknown";
}

export function detectUiFramework(
  packageManifest: RepositoryConventionPackageManifest | null,
  workspaceKind: WorkspaceKind
): RepositoryUiFramework {
  const deps = collectDependencyKeys(packageManifest);
  if (deps.has("next")) return "nextjs";
  if (deps.has("react") || deps.has("react-dom") || workspaceKind === "react") return "react";
  if (workspaceKind === "static") return "none";
  return "unknown";
}

export function detectStylingApproach(
  packageManifest: RepositoryConventionPackageManifest | null,
  workspaceKind: WorkspaceKind
): RepositoryStyling {
  const deps = collectDependencyKeys(packageManifest);
  const hasTailwind = deps.has("tailwindcss") || deps.has("@tailwindcss/vite");
  const hasCss = workspaceKind === "static" || deps.has("react") || deps.has("vite") || deps.has("next");
  if (hasTailwind && hasCss) return "mixed";
  if (hasTailwind) return "tailwind";
  if (hasCss) return "css";
  return "unknown";
}

export function detectTestingTool(
  packageManifest: RepositoryConventionPackageManifest | null
): RepositoryTesting {
  const deps = collectDependencyKeys(packageManifest);
  if (deps.has("vitest")) return "vitest";
  if (deps.has("jest")) return "jest";
  const scripts = Object.values(packageManifest?.scripts ?? {}).join(" ").toLowerCase();
  if (/\bnode\b.*--test|\bnode:test\b/.test(scripts)) return "node:test";
  return Object.keys(packageManifest?.scripts ?? {}).includes("test") ? "unknown" : "none";
}

export function detectLintingTool(
  packageManifest: RepositoryConventionPackageManifest | null
): RepositoryLinting {
  const deps = collectDependencyKeys(packageManifest);
  if (deps.has("eslint")) return "eslint";
  if (deps.has("@biomejs/biome")) return "biome";
  return Object.keys(packageManifest?.scripts ?? {}).includes("lint") ? "unknown" : "none";
}
