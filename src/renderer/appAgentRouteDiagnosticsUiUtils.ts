function renderAgentRouteDiagnostics(diagnostics: AgentRouteDiagnostics | null, task: AgentTask | null = null): void {
  const el = document.getElementById("agent-route-health");
  if (!(el instanceof HTMLElement)) return;
  cachedAgentRouteDiagnostics = diagnostics;
  renderSettingsModelHealth(diagnostics, task);

  if (!diagnostics || diagnostics.routes.length === 0) {
    el.innerHTML = '<div class="agent-route-health-empty">Reliability stats will appear here after the agent has tried at least one model route.</div>';
    return;
  }

  const topRoutes = diagnostics.routes.slice(0, 6);
  const taskState = getEffectiveTaskRouteState(task, diagnostics);
  const taskMarkup = taskState
    ? `
      <div class="agent-route-health-block">
        <div class="agent-route-health-title">Active task route state</div>
        <div class="agent-route-health-help">${escHtml(diagnostics.task ? "Task-specific blacklisting and remembered stage routes exist only while a task is active." : "This route-state summary was persisted on the task before runtime cleanup.")}</div>
        <div class="agent-route-health-summary">
          <span class="agent-history-badge">${escHtml(`Task: ${taskState.taskId}`)}</span>
          <span class="agent-history-badge ${taskState.blacklistedModels.length > 0 ? "err" : "ok"}">${escHtml(taskState.blacklistedModels.length > 0 ? `${taskState.blacklistedModels.length} blacklisted` : "No blacklist")}</span>
          <span class="agent-history-badge ${taskState.activeStageRoutes.length > 0 ? "ok" : ""}">${escHtml(`${taskState.activeStageRoutes.length} stage routes`)}</span>
          ${taskState.visionRequested ? '<span class="agent-history-badge ok">Vision input</span>' : ""}
        </div>
        ${taskState.blacklistedModels.length > 0 ? `<div class="agent-route-health-stats">${taskState.blacklistedModels.map((model) => `<span class="agent-history-badge err">${escHtml(`Blocked: ${model}`)}</span>`).join("")}</div>` : ""}
        ${taskState.failureCounts.length > 0 ? `<div class="agent-route-health-stats">${taskState.failureCounts.map((entry) => `<span class="agent-history-badge ${entry.blacklisted ? "err" : ""}">${escHtml(`${entry.model}: ${entry.count} failure${entry.count === 1 ? "" : "s"} • ${formatBlacklistProgress(entry)}`)}</span>`).join("")}</div>` : ""}
        ${taskState.activeStageRoutes.length > 0 ? `<div class="agent-route-health-stage-list">${taskState.activeStageRoutes.map((entry) => `
          <div class="agent-route-health-stage">
            <span class="agent-history-badge ok">${escHtml(entry.stage)}</span>
            <span class="agent-history-badge">${escHtml(entry.model)}</span>
            <span class="agent-history-badge">${escHtml(`Route ${entry.routeIndex + 1}`)}</span>
            <span class="agent-history-badge">${escHtml(`Attempt ${entry.attempt}`)}</span>
            <span class="agent-history-badge ${entry.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${entry.score}`)}</span>
            <span class="agent-history-badge ${entry.blacklisted ? "err" : ""}">${escHtml(formatBlacklistProgress(entry))}</span>
            ${entry.visionRequested ? `<span class="agent-history-badge ${entry.visionCapable ? "ok" : "err"}">${escHtml(entry.visionCapable ? "Vision-selected" : "Vision fallback")}</span>` : ""}
            ${renderRouteScoreFactors(entry.scoreFactors)}
            <div class="agent-route-health-footnote">${escHtml(entry.selectionReason)}</div>
          </div>
        `).join("")}</div>` : '<div class="agent-route-health-help">No stage route is currently remembered for this task.</div>'}
      </div>
    `
    : `
      <div class="agent-route-health-block">
        <div class="agent-route-health-title">Active task route state</div>
        <div class="agent-route-health-help">Select or start an agent task to inspect blacklist and remembered stage routes here.</div>
      </div>
    `;

  el.innerHTML = `
    ${taskMarkup}
    <div class="agent-route-health-block">
      <div class="agent-route-health-title">Global route reliability</div>
      <div class="agent-route-health-help">Higher scores move a model earlier in runtime route ordering. Semantic failures are penalized harder than transient failures, and transient failures blacklist more slowly.</div>
      <div class="agent-route-health-grid">
        ${topRoutes.map((route) => `
          <div class="agent-route-health-item">
            <div class="agent-route-health-top">
              <div class="agent-route-health-model">
                <strong>${escHtml(route.model)}</strong>
                <span>${escHtml(route.baseUrl)}</span>
              </div>
              <span class="agent-history-badge ${route.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${route.score}`)}</span>
            </div>
            <div class="agent-route-health-stats">
              <span class="agent-history-badge ${route.provider === "local" ? "ok" : ""}">${escHtml(route.provider === "local" ? "Local" : "Cloud")}</span>
              ${renderModelCapabilityBadges(route.model)}
              <span class="agent-history-badge">${escHtml(`${route.successes} success`)}</span>
              <span class="agent-history-badge ${route.failures > 0 ? "err" : ""}">${escHtml(`${route.failures} hard fail`)}</span>
              <span class="agent-history-badge ${route.transientFailures > 0 ? "err" : ""}">${escHtml(`${route.transientFailures} transient`)}</span>
              <span class="agent-history-badge ${route.semanticFailures > 0 ? "err" : ""}">${escHtml(`${route.semanticFailures} semantic`)}</span>
            </div>
            ${route.scoreFactors.length > 0 ? `<div class="agent-route-health-stats">${renderRouteScoreFactors(route.scoreFactors)}</div>` : ""}
            <div class="agent-route-health-footnote">${escHtml(`Last used: ${formatRouteDiagnosticTimestamp(route.lastUsedAt)}`)}</div>
          </div>
        `).join("")}
      </div>
      <div class="agent-route-health-footnote">Showing the top ${topRoutes.length} routes by current reliability score.</div>
    </div>
  `;
}

async function refreshAgentRouteDiagnostics(taskId?: string): Promise<void> {
  try {
    const diagnostics = await window.api.agent.getRouteDiagnostics(taskId);
    const task = taskId ? (cachedAgentTasks.find((item) => item.id === taskId) ?? null) : null;
    renderAgentRouteDiagnostics(diagnostics, task);
  } catch (err) {
    const el = document.getElementById("agent-route-health");
    const message = err instanceof Error ? err.message : "Unable to load route health.";
    if (el instanceof HTMLElement) {
      el.innerHTML = `<div class="agent-route-health-empty">${escHtml(message)}</div>`;
    }
    const settingsEl = document.getElementById("settings-model-health");
    if (settingsEl instanceof HTMLElement) {
      settingsEl.innerHTML = `<div class="settings-model-health-empty">${escHtml(message)}</div>`;
    }
  }
}
