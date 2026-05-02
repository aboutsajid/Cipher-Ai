const AGENT_PROMPT_PREFLIGHT_DEBOUNCE_MS = 220;
let agentPromptPreflightTimer: ReturnType<typeof setTimeout> | null = null;
let agentPromptPreflightRequestId = 0;

interface AgentPromptAutoEnhanceResult {
  enhanced: boolean;
  prompt: string;
  preflight: AgentPromptPreflightResult;
}

function setAgentPreflightStatus(message: string, tone: "ok" | "err" | "" = ""): void {
  const el = $("agent-preflight-msg");
  if (!(el instanceof HTMLElement)) return;
  el.textContent = message;
  el.className = `status-msg ${tone}`.trim();
}

function summarizePreflightIssues(issues: AgentPromptPreflightIssue[], maxItems = 3): string {
  const top = issues.slice(0, maxItems);
  return top.map((issue) => issue.message).join(" | ");
}

function formatPreflightSuggestion(issue: AgentPromptPreflightIssue): string {
  const suggestion = (issue.suggestion ?? "").trim();
  if (!suggestion) return issue.message;
  return `${issue.message} Fix: ${suggestion}`;
}

function buildBlockingPreflightMessage(result: AgentPromptPreflightResult, maxItems = 2): string {
  const blocking = result.issues.filter((issue) => issue.severity === "error");
  if (blocking.length === 0) return result.summary;
  const detailCount = Math.min(blocking.length, maxItems);
  return `Prompt blocked by contract preflight (${blocking.length} issue${blocking.length === 1 ? "" : "s"}). Showing ${detailCount} key fix${detailCount === 1 ? "" : "es"} in the popup.`;
}

function buildAgentPromptAutoEnhanceConsentMessage(result: AgentPromptPreflightResult): string {
  const blocking = result.issues.filter((issue) => issue.severity === "error");
  const topIssues = blocking.slice(0, 2).map((issue) => `- ${issue.message}`);
  const issueSummary = topIssues.length > 0 ? `\n\nBlocking issues:\n${topIssues.join("\n")}` : "";
  return `Prompt preflight found ${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}.\n\nAllow the agent to auto-enhance your prompt and retry before start?${issueSummary}`;
}

function requestAgentPromptAutoEnhanceConsent(result: AgentPromptPreflightResult): boolean {
  return window.confirm(buildAgentPromptAutoEnhanceConsentMessage(result));
}

function getArtifactPromptLabel(artifact: AgentPromptPreflightResult["inferredArtifact"]): string {
  if (artifact === "desktop-app") return "Electron desktop app";
  if (artifact === "web-app") return "web app";
  if (artifact === "api-service") return "API service";
  if (artifact === "script-tool") return "script tool";
  if (artifact === "library") return "code library";
  return "software project";
}

function getArtifactObjectiveFallback(artifact: AgentPromptPreflightResult["inferredArtifact"]): string {
  if (artifact === "desktop-app") {
    return "Build a complete Electron desktop app with working UI, local persistence, and runnable scripts.";
  }
  if (artifact === "web-app") {
    return "Build a complete web app with working UI, core flows, and local persistence where relevant.";
  }
  if (artifact === "api-service") {
    return "Build an API service with clear endpoints, validation, and executable verification.";
  }
  if (artifact === "script-tool") {
    return "Build an executable script tool with clear inputs, outputs, and usage instructions.";
  }
  if (artifact === "library") {
    return "Build a reusable library module with clean exports and usage examples.";
  }
  return "Build a complete, runnable solution that satisfies the requested behavior.";
}

function normalizePromptSentence(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\-\*\d\.\)\s]+/, "")
    .trim();
}

