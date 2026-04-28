import type { AgentArtifactType } from "../../shared/types";
import type { BuilderMode, DomainFocus, StarterProfile, WorkspaceKind } from "./starterDomainFocusHeuristics";
import type { TaskExecutionSpecScriptGroup } from "./taskExecutionSpecBuilders";

export interface TaskExecutionSpecPlan {
  summary: string;
  starterProfile: StarterProfile;
  domainFocus: DomainFocus;
  deliverables: string[];
  acceptanceCriteria: string[];
  qualityGates: string[];
  requiredFiles: string[];
  requiredScriptGroups: TaskExecutionSpecScriptGroup[];
  expectsReadme: boolean;
}

export function buildTaskExecutionSpec(
  prompt: string,
  workingDirectory: string,
  workspaceKind: WorkspaceKind,
  builderMode: BuilderMode,
  promptArtifact: AgentArtifactType | null,
  requestedPaths: string[],
  options: {
    buildSpecAcceptanceCriteria: (
      starterProfile: StarterProfile,
      builderMode: BuilderMode,
      promptArtifact: AgentArtifactType | null,
      domainFocus: DomainFocus
    ) => string[];
    buildSpecDeliverables: (
      starterProfile: StarterProfile,
      workspaceKind: WorkspaceKind,
      expectsReadme: boolean
    ) => string[];
    buildSpecQualityGates: (
      starterProfile: StarterProfile,
      workspaceKind: WorkspaceKind,
      expectsReadme: boolean
    ) => string[];
    buildSpecRequiredFiles: (
      workingDirectory: string,
      workspaceKind: WorkspaceKind,
      starterProfile: StarterProfile,
      expectsReadme: boolean,
      requestedPaths: string[]
    ) => string[];
    buildSpecRequiredScriptGroups: (
      starterProfile: StarterProfile,
      workspaceKind: WorkspaceKind
    ) => TaskExecutionSpecScriptGroup[];
    describeDomainFocus: (domainFocus: DomainFocus) => string;
    describeStarterProfile: (profile: StarterProfile) => string;
    inferDomainFocus: (
      prompt: string,
      starterProfile: StarterProfile,
      promptArtifact: AgentArtifactType | null
    ) => DomainFocus;
    inferStarterProfile: (
      promptArtifact: AgentArtifactType | null,
      builderMode: BuilderMode,
      workspaceKind: WorkspaceKind
    ) => StarterProfile;
    joinWorkspacePath: (...parts: string[]) => string;
    looksLikeNewProjectPrompt: (normalizedPrompt: string) => boolean;
  }
): TaskExecutionSpecPlan {
  const starterProfile = options.inferStarterProfile(promptArtifact, builderMode, workspaceKind);
  const domainFocus = options.inferDomainFocus(prompt, starterProfile, promptArtifact);
  const expectsReadme = options.looksLikeNewProjectPrompt((prompt ?? "").trim().toLowerCase())
    || requestedPaths.length > 0
    || options.joinWorkspacePath(workingDirectory).startsWith("generated-apps/");
  const requiredFiles = options.buildSpecRequiredFiles(workingDirectory, workspaceKind, starterProfile, expectsReadme, requestedPaths);
  const requiredScriptGroups = options.buildSpecRequiredScriptGroups(starterProfile, workspaceKind);
  const deliverables = options.buildSpecDeliverables(starterProfile, workspaceKind, expectsReadme);
  const acceptanceCriteria = options.buildSpecAcceptanceCriteria(starterProfile, builderMode, promptArtifact, domainFocus);
  const qualityGates = options.buildSpecQualityGates(starterProfile, workspaceKind, expectsReadme);
  return {
    summary: `${options.describeStarterProfile(starterProfile)} for ${options.describeDomainFocus(domainFocus)} workflows with ${acceptanceCriteria.length} acceptance gate(s).`,
    starterProfile,
    domainFocus,
    deliverables,
    acceptanceCriteria,
    qualityGates,
    requiredFiles,
    requiredScriptGroups,
    expectsReadme
  };
}
