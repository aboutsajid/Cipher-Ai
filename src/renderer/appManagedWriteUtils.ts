function getEditableSourcePaths(items: AttachmentPayload[]): string[] {
  return items
    .filter((attachment) => attachment.type === "text")
    .map((attachment) => (attachment.sourcePath ?? "").trim())
    .filter(Boolean);
}

function getWritableRootPaths(items: AttachmentPayload[]): string[] {
  return items
    .map((attachment) => (attachment.writableRoot ?? "").trim())
    .filter(Boolean);
}

function getClaudeManagedEditPermissions(
  items: AttachmentPayload[],
): ClaudeManagedEditPermissions {
  const allowedPaths = getEditableSourcePaths(items);
  const allowedRoots = getWritableRootPaths(items);

  return { allowedPaths, allowedRoots };
}

function buildClaudeManagedEditBaselines(items: AttachmentPayload[]): ClaudeManagedEditBaseline[] {
  return items
    .filter((attachment) => attachment.type === "text")
    .map((attachment) => {
      const path = (attachment.sourcePath ?? "").trim();
      return path ? { path, content: attachment.content ?? "" } : null;
    })
    .filter((item): item is ClaudeManagedEditBaseline => Boolean(item));
}

function hasManagedSaveTargets(items: AttachmentPayload[]): boolean {
  const permissions = getClaudeManagedEditPermissions(items);
  return permissions.allowedPaths.length > 0 || permissions.allowedRoots.length > 0;
}

function hasFilesystemToolConfigured(): boolean {
  return mcpStatus.servers.some((server) => {
    const haystack = `${server.name} ${server.tools.join(" ")}`.toLowerCase();
    return server.running && (haystack.includes("file") || haystack.includes("filesystem") || haystack.includes("fs"));
  });
}

function hasFilesystemToolEnabled(): boolean {
  if (enabledMcpTools.size === 0) return false;
  return [...enabledMcpTools].some((tool) => {
    const normalized = tool.toLowerCase();
    return normalized.includes("file") || normalized.includes("filesystem") || normalized.includes("fs");
  });
}
