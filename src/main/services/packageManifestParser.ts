export function parseLoosePackageManifest(
  raw: string,
  normalizeLooseJson: (value: string) => string
): unknown | null {
  const normalized = normalizeLooseJson(raw);
  const candidates = [
    raw,
    normalized,
    normalized.replace(/\\'/g, "'")
  ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
}
