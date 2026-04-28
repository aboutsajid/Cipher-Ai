function trimStringRecordValues(input: unknown): Record<string, string> {
  if (typeof input !== "object" || !input) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, (value as string).trim()])
  );
}

export function buildGeneratedStaticPackageManifest(
  packageName: string,
  current: Record<string, unknown>
): Record<string, unknown> {
  return {
    name: packageName,
    private: current.private ?? true,
    version: typeof current.version === "string" && current.version.trim() ? current.version : "0.1.0",
    scripts: {
      build: "python -c \"print('Static site ready')\"",
      start: "python -m http.server 4173"
    }
  };
}

export function buildGeneratedGenericPackageManifest(
  packageName: string,
  current: Record<string, unknown>,
  defaultScripts: Record<string, string>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    name: packageName,
    private: current.private ?? true,
    version: typeof current.version === "string" && current.version.trim() ? current.version : "0.1.0"
  };

  if (typeof current.type === "string" && current.type.trim()) {
    normalized.type = current.type.trim();
  }
  if (typeof current.main === "string" && current.main.trim()) {
    normalized.main = current.main.trim();
  }
  if (current.bin && (typeof current.bin === "string" || typeof current.bin === "object")) {
    normalized.bin = current.bin;
  }

  const scripts = trimStringRecordValues(current.scripts);
  if (Object.keys(defaultScripts).length > 0) {
    normalized.scripts = {
      ...scripts,
      build: defaultScripts.build,
      ...(typeof scripts.start === "string" && scripts.start.trim()
        ? { start: scripts.start.trim() }
        : typeof defaultScripts.start === "string"
          ? { start: defaultScripts.start }
          : {})
    };
  } else if (Object.keys(scripts).length > 0) {
    normalized.scripts = scripts;
  }

  const dependencies = trimStringRecordValues(current.dependencies);
  if (Object.keys(dependencies).length > 0) {
    normalized.dependencies = dependencies;
  }

  const devDependencies = trimStringRecordValues(current.devDependencies);
  if (Object.keys(devDependencies).length > 0) {
    normalized.devDependencies = devDependencies;
  }

  return normalized;
}
