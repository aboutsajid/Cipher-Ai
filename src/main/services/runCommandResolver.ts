import type { AgentArtifactType } from "../../shared/types";

interface ScriptsLike {
  start?: string;
  dev?: string;
  build?: string;
  test?: string;
}

export function resolvePreferredRunCommand(artifactType: AgentArtifactType, scripts?: ScriptsLike): string | undefined {
  const commandFor = (scriptName: keyof ScriptsLike): string => scriptName === "start"
    ? "npm start"
    : `npm run ${scriptName}`;

  if (!scripts) return undefined;

  if (artifactType === "web-app") {
    if (scripts.dev) return commandFor("dev");
    if (scripts.start) return commandFor("start");
    return undefined;
  }

  if (artifactType === "api-service" || artifactType === "desktop-app" || artifactType === "script-tool") {
    if (scripts.start) return commandFor("start");
    if (scripts.dev) return commandFor("dev");
    return undefined;
  }

  if (artifactType === "library") {
    if (scripts.build) return commandFor("build");
    if (scripts.test) return commandFor("test");
    return undefined;
  }

  if (scripts.start) return commandFor("start");
  if (scripts.dev) return commandFor("dev");
  if (scripts.build) return commandFor("build");
  return undefined;
}
