function getSnapshotKindLabel(snapshot: WorkspaceSnapshot): string {
  if (snapshot.kind === "before-task") return "Before task";
  if (snapshot.kind === "after-task") return "After task";
  return "Snapshot";
}

function getSnapshotRestoreActionLabel(snapshot: WorkspaceSnapshot): string {
  if (snapshot.kind === "before-task") return "Restore Before Snapshot";
  if (snapshot.kind === "after-task") return "Restore After Snapshot";
  return "Restore Snapshot";
}

function getRestoreStateForTask(task: AgentTask): AgentSnapshotRestoreResult | null {
  if (!activeAgentRestoreState?.ok) return null;
  return activeAgentRestoreState.taskId === task.id ? activeAgentRestoreState : null;
}

function getRestoreStateBadgeLabel(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") return "Current Before state";
  if (result.snapshotKind === "after-task") return "Current After state";
  return "Current restored state";
}

function getRestoreStateSummary(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") return "Current workspace is on the Before snapshot for this task.";
  if (result.snapshotKind === "after-task") return "Current workspace is on the After snapshot for this task.";
  return "Current workspace matches a restored snapshot for this task.";
}

function getRestoreStateDetail(result: AgentSnapshotRestoreResult): string {
  if (result.snapshotKind === "before-task") {
    return "Generated output from this run may be missing until you restore After.";
  }
  if (result.snapshotKind === "after-task") {
    return "The finished task output should be available in the workspace again.";
  }
  return result.message;
}

function buildSnapshotRestoreWarning(snapshot: WorkspaceSnapshot): string {
  const lines = [
    `${getSnapshotRestoreActionLabel(snapshot)} "${snapshot.label}"?`,
    "",
    "This will replace the current workspace state."
  ];
  if (snapshot.kind === "before-task") {
    lines.push("This snapshot was taken before the linked task started.");
    if (snapshot.targetPathHint) {
      lines.push(`It may remove files created later under: ${snapshot.targetPathHint}`);
    }
  } else if (snapshot.kind === "after-task") {
    lines.push("This snapshot was taken after the linked task completed.");
    if (snapshot.targetPathHint) {
      lines.push(`It should include the generated workspace state under: ${snapshot.targetPathHint}`);
    }
  }
  return lines.join("\n");
}

function buildSnapshotRestoreSummary(snapshot: WorkspaceSnapshot): string {
  const parts = [
    getSnapshotKindLabel(snapshot),
    snapshot.targetPathHint ? `Target: ${snapshot.targetPathHint}` : "",
    `${snapshot.fileCount} files`
  ].filter(Boolean);
  return parts.join(" | ");
}

function formatSnapshotFileSample(snapshot: WorkspaceSnapshot | null): string {
  if (!snapshot) return "No snapshot available.";
  const sampleFiles = snapshot.targetEntries && snapshot.targetEntries.length > 0
    ? snapshot.targetEntries
    : snapshot.topLevelEntries && snapshot.topLevelEntries.length > 0
      ? snapshot.topLevelEntries
      : [];
  return sampleFiles.length > 0 ? sampleFiles.join("\n") : "No file sample available for this snapshot.";
}

function openSnapshotRestoreModal(snapshot: WorkspaceSnapshot): void {
  pendingSnapshotRestoreId = snapshot.id;
  $("snapshot-restore-label").textContent = snapshot.label || snapshot.id;
  $("snapshot-restore-badges").innerHTML = [
    `<span class="agent-history-badge">${escHtml(getSnapshotKindLabel(snapshot))}</span>`,
    `<span class="agent-history-badge">${escHtml(`${snapshot.fileCount} files`)}</span>`,
    snapshot.targetPathHint ? `<span class="agent-history-badge">${escHtml(snapshot.targetPathHint)}</span>` : ""
  ].filter(Boolean).join("");
  $("snapshot-restore-warning").textContent = buildSnapshotRestoreWarning(snapshot);
  $("snapshot-restore-files").textContent = formatSnapshotFileSample(snapshot);
  $("snapshot-restore-confirm-btn").textContent = getSnapshotRestoreActionLabel(snapshot);

  const compareSection = $("snapshot-compare-section");
  const compareBefore = $("snapshot-compare-before");
  const compareAfter = $("snapshot-compare-after");
  const compareSummary = $("snapshot-compare-summary");
  const taskSnapshots = snapshot.taskId ? getSnapshotsForTask(snapshot.taskId) : [];
  const beforeSnapshot = taskSnapshots.find((item) => item.kind === "before-task") ?? null;
  const afterSnapshot = taskSnapshots.find((item) => item.kind === "after-task") ?? null;

  if (beforeSnapshot && afterSnapshot && beforeSnapshot.id !== afterSnapshot.id) {
    compareBefore.textContent = formatSnapshotFileSample(beforeSnapshot);
    compareAfter.textContent = formatSnapshotFileSample(afterSnapshot);
    const beforeEntries = new Set((beforeSnapshot.targetEntries && beforeSnapshot.targetEntries.length > 0
      ? beforeSnapshot.targetEntries
      : beforeSnapshot.topLevelEntries) ?? []);
    const afterEntries = (afterSnapshot.targetEntries && afterSnapshot.targetEntries.length > 0
      ? afterSnapshot.targetEntries
      : afterSnapshot.topLevelEntries) ?? [];
    const addedEntries = afterEntries.filter((entry) => !beforeEntries.has(entry));
    compareSummary.textContent = addedEntries.length > 0
      ? `Only in After: ${addedEntries.slice(0, 4).join(", ")}${addedEntries.length > 4 ? ", ..." : ""}`
      : "Before and After samples overlap heavily for this task.";
    compareSection.style.display = "block";
  } else {
    compareBefore.textContent = "";
    compareAfter.textContent = "";
    compareSummary.textContent = "";
    compareSection.style.display = "none";
  }

  $("snapshot-restore-modal").style.display = "flex";
}

function closeSnapshotRestoreModal(): void {
  pendingSnapshotRestoreId = null;
  $("snapshot-restore-modal").style.display = "none";
  $("snapshot-compare-before").textContent = "";
  $("snapshot-compare-after").textContent = "";
  $("snapshot-compare-summary").textContent = "";
  $("snapshot-compare-section").style.display = "none";
}

function reportSnapshotRestoreResult(message: string, ok: boolean): void {
  setAgentStatus(message, ok ? "ok" : "err");
  if (!ok || rightPanelTab !== "agent") {
    showToast(message, ok ? 2600 : 3800);
  }
}