function sentenceContainsBlockingNegation(sentence: string): boolean {
  return /\b(do not|don't|without|omit|excluding|exclude|avoid|skip)\b/i.test(sentence);
}

function extractPrimaryObjectiveFromPrompt(prompt: string): string {
  const compact = (prompt ?? "").trim();
  if (!compact) return "";
  const fragments = compact
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map(normalizePromptSentence)
    .filter(Boolean);
  const candidate = fragments.find((line) => !sentenceContainsBlockingNegation(line)) ?? "";
  if (!candidate) return "";
  return candidate.length > 240 ? `${candidate.slice(0, 237).trimEnd()}...` : candidate;
}

function buildRequirementEnhancementLines(result: AgentPromptPreflightResult): string[] {
  const lines: string[] = [];
  const requirementIds = new Set(result.requirementIds);
  if (requirementIds.has("req-hero")) lines.push("Include a Hero section with clear headline and value proposition.");
  if (requirementIds.has("req-features")) lines.push("Include a Feature section with visible feature cards.");
  if (requirementIds.has("req-contact")) lines.push("Include a Contact CTA section with clear call-to-action.");
  if (requirementIds.has("req-auth")) lines.push("Include authentication flow terms explicitly: Login, Sign in, Password, Account.");
  if (requirementIds.has("req-settings")) lines.push("Include settings flow terms explicitly: Settings, Preferences, Configuration.");
  if (requirementIds.has("req-dashboard")) lines.push("Include dashboard content with metrics and recent activity.");
  if (requirementIds.has("req-notes")) lines.push("Include notes experience with add/edit/delete flows.");
  if (requirementIds.has("req-search-filter")) lines.push("Include search/filter behavior for key records.");
  if (requirementIds.has("req-persistence")) lines.push("Persist key user data locally and verify saved/recent behavior.");
  if (requirementIds.has("req-export")) lines.push("Include copy/export/download/share flow where requested.");
  if (requirementIds.has("req-ingest")) lines.push("Include ingest flow such as import/upload/paste/file picker.");
  if (requirementIds.has("req-summary")) lines.push("Provide summary output with takeaways/action items.");
  if (requirementIds.has("req-transcript")) lines.push("Include transcript/captions workflow in the interface.");
  if (requirementIds.has("req-video-source")) lines.push("Support video URL input and processing flow.");
  if (requirementIds.has("req-record-entry")) lines.push("Include daily entry workflow with saved records.");
  if (requirementIds.has("req-reporting")) lines.push("Include daily/weekly/monthly/quarterly/yearly reporting views.");
  return lines;
}

function buildArtifactDeliveryLines(result: AgentPromptPreflightResult): string[] {
  const lines: string[] = [];
  if (result.inferredArtifact === "desktop-app") {
    lines.push("Use Electron desktop architecture.");
    lines.push("Include package.json scripts: build, start, package:win.");
    lines.push("Generate Windows installer output and run installer smoke.");
  }
  if (result.runMode === "build-product") {
    lines.push("Follow full gate flow: plan -> implement -> verify -> repair -> package -> installer-smoke -> approve.");
  } else {
    lines.push("Follow standard gate flow: implement -> verify -> approve.");
  }
  return lines;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(line.trim());
  }
  return output;
}

