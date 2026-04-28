interface StructuredEdit {
  path: string;
  content: string;
}

export interface HeuristicWorkspaceResult {
  summary: string;
  edits: StructuredEdit[];
}

export interface NotesFeatureFlags {
  wantsSearch: boolean;
  wantsDelete: boolean;
  wantsAdd: boolean;
}

export interface HeuristicNotesWorkspaceInput {
  title: string;
  workingDirectory: string;
  isStaticWorkspace: boolean;
  features: NotesFeatureFlags;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildStaticNotesHtml: (title: string) => string;
  buildStaticNotesCss: () => string;
  buildStaticNotesJs: (title: string, features: NotesFeatureFlags) => string;
  buildNotesAppTsx: (title: string, features: NotesFeatureFlags) => string;
  buildNotesAppCss: () => string;
  buildNotesIndexCss: () => string;
}

export interface HeuristicKanbanWorkspaceInput {
  title: string;
  workingDirectory: string;
  isStaticWorkspace: boolean;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildStaticKanbanHtml: (title: string) => string;
  buildStaticKanbanCss: () => string;
  buildStaticKanbanJs: () => string;
  buildKanbanBoardTsx: (title: string) => string;
  buildKanbanBoardCss: () => string;
  buildKanbanBoardIndexCss: () => string;
}

function buildNotesFeatureSummary(features: NotesFeatureFlags): string {
  return [
    features.wantsAdd ? "add" : null,
    features.wantsDelete ? "delete" : null,
    features.wantsSearch ? "search" : null
  ].filter(Boolean).join(", ") || "core";
}

export function buildHeuristicNotesWorkspace(input: HeuristicNotesWorkspaceInput): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    isStaticWorkspace,
    features,
    resolveWorkspacePath,
    buildStaticNotesHtml,
    buildStaticNotesCss,
    buildStaticNotesJs,
    buildNotesAppTsx,
    buildNotesAppCss,
    buildNotesIndexCss
  } = input;

  const featureSummary = buildNotesFeatureSummary(features);
  if (isStaticWorkspace) {
    return {
      summary: `Created a heuristic ${title} static notes app with ${featureSummary} features.`,
      edits: [
        { path: resolveWorkspacePath(workingDirectory, "index.html"), content: buildStaticNotesHtml(title) },
        { path: resolveWorkspacePath(workingDirectory, "styles.css"), content: buildStaticNotesCss() },
        { path: resolveWorkspacePath(workingDirectory, "app.js"), content: buildStaticNotesJs(title, features) }
      ]
    };
  }

  return {
    summary: `Created a heuristic ${title} React notes app with ${featureSummary} features.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: buildNotesAppTsx(title, features) },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildNotesAppCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildNotesIndexCss() }
    ]
  };
}

export function buildHeuristicKanbanWorkspace(input: HeuristicKanbanWorkspaceInput): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    isStaticWorkspace,
    resolveWorkspacePath,
    buildStaticKanbanHtml,
    buildStaticKanbanCss,
    buildStaticKanbanJs,
    buildKanbanBoardTsx,
    buildKanbanBoardCss,
    buildKanbanBoardIndexCss
  } = input;

  if (isStaticWorkspace) {
    return {
      summary: `Created a heuristic ${title} static kanban board with add-task and status-flow interactions.`,
      edits: [
        { path: resolveWorkspacePath(workingDirectory, "index.html"), content: buildStaticKanbanHtml(title) },
        { path: resolveWorkspacePath(workingDirectory, "styles.css"), content: buildStaticKanbanCss() },
        { path: resolveWorkspacePath(workingDirectory, "app.js"), content: buildStaticKanbanJs() }
      ]
    };
  }

  return {
    summary: `Created a heuristic ${title} React kanban board with add-task and status-flow interactions.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: buildKanbanBoardTsx(title) },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildKanbanBoardCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildKanbanBoardIndexCss() }
    ]
  };
}
