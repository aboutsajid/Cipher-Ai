import type { AgentArtifactType } from "../../shared/types";

export function inferGeneratedGenericArtifactType(
  plan: { candidateFiles?: string[] } | null | undefined,
  current: Record<string, unknown>
): AgentArtifactType | null {
  const candidateFiles = Array.isArray(plan?.candidateFiles) ? plan.candidateFiles : [];
  const scripts = typeof current.scripts === "object" && current.scripts
    ? current.scripts as Record<string, unknown>
    : {};
  const startScript = typeof scripts.start === "string" ? scripts.start.trim().toLowerCase() : "";
  const hasServerCandidate = candidateFiles.some((path) => /\/src\/server\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")));
  const hasBin = typeof current.bin === "string"
    || (typeof current.bin === "object" && current.bin !== null && Object.keys(current.bin as Record<string, unknown>).length > 0)
    || candidateFiles.some((path) => /\/bin\/.+\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")));

  if (hasServerCandidate || /src\/server\.[cm]?[jt]s/.test(startScript)) {
    return "api-service";
  }
  if (hasBin || startScript.length > 0) {
    return "script-tool";
  }
  if (candidateFiles.some((path) => /\/src\/index\.[cm]?[jt]s$/i.test(path.replace(/\\/g, "/")))) {
    return "library";
  }
  return null;
}
