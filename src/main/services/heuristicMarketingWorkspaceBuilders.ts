interface StructuredEdit {
  path: string;
  content: string;
}

export interface HeuristicWorkspaceResult {
  summary: string;
  edits: StructuredEdit[];
}

export interface HeuristicLandingWorkspaceInput {
  title: string;
  workingDirectory: string;
  isStaticWorkspace: boolean;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildStaticLandingHtml: (title: string) => string;
  buildStaticLandingCss: () => string;
  buildStaticLandingJs: (title: string) => string;
  buildLandingPageTsx: (title: string) => string;
  buildLandingPageCss: () => string;
  buildLandingIndexCss: () => string;
}

export interface HeuristicMarketingPageWorkspaceInput {
  title: string;
  workingDirectory: string;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildAppTsx: (title: string) => string;
  buildAppCss: () => string;
  buildIndexCss: () => string;
  summaryPrefix: string;
}

export function buildHeuristicLandingWorkspace(input: HeuristicLandingWorkspaceInput): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    isStaticWorkspace,
    resolveWorkspacePath,
    buildStaticLandingHtml,
    buildStaticLandingCss,
    buildStaticLandingJs,
    buildLandingPageTsx,
    buildLandingPageCss,
    buildLandingIndexCss
  } = input;

  if (isStaticWorkspace) {
    return {
      summary: `Created a heuristic ${title} static landing page with structured sections and polished styling.`,
      edits: [
        { path: resolveWorkspacePath(workingDirectory, "index.html"), content: buildStaticLandingHtml(title) },
        { path: resolveWorkspacePath(workingDirectory, "styles.css"), content: buildStaticLandingCss() },
        { path: resolveWorkspacePath(workingDirectory, "app.js"), content: buildStaticLandingJs(title) }
      ]
    };
  }

  return {
    summary: `Created a heuristic ${title} landing page with structured sections and polished styling.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: buildLandingPageTsx(title) },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildLandingPageCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildLandingIndexCss() }
    ]
  };
}

export function buildHeuristicMarketingPageWorkspace(
  input: HeuristicMarketingPageWorkspaceInput
): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    resolveWorkspacePath,
    buildAppTsx,
    buildAppCss,
    buildIndexCss,
    summaryPrefix
  } = input;

  return {
    summary: `Created a heuristic ${title} ${summaryPrefix}.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: buildAppTsx(title) },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildAppCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildIndexCss() }
    ]
  };
}
