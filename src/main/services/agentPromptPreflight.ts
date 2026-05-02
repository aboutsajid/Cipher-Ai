import type {
  AgentArtifactType,
  AgentPromptPreflightIssue,
  AgentPromptPreflightResult,
  AgentTaskRequest,
  AgentTaskRunMode
} from "../../shared/types";
import { classifyArtifactType as classifyArtifactTypeText } from "./artifactTypeClassifier";
import { isDesktopBusinessReportingPrompt as isDesktopBusinessReportingPromptText } from "./heuristicDesktopPromptGuards";
import { inferArtifactTypeFromPrompt as inferArtifactTypeFromPromptText } from "./heuristicPromptArtifactGuards";
import { extractPromptRequirements as extractPromptRequirementsText } from "./heuristicPromptRequirements";

function normalizeRunMode(value: string | null | undefined): AgentTaskRunMode {
  return value === "standard" ? "standard" : "build-product";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNegatedPhrase(normalizedPrompt: string, phrase: string): boolean {
  const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
  const directNegation = new RegExp(
    `\\b(?:no|without|omit|excluding|exclude|avoid|skip)\\s+(?:any\\s+)?${escapedPhrase}\\b`
  );
  const doNotNegation = new RegExp(
    `\\bdo\\s+not\\s+(?:add|include|use|build|create|show|render|require|have|need)\\s+(?:any\\s+)?${escapedPhrase}\\b`
  );
  const dontNegation = new RegExp(
    `\\bdon't\\s+(?:add|include|use|build|create|show|render|require|have|need)\\s+(?:any\\s+)?${escapedPhrase}\\b`
  );
  return directNegation.test(normalizedPrompt)
    || doNotNegation.test(normalizedPrompt)
    || dontNegation.test(normalizedPrompt);
}

function isNegatedPhraseOccurrence(prefixText: string): boolean {
  return /\b(?:no|without|omit|excluding|exclude|avoid|skip)\s+(?:any\s+)?$/i.test(prefixText)
    || /\bdo\s+not\s+(?:add|include|use|build|create|show|render|require|have|need)\s+(?:any\s+)?$/i.test(prefixText)
    || /\bdon't\s+(?:add|include|use|build|create|show|render|require|have|need)\s+(?:any\s+)?$/i.test(prefixText);
}

function hasAffirmativePhrase(normalizedPrompt: string, phrase: string): boolean {
  const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
  const phrasePattern = new RegExp(`\\b${escapedPhrase}\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = phrasePattern.exec(normalizedPrompt)) !== null) {
    const startIndex = match.index;
    const prefix = normalizedPrompt.slice(Math.max(0, startIndex - 96), startIndex);
    if (!isNegatedPhraseOccurrence(prefix)) {
      return true;
    }
  }
  return false;
}

function hasAnyAffirmativePhrase(normalizedPrompt: string, phrases: string[]): boolean {
  return phrases.some((phrase) => hasAffirmativePhrase(normalizedPrompt, phrase));
}

function hasAnyNegatedPhrase(normalizedPrompt: string, phrases: string[]): boolean {
  return phrases.some((phrase) => hasNegatedPhrase(normalizedPrompt, phrase));
}

function pushContradictionIssue(
  issues: AgentPromptPreflightIssue[],
  normalizedPrompt: string,
  label: string,
  phrases: string[]
): void {
  if (!hasAnyAffirmativePhrase(normalizedPrompt, phrases)) return;
  if (!hasAnyNegatedPhrase(normalizedPrompt, phrases)) return;
  issues.push({
    severity: "error",
    code: "contradictory-requirement",
    message: `Prompt contains contradictory instructions for ${label}.`,
    suggestion: `Keep either a positive request or a negative exclusion for ${label}, not both.`
  });
}

function normalizeRequest(request: string | AgentTaskRequest): { prompt: string; runMode: AgentTaskRunMode } {
  if (typeof request === "string") {
    return {
      prompt: (request ?? "").trim(),
      runMode: "build-product"
    };
  }
  return {
    prompt: (request?.prompt ?? "").trim(),
    runMode: normalizeRunMode(request?.runMode)
  };
}

export function preflightAgentPrompt(
  request: string | AgentTaskRequest
): AgentPromptPreflightResult {
  const normalizedRequest = normalizeRequest(request);
  const normalizedPrompt = normalizedRequest.prompt;
  const normalizedLowerPrompt = normalizedPrompt.toLowerCase();
  const runMode = normalizeRunMode(normalizedRequest.runMode);
  const issues: AgentPromptPreflightIssue[] = [];

  const promptArtifact = inferArtifactTypeFromPromptText(normalizedLowerPrompt);
  const inferredArtifact = classifyArtifactTypeText(normalizedPrompt, {
    previewReady: false,
    workspaceKind: null,
    promptArtifact,
    packageArtifact: null
  }) as AgentArtifactType;
  const promptRequirements = extractPromptRequirementsText(normalizedPrompt, {
    promptArtifact,
    isDesktopBusinessReportingPrompt: isDesktopBusinessReportingPromptText
  });
  const requirementIds = promptRequirements.map((requirement) => requirement.id);

  if (!normalizedPrompt) {
    issues.push({
      severity: "error",
      code: "prompt-empty",
      message: "Prompt is empty.",
      suggestion: "Describe the task outcome, required flows, and packaging expectations."
    });
  }

  if (/\b(do not|don't)\s+(modify|change|edit)\s+any\s+files\b/.test(normalizedLowerPrompt)) {
    issues.push({
      severity: "error",
      code: "impossible-constraint",
      message: "Prompt blocks all file changes, which prevents implementation.",
      suggestion: "Allow file edits or ask for analysis-only output."
    });
  }

  pushContradictionIssue(issues, normalizedLowerPrompt, "Hero section", ["hero section", "hero"]);
  pushContradictionIssue(issues, normalizedLowerPrompt, "Feature section", ["feature cards", "feature card", "feature sections", "feature section"]);
  pushContradictionIssue(issues, normalizedLowerPrompt, "Contact CTA", ["contact cta", "call to action", "contact us", "get in touch"]);
  pushContradictionIssue(issues, normalizedLowerPrompt, "Authentication flow", ["authentication flow", "auth", "login", "sign in"]);
  pushContradictionIssue(issues, normalizedLowerPrompt, "Settings flow", ["settings", "preferences", "configuration"]);

  if (runMode === "build-product" && inferredArtifact === "workspace-change") {
    issues.push({
      severity: "warn",
      code: "artifact-ambiguous",
      message: "Prompt looks like a workspace change instead of a concrete app/tool build.",
      suggestion: "Specify artifact type explicitly (desktop app, web app, API service, script tool, or library)."
    });
  }

  if (runMode === "build-product" && inferredArtifact === "desktop-app") {
    if (!/\b(package:win|package win|windows installer|installer smoke|electron-builder|nsis)\b/.test(normalizedLowerPrompt)) {
      issues.push({
        severity: "warn",
        code: "desktop-packaging-unspecified",
        message: "Desktop packaging signals are not explicit in the prompt.",
        suggestion: "Add explicit packaging requirements like package:win, Windows installer, and installer smoke."
      });
    }
  }

  if (inferredArtifact !== "desktop-app" && /\b(package:win|package win|windows installer|installer smoke)\b/.test(normalizedLowerPrompt)) {
    issues.push({
      severity: "warn",
      code: "artifact-packaging-mismatch",
      message: "Prompt includes Windows installer packaging signals but does not clearly classify as desktop app.",
      suggestion: "Explicitly say Electron desktop app to avoid artifact misrouting."
    });
  }

  if (requirementIds.includes("req-auth") && !/\b(login|log in|sign in|signin|sign-in|password|account)\b/.test(normalizedLowerPrompt)) {
    issues.push({
      severity: "warn",
      code: "auth-evidence-weak",
      message: "Authentication flow requested without explicit login/password/account wording.",
      suggestion: "Include terms like Sign in, Password, and Account to satisfy requirement verification."
    });
  }

  if (requirementIds.includes("req-settings") && !/\b(settings|preferences|configuration)\b/.test(normalizedLowerPrompt)) {
    issues.push({
      severity: "warn",
      code: "settings-evidence-weak",
      message: "Settings flow requested without explicit settings/preferences/configuration wording.",
      suggestion: "Include the exact words Settings, Preferences, and Configuration."
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const ok = errorCount === 0;
  const summary = issues.length === 0
    ? `Prompt contract preflight passed for ${inferredArtifact} (${runMode}).`
    : errorCount > 0
      ? `Prompt contract preflight found ${errorCount} blocking issue(s) and ${warnCount} warning(s).`
      : `Prompt contract preflight passed with ${warnCount} warning(s).`;

  return {
    ok,
    normalizedPrompt,
    runMode,
    inferredArtifact,
    requirementIds,
    issues,
    summary
  };
}
