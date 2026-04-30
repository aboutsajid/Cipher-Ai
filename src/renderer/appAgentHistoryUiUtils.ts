function buildMainChatCards(chats: ChatSummary[]): string {
  const recentChats = chats.slice(0, 4);
  if (recentChats.length === 0) {
    return '<div class="empty-panel-note">Your recent conversations will appear here for quick access.</div>';
  }

  return recentChats.map((chat) => `
    <div class="empty-chat-card${chat.id === currentChatId ? " active" : ""}" data-main-chat-history-id="${escHtml(chat.id)}">
      <div class="empty-chat-top">
        <strong>${escHtml(chat.title)}</strong>
        <span>${escHtml(formatUiTime(chat.updatedAt))}</span>
      </div>
      <div class="empty-chat-meta">
        <span class="agent-history-badge">${escHtml(`${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`)}</span>
      </div>
    </div>
  `).join("");
}

function buildMainAgentTaskCards(tasks: AgentTask[]): string {
  const recentTasks = tasks.slice(0, 4);
  if (recentTasks.length === 0) {
    return '<div class="empty-panel-note">Run your first supervised task and it will appear here.</div>';
  }

  return recentTasks.map((task) => {
    const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
    const targetMissing = isTaskTargetMissing(task);
    const passedCount = (task.verification?.checks ?? []).filter((check) => check.status === "passed").length;
    const failedCount = (task.verification?.checks ?? []).filter((check) => check.status === "failed").length;
    const skippedCount = (task.verification?.checks ?? []).filter((check) => check.status === "skipped").length;
    const verificationBadges: string[] = [];
    if (passedCount > 0) verificationBadges.push(`<span class="agent-history-badge ok">${escHtml(`${passedCount} passed`)}</span>`);
    if (failedCount > 0) verificationBadges.push(`<span class="agent-history-badge err">${escHtml(`${failedCount} failed`)}</span>`);
    if (skippedCount > 0) verificationBadges.push(`<span class="agent-history-badge">${escHtml(`${skippedCount} skipped`)}</span>`);

    return `
      <div class="empty-agent-task-card${task.id === activeAgentTaskId ? " active" : ""}" data-main-agent-history-id="${escHtml(task.id)}">
        <div class="empty-agent-task-top">
          <div class="empty-agent-task-title-stack">
            <span class="empty-agent-task-kicker">Last run</span>
            <strong>${escHtml(summarizeAgentPrompt(task.prompt))}</strong>
          </div>
          <div class="empty-agent-task-meta">
            <span class="agent-history-badge ${tone}">${escHtml(task.status)}</span>
            <span>${escHtml(formatAgentTaskTimestamp(task.updatedAt))}</span>
          </div>
        </div>
        ${buildTaskResultOverview(task, "main")}
        <div class="empty-agent-task-badges">
          ${task.artifactType ? `<span class="agent-history-badge">${escHtml(formatAgentArtifactType(task.artifactType))}</span>` : ""}
          ${verificationBadges.join("")}
          ${targetMissing ? `<span class="agent-history-badge err">${escHtml("Target missing")}</span>` : ""}
        </div>
        ${buildTaskPrimaryActions(task, "main")}
        ${buildTaskRestartActions(task, "main")}
      </div>
    `;
  }).join("");
}

function renderAgentHistoryFilters(): void {
  const filterRoot = $("agent-history-filters");
  filterRoot.querySelectorAll<HTMLElement>("[data-agent-history-filter]").forEach((el) => {
    el.classList.toggle("active", (el.dataset["agentHistoryFilter"] ?? "all") === agentHistoryFilter);
  });
}

function renderAgentHistoryControls(totalCount: number, visibleCount: number): void {
  const controlsEl = $("agent-history-controls");
  const toggleBtn = $("agent-history-toggle-btn") as HTMLButtonElement;

  if (totalCount <= 1) {
    controlsEl.style.display = "none";
    toggleBtn.textContent = "Show More";
    return;
  }

  controlsEl.style.display = "flex";
  if (agentHistoryExpanded) {
    toggleBtn.textContent = "Show Less";
    return;
  }

  const hiddenCount = Math.max(0, totalCount - visibleCount);
  toggleBtn.textContent = hiddenCount > 0 ? `Show More (${hiddenCount})` : "Show More";
}

function syncAgentHistoryPanelWidth(): void {
  const panel = document.getElementById("right-panel");
  const isAgentPanelOpen = panel instanceof HTMLElement
    && panel.style.display !== "none"
    && (panel.dataset["openTab"] ?? rightPanelTab) === "agent";

  if (!isAgentPanelOpen) return;

  if (agentHistoryExpanded) {
    if (agentHistoryCollapsedPanelWidth === null) {
      agentHistoryCollapsedPanelWidth = currentRightPanelWidth;
    }
    applyRightPanelWidth(getRightPanelMaxWidth());
    return;
  }

  if (agentHistoryCollapsedPanelWidth !== null) {
    applyRightPanelWidth(agentHistoryCollapsedPanelWidth);
    agentHistoryCollapsedPanelWidth = null;
  }
}

function renderAgentHistory(tasks: AgentTask[]): void {
  const historyEl = $("agent-history");
  cachedAgentTasks = tasks;
  renderAgentHistoryFilters();
  refreshEmptyStateIfNeeded();
  const filteredTasks = agentHistoryFilter === "all"
    ? tasks
    : tasks.filter((task) => task.status === agentHistoryFilter);

  if (filteredTasks.length === 0) {
    historyEl.innerHTML = '<div class="agent-history-empty">Recent agent tasks will appear here with status and verification details.</div>';
    renderAgentHistoryControls(0, 0);
    return;
  }

  const visibleTasks = agentHistoryExpanded ? filteredTasks : filteredTasks.slice(0, 1);
  historyEl.innerHTML = visibleTasks.map((task) => {
    const tone = task.status === "completed" ? "ok" : task.status === "failed" ? "err" : "";
    const targetMissing = isTaskTargetMissing(task);
    const verificationBadge = task.verification?.summary
      ? `<span class="agent-history-badge ${tone}">${escHtml(task.verification.summary)}</span>`
      : "";
    const artifactBadge = task.artifactType
      ? `<span class="agent-history-badge">${escHtml(formatAgentArtifactType(task.artifactType))}</span>`
      : "";
    const targetBadge = task.targetPath
      ? `<span class="agent-history-badge">${escHtml(task.targetPath)}</span>`
      : "";
    const failedReasons = (task.verification?.checks ?? [])
      .filter((check) => check.status === "failed")
      .slice(0, 2)
      .map((check) => `<div class="agent-history-reason">${escHtml(`${check.label}: ${summarizeAgentTaskSummary(check.details, "failed")}`)}</div>`)
      .join("");
    const passedCount = (task.verification?.checks ?? []).filter((check) => check.status === "passed").length;
    const failedCount = (task.verification?.checks ?? []).filter((check) => check.status === "failed").length;
    const skippedCount = (task.verification?.checks ?? []).filter((check) => check.status === "skipped").length;
    const verificationStats = task.verification
      ? `<div class="agent-history-stats">
          <span class="agent-history-badge ok">${escHtml(`${passedCount} passed`)}</span>
          ${failedCount > 0 ? `<span class="agent-history-badge err">${escHtml(`${failedCount} failed`)}</span>` : ""}
          ${skippedCount > 0 ? `<span class="agent-history-badge">${escHtml(`${skippedCount} skipped`)}</span>` : ""}
        </div>`
      : "";

    return `
      <button class="agent-history-item${task.id === activeAgentTaskId ? " active" : ""}" type="button" data-agent-history-id="${escHtml(task.id)}">
        <div class="agent-history-top">
          <div class="agent-history-title">${escHtml(summarizeAgentPrompt(task.prompt))}</div>
          <div class="agent-history-meta">${escHtml(formatAgentTaskTimestamp(task.updatedAt))}</div>
        </div>
        ${buildTaskResultOverview(task, "panel")}
        ${failedReasons ? `<div class="agent-history-reasons">${failedReasons}</div>` : ""}
        <div class="agent-history-badges">
          <span class="agent-history-badge ${tone}">${escHtml(task.status)}</span>
          ${artifactBadge}
          ${verificationBadge}
          ${targetBadge}
          ${targetMissing ? `<span class="agent-history-badge err">${escHtml("Target missing")}</span>` : ""}
        </div>
        ${buildTaskSnapshotBadges(task)}
        ${buildTaskSnapshotActions(task, "panel")}
        ${buildTaskRestoreState(task, "panel")}
        ${buildTaskMissingTargetState(task)}
        ${buildTaskSnapshotHint(task)}
        ${buildTaskSnapshotDiff(task)}
        ${verificationStats}
        ${buildTaskRestartActions(task, "panel")}
        ${buildTaskPrimaryActions(task, "panel")}
      </button>
    `;
  }).join("");
  renderAgentHistoryControls(filteredTasks.length, visibleTasks.length);
}
