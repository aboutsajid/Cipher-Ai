function syncActiveAgentTaskSelectionUi(): void {
  renderAgentHistory(cachedAgentTasks);
}

function renderAgentSnapshots(snapshots: WorkspaceSnapshot[]): void {
  const snapshotsEl = $("agent-snapshots");
  cachedAgentSnapshots = snapshots;

  if (snapshots.length === 0) {
    snapshotsEl.innerHTML = '<div class="agent-history-empty">Rollback snapshots will appear here after agent tasks start.</div>';
    return;
  }

  snapshotsEl.innerHTML = snapshots.slice(0, 10).map((snapshot) => `
    <div class="agent-history-item">
      <div class="agent-history-top">
        <div class="agent-history-title">${escHtml(snapshot.label || snapshot.id)}</div>
        <div class="agent-history-meta">${escHtml(formatAgentTaskTimestamp(snapshot.createdAt))}</div>
      </div>
      <div class="agent-history-summary">${escHtml(snapshot.id)}</div>
      <div class="agent-snapshot-meta">
        <span class="agent-history-badge">${escHtml(getSnapshotKindLabel(snapshot))}</span>
        <span class="agent-history-badge">${escHtml(`${snapshot.fileCount} files`)}</span>
        ${snapshot.taskId ? `<span class="agent-history-badge">${escHtml(snapshot.taskId)}</span>` : ""}
        ${snapshot.targetPathHint ? `<span class="agent-history-badge">${escHtml(snapshot.targetPathHint)}</span>` : ""}
      </div>
      <div class="agent-snapshot-actions">
        ${snapshot.taskId ? `<button class="btn-ghost-sm" type="button" data-agent-snapshot-task-id="${escHtml(snapshot.taskId)}">View Task</button>` : ""}
        <button class="btn-ghost-sm" type="button" data-agent-snapshot-id="${escHtml(snapshot.id)}">Restore</button>
      </div>
    </div>
  `).join("");
}

async function refreshAgentSnapshots(): Promise<void> {
  activeAgentRestoreState = await window.api.agent.getRestoreState();
  const snapshots = await window.api.agent.listSnapshots();
  renderAgentSnapshots(snapshots);
}
