export interface StructuredFixEdit {
  path: string;
  content: string;
}

export interface StructuredFixResponse {
  summary: string;
  edits: StructuredFixEdit[];
}

export interface ParsedStructuredFixResponse {
  fix?: StructuredFixResponse;
  extractedJson: string;
  issue?: "no-usable-edits" | "schema-mismatch";
}

export interface StructuredFixParseOptions {
  strictSchema?: boolean;
}

function isJsonLikeEditPath(path: string): boolean {
  const normalized = (path ?? "").trim().toLowerCase().replace(/\\/g, "/");
  return normalized.endsWith(".json")
    || normalized.endsWith(".jsonc")
    || normalized.endsWith(".webmanifest");
}

function normalizeStructuredEditContent(path: string, value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isJsonLikeEditPath(path)) return null;
  if (!value || typeof value !== "object") return null;
  try {
    const serialized = JSON.stringify(value, null, 2);
    return typeof serialized === "string" ? `${serialized}\n` : null;
  } catch {
    return null;
  }
}

function normalizeStructuredEditLines(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return value.join("\n");
}

function normalizeStructuredEdit(edit: unknown): StructuredFixEdit | null {
  if (!edit || typeof edit !== "object") return null;

  const candidate = edit as {
    path?: unknown;
    file?: unknown;
    target?: unknown;
    filename?: unknown;
    content?: unknown;
    text?: unknown;
    value?: unknown;
    contents?: unknown;
    lines?: unknown;
    contentLines?: unknown;
  };

  const rawPath = [candidate.path, candidate.file, candidate.target, candidate.filename]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!rawPath) return null;

  const path = rawPath.trim().replace(/\\/g, "/");
  if (!path) return null;
  const rawContent = [
    normalizeStructuredEditContent(path, candidate.content),
    normalizeStructuredEditContent(path, candidate.text),
    normalizeStructuredEditContent(path, candidate.value),
    normalizeStructuredEditContent(path, candidate.contents),
    normalizeStructuredEditLines(candidate.lines),
    normalizeStructuredEditLines(candidate.contentLines)
  ].find((value): value is string => typeof value === "string");
  if (rawContent === undefined) return null;

  return {
    path,
    content: rawContent
  };
}

function normalizeStructuredEdits(parsed: Partial<StructuredFixResponse>): StructuredFixEdit[] {
  const rawEdits = parsed.edits
    ?? (parsed as { files?: unknown }).files
    ?? (parsed as { changes?: unknown }).changes;

  if (Array.isArray(rawEdits)) {
    return rawEdits
      .map((edit) => normalizeStructuredEdit(edit))
      .filter((edit): edit is StructuredFixEdit => Boolean(edit));
  }

  if (rawEdits && typeof rawEdits === "object") {
    return Object.entries(rawEdits)
      .map(([path, content]) => normalizeStructuredEdit({ path, content }))
      .filter((edit): edit is StructuredFixEdit => Boolean(edit));
  }

  return [];
}

function normalizeStrictStructuredEdits(parsed: Partial<StructuredFixResponse>): StructuredFixEdit[] {
  if (!Array.isArray(parsed.edits)) return [];
  return parsed.edits
    .map((edit) => {
      if (!edit || typeof edit !== "object") return null;
      const candidate = edit as { path?: unknown; content?: unknown };
      if (typeof candidate.path !== "string") return null;
      const path = candidate.path.trim().replace(/\\/g, "/");
      if (!path) return null;
      const content = normalizeStructuredEditContent(path, candidate.content);
      if (content === null) return null;
      return {
        path,
        content
      } satisfies StructuredFixEdit;
    })
    .filter((edit): edit is StructuredFixEdit => Boolean(edit));
}

function matchesStrictFixResponseSchema(parsed: Partial<StructuredFixResponse>): boolean {
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.edits)) {
    return false;
  }

  return parsed.edits.every((edit) => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) return false;
    const record = edit as unknown as Record<string, unknown>;
    const keys = Object.keys(record);
    const path = typeof record.path === "string" ? record.path.trim().replace(/\\/g, "/") : "";
    return keys.length === 2
      && keys.includes("path")
      && keys.includes("content")
      && Boolean(path)
      && normalizeStructuredEditContent(path, record.content) !== null;
  });
}

function matchesNestedStrictFixResponseSchema(parsed: Partial<StructuredFixResponse>): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.length > 2) return false;
  if (!keys.includes("edits")) return false;
  if (keys.some((key) => key !== "summary" && key !== "edits")) return false;
  if ("summary" in record && typeof record.summary !== "string") return false;
  return Array.isArray(record.edits) && normalizeStrictStructuredEdits(parsed).length > 0;
}

