interface ParsedAgentMessage {
  status?: string;
  activity?: string;
  latestUpdate?: string;
  artifactType?: AgentArtifactType;
  output?: AgentTaskOutput;
  target?: string;
  rollback?: string;
  summary?: string;
  steps: string[];
  logs: string[];
  files: string[];
  verifySummary?: string;
  verifyChecks: Array<{ label: string; status: "passed" | "failed" | "skipped"; details: string }>;
  previewUrl?: string;
}

function detectAgentPreviewUrl(logs: string[]): string | undefined {
  for (const rawLine of logs) {
    const line = stripAnsi(rawLine);
    const explicitUrl = line.match(/https?:\/\/[^\s]+/i)?.[0];
    if (explicitUrl) return explicitUrl.replace(/[)\].,]+$/, "");
  }

  for (const rawLine of logs) {
    const line = stripAnsi(rawLine);
    const viteLocal = line.match(/Local:\s*(https?:\/\/[^\s]+)/i)?.[1];
    if (viteLocal) return viteLocal.trim();

    const pythonServer = line.match(/python\s+-m\s+http\.server\s+(\d{2,5})/i)?.[1];
    if (pythonServer) return `http://localhost:${pythonServer}`;

    const genericPort = line.match(/\b(?:localhost|127\.0\.0\.1):(\d{2,5})\b/i)?.[1];
    if (genericPort) return `http://localhost:${genericPort}`;
  }

  return undefined;
}

function isPreviewPrimaryAction(action?: AgentOutputPrimaryAction): boolean {
  return action === "preview-web" || action === "preview";
}

function isRunPrimaryAction(action?: AgentOutputPrimaryAction): boolean {
  return action === "run-web-app"
    || action === "run-service"
    || action === "run-tool"
    || action === "run-desktop"
    || action === "run-command";
}

function getAgentRunCommandButtonLabel(action?: AgentOutputPrimaryAction): string {
  return isRunPrimaryAction(action) || isPreviewPrimaryAction(action) ? "Copy run command" : "Copy command";
}

function isPreviewableAgentResult(parsed: ParsedAgentMessage): boolean {
  if (!parsed.target) return false;
  if (parsed.artifactType && !isWebArtifactType(parsed.artifactType)) return false;
  if (parsed.output?.primaryAction && !isPreviewPrimaryAction(parsed.output.primaryAction)) return false;
  if (parsed.verifyChecks.some((check) => check.label === "Preview health" && check.status === "passed")) return true;
  return Boolean(parsed.previewUrl) && parsed.verifyChecks.some((check) => check.label === "Launch" && check.status === "passed");
}

