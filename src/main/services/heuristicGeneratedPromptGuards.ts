type WorkspaceKind = "static" | "react" | "generic";
type BuilderMode = "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;
type ArtifactKind =
  | "web-app"
  | "desktop-app"
  | "api-service"
  | "script-tool"
  | "library"
  | "workspace-change"
  | "unknown"
  | null;

export function isSimpleNotesAppPrompt(
  prompt: string,
  plan: { builderMode: BuilderMode; workspaceKind: WorkspaceKind; workingDirectory: string }
): boolean {
  if (plan.builderMode !== "notes" || plan.workspaceKind !== "react") return false;
  const workingDirectory = (plan.workingDirectory ?? "").replace(/\\/g, "/");
  if (!workingDirectory.startsWith("generated-apps/")) return false;

  const normalized = (prompt ?? "").trim().toLowerCase();
  return /\b(notes?|journal|entries?)\b/.test(normalized)
    && /\b(add|create|edit|save|saved state|visible saved state)\b/.test(normalized);
}

export function isSimpleGeneratedPackagePrompt(
  prompt: string,
  plan: { workspaceKind: WorkspaceKind; workingDirectory: string },
  promptArtifact: ArtifactKind
): boolean {
  if (plan.workspaceKind !== "generic") return false;
  const workingDirectory = (plan.workingDirectory ?? "").replace(/\\/g, "/");
  if (!workingDirectory.startsWith("generated-apps/")) return false;

  const normalized = (prompt ?? "").trim().toLowerCase();
  if (promptArtifact === "api-service") {
    return /\bendpoints?\b/.test(normalized)
      && /\b(list|create|add|mark|assign|approve|pause|resume|ship|resolve|pack)\b/.test(normalized);
  }
  if (promptArtifact === "script-tool") {
    return /\b(command line|command-line|cli|tool)\b/.test(normalized)
      && /\b(reads?|parse|prints?|summary|grouped?|group|counts?|headers?|priority|json|csv|markdown|handoff|audit)\b/.test(normalized);
  }
  if (promptArtifact === "library") {
    return /\b(reusable|library|package|helpers?)\b/.test(normalized)
      && /\b(validation|validator|email|required|min[- ]?length|string guard|format|formatting|money|currency|refund|fees|tax|percent|percentage|compact counts?|compact numbers?|delta)\b/.test(normalized);
  }
  return false;
}
