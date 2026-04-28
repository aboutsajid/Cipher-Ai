import type { AgentArtifactType } from "../../shared/types";
import type { DomainFocus } from "./starterDomainFocusHeuristics";

type WorkspaceKind = "static" | "react" | "generic";

export interface TaskRepositoryContextLike {
  summary: string;
  conventions: string[];
}

export interface TaskExecutionSpecLike {
  domainFocus: DomainFocus;
  deliverables: string[];
  acceptanceCriteria: string[];
}

export interface TaskWorkItemPlan {
  title: string;
  instruction: string;
  allowedPaths?: string[];
}

export function buildTaskWorkItems(
  prompt: string,
  workingDirectory: string,
  workspaceKind: WorkspaceKind,
  requestedPaths: string[] = [],
  spec: TaskExecutionSpecLike | undefined,
  repositoryContext: TaskRepositoryContextLike | undefined,
  options: {
    describeDomainFocus: (domainFocus: DomainFocus) => string;
    inferArtifactTypeFromPrompt: (normalizedPrompt: string) => AgentArtifactType | null;
    isPathInsideWorkingDirectory: (path: string, workingDirectory: string) => boolean;
    joinWorkspacePath: (...parts: string[]) => string;
  }
): TaskWorkItemPlan[] {
  const normalized = (prompt ?? "").trim().toLowerCase();
  const promptArtifact = options.inferArtifactTypeFromPrompt(normalized);
  const targetHint = workingDirectory && workingDirectory !== "." ? ` inside ${workingDirectory}` : "";
  const sharedPaths = [options.joinWorkspacePath(workingDirectory, "package.json")];
  const staticPaths = [
    ...sharedPaths,
    options.joinWorkspacePath(workingDirectory, "index.html"),
    options.joinWorkspacePath(workingDirectory, "styles.css"),
    options.joinWorkspacePath(workingDirectory, "app.js")
  ];
  const reactPaths = [
    ...sharedPaths,
    options.joinWorkspacePath(workingDirectory, "src/main.tsx"),
    options.joinWorkspacePath(workingDirectory, "src/App.tsx"),
    options.joinWorkspacePath(workingDirectory, "src/App.css"),
    options.joinWorkspacePath(workingDirectory, "src/index.css"),
    options.joinWorkspacePath(workingDirectory, "index.html")
  ];
  const scriptToolPaths = [
    ...sharedPaths,
    options.joinWorkspacePath(workingDirectory, "src/index.js"),
    options.joinWorkspacePath(workingDirectory, "src/index.ts"),
    options.joinWorkspacePath(workingDirectory, "bin/cli.js"),
    options.joinWorkspacePath(workingDirectory, "bin/cli.mjs"),
    options.joinWorkspacePath(workingDirectory, "README.md")
  ];
  const libraryPaths = [
    ...sharedPaths,
    options.joinWorkspacePath(workingDirectory, "src/index.ts"),
    options.joinWorkspacePath(workingDirectory, "src/index.js"),
    options.joinWorkspacePath(workingDirectory, "README.md")
  ];
  const servicePaths = [
    ...sharedPaths,
    options.joinWorkspacePath(workingDirectory, "src/server.js"),
    options.joinWorkspacePath(workingDirectory, "src/server.ts"),
    options.joinWorkspacePath(workingDirectory, "src/index.js"),
    options.joinWorkspacePath(workingDirectory, "src/index.ts"),
    options.joinWorkspacePath(workingDirectory, "README.md")
  ];
  const requested = requestedPaths.filter((path) => options.isPathInsideWorkingDirectory(path, workingDirectory));
  const staticAllowedPaths = [...new Set([...staticPaths, ...requested])];
  const reactAllowedPaths = [...new Set([...reactPaths, ...requested])];
  const scriptToolAllowedPaths = [...new Set([...scriptToolPaths, ...requested])];
  const libraryAllowedPaths = [...new Set([...libraryPaths, ...requested])];
  const serviceAllowedPaths = [...new Set([...servicePaths, ...requested])];
  const preferredPaths = workspaceKind === "static"
    ? staticAllowedPaths
    : workspaceKind === "react"
      ? reactAllowedPaths
      : promptArtifact === "script-tool"
        ? scriptToolAllowedPaths
        : promptArtifact === "library"
          ? libraryAllowedPaths
          : promptArtifact === "api-service"
            ? serviceAllowedPaths
          : reactAllowedPaths;
  const executionBrief = spec
    ? ` Domain focus: ${options.describeDomainFocus(spec.domainFocus)}. Deliverables: ${spec.deliverables.join("; ")}. Acceptance: ${spec.acceptanceCriteria.join(" ")}.`
    : "";
  const repoBrief = repositoryContext?.conventions.length
    ? ` Repository conventions: ${repositoryContext.conventions.join(" ")}`
    : repositoryContext?.summary
      ? ` ${repositoryContext.summary}`
      : "";

  if (["kanban", "task board"].some((term) => normalized.includes(term))) {
    return [
      {
        title: "Build kanban layout",
        instruction: `Create the main kanban board layout${targetHint} with todo, in progress, and done columns plus clear task cards.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Add task creation and status flow",
        instruction: `Implement add-task and status-change interactions${targetHint}. Users should be able to create a task and move it between visible columns.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Polish board design",
        instruction: `Improve the kanban board styling${targetHint} so it feels intentional, readable, and responsive.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
  }

  if (["notes app", "note app", "notes", "todo"].some((term) => normalized.includes(term))) {
    const items: TaskWorkItemPlan[] = [
      {
        title: "Build notes interface",
        instruction: `Create or improve the main notes app interface${targetHint}. Replace starter content with a real notes experience.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
    if (normalized.includes("add") || normalized.includes("create")) {
      items.push({
        title: "Add note creation flow",
        instruction: `Implement a reliable add-note flow${targetHint}. Users should be able to enter a note title and body and save it into the visible notes list.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      });
    }
    if (normalized.includes("search")) {
      items.push({
        title: "Add search and filtering",
        instruction: `Implement note search/filtering${targetHint}. Searching should reduce the visible notes list based on title or body matches.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      });
    }
    if (normalized.includes("delete") || normalized.includes("remove")) {
      items.push({
        title: "Add note deletion",
        instruction: `Add note deletion controls${targetHint}. Users should be able to remove notes from the list cleanly.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      });
    }
    if (normalized.includes("ui") || normalized.includes("design") || normalized.includes("improve")) {
      items.push({
        title: "Polish visual design",
        instruction: `Improve layout and styling${targetHint}. Make the notes UI feel intentional, clean, and responsive.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      });
    }
    return items;
  }

  if (
    promptArtifact === "script-tool"
    || promptArtifact === "library"
    || promptArtifact === "api-service"
    || promptArtifact === "desktop-app"
  ) {
    return [{
      title: "Implement requested changes",
      instruction: `Implement the requested ${promptArtifact.replace(/-/g, " ")} updates${targetHint}. Keep the solution inside the planned package files and avoid unrelated UI scaffolding.${executionBrief}${repoBrief}`,
      allowedPaths: preferredPaths
    }];
  }

  if (["landing page", "website", "site"].some((term) => normalized.includes(term))) {
    return [
      {
        title: "Build page structure",
        instruction: `Create the main page layout${targetHint} with complete sections and usable content.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Polish visual design",
        instruction: `Improve styling and hierarchy${targetHint} so the interface looks intentional and responsive.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
  }

  if (["dashboard", "admin panel", "analytics"].some((term) => normalized.includes(term))) {
    return [
      {
        title: "Build dashboard structure",
        instruction: `Create the main dashboard layout${targetHint} with stats, activity, and clear navigation areas.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Add data cards and tables",
        instruction: `Add dashboard content blocks${targetHint} including metric cards, a simple chart area, and recent activity or table rows.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Polish dashboard design",
        instruction: `Improve dashboard styling${targetHint} so it feels clear, intentional, and responsive.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
  }

  if (["crud", "inventory app", "contacts app", "admin tool", "record manager"].some((term) => normalized.includes(term))) {
    return [
      {
        title: "Build CRUD layout",
        instruction: `Create the main CRUD app layout${targetHint} with a clear form area, records list, and useful summary section.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Add create, edit, and delete flows",
        instruction: `Implement create, edit, and delete interactions${targetHint}. Users should be able to manage visible records cleanly from the interface.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      },
      {
        title: "Polish CRUD experience",
        instruction: `Improve the CRUD app styling${targetHint} so it feels intentional, responsive, and easy to scan.${executionBrief}${repoBrief}`,
        allowedPaths: preferredPaths
      }
    ];
  }

  return [
    {
      title: "Implement requested changes",
      instruction: `${prompt}${executionBrief}${repoBrief}`,
      allowedPaths: preferredPaths
    }
  ];
}
