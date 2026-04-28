import { buildHeuristicDesktopWorkspaceTemplate } from "./heuristicDesktopWorkspaceTemplate";

interface StructuredEdit {
  path: string;
  content: string;
}

export interface HeuristicWorkspaceResult {
  summary: string;
  edits: StructuredEdit[];
}

type WorkspaceKind = "static" | "react" | "generic";
type BuilderMode = "notes" | "landing" | "dashboard" | "crud" | "kanban" | null;

export interface HeuristicDesktopWorkspaceInput {
  prompt: string;
  workspaceKind: WorkspaceKind;
  builderMode: BuilderMode;
  workingDirectory: string;
  title: string;
  isDesktopBusinessReportingPrompt: (normalizedPrompt: string) => boolean;
  isSimpleDesktopUtilityPrompt: (normalizedPrompt: string) => boolean;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
}

export function buildHeuristicDesktopWorkspace(input: HeuristicDesktopWorkspaceInput): HeuristicWorkspaceResult | null {
  const {
    prompt,
    workspaceKind,
    builderMode,
    workingDirectory,
    title,
    isDesktopBusinessReportingPrompt,
    isSimpleDesktopUtilityPrompt,
    resolveWorkspacePath
  } = input;

  const normalized = (prompt ?? "").trim().toLowerCase();
  const wantsDesktop = /\b(electron|desktop|tauri)\b/.test(normalized);
  if (!wantsDesktop || workspaceKind !== "react") return null;

  const isSnippetManager = normalized.includes("snippet");
  const isVoiceWorkspace = normalized.includes("voice") || normalized.includes("recording");
  const isBusinessReportingWorkspace = isDesktopBusinessReportingPrompt(normalized);
  const isFileRenamer = isSimpleDesktopUtilityPrompt(normalized)
    && (/\b(file renamer|rename files?|rename action)\b/.test(normalized)
      || (/\brename\b/.test(normalized) && /\bfiles?\b/.test(normalized)));
  const isPdfCombiner = isSimpleDesktopUtilityPrompt(normalized)
    && /\bpdf\b/.test(normalized)
    && /\b(combiner|merge)\b/.test(normalized);
  if (builderMode === "notes" && !isVoiceWorkspace) return null;

  const { appContent, cssContent, indexCssContent } = buildHeuristicDesktopWorkspaceTemplate({
    title,
    isBusinessReportingWorkspace,
    isFileRenamer,
    isPdfCombiner,
    isSnippetManager,
    isVoiceWorkspace
  });

  return {
    summary: `Created a heuristic ${title} desktop workspace with sidebar navigation and a clear primary action.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: appContent },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: `${cssContent}\n` },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: `${indexCssContent}\n` }
    ]
  };
}
