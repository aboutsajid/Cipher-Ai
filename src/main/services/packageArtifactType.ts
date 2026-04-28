interface PackageManifestLike {
  name?: string;
  description?: string;
  main?: string;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string | undefined>;
}

export function inferArtifactTypeFromPackage(
  packageManifest?: PackageManifestLike | null
): "desktop-app" | "web-app" | "api-service" | "script-tool" | "library" | null {
  if (!packageManifest) return null;

  const dependencyNames = [
    ...Object.keys(packageManifest.dependencies ?? {}),
    ...Object.keys(packageManifest.devDependencies ?? {})
  ].map((name) => name.toLowerCase());
  const depSet = new Set(dependencyNames);
  const nameAndDescription = [
    packageManifest.name ?? "",
    packageManifest.description ?? "",
    packageManifest.main ?? ""
  ].join(" ").toLowerCase();
  const scriptValues = Object.values(packageManifest.scripts ?? {}).join(" ").toLowerCase();
  const hasDependency = (pattern: RegExp): boolean => dependencyNames.some((name) => pattern.test(name));

  if (
    depSet.has("electron") ||
    depSet.has("electron-builder") ||
    depSet.has("tauri") ||
    hasDependency(/^@tauri-apps\//) ||
    /\b(electron|desktop|tauri)\b/.test(nameAndDescription) ||
    /launch-electron|electron-builder/.test(scriptValues)
  ) {
    return "desktop-app";
  }

  if (
    hasDependency(/^(express|fastify|hono|koa|ws)$/) ||
    hasDependency(/^@nestjs\//) ||
    hasDependency(/graphql|apollo-server|trpc|serverless|supabase/) ||
    /\b(api|backend|server|service)\b/.test(nameAndDescription)
  ) {
    return "api-service";
  }

  if (packageManifest.bin || /\b(cli|command line|automation tool)\b/.test(nameAndDescription)) {
    return "script-tool";
  }

  if (!packageManifest.scripts?.start && !packageManifest.scripts?.dev && (packageManifest.scripts?.build || packageManifest.scripts?.test)) {
    return "library";
  }

  if (
    hasDependency(/^(react|react-dom|next|vite|vue|svelte|astro)$/) ||
    hasDependency(/^@vitejs\//)
  ) {
    return "web-app";
  }

  return null;
}
