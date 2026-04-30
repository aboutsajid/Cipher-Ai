function compactAgentProviderFailureMessage(message: string): string {
  const normalized = (message ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "unknown failure";
  if (/overloaded/i.test(normalized)) return "provider overloaded";
  if (/rate limit|api error 429/i.test(normalized)) return "rate limited";
  if (/timed out|timeout|aborted due to timeout|operation was aborted/i.test(normalized)) return "timed out";
  if (/insufficient .*credits|budget|api error 402/i.test(normalized)) return "insufficient credits";
  if (/malformed json/i.test(normalized)) return "malformed JSON";
  if (/empty response/i.test(normalized)) return "empty response";
  if (/api error (\d{3})/i.test(normalized)) {
    const code = normalized.match(/api error (\d{3})/i)?.[1] ?? "";
    return code ? `API ${code}` : normalized;
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function parseExhaustedAgentModelRoutes(summary: string): { stage: string; routes: Array<{ model: string; reason: string }> } | null {
  const normalized = (summary ?? "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.+?) exhausted all configured model routes\. Tried:\s*(.+?)\.?$/i);
  if (!match) return null;

  const stage = (match[1] ?? "Agent request").trim();
  const detail = (match[2] ?? "").trim();
  const routes = detail
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => {
      const routeMatch = part.match(/^(.+?) \((?:\d+) attempts?: (.+)\)$/i);
      if (!routeMatch) {
        return { model: part, reason: "request failed" };
      }
      const model = (routeMatch[1] ?? "").trim();
      const message = (routeMatch[2] ?? "")
        .split(/\s*\|\s*/)
        .map((value) => value.trim())
        .find(Boolean) ?? "";
      return { model, reason: compactAgentProviderFailureMessage(message) };
    });

  return { stage, routes };
}

function summarizeExhaustedAgentModelRoutes(summary: string): string | null {
  const parsed = parseExhaustedAgentModelRoutes(summary);
  if (!parsed) return null;
  if (parsed.routes.length === 0) return `${parsed.stage} exhausted all configured model routes.`;
  return `${parsed.stage} failed after trying ${parsed.routes.map((route) => `${route.model}: ${route.reason}`).join("; ")}.`;
}

function summarizeAgentTaskSummary(summary: string, fallbackStatus: AgentTask["status"]): string {
  const normalized = (summary ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return `Task ${fallbackStatus}.`;
  const exhaustedRoutes = summarizeExhaustedAgentModelRoutes(normalized);
  if (exhaustedRoutes) {
    return exhaustedRoutes.length > 180 ? `${exhaustedRoutes.slice(0, 177)}...` : exhaustedRoutes;
  }
  const withoutVerification = normalized.replace(/\s+Verification:\s+.+?\.?$/i, "").trim();
  const concise = withoutVerification || normalized;
  return concise.length > 180 ? `${concise.slice(0, 180)}...` : concise;
}

function buildExhaustedRouteText(summary: string | undefined): string[] {
  const parsed = parseExhaustedAgentModelRoutes(summary ?? "");
  if (!parsed || parsed.routes.length === 0) return [];
  return [
    `Model fallback: ${parsed.stage}`,
    ...parsed.routes.slice(0, 4).map((route) => `Model tried: ${route.model} - ${route.reason}`)
  ];
}
