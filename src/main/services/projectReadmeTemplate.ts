import type { AgentArtifactType } from "../../shared/types";

interface BuildProjectReadmeTemplateOptions {
  projectName: string;
  artifactType: AgentArtifactType | null | undefined;
  starterProfileLabel: string;
  workingDirectory: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  qualityGates: string[];
}

function buildRunLines(
  artifactType: AgentArtifactType | null | undefined,
  starterProfileLabel: string
): string[] {
  const runLines: string[] = [];
  if (artifactType === "desktop-app") {
    runLines.push("- `npm install`");
    runLines.push("- `npm start`");
    runLines.push("- `npm run build`");
    runLines.push("- `npm run package:win`");
  } else if (artifactType === "api-service" || artifactType === "script-tool") {
    runLines.push("- `npm install`");
    runLines.push("- `npm start`");
    runLines.push("- `npm run build`");
  } else if (artifactType === "library") {
    runLines.push("- `npm install`");
    runLines.push("- `npm run build`");
  } else if (starterProfileLabel === "Static marketing starter") {
    runLines.push("- `npm run build`");
    runLines.push("- `npm start`");
  } else {
    runLines.push("- `npm install`");
    runLines.push("- `npm run dev`");
    runLines.push("- `npm run build`");
  }
  return runLines;
}

export function buildProjectReadmeTemplate(options: BuildProjectReadmeTemplateOptions): string {
  const runLines = buildRunLines(options.artifactType, options.starterProfileLabel);
  return [
    `# ${options.projectName}`,
    "",
    `Starter profile: ${options.starterProfileLabel}.`,
    `Target folder: \`${options.workingDirectory}\`.`,
    "",
    "## Deliverables",
    ...options.deliverables.map((item) => `- ${item}`),
    "",
    "## Acceptance Criteria",
    ...options.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Quality Gates",
    ...options.qualityGates.map((item) => `- ${item}`),
    "",
    "## Run",
    ...runLines,
    ""
  ].join("\n");
}
