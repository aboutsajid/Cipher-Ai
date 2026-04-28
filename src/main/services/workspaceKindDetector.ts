type WorkspaceKind = "static" | "react" | "generic";

export async function detectWorkspaceKind(
  workingDirectory: string,
  options: {
    allFilesExist: (paths: string[]) => Promise<boolean>;
    joinWorkspacePath: (...parts: string[]) => string;
  }
): Promise<WorkspaceKind> {
  const staticFiles = [
    options.joinWorkspacePath(workingDirectory, "index.html"),
    options.joinWorkspacePath(workingDirectory, "styles.css"),
    options.joinWorkspacePath(workingDirectory, "app.js")
  ];
  const reactFiles = [
    options.joinWorkspacePath(workingDirectory, "src/main.tsx"),
    options.joinWorkspacePath(workingDirectory, "src/App.tsx")
  ];

  const hasStatic = await options.allFilesExist(staticFiles);
  if (hasStatic) return "static";
  const hasReact = await options.allFilesExist(reactFiles);
  if (hasReact) return "react";
  return "generic";
}
