type BuilderMode = "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;

export function detectBuilderMode(
  prompt: string,
  options: { looksLikeCrudAppPrompt: (normalizedPrompt: string) => boolean }
): BuilderMode {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const landingSignals = ["landing page", "website", "site", "homepage", "pricing page", "microsite", "showcase page", "marketing page"];
  const dashboardSignals = ["dashboard", "admin panel", "analytics", "wallboard", "kpi", "incident", "escalation"];
  if (["kanban", "task board"].some((term) => normalized.includes(term))) {
    return "kanban";
  }
  if (options.looksLikeCrudAppPrompt(normalized)) {
    return "crud";
  }
  if (["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term))) {
    return "notes";
  }
  if (landingSignals.some((term) => normalized.includes(term))) {
    return "landing";
  }
  if (dashboardSignals.some((term) => normalized.includes(term))) {
    return "dashboard";
  }
  return null;
}

export function isLockedBuilderMode(builderMode: BuilderMode): boolean {
  return builderMode === "crud" || builderMode === "landing" || builderMode === "dashboard" || builderMode === "kanban";
}
