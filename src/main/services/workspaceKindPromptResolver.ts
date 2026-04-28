import type { AgentArtifactType } from "../../shared/types";

type WorkspaceKind = "static" | "react" | "generic";

export function resolveWorkspaceKindForPrompt(
  prompt: string,
  detectedKind: WorkspaceKind,
  requestedPaths: string[],
  options: {
    inferArtifactTypeFromPrompt: (normalizedPrompt: string) => AgentArtifactType | null;
  }
): WorkspaceKind {
  const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
  const promptArtifact = options.inferArtifactTypeFromPrompt(normalizedPrompt);
  const requestedNames = new Set(
    requestedPaths
      .map((path) => path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "")
      .filter(Boolean)
  );
  const requestsDesktopFiles = requestedNames.has("main.js")
    || requestedNames.has("preload.js")
    || requestedNames.has("renderer.js");

  if (
    promptArtifact === "desktop-app"
    || requestsDesktopFiles
    || /\b(electron|desktop app|desktop application)\b/.test(normalizedPrompt)
  ) {
    return "react";
  }

  const requestsStaticFiles = requestedNames.has("index.html")
    && (requestedNames.has("styles.css") || requestedNames.has("app.js"));
  if (
    requestsStaticFiles
    || /\bstatic (?:site|page|demo|landing page|website)\b/.test(normalizedPrompt)
    || /\bpricing page\b/.test(normalizedPrompt)
    || /\bmicrosite\b/.test(normalizedPrompt)
    || /\bshowcase page\b/.test(normalizedPrompt)
    || /\bmarketing page\b/.test(normalizedPrompt)
    || /\bhtml\s+css\b/.test(normalizedPrompt)
    || /\bvanilla (?:js|javascript)\b/.test(normalizedPrompt)
  ) {
    return "static";
  }

  const requestsReactFiles = requestedNames.has("src/main.tsx")
    || requestedNames.has("main.tsx")
    || requestedNames.has("src/app.tsx")
    || requestedNames.has("app.tsx");
  if (
    requestsReactFiles
    || /\breact app|vite app|kanban|task board\b/.test(normalizedPrompt)
    || /\breact\b/.test(normalizedPrompt)
    || /\btsx\b/.test(normalizedPrompt)
  ) {
    return "react";
  }

  return detectedKind;
}
