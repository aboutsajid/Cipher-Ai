export function compactFailureMessage(message: string): string {
  const normalized = (message ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export function buildExhaustedModelRouteMessage(
  stageLabel: string,
  failures: Array<{ model: string; messages: string[] }>
): string {
  const detail = failures
    .filter((failure) => failure.messages.length > 0)
    .map((failure) => {
      const uniqueMessages = [...new Set(failure.messages.map((message) => compactFailureMessage(message)))];
      return `${failure.model} (${failure.messages.length} attempt${failure.messages.length === 1 ? "" : "s"}: ${uniqueMessages.join(" | ")})`;
    })
    .join("; ");

  return `${stageLabel} exhausted all configured model routes. Tried: ${detail || "no model routes"}.`;
}
