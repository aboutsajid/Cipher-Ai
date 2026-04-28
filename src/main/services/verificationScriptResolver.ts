interface ScriptsLike {
  [key: string]: string | undefined;
  build?: string;
  start?: string;
}

export function extractScripts(pkg: { scripts?: Record<string, unknown> } | null): ScriptsLike {
  const rawScripts = typeof pkg?.scripts === "object" && pkg?.scripts
    ? pkg.scripts
    : {};
  const normalized: ScriptsLike = {};
  for (const [key, value] of Object.entries(rawScripts)) {
    if (typeof value === "string" && value.trim()) {
      normalized[key] = value.trim();
    }
  }
  return normalized;
}

export function resolveVerificationScripts(
  pkg: { scripts?: Record<string, unknown> } | null,
  workspaceKind: string
): ScriptsLike {
  const scripts = extractScripts(pkg);
  if (workspaceKind !== "static") return scripts;
  return {
    ...scripts,
    build: "python -c \"print('Static site ready')\"",
    start: "python -m http.server 4173"
  };
}
