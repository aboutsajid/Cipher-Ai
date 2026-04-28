export function extractTaskOutputLogLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function appendTaskLogLine(
  taskLogs: Map<string, string[]>,
  taskId: string,
  line: string,
  maxLogLines: number,
  nowIso = new Date().toISOString()
): void {
  const logs = taskLogs.get(taskId) ?? [];
  logs.push(`[${nowIso}] ${line}`);
  if (logs.length > maxLogLines) logs.splice(0, logs.length - maxLogLines);
  taskLogs.set(taskId, logs);
}