function extractStrictFixResponse(parsed: Partial<StructuredFixResponse>): StructuredFixResponse | null {
  if (matchesStrictFixResponseSchema(parsed)) {
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      edits: normalizeStrictStructuredEdits(parsed)
    };
  }

  const fallbackSummary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const nestedCandidates = [
    typeof (parsed as { fix?: unknown }).fix === "object" ? (parsed as { fix?: Partial<StructuredFixResponse> }).fix : null,
    typeof (parsed as { result?: unknown }).result === "object" ? (parsed as { result?: Partial<StructuredFixResponse> }).result : null,
    typeof (parsed as { response?: unknown }).response === "object" ? (parsed as { response?: Partial<StructuredFixResponse> }).response : null,
    typeof (parsed as { data?: unknown }).data === "object" ? (parsed as { data?: Partial<StructuredFixResponse> }).data : null,
    typeof (parsed as { payload?: unknown }).payload === "object" ? (parsed as { payload?: Partial<StructuredFixResponse> }).payload : null,
    typeof parsed.summary === "object" && parsed.summary ? parsed.summary as Partial<StructuredFixResponse> : null
  ].filter((candidate): candidate is Partial<StructuredFixResponse> => Boolean(candidate));

  for (const candidate of nestedCandidates) {
    if (!matchesNestedStrictFixResponseSchema(candidate)) continue;
    const edits = normalizeStrictStructuredEdits(candidate);
    if (edits.length === 0) continue;
    return {
      summary: typeof candidate.summary === "string" ? candidate.summary.trim() : (fallbackSummary || "Recovered strict structured edits."),
      edits
    };
  }

  return null;
}

function parseLooseFixResponse(jsonText: string): Partial<StructuredFixResponse> | null {
  const candidates = [
    jsonText,
    normalizeLooseJson(jsonText)
  ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Partial<StructuredFixResponse>;
    } catch {
      // try next candidate
    }
  }

  return null;
}

function extractLikelyJson(raw: string, options: StructuredFixParseOptions = {}): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (options.strictSchema) {
    return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : null;
  }

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedMatches) {
    const candidate = match[1]?.trim() ?? "";
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = firstBrace; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
}

export function normalizeLooseJson(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function tryParseStructuredFixResponse(
  raw: string,
  responseLabel = "Fix",
  options: StructuredFixParseOptions = {}
): ParsedStructuredFixResponse | null {
  const normalized = (raw ?? "").trim();
  if (!normalized) {
    throw new Error(`${responseLabel} model returned an empty response.`);
  }

  if (options.strictSchema && !(normalized.startsWith("{") && normalized.endsWith("}"))) {
    const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fencedMatch) {
      const fencedJson = fencedMatch[1]?.trim() ?? "";
      if (fencedJson.startsWith("{") && fencedJson.endsWith("}")) {
        const parsed = parseLooseFixResponse(fencedJson);
        if (!parsed) {
          return null;
        }
        const strictFix = extractStrictFixResponse(parsed);
        if (!strictFix) {
          return {
            extractedJson: fencedJson,
            issue: "schema-mismatch"
          };
        }
        if (strictFix.edits.length === 0) {
          return {
            extractedJson: fencedJson,
            issue: "no-usable-edits"
          };
        }
        return {
          fix: strictFix,
          extractedJson: fencedJson
        };
      }
    }
    if (normalized.includes("{") || normalized.includes("```")) {
      return {
        extractedJson: normalized,
        issue: "schema-mismatch"
      };
    }
    return null;
  }

  const jsonText = extractLikelyJson(normalized, options);
  if (!jsonText) {
    return null;
  }

  const parsed = parseLooseFixResponse(jsonText);
  if (!parsed) {
    return null;
  }
  const strictFix = options.strictSchema ? extractStrictFixResponse(parsed) : null;
  const edits = options.strictSchema
    ? (strictFix?.edits ?? [])
    : normalizeStructuredEdits(parsed);

  if (options.strictSchema && !strictFix) {
    return {
      extractedJson: jsonText,
      issue: "schema-mismatch"
    };
  }

  if (edits.length === 0) {
    return {
      extractedJson: jsonText,
      issue: "no-usable-edits"
    };
  }

  return {
    fix: {
      summary: strictFix?.summary ?? (typeof parsed.summary === "string" ? parsed.summary.trim() : ""),
      edits
    },
    extractedJson: jsonText
  };
}
