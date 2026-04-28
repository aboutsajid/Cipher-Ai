export type HeuristicWorkspaceKind = "static" | "react" | "generic";

export function isDesktopBusinessReportingPrompt(normalizedPrompt: string): boolean {
  const hasEntrySignals = /\b(daily entries?|daily records?|daily entry form|saved records?)\b/.test(normalizedPrompt);
  const hasBusinessContext = /\b(shop|store|retail|sales|performance|summary views?|reports?|record software)\b/.test(normalizedPrompt);
  const periods = ["daily", "weekly", "monthly", "quarterly", "yearly"].filter((term) => normalizedPrompt.includes(term));
  return hasEntrySignals && hasBusinessContext && periods.length >= 4;
}

export function isSimpleDesktopUtilityPrompt(normalizedPrompt: string): boolean {
  const isFileRenamer = (
    /\b(file renamer|rename files?|rename action)\b/.test(normalizedPrompt)
    || (/\brename\b/.test(normalizedPrompt) && /\bfiles?\b/.test(normalizedPrompt))
  ) && /\b(folder picker|preview list|replace-text|replace text|filename preview)\b/.test(normalizedPrompt);

  const isPdfCombiner = /\bpdf\b/.test(normalizedPrompt)
    && /\b(combiner|merge|merge button|move-up|move-down|output path)\b/.test(normalizedPrompt);

  return isFileRenamer || isPdfCombiner;
}

export function isSimpleDesktopShellPrompt(prompt: string, workspaceKind: HeuristicWorkspaceKind): boolean {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (workspaceKind !== "react") return false;
  if (!/\b(electron|desktop|tauri)\b/.test(normalized)) return false;
  if (isDesktopBusinessReportingPrompt(normalized)) return true;
  if (isSimpleDesktopUtilityPrompt(normalized)) return true;
  if (/\bsnippet\b/.test(normalized)) return true;
  if ((/\bvoice\b/.test(normalized) || /\brecording\b/.test(normalized)) && /\b(start recording|recording list|sidebar)\b/.test(normalized)) {
    return true;
  }
  return false;
}
