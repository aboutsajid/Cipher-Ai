type WorkspaceKind = "static" | "react" | "generic";
type RuntimeScript = "start" | "dev";

export interface ResolveServedWebPageUrlInput {
  workspaceKind: WorkspaceKind;
  runtimeScript: RuntimeScript;
  startScript?: string;
  devScript?: string;
  combinedOutput: string;
}

export function resolveServedWebPageUrl(input: ResolveServedWebPageUrlInput): string | null {
  const {
    workspaceKind,
    runtimeScript,
    startScript,
    devScript,
    combinedOutput
  } = input;

  const urlMatches = [...combinedOutput.matchAll(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s]*)?/gi)];
  if (urlMatches.length > 0) {
    return urlMatches[0]?.[0] ?? null;
  }

  const scriptValue = runtimeScript === "start" ? startScript : devScript;
  if (workspaceKind === "static" && /http\.server\s+4173/.test(scriptValue ?? "")) {
    return "http://127.0.0.1:4173/";
  }
  if (workspaceKind === "react" && /\bvite\b/.test(scriptValue ?? "")) {
    return "http://127.0.0.1:5173/";
  }
  return null;
}
