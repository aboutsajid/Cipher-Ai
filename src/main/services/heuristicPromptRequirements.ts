type ArtifactKind =
  | "web-app"
  | "desktop-app"
  | "api-service"
  | "script-tool"
  | "library"
  | "workspace-change"
  | "unknown"
  | null;

export interface HeuristicPromptRequirement {
  id: string;
  label: string;
  terms: string[];
  mode: "all" | "any";
}

export function hasProductSummaryRequirement(normalizedPrompt: string): boolean {
  const normalized = (normalizedPrompt ?? "").trim().toLowerCase();
  if (!normalized) return false;

  if (/\bsummary output\b/.test(normalized) || /\bsummarizer\b/.test(normalized)) {
    return true;
  }

  if (/\b(takeaways?|chapters?|action items?|key points?|insights?)\b/.test(normalized)) {
    return true;
  }

  return /\b(summarize|summarise)\b/.test(normalized)
    && /\b(video|youtube|article|document|text|transcript|meeting|call|audio|pdf|captions?|subtitles?)\b/.test(normalized);
}

export function hasAuthenticationRequirement(normalizedPrompt: string): boolean {
  const normalized = (normalizedPrompt ?? "").trim().toLowerCase();
  if (!normalized) return false;

  return /\b(login|log in|sign in|signin|sign-in|auth|authentication|password|passcode|credentials?)\b/.test(normalized);
}

export function extractPromptRequirements(
  prompt: string,
  options: {
    promptArtifact: ArtifactKind;
    isDesktopBusinessReportingPrompt: (normalizedPrompt: string) => boolean;
  }
): HeuristicPromptRequirement[] {
  const normalized = (prompt ?? "").trim().toLowerCase();
  const requirements: HeuristicPromptRequirement[] = [];
  const supportsVisualRequirements = (
    options.promptArtifact === null
    || options.promptArtifact === "web-app"
    || options.promptArtifact === "desktop-app"
  );
  const addRequirement = (requirement: HeuristicPromptRequirement): void => {
    if (!requirements.some((entry) => entry.id === requirement.id)) {
      requirements.push(requirement);
    }
  };

  if (normalized.includes("hero")) {
    addRequirement({
      id: "req-hero",
      label: "Hero section",
      terms: ["hero"],
      mode: "any"
    });
  }

  if (normalized.includes("feature cards") || normalized.includes("features")) {
    addRequirement({
      id: "req-features",
      label: "Feature section",
      terms: ["features", "feature", "card"],
      mode: "all"
    });
  }

  if (
    normalized.includes("contact cta")
    || normalized.includes("call to action")
    || /\b(contact us|get in touch|talk to sales|book now|book appointment)\b/.test(normalized)
  ) {
    addRequirement({
      id: "req-contact",
      label: "Contact CTA",
      terms: ["contact", "cta"],
      mode: "all"
    });
  }

  if (supportsVisualRequirements && normalized.includes("dashboard")) {
    addRequirement({
      id: "req-dashboard",
      label: "Dashboard content",
      terms: ["dashboard", "metric", "activity"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && normalized.includes("notes")) {
    addRequirement({
      id: "req-notes",
      label: "Notes experience",
      terms: ["note", "notes"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && options.isDesktopBusinessReportingPrompt(normalized)) {
    addRequirement({
      id: "req-record-entry",
      label: "Daily entry workflow",
      terms: ["daily entry", "saved records"],
      mode: "all"
    });
    addRequirement({
      id: "req-reporting",
      label: "Reporting views",
      terms: ["daily summary", "weekly report", "monthly report", "quarterly report", "yearly report"],
      mode: "all"
    });
  }

  if (supportsVisualRequirements && hasProductSummaryRequirement(normalized)) {
    addRequirement({
      id: "req-summary",
      label: "Summary output",
      terms: ["summary", "takeaways", "chapters", "action items"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(transcript|subtitles?|captions?)\b/.test(normalized)) {
    addRequirement({
      id: "req-transcript",
      label: "Transcript workflow",
      terms: ["transcript", "caption", "subtitle"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(youtube|video url|youtube url|youtu\.be|youtube\.com|video link)\b/.test(normalized)) {
    addRequirement({
      id: "req-video-source",
      label: "Video source input",
      terms: ["youtube", "video", "url", "link"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(search|filter|find)\b/.test(normalized)) {
    addRequirement({
      id: "req-search-filter",
      label: "Search or filter flow",
      terms: ["search", "filter"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(save|saved|persist|history|recent|library)\b/.test(normalized)) {
    addRequirement({
      id: "req-persistence",
      label: "Persistence flow",
      terms: ["save", "saved", "localstorage", "history", "recent", "library"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(copy|export|download|share)\b/.test(normalized)) {
    addRequirement({
      id: "req-export",
      label: "Export or copy flow",
      terms: ["copy", "export", "download", "share"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(import|upload|paste|drag and drop|dropzone|drop zone|file picker)\b/.test(normalized)) {
    addRequirement({
      id: "req-ingest",
      label: "Input ingest flow",
      terms: ["import", "upload", "paste", "drop", "file"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && hasAuthenticationRequirement(normalized)) {
    addRequirement({
      id: "req-auth",
      label: "Authentication flow",
      terms: ["login", "sign in", "auth", "password", "account"],
      mode: "any"
    });
  }

  if (supportsVisualRequirements && /\b(settings|preferences|configuration|config)\b/.test(normalized)) {
    addRequirement({
      id: "req-settings",
      label: "Settings flow",
      terms: ["settings", "preferences", "configuration"],
      mode: "any"
    });
  }

  return requirements;
}