function buildAutoEnhancedPrompt(prompt: string, result: AgentPromptPreflightResult): string {
  const artifactLabel = getArtifactPromptLabel(result.inferredArtifact);
  const objective = extractPrimaryObjectiveFromPrompt(prompt) || getArtifactObjectiveFallback(result.inferredArtifact);
  const requirementLines = buildRequirementEnhancementLines(result);
  const deliveryLines = buildArtifactDeliveryLines(result);
  const contractLines = dedupeLines([
    "You are allowed to create and modify files needed for implementation.",
    "Implement complete working functionality, not placeholders.",
    "Run build and quality checks, repair failures, and report what was verified."
  ]);
  const sections = [
    `Create and deliver a complete ${artifactLabel}.`,
    "",
    "Primary objective:",
    objective,
    "",
    "Required product behavior:",
    ...dedupeLines(requirementLines).map((line) => `- ${line}`),
    "",
    "Delivery contract:",
    ...deliveryLines.map((line) => `- ${line}`),
    ...contractLines.map((line) => `- ${line}`),
    "",
    "Completion summary:",
    "- Provide concise verification summary with the checks/scripts you ran and final result."
  ];
  return sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function applyAgentPromptToInputs(prompt: string): void {
  const agentInput = document.getElementById("agent-prompt-input");
  if (agentInput instanceof HTMLTextAreaElement) {
    agentInput.value = prompt;
    agentInput.dispatchEvent(new Event("input"));
    syncComposerAgentPrompts("agent");
    return;
  }
  const composerInput = document.getElementById("composer-input");
  if (composerInput instanceof HTMLTextAreaElement) {
    composerInput.value = prompt;
    composerInput.dispatchEvent(new Event("input"));
    syncComposerAgentPrompts("composer");
  }
}

async function autoEnhanceAgentPromptForPreflight(
  prompt: string,
  runMode: AgentTaskRunMode,
  preflight: AgentPromptPreflightResult
): Promise<AgentPromptAutoEnhanceResult> {
  if (preflight.ok) {
    return {
      enhanced: false,
      prompt,
      preflight
    };
  }
  const enhancedPrompt = buildAutoEnhancedPrompt(prompt, preflight);
  if (!enhancedPrompt || enhancedPrompt.trim() === prompt.trim()) {
    return {
      enhanced: false,
      prompt,
      preflight
    };
  }
  const enhancedPreflight = await runAgentPromptPreflight(enhancedPrompt, runMode);
  return {
    enhanced: true,
    prompt: enhancedPrompt,
    preflight: enhancedPreflight
  };
}

function formatPreflightModalIssue(issue: AgentPromptPreflightIssue, index: number): string {
  const severityLabel = issue.severity === "error" ? "Blocking" : "Warning";
  const title = `${index + 1}. ${severityLabel}: ${issue.message}`;
  const suggestion = (issue.suggestion ?? "").trim();
  if (!suggestion) return title;
  return `${title}\nFix: ${suggestion}`;
}

function openAgentPromptPreflightModal(result: AgentPromptPreflightResult): void {
  const modal = $("agent-preflight-modal");
  const summaryEl = $("agent-preflight-modal-summary");
  const detailsEl = $("agent-preflight-modal-details");
  const blocking = result.issues.filter((issue) => issue.severity === "error");
  const shownIssues = blocking.length > 0 ? blocking : result.issues;
  const summaryParts = [
    `Prompt preflight found ${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}.`,
    `Run mode: ${result.runMode}.`,
    `Artifact: ${result.inferredArtifact}.`
  ];
  summaryEl.textContent = summaryParts.join(" ");
  detailsEl.textContent = shownIssues.length > 0
    ? shownIssues.map((issue, index) => formatPreflightModalIssue(issue, index)).join("\n\n")
    : result.summary;
  modal.style.display = "flex";
}

function closeAgentPromptPreflightModal(focusPrompt = false): void {
  const modal = document.getElementById("agent-preflight-modal");
  if (modal instanceof HTMLElement) {
    modal.style.display = "none";
  }
  if (!focusPrompt) return;
  const promptInput = document.getElementById("agent-prompt-input");
  if (promptInput instanceof HTMLTextAreaElement) {
    promptInput.focus();
    promptInput.selectionStart = promptInput.value.length;
    promptInput.selectionEnd = promptInput.value.length;
  }
}

function renderAgentPromptPreflight(result: AgentPromptPreflightResult): void {
  const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
  const warnCount = result.issues.filter((issue) => issue.severity === "warn").length;
  const issueSummary = result.issues.length > 0 ? ` ${summarizePreflightIssues(result.issues, 2)}` : "";
  const message = `${result.summary} Artifact: ${result.inferredArtifact}.${issueSummary}`;
  if (!result.ok) {
    setAgentPreflightStatus(
      `Prompt preflight found ${errorCount} blocking issue${errorCount === 1 ? "" : "s"}. Press Start and the agent will auto-enhance first.`,
      "err"
    );
    return;
  }
  if (warnCount > 0) {
    setAgentPreflightStatus(message, "");
    return;
  }
  setAgentPreflightStatus(message, "ok");
}

function buildAgentPreflightRequest(prompt: string, runMode: AgentTaskRunMode): AgentTaskRequest {
  return {
    prompt: (prompt ?? "").trim(),
    runMode
  };
}

async function runAgentPromptPreflight(
  prompt: string,
  runMode: AgentTaskRunMode
): Promise<AgentPromptPreflightResult> {
  return window.api.agent.preflightPrompt(buildAgentPreflightRequest(prompt, runMode));
}

function getAgentPromptPreflightBlockingMessage(result: AgentPromptPreflightResult): string {
  return buildBlockingPreflightMessage(result);
}

function scheduleAgentPromptPreflight(prompt: string, runMode: AgentTaskRunMode): void {
  const normalizedPrompt = (prompt ?? "").trim();
  if (agentPromptPreflightTimer) {
    clearTimeout(agentPromptPreflightTimer);
    agentPromptPreflightTimer = null;
  }
  if (!normalizedPrompt) {
    setAgentPreflightStatus("Prompt contract preflight will appear as you type.");
    return;
  }

  const requestId = ++agentPromptPreflightRequestId;
  agentPromptPreflightTimer = setTimeout(async () => {
    try {
      const result = await runAgentPromptPreflight(normalizedPrompt, runMode);
      if (requestId !== agentPromptPreflightRequestId) return;
      renderAgentPromptPreflight(result);
    } catch {
      if (requestId !== agentPromptPreflightRequestId) return;
      setAgentPreflightStatus("Prompt contract preflight is unavailable right now.", "err");
    }
  }, AGENT_PROMPT_PREFLIGHT_DEBOUNCE_MS);
}
