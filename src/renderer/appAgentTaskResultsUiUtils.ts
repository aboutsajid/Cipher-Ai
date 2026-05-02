function isTaskTargetMissing(task: AgentTask): boolean {
  return Boolean(task.targetPath) && taskTargetExistsById.get(task.id) === false;
}

function getSnapshotsForTask(taskId: string): WorkspaceSnapshot[] {
  return cachedAgentSnapshots
    .filter((snapshot) => snapshot.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getLatestSnapshotForTask(taskId: string, kind: WorkspaceSnapshot["kind"]): WorkspaceSnapshot | null {
  return getSnapshotsForTask(taskId).find((snapshot) => snapshot.kind === kind) ?? null;
}

function buildTaskSnapshotBadges(task: AgentTask): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const restoreState = getRestoreStateForTask(task);
  if (!beforeSnapshot && !afterSnapshot) return "";

  return `
    <div class="agent-history-badges task-snapshot-badges">
      ${beforeSnapshot ? `<span class="agent-history-badge">${escHtml("Before task")}</span>` : ""}
      ${afterSnapshot ? `<span class="agent-history-badge ok">${escHtml("After task")}</span>` : ""}
      ${restoreState ? `<span class="agent-history-badge ${restoreState.snapshotKind === "before-task" ? "err" : "ok"}">${escHtml(getRestoreStateBadgeLabel(restoreState))}</span>` : ""}
    </div>
  `;
}

function buildTaskMissingTargetState(task: AgentTask): string {
  if (!isTaskTargetMissing(task)) return "";

  return `
    <div class="task-missing-target">
      <div class="task-missing-target-title">Target is not in the current workspace state.</div>
      <div class="task-missing-target-detail">If you restored a Before snapshot, this task output may have been removed.</div>
    </div>
  `;
}

function buildTaskSnapshotActions(task: AgentTask, variant: "main" | "panel"): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const restoreState = getRestoreStateForTask(task);
  if (!beforeSnapshot && !afterSnapshot) return "";

  const attr = variant === "main" ? "data-main-agent-snapshot-id" : "data-agent-history-snapshot-id";
  const showAfterAction = Boolean(afterSnapshot) && restoreState?.snapshotKind !== "after-task" && restoreState?.snapshotKind !== "before-task";
  const showBeforeAction = Boolean(beforeSnapshot) && restoreState?.snapshotKind !== "before-task";
  if (!showAfterAction && !showBeforeAction) return "";

  return `
    <div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"} task-snapshot-actions">
      ${showAfterAction && afterSnapshot ? `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(afterSnapshot.id)}">Restore After</button>` : ""}
      ${showBeforeAction && beforeSnapshot ? `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(beforeSnapshot.id)}">Restore Before</button>` : ""}
    </div>
  `;
}

function buildTaskSnapshotHint(task: AgentTask): string {
  const restoreState = getRestoreStateForTask(task);
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  if (!beforeSnapshot && !afterSnapshot) return "";
  if (restoreState?.snapshotKind === "before-task") {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output when you want to return to the post-task state.</div>';
  }
  if (restoreState?.snapshotKind === "after-task") {
    return '<div class="task-snapshot-hint">Restore Before will undo this task again if you want the pre-task workspace state.</div>';
  }
  if (beforeSnapshot && afterSnapshot) {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output. Restore Before undoes this run.</div>';
  }
  if (afterSnapshot) {
    return '<div class="task-snapshot-hint">Restore After brings back the finished task output state.</div>';
  }
  return '<div class="task-snapshot-hint">Restore Before returns the workspace to the state before this run.</div>';
}

function buildTaskRestoreState(task: AgentTask, variant: "main" | "panel"): string {
  const restoreState = getRestoreStateForTask(task);
  if (!restoreState) return "";

  const tone = restoreState.snapshotKind === "before-task" ? "warn" : restoreState.snapshotKind === "after-task" ? "ok" : "neutral";
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const recoverAttr = variant === "main" ? "data-main-agent-snapshot-id" : "data-agent-history-snapshot-id";
  const recoverCta = restoreState.snapshotKind === "before-task" && afterSnapshot
    ? `<button class="btn-ghost-sm task-restore-state-cta" type="button" ${recoverAttr}="${escHtml(afterSnapshot.id)}">Restore After to Recover</button>`
    : "";

  return `
    <div class="task-restore-state task-restore-state-${tone}">
      <div class="task-restore-state-copy">
        <div class="task-restore-state-title">${escHtml(getRestoreStateSummary(restoreState))}</div>
        <div class="task-restore-state-detail">${escHtml(getRestoreStateDetail(restoreState))}</div>
      </div>
      ${recoverCta}
    </div>
  `;
}

function buildTaskSnapshotDiff(task: AgentTask): string {
  const beforeSnapshot = getLatestSnapshotForTask(task.id, "before-task");
  const afterSnapshot = getLatestSnapshotForTask(task.id, "after-task");
  const afterEntries = afterSnapshot?.targetEntries ?? [];
  const beforeEntries = beforeSnapshot?.targetEntries ?? [];

  if (afterEntries.length === 0 && beforeEntries.length === 0) return "";

  const addedEntries = afterEntries.filter((entry) => !beforeEntries.includes(entry)).slice(0, 4);
  const visibleEntries = (addedEntries.length > 0 ? addedEntries : afterEntries).slice(0, 4);
  if (visibleEntries.length === 0) return "";

  const label = addedEntries.length > 0 ? "After snapshot adds" : "After snapshot includes";
  return `
    <div class="task-snapshot-diff">
      <span class="task-snapshot-diff-label">${escHtml(label)}</span>
      <div class="task-snapshot-diff-list">
        ${visibleEntries.map((entry) => `<span class="agent-history-badge">${escHtml(entry)}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildTaskPrimaryActions(task: AgentTask, variant: "main" | "panel"): string {
  const targetMissing = isTaskTargetMissing(task);
  const previewAttr = variant === "main" ? "data-main-agent-history-preview" : "data-agent-history-preview";
  const openAttr = variant === "main" ? "data-main-agent-history-open-folder" : "data-agent-history-open-folder";
  const copyRunAttr = variant === "main" ? "data-main-agent-history-copy-run" : "data-agent-history-copy-run";
  const previewLabel = variant === "main" ? "Open Preview" : "Preview";
  const openLabel = variant === "main" ? "Open Output" : getArtifactOpenLabel(task.artifactType);
  const rerunLabel = variant === "main" ? "Re-run Command" : getAgentRunCommandButtonLabel(task.output?.primaryAction);
  const buttons: string[] = [];
  const copyRunButton = task.output?.runCommand
    ? `<button class="btn-ghost-sm" type="button" ${copyRunAttr}="${escHtml(task.id)}">${escHtml(rerunLabel)}</button>`
    : "";

  const previewButton = isTaskPreviewable(task)
    ? `<button class="btn-ghost-sm" type="button" ${previewAttr}="${escHtml(task.id)}"${targetMissing ? " disabled" : ""}>${escHtml(previewLabel)}</button>`
    : "";
  const openFolderButton = task.targetPath
    ? `<button class="btn-ghost-sm" type="button" ${openAttr}="${escHtml(task.id)}"${targetMissing ? " disabled" : ""}>${escHtml(openLabel)}</button>`
    : "";

  if (isPreviewPrimaryAction(task.output?.primaryAction)) {
    if (previewButton) buttons.push(previewButton);
    if (copyRunButton) buttons.push(copyRunButton);
    if (openFolderButton) buttons.push(openFolderButton);
  } else if (isRunPrimaryAction(task.output?.primaryAction)) {
    if (copyRunButton) buttons.push(copyRunButton);
    if (openFolderButton) buttons.push(openFolderButton);
    if (previewButton) buttons.push(previewButton);
  } else {
    if (openFolderButton) buttons.push(openFolderButton);
    if (copyRunButton) buttons.push(copyRunButton);
    if (previewButton) buttons.push(previewButton);
  }

  if (buttons.length === 0) return "";
  return `<div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"}">${buttons.join("")}</div>`;
}

function canRestartAgentTask(task: AgentTask): boolean {
  return task.status === "failed" || task.status === "stopped";
}

function getAgentRestartModeLabel(mode: AgentTaskRestartMode): string {
  if (mode === "retry-clean") return "Retry Clean";
  if (mode === "continue-fix") return "Continue Fix";
  return "Retry";
}

function buildTaskRestartActions(task: AgentTask, variant: "main" | "panel"): string {
  if (!canRestartAgentTask(task)) return "";
  const attr = variant === "main" ? "data-main-agent-restart-task-id" : "data-agent-history-restart-task-id";
  const buttons = (["retry", "retry-clean", "continue-fix"] as AgentTaskRestartMode[]).map((mode) => {
    return `<button class="btn-ghost-sm" type="button" ${attr}="${escHtml(task.id)}" data-agent-restart-mode="${escHtml(mode)}">${escHtml(getAgentRestartModeLabel(mode))}</button>`;
  });
  return `<div class="${variant === "main" ? "empty-agent-task-actions" : "agent-history-actions"}">${buttons.join("")}</div>`;
}

function hasPackagingVerificationFailure(task: AgentTask): boolean {
  return (task.verification?.checks ?? []).some((check) => {
    if (check.status !== "failed") return false;
    return check.label === "Windows packaging" || /windows installer packaging failed/i.test(check.details);
  });
}

function buildPackagingRetryButton(task: AgentTask, variant: "main" | "panel"): string {
  if (!canRestartAgentTask(task) || !hasPackagingVerificationFailure(task)) return "";
  const attr = variant === "main" ? "data-main-agent-restart-task-id" : "data-agent-history-restart-task-id";
  return `<button class="btn-ghost-sm task-result-overview-retry" type="button" ${attr}="${escHtml(task.id)}" data-agent-restart-mode="continue-fix">Retry</button>`;
}

function buildVerificationMiniBadges(checks: AgentVerificationReport["checks"] | undefined, limit = 3): string {
  if (!checks || checks.length === 0) return "";
  return checks
    .slice(0, limit)
    .map((check) => `<span class="agent-history-badge ${check.status === "passed" ? "ok" : check.status === "failed" ? "err" : ""}">${escHtml(`${check.label}: ${check.status}`)}</span>`)
    .join("");
}

function buildExhaustedRouteBadges(summary: string | undefined): string {
  const parsed = parseExhaustedAgentModelRoutes(summary ?? "");
  if (!parsed || parsed.routes.length === 0) return "";
  const badges = parsed.routes
    .slice(0, 3)
    .map((route) => `<span class="agent-history-badge err">${escHtml(`${route.model}: ${route.reason}`)}</span>`)
    .join("");
  return `
    <div class="task-result-overview-verify">
      <strong>Models tried</strong>
      <span class="task-result-overview-meta">${badges}</span>
    </div>
  `;
}

function formatDoDGateLabel(gate: string): string {
  if (gate === "installer-smoke") return "installer smoke";
  return gate.replace(/-/g, " ");
}

function buildDoDGateTimeline(task: AgentTask): string {
  const outcomes = task.telemetry?.dodGateOutcomes ?? [];
  if (outcomes.length === 0) return "";

  const gateOrder: AgentTaskDoDGateId[] = ["plan", "implement", "verify", "repair", "package", "installer-smoke", "approve"];
  const byGate = new Map(outcomes.map((entry) => [entry.gate, entry]));
  const ordered = gateOrder
    .map((gate) => byGate.get(gate))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const visible = ordered.length > 0 ? ordered : outcomes;
  const badges = visible.map((entry) => {
    const tone = entry.status === "passed" ? "ok" : entry.status === "failed" ? "err" : "";
    return `<span class="agent-history-badge ${tone}" title="${escHtml(entry.summary ?? "")}">${escHtml(`${formatDoDGateLabel(entry.gate)}: ${entry.status}`)}</span>`;
  }).join("");

  return `
    <div class="task-result-overview-verify">
      <strong>DoD gate timeline</strong>
      <span class="task-result-overview-meta">${badges}</span>
    </div>
  `;
}

function formatStarterProfileLabel(profile?: string): string {
  const normalized = (profile ?? "").trim();
  if (!normalized) return "Custom";
  return normalized
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function formatDomainFocusLabel(domainFocus?: string): string {
  const normalized = (domainFocus ?? "").trim();
  if (!normalized) return "General";
  if (normalized === "crm") return "CRM";
  if (normalized === "admin") return "Internal Admin";
  return normalized
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function buildExecutionSpecSection(spec?: AgentExecutionSpec): string {
  if (!spec) return "";

  const deliverables = spec.deliverables.slice(0, 4);
  const acceptance = spec.acceptanceCriteria.slice(0, 4);
  const qualityGates = spec.qualityGates.slice(0, 4);
  const scriptGroups = spec.requiredScriptGroups.slice(0, 3).map((group) => `${group.label}: ${group.options.join(" / ")}`);
  const fileBadges = spec.requiredFiles.slice(0, 4);

  return `
    <div class="task-result-overview-spec">
      <div class="task-result-overview-spec-head">
        <strong>Execution brief</strong>
        <span class="agent-history-badge">${escHtml(formatStarterProfileLabel(spec.starterProfile))}</span>
      </div>
      <div class="task-result-overview-spec-summary">${escHtml(spec.summary)}</div>
      ${spec.domainFocus ? `<div class="task-result-overview-spec-list"><strong>Domain focus</strong><span>${escHtml(formatDomainFocusLabel(spec.domainFocus))}</span></div>` : ""}
      ${deliverables.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Deliverables</strong><span>${escHtml(deliverables.join(" | "))}</span></div>` : ""}
      ${acceptance.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Acceptance</strong><span>${escHtml(acceptance.join(" | "))}</span></div>` : ""}
      ${qualityGates.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Quality gates</strong><span>${escHtml(qualityGates.join(" | "))}</span></div>` : ""}
      ${scriptGroups.length > 0 ? `<div class="task-result-overview-spec-list"><strong>Required scripts</strong><span>${escHtml(scriptGroups.join(" | "))}</span></div>` : ""}
      ${fileBadges.length > 0 ? `<div class="task-result-overview-meta">${fileBadges.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

function buildReviewList(title: string, items: string[], tone: "default" | "warn" | "err" = "default"): string {
  if (items.length === 0) return "";
  return `
    <div class="task-review-card ${tone !== "default" ? `task-review-card-${tone}` : ""}">
      <strong>${escHtml(title)}</strong>
      <ul class="task-review-list">
        ${items.map((item) => `<li>${escHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function buildTaskReviewSection(task: AgentTask): string {
  const plannedFiles = (task.executionSpec?.requiredFiles ?? []).slice(0, 8);
  const fileOverflow = (task.executionSpec?.requiredFiles?.length ?? 0) - plannedFiles.length;
  const verifierFindings = (task.verification?.checks ?? [])
    .filter((check) => check.status !== "passed")
    .slice(0, 5)
    .map((check) => `${check.label}: ${check.status}. ${check.details}`);
  const repairTrail = task.steps
    .filter((step) => /fix|repair|recovery/i.test(step.title) || /fix|repair/i.test(step.summary ?? ""))
    .slice(-4)
    .map((step) => `${step.title} (${step.status})${step.summary ? `: ${step.summary}` : ""}`);
  const memoryHints = (task.telemetry?.failureMemoryHints ?? []).slice(0, 3);

  if (plannedFiles.length === 0 && verifierFindings.length === 0 && repairTrail.length === 0 && memoryHints.length === 0) {
    return "";
  }

  const plannedItems = fileOverflow > 0
    ? [...plannedFiles, `+${fileOverflow} more planned path${fileOverflow === 1 ? "" : "s"}`]
    : plannedFiles;

  return `
    <div class="task-review-grid">
      ${buildReviewList("Planned file map", plannedItems)}
      ${buildReviewList("Verifier findings", verifierFindings, verifierFindings.some((item) => /failed/i.test(item)) ? "err" : "warn")}
      ${buildReviewList("Repair trail", repairTrail)}
      ${buildReviewList("Memory hints used", memoryHints, "warn")}
    </div>
  `;
}

function buildTaskResultOverview(task: AgentTask, variant: "main" | "panel"): string {
  const artifactLabel = formatAgentArtifactType(task.artifactType);
  const resultTitle = getArtifactResultTitle(task.artifactType, task.output?.primaryAction);
  const usage = task.output?.usageTitle && task.output?.usageDetail
    ? { title: task.output.usageTitle, detail: task.output.usageDetail }
    : getArtifactUsageCopy(task.artifactType);
  const meta = [
    task.output?.primaryAction ? `Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}` : "",
    task.output?.runCommand ? `Run: ${task.output.runCommand}` : "",
    task.output?.workingDirectory ? `Dir: ${task.output.workingDirectory}` : "",
    task.output?.packageName ? `Package: ${task.output.packageName}` : ""
  ].filter(Boolean);
  const dodGateOutcomes = task.telemetry?.dodGateOutcomes ?? [];
  const dodFailedCount = dodGateOutcomes.filter((gate) => gate.status === "failed").length;
  const dodSkippedCount = dodGateOutcomes.filter((gate) => gate.status === "skipped").length;
  const telemetryMeta = [
    task.telemetry?.runMode ? `Run mode: ${task.telemetry.runMode}` : "",
    task.telemetry?.selectedModel ? `Model: ${task.telemetry.selectedModel}` : "",
    task.telemetry?.fallbackUsed && task.telemetry.fallbackModel ? `Fallback: ${task.telemetry.fallbackModel}` : "",
    task.telemetry?.failureStage ? `Failure stage: ${task.telemetry.failureStage}` : "",
    task.telemetry?.failureCategory ? `Failure type: ${task.telemetry.failureCategory}` : "",
    task.telemetry?.finalVerificationResult ? `Verification result: ${task.telemetry.finalVerificationResult}` : "",
    dodGateOutcomes.length
      ? `DoD gates: ${dodGateOutcomes.length} (${dodFailedCount} failed${dodSkippedCount > 0 ? `, ${dodSkippedCount} skipped` : ""})`
      : "",
    task.telemetry?.routeDiagnostics?.blacklistedModels.length
      ? `Blacklisted models: ${task.telemetry.routeDiagnostics.blacklistedModels.length}`
      : "",
    task.telemetry?.routeDiagnostics?.activeStageRoutes.length
      ? `Remembered routes: ${task.telemetry.routeDiagnostics.activeStageRoutes.length}`
      : ""
  ].filter(Boolean);
  const verificationBadges = buildVerificationMiniBadges(task.verification?.checks);
  const exhaustedRouteBadges = buildExhaustedRouteBadges(task.summary);
  const dodGateTimeline = buildDoDGateTimeline(task);
  const packagingRetryButton = buildPackagingRetryButton(task, variant);
  const summary = task.summary ? summarizeAgentTaskSummary(task.summary, task.status) : "";

  if (variant === "main") {
    const compactMeta = [
      task.output?.primaryAction ? `Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}` : "",
      task.output?.runCommand ? `Run: ${task.output.runCommand}` : "",
      task.output?.workingDirectory ? `Dir: ${task.output.workingDirectory}` : ""
    ].filter(Boolean).slice(0, 2);

    return `
      <div class="task-result-overview task-result-overview-compact">
        <div class="task-result-overview-head">
          <div class="task-result-overview-title">${escHtml(task.status === "failed" ? "Result needs attention" : resultTitle)}</div>
          ${task.artifactType ? `<span class="agent-history-badge">${escHtml(artifactLabel)}</span>` : ""}
        </div>
        ${summary ? `<div class="task-result-overview-summary">${escHtml(summary)}</div>` : ""}
        ${dodGateTimeline}
        ${task.verification?.summary ? `<div class="task-result-overview-verify task-result-overview-verify-compact"><strong>Verification</strong><span>${escHtml(task.verification.summary)}</span></div>` : ""}
        ${compactMeta.length > 0 ? `<div class="task-result-overview-meta">${compactMeta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
        ${verificationBadges ? `<div class="task-result-overview-meta">${verificationBadges}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="task-result-overview">
      <div class="task-result-overview-head">
        <div class="task-result-overview-title">${escHtml(task.status === "failed" ? "Result needs attention" : resultTitle)}</div>
        ${task.artifactType ? `<span class="agent-history-badge">${escHtml(artifactLabel)}</span>` : ""}
      </div>
      ${summary ? `<div class="task-result-overview-summary">${escHtml(summary)}</div>` : ""}
      ${dodGateTimeline}
      ${buildExecutionSpecSection(task.executionSpec)}
      ${buildTaskReviewSection(task)}
      ${usage ? `<div class="task-result-overview-usage"><strong>${escHtml(usage.title)}</strong><span>${escHtml(usage.detail)}</span></div>` : ""}
      ${task.verification?.summary ? `<div class="task-result-overview-verify"><div class="task-result-overview-verify-head"><strong>Verification</strong>${packagingRetryButton}</div><span>${escHtml(task.verification.summary)}</span></div>` : ""}
      ${exhaustedRouteBadges}
      ${meta.length > 0 ? `<div class="task-result-overview-meta">${meta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${telemetryMeta.length > 0 ? `<div class="task-result-overview-meta">${telemetryMeta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${verificationBadges ? `<div class="task-result-overview-meta">${verificationBadges}</div>` : ""}
    </div>
  `;
}

function buildParsedResultOverview(parsed: ParsedAgentMessage): string {
  const artifactLabel = parsed.artifactType ? formatAgentArtifactType(parsed.artifactType) : "Task output";
  const resultTitle = getArtifactResultTitle(parsed.artifactType, parsed.output?.primaryAction);
  const usage = parsed.output?.usageDetail
    ? {
      title: parsed.output.usageTitle ?? `Primary action: ${formatAgentPrimaryAction(parsed.output.primaryAction)}`,
      detail: parsed.output.usageDetail
    }
    : getArtifactUsageCopy(parsed.artifactType);
  const meta = [
    parsed.output?.primaryAction ? `Primary action: ${formatAgentPrimaryAction(parsed.output.primaryAction)}` : "",
    parsed.output?.runCommand ? `Run: ${parsed.output.runCommand}` : "",
    parsed.output?.workingDirectory ? `Dir: ${parsed.output.workingDirectory}` : "",
    parsed.output?.packageName ? `Package: ${parsed.output.packageName}` : ""
  ].filter(Boolean);
  const verificationBadges = parsed.verifyChecks.length > 0
    ? parsed.verifyChecks
      .slice(0, 3)
      .map((check) => `<span class="agent-history-badge ${check.status === "passed" ? "ok" : check.status === "failed" ? "err" : ""}">${escHtml(`${check.label}: ${check.status}`)}</span>`)
      .join("")
    : "";
  const exhaustedRouteBadges = buildExhaustedRouteBadges(parsed.summary);

  if (!parsed.summary && !usage && !parsed.verifySummary && meta.length === 0 && !verificationBadges) {
    return "";
  }

  return `
    <section class="agent-card-summary-block agent-card-result-overview">
      <div class="agent-card-summary-label">Result Overview</div>
      <div class="task-result-overview-head">
        <div class="task-result-overview-title">${escHtml(parsed.status === "failed" ? "Result needs attention" : resultTitle)}</div>
        ${parsed.artifactType ? `<span class="agent-history-badge">${escHtml(artifactLabel)}</span>` : ""}
      </div>
      ${parsed.summary ? `<div class="task-result-overview-summary">${escHtml(summarizeAgentTaskSummary(parsed.summary, (parsed.status as AgentTask["status"]) || "completed"))}</div>` : ""}
      ${usage ? `<div class="task-result-overview-usage"><strong>${escHtml(usage.title)}</strong><span>${escHtml(usage.detail)}</span></div>` : ""}
      ${parsed.verifySummary ? `<div class="task-result-overview-verify"><strong>Verification</strong><span>${escHtml(parsed.verifySummary)}</span></div>` : ""}
      ${exhaustedRouteBadges}
      ${meta.length > 0 ? `<div class="task-result-overview-meta">${meta.map((item) => `<span class="agent-history-badge">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${verificationBadges ? `<div class="task-result-overview-meta">${verificationBadges}</div>` : ""}
    </section>
  `;
}
