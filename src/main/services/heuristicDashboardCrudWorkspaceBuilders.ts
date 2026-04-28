import type { HeuristicDomainFocus } from "./heuristicDashboardCrudDomainContent";

interface StructuredEdit {
  path: string;
  content: string;
}

export interface HeuristicWorkspaceResult {
  summary: string;
  edits: StructuredEdit[];
}

export interface HeuristicDashboardWorkspaceInput {
  title: string;
  workingDirectory: string;
  isStaticWorkspace: boolean;
  domainFocus: HeuristicDomainFocus;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildStaticDashboardHtml: (title: string, domainFocus: HeuristicDomainFocus) => string;
  buildStaticDashboardCss: () => string;
  buildStaticDashboardJs: (domainFocus: HeuristicDomainFocus) => string;
  buildDashboardTsx: (title: string, domainFocus: HeuristicDomainFocus) => string;
  buildDashboardCss: () => string;
  buildDashboardIndexCss: () => string;
}

export interface HeuristicCrudWorkspaceInput {
  title: string;
  workingDirectory: string;
  isStaticWorkspace: boolean;
  isVendorPayments: boolean;
  domainFocus: HeuristicDomainFocus;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  buildStaticCrudHtml: (title: string, domainFocus: HeuristicDomainFocus) => string;
  buildStaticCrudCss: () => string;
  buildStaticCrudJs: (title: string, domainFocus: HeuristicDomainFocus) => string;
  buildCrudAppTsx: (title: string, domainFocus: HeuristicDomainFocus) => string;
  buildVendorPaymentsCrudAppTsx: (title: string) => string;
  buildCrudAppCss: () => string;
  buildCrudIndexCss: () => string;
}

export function buildHeuristicDashboardWorkspace(input: HeuristicDashboardWorkspaceInput): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    isStaticWorkspace,
    domainFocus,
    resolveWorkspacePath,
    buildStaticDashboardHtml,
    buildStaticDashboardCss,
    buildStaticDashboardJs,
    buildDashboardTsx,
    buildDashboardCss,
    buildDashboardIndexCss
  } = input;

  if (isStaticWorkspace) {
    return {
      summary: `Created a heuristic ${title} static dashboard with metrics, activity, and responsive layout.`,
      edits: [
        { path: resolveWorkspacePath(workingDirectory, "index.html"), content: buildStaticDashboardHtml(title, domainFocus) },
        { path: resolveWorkspacePath(workingDirectory, "styles.css"), content: buildStaticDashboardCss() },
        { path: resolveWorkspacePath(workingDirectory, "app.js"), content: buildStaticDashboardJs(domainFocus) }
      ]
    };
  }

  return {
    summary: `Created a heuristic ${title} dashboard with metrics, activity, and responsive layout.`,
    edits: [
      { path: resolveWorkspacePath(workingDirectory, "src/App.tsx"), content: buildDashboardTsx(title, domainFocus) },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildDashboardCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildDashboardIndexCss() }
    ]
  };
}

export function buildHeuristicCrudWorkspace(input: HeuristicCrudWorkspaceInput): HeuristicWorkspaceResult {
  const {
    title,
    workingDirectory,
    isStaticWorkspace,
    isVendorPayments,
    domainFocus,
    resolveWorkspacePath,
    buildStaticCrudHtml,
    buildStaticCrudCss,
    buildStaticCrudJs,
    buildCrudAppTsx,
    buildVendorPaymentsCrudAppTsx,
    buildCrudAppCss,
    buildCrudIndexCss
  } = input;

  if (isStaticWorkspace) {
    return {
      summary: `Created a heuristic ${title} static CRUD app with record management and responsive layout.`,
      edits: [
        { path: resolveWorkspacePath(workingDirectory, "index.html"), content: buildStaticCrudHtml(title, domainFocus) },
        { path: resolveWorkspacePath(workingDirectory, "styles.css"), content: buildStaticCrudCss() },
        { path: resolveWorkspacePath(workingDirectory, "app.js"), content: buildStaticCrudJs(title, domainFocus) }
      ]
    };
  }

  return {
    summary: `Created a heuristic ${title} CRUD app with record management, filters, and responsive layout.`,
    edits: [
      {
        path: resolveWorkspacePath(workingDirectory, "src/App.tsx"),
        content: isVendorPayments
          ? buildVendorPaymentsCrudAppTsx(title)
          : buildCrudAppTsx(title, domainFocus)
      },
      { path: resolveWorkspacePath(workingDirectory, "src/App.css"), content: buildCrudAppCss() },
      { path: resolveWorkspacePath(workingDirectory, "src/index.css"), content: buildCrudIndexCss() }
    ]
  };
}
