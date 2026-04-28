export function isBenignStartupWarning(line: string): boolean {
  return /unable to move the cache|unable to create cache|gpu cache creation failed|console-message' arguments are deprecated/i
    .test(line);
}

export function hasStartupFailureSignal(output: string): boolean {
  const normalized = (output ?? "").trim();
  if (!normalized) return false;
  const relevantLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isBenignStartupWarning(line));

  if (relevantLines.length === 0) return false;

  return relevantLines.some((line) => (
    /bootstrap failed|render-process-gone|\bunhandled\b|\buncaught\b|\bexception\b|\btypeerror\b|\breferenceerror\b|\bsyntaxerror\b|cannot find module|\beaddrinuse\b|failed:/i
      .test(line)
  ));
}
