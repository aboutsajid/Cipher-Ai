function renderAgentTask(task: AgentTask | null, logs: string[]): void {
  const stepsEl = $("agent-steps");
  const logEl = $("agent-log");
  const targetEl = $("agent-target-msg");

  if (!task) {
    activeAgentTaskStatus = null;
    stepsEl.textContent = "No agent task started yet.";
    logEl.textContent = logs.join("\n");
    targetEl.textContent = "Target: workspace root";
    return;
  }

  const restoreState = getRestoreStateForTask(task);
  const activity = buildAgentActivityLabel(task);
  const stepLines = [
    `Status: ${task.status}`,
    `Activity: ${activity}`,
    `Prompt: ${task.prompt}`,
    ...(task.attachments?.length ? [`Attachments: ${task.attachments.map((attachment) => attachment.name).join(" | ")}`] : []),
    ...(task.artifactType ? [`Artifact: ${formatAgentArtifactType(task.artifactType)}`] : []),
    ...(task.executionSpec?.starterProfile ? [`Starter profile: ${formatStarterProfileLabel(task.executionSpec.starterProfile)}`] : []),
    ...(task.executionSpec?.domainFocus ? [`Domain focus: ${formatDomainFocusLabel(task.executionSpec.domainFocus)}`] : []),
    ...(task.executionSpec?.summary ? [`Execution brief: ${task.executionSpec.summary}`] : []),
    ...(task.executionSpec?.deliverables?.length ? [`Deliverables: ${task.executionSpec.deliverables.join(" | ")}`] : []),
    ...(task.executionSpec?.acceptanceCriteria?.length ? [`Acceptance: ${task.executionSpec.acceptanceCriteria.join(" | ")}`] : []),
    ...(task.executionSpec?.qualityGates?.length ? [`Quality gates: ${task.executionSpec.qualityGates.join(" | ")}`] : []),
    ...(task.executionSpec?.requiredFiles?.length ? [`Planned file map: ${task.executionSpec.requiredFiles.slice(0, 8).join(" | ")}`] : []),
    ...(task.output?.primaryAction ? [`Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}`] : []),
    ...(task.output?.runCommand ? [`Run command: ${task.output.runCommand}`] : []),
    ...(task.output?.workingDirectory ? [`Working directory: ${task.output.workingDirectory}`] : []),
    ...(task.output?.packageName ? [`Package: ${task.output.packageName}`] : []),
    ...(task.output?.usageDetail ? [`How to use: ${task.output.usageDetail}`] : []),
    ...(!task.output?.usageDetail && getArtifactUsageCopy(task.artifactType) ? [`How to use: ${getArtifactUsageCopy(task.artifactType)?.detail}`] : []),
    ...(task.targetPath ? [`Target: ${task.targetPath}`] : []),
    ...(restoreState ? [`Workspace state: ${getRestoreStateSummary(restoreState)}`] : []),
    ...(task.rollbackSnapshotId ? [`Rollback: ${task.rollbackSnapshotId}`] : []),
    ...(task.completionSnapshotId ? [`After snapshot: ${task.completionSnapshotId}`] : []),
    ...(task.verification ? [`Verification: ${task.verification.summary}`] : []),
    ...(task.verification?.checks.map((check) => `Verification check: ${check.label} - ${check.status} - ${check.details}`) ?? []),
    ...(task.telemetry?.failureMemoryHints?.length ? [`Memory hints used: ${task.telemetry.failureMemoryHints.join(" | ")}`] : []),
    ...(task.summary ? [`Summary: ${summarizeAgentTaskSummary(task.summary, task.status)}`] : []),
    ...buildExhaustedRouteText(task.summary),
    "",
    ...task.steps.map((step) => `${step.status.toUpperCase()} - ${step.title}${step.summary ? ` - ${step.summary}` : ""}`)
  ];
  stepsEl.textContent = stepLines.join("\n").trim();
  logEl.textContent = logs.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  targetEl.textContent = restoreState
    ? `Target: ${task.targetPath ?? "workspace root"} | ${task.artifactType ? `${formatAgentArtifactType(task.artifactType)} | ` : ""}${getRestoreStateSummary(restoreState)}`
    : `Target: ${task.targetPath ?? "workspace root"}${task.artifactType ? ` | ${formatAgentArtifactType(task.artifactType)}` : ""}`;
}
