const PROMPT_TERM_STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "then", "build", "fix", "current", "workspace", "apply",
  "minimal", "safe", "changes", "confirm", "result", "verify", "launch", "cleanly", "app"
]);

export function extractPromptTerms(prompt: string): string[] {
  return (prompt.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [])
    .filter((term) => !PROMPT_TERM_STOP_WORDS.has(term))
    .filter((term, index, arr) => arr.indexOf(term) === index)
    .slice(0, 10);
}

export function extractProjectName(prompt: string): string {
  const namedMatch = /(?:called|named)\s+["']?([a-z0-9][a-z0-9 -]{1,40})["']?/i.exec(prompt);
  const rawName = namedMatch?.[1] ?? extractPromptTerms(prompt).slice(0, 3).join("-");
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return slug || "agent-app";
}

export function toDisplayLabel(value: string, fallback = "Generated App"): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return fallback;

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toDisplayNameFromDirectory(workingDirectory: string, fallback = "Focus Notes"): string {
  const source = workingDirectory.split("/").filter(Boolean).pop() ?? fallback;
  return toDisplayLabel(source, fallback);
}
