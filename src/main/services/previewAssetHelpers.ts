type JoinWorkspacePath = (workingDirectory: string, relativePath: string) => string;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeLocalHtmlScriptsForVite(content: string, expectedScripts: string[]): string | null {
  let updated = content;
  let changed = false;

  for (const scriptName of expectedScripts) {
    const pattern = new RegExp(
      `<script((?:(?!type=)[^>])*)\\s+src=(["'](?:\\./)?${escapeRegExp(scriptName)}["'])((?:(?!type=)[^>])*)></script>`,
      "gi"
    );
    updated = updated.replace(pattern, (_match, before, src, after) => {
      changed = true;
      return `<script${before} type="module" src=${src}${after}></script>`;
    });
  }

  return changed ? updated : null;
}

export function resolvePreviewAssetPath(
  previewRoot: string,
  ref: string,
  joinWorkspacePath: JoinWorkspacePath
): string | null {
  const cleaned = (ref ?? "").trim();
  if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("data:") || cleaned.startsWith("mailto:")) {
    return null;
  }

  const withoutQuery = cleaned.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery) return null;
  if (withoutQuery.startsWith("/")) {
    return joinWorkspacePath(previewRoot, withoutQuery.replace(/^\/+/, ""));
  }
  return joinWorkspacePath(previewRoot, withoutQuery);
}

export function isLikelyValidStylesheet(content: string): boolean {
  const normalized = (content ?? "").trim();
  if (normalized.length < 12) return false;
  const openBraces = (normalized.match(/\{/g) ?? []).length;
  const closeBraces = (normalized.match(/\}/g) ?? []).length;
  if (openBraces === 0 || closeBraces === 0 || openBraces !== closeBraces) return false;
  const hasSelector = /(^|}|,)\s*(?:[.#:]?[a-z][a-z0-9_-]*|\*|html|body)(?:[\s>+~:#.[\]-][^{}]*)?\s*\{/im.test(normalized);
  const hasDeclaration = /[a-z-]+\s*:\s*[^;{}]+;?/i.test(normalized);
  return hasSelector && hasDeclaration;
}
