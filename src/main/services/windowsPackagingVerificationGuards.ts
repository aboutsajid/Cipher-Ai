type ArtifactKind =
  | "web-app"
  | "desktop-app"
  | "api-service"
  | "script-tool"
  | "library"
  | "workspace-change"
  | "unknown"
  | null
  | undefined;

export function getPackagingVerificationLabel(artifactType: ArtifactKind): string {
  switch (artifactType) {
    case "desktop-app":
      return "Windows packaging";
    default:
      return "Packaging";
  }
}

export function shouldVerifyWindowsPackaging(
  artifactType: ArtifactKind,
  workingDirectory: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const normalizedWorkingDirectory = (workingDirectory ?? ".").replace(/\\/g, "/");
  return artifactType === "desktop-app"
    && platform === "win32"
    && normalizedWorkingDirectory.startsWith("generated-apps/");
}