function humanizeAgentStepTitle(title: string): string {
  const normalized = title.trim();
  const directMap: Record<string, string> = {
    "Inspect workspace": "inspecting the workspace",
    "Plan task execution": "planning the task",
    "Verify build and quality scripts": "verifying the build",
    "Bootstrap project workspace": "bootstrapping the project workspace",
    "Build page structure": "building the page structure",
    "Build dashboard structure": "building the dashboard structure",
    "Build CRUD layout": "building the CRUD layout",
    "Add data cards and tables": "adding data cards and tables",
    "Add create, edit, and delete flows": "adding create, edit, and delete flows",
    "Add note creation flow": "adding note creation flow",
    "Build notes interface": "building the notes interface",
    "Polish visual design": "polishing the visual design",
    "Polish dashboard design": "polishing the dashboard design",
    "Polish CRUD experience": "polishing the CRUD experience",
    "Implement requested changes": "applying the requested changes",
    "Final builder recovery": "recovering the app",
    "Final lint recovery": "recovering lint issues"
  };

  if (directMap[normalized]) return directMap[normalized];
  if (/^Implement:\s*/i.test(normalized)) {
    return humanizeAgentStepTitle(normalized.replace(/^Implement:\s*/i, ""));
  }
  if (/^Fix build attempt \d+/i.test(normalized)) return "fixing the build";
  if (/^Fix lint attempt \d+/i.test(normalized)) return "fixing lint issues";
  return `working on ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
}

function parseAgentPrimaryActionLabel(value: string, artifactType?: AgentArtifactType): AgentOutputPrimaryAction {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "preview web app":
    case "preview":
      return "preview-web";
    case "run web app":
      return "run-web-app";
    case "run service":
      return "run-service";
    case "run tool":
      return "run-tool";
    case "run desktop app":
      return "run-desktop";
    case "inspect package":
      return "inspect-package";
    case "inspect workspace":
      return "inspect-workspace";
    case "inspect":
      return artifactType === "library"
        ? "inspect-package"
        : artifactType === "workspace-change"
          ? "inspect-workspace"
          : "inspect";
    case "run command":
      if (artifactType === "api-service") return "run-service";
      if (artifactType === "script-tool") return "run-tool";
      if (artifactType === "desktop-app") return "run-desktop";
      if (artifactType === "web-app") return "run-web-app";
      return "run-command";
    case "open folder":
      return artifactType === "workspace-change" ? "inspect-workspace" : "open-folder";
    default:
      return "open-folder";
  }
}

function parseAgentMessageContent(content: string): ParsedAgentMessage {
  const lines = (content ?? "").split(/\r?\n/);
  const parsed: ParsedAgentMessage = { steps: [], logs: [], files: [], verifyChecks: [] };
  let mode: "summary" | "steps" | "logs" = "summary";
  let inLogFence = false;
  const summaryLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("Agent status: ")) {
      parsed.status = line.slice("Agent status: ".length).trim();
      continue;
    }
    if (line.startsWith("Activity: ")) {
      parsed.activity = line.slice("Activity: ".length).trim();
      continue;
    }
    if (line.startsWith("Latest update: ")) {
      parsed.latestUpdate = line.slice("Latest update: ".length).trim();
      continue;
    }
    if (line.startsWith("Artifact: ")) {
      parsed.artifactType = parseAgentArtifactTypeLabel(line.slice("Artifact: ".length).trim());
      continue;
    }
    if (line.startsWith("Primary action: ")) {
      const value = line.slice("Primary action: ".length).trim();
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.primaryAction = parseAgentPrimaryActionLabel(value, parsed.artifactType);
      continue;
    }
    if (line.startsWith("Run command: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.runCommand = line.slice("Run command: ".length).trim();
      continue;
    }
    if (line.startsWith("Working directory: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.workingDirectory = line.slice("Working directory: ".length).trim();
      continue;
    }
    if (line.startsWith("Package: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.packageName = line.slice("Package: ".length).trim();
      continue;
    }
    if (line.startsWith("Usage: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.usageDetail = line.slice("Usage: ".length).trim();
      continue;
    }
    if (line.startsWith("Usage title: ")) {
      parsed.output = parsed.output ?? { primaryAction: "open-folder" };
      parsed.output.usageTitle = line.slice("Usage title: ".length).trim();
      continue;
    }
    if (line.startsWith("Target: ")) {
      parsed.target = line.slice("Target: ".length).trim();
      continue;
    }
    if (line.startsWith("Rollback: ")) {
      parsed.rollback = line.slice("Rollback: ".length).trim();
      continue;
    }
    if (line.startsWith("Verification: ")) {
      parsed.verifySummary = line.slice("Verification: ".length).trim();
      continue;
    }
    if (line.startsWith("Verification check: ")) {
      const normalizedCheck = line.slice("Verification check: ".length).trim();
      const verifyCheckMatch = normalizedCheck.match(/^(.+?)\s*-\s*(passed|failed|skipped)\s*-\s*(.+)$/i);
      if (verifyCheckMatch) {
        parsed.verifyChecks.push({
          label: verifyCheckMatch[1].trim(),
          status: verifyCheckMatch[2].trim().toLowerCase() as "passed" | "failed" | "skipped",
          details: verifyCheckMatch[3].trim()
        });
      }
      continue;
    }
    if (line === "Steps:") {
      mode = "steps";
      continue;
    }
    if (line === "Recent logs:") {
      mode = "logs";
      continue;
    }
    if (line.startsWith("```")) {
      inLogFence = !inLogFence;
      continue;
    }
    if (!line.trim()) continue;

    if (mode === "logs" || inLogFence) {
      parsed.logs.push(line);
      continue;
    }
    if (mode === "steps" && line.startsWith("- ")) {
      const step = line.slice(2).trim();
      parsed.steps.push(step);
      const changedMatch = step.match(/Files changed:\s*(.+)$/i);
      if (changedMatch) {
        const files = changedMatch[1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .filter((value) => value.toLowerCase() !== "none");
        for (const file of files) {
          if (!parsed.files.includes(file)) parsed.files.push(file);
        }
      }
      const verifyMatch = step.match(/Verification finished:\s*(.+)$/i);
      if (verifyMatch) {
        parsed.verifySummary = verifyMatch[1].trim();
      }
      continue;
    }
    summaryLines.push(line);
  }

  parsed.previewUrl = detectAgentPreviewUrl(parsed.logs);
  parsed.summary = summaryLines.join(" ").trim();
  return parsed;
}
