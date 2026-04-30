function setAgentStatus(message: string, tone: "ok" | "err" | "" = ""): void {
  const el = $("agent-status-msg");
  el.textContent = message;
  el.className = `status-msg ${tone}`.trim();
}

function formatAgentTaskTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatRouteDiagnosticTimestamp(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type ModelHealthTone = "active" | "working" | "warning" | "blocked" | "failing" | "untested";

function getRouteDiagnosticsByModel(diagnostics: AgentRouteDiagnostics | null): Map<string, AgentModelRouteDiagnostics> {
  const map = new Map<string, AgentModelRouteDiagnostics>();
  for (const route of diagnostics?.routes ?? []) {
    if (!map.has(route.model)) map.set(route.model, route);
  }
  return map;
}

function getEffectiveTaskRouteState(task: AgentTask | null, diagnostics: AgentRouteDiagnostics | null): AgentTaskRouteDiagnostics | undefined {
  return diagnostics?.task ?? (task?.telemetry?.routeDiagnostics
    ? {
      taskId: task.id,
      blacklistedModels: task.telemetry.routeDiagnostics.blacklistedModels,
      failureCounts: task.telemetry.routeDiagnostics.failureCounts,
      visionRequested: task.telemetry.routeDiagnostics.visionRequested ?? false,
      activeStageRoutes: task.telemetry.routeDiagnostics.activeStageRoutes
    }
    : undefined);
}

function describeModelHealth(
  model: string,
  route: AgentModelRouteDiagnostics | undefined,
  taskState?: AgentTaskRouteDiagnostics
): { tone: ModelHealthTone; label: string; detail: string } {
  if (taskState?.blacklistedModels.includes(model)) {
    return { tone: "blocked", label: "Blocked", detail: "This model is blacklisted for the active task." };
  }
  if (taskState?.activeStageRoutes.some((entry) => entry.model === model)) {
    return { tone: "active", label: "Active", detail: "This model is in the current task's live route order." };
  }
  if (!route) {
    return { tone: "untested", label: "Untested", detail: "No reliability history captured yet." };
  }
  if (route.successes > 0 && route.failures === 0 && route.transientFailures === 0 && route.semanticFailures === 0) {
    return { tone: "working", label: "Working", detail: "Recent history is clean with successful runs." };
  }
  if (route.successes > 0) {
    return { tone: "warning", label: "Mixed", detail: "This model works, but it also has some failure history." };
  }
  if (route.failures > 0 || route.semanticFailures > 0) {
    return { tone: "failing", label: "Failing", detail: "This model only shows failed attempts right now." };
  }
  if (route.transientFailures > 0) {
    return { tone: "warning", label: "Unstable", detail: "Only transient failures have been seen so far." };
  }
  return { tone: "untested", label: "Untested", detail: "No useful reliability signal yet." };
}

function buildModelHealthBadgeTone(tone: ModelHealthTone): string {
  if (tone === "active" || tone === "working") return "ok";
  if (tone === "blocked" || tone === "failing") return "err";
  return "";
}

function renderRouteScoreFactors(factors: AgentModelRouteScoreFactor[] | undefined): string {
  const safeFactors = (factors ?? []).filter((factor) => factor && typeof factor.label === "string");
  if (safeFactors.length === 0) return "";
  return safeFactors.map((factor) => {
    const tone = factor.delta > 0 ? "ok" : factor.delta < 0 ? "err" : "";
    const deltaLabel = factor.delta > 0 ? `+${factor.delta}` : `${factor.delta}`;
    return `<span class="agent-history-badge ${tone}">${escHtml(`${deltaLabel} ${factor.label}`)}</span>`;
  }).join("");
}

function formatBlacklistProgress(entry: Pick<AgentTaskRouteFailureCount, "blacklisted" | "hardFailuresUntilBlacklist" | "transientFailuresUntilBlacklist">): string {
  if (entry.blacklisted) return "Blacklisted for this task";
  const hardLabel = entry.hardFailuresUntilBlacklist === 0
    ? "hard blacklist reached"
    : `${entry.hardFailuresUntilBlacklist} hard left`;
  const transientLabel = entry.transientFailuresUntilBlacklist === 0
    ? "transient blacklist reached"
    : `${entry.transientFailuresUntilBlacklist} transient left`;
  return `${hardLabel} / ${transientLabel}`;
}

function findBestKnownRoute(
  diagnostics: AgentRouteDiagnostics | null,
  provider: "remote" | "local"
): AgentModelRouteDiagnostics | null {
  return diagnostics?.routes.find((route) => route.provider === provider && route.successes > 0) ?? null;
}

function renderSettingsModelHealth(diagnostics: AgentRouteDiagnostics | null, task: AgentTask | null = null): void {
  const el = document.getElementById("settings-model-health");
  if (!(el instanceof HTMLElement)) return;

  if (!settings) {
    el.innerHTML = '<div class="settings-model-health-empty">Model health will appear after settings load.</div>';
    return;
  }

  const activeCloudProvider = getCloudProviderModeFromSettings(settings);
  const activeCloudProviderName = getProviderDisplayName(activeCloudProvider);
  const cloudModels = getVisibleModelsForProvider(settings, activeCloudProvider);
  const localModels = getVisibleModelsForProvider(settings, "ollama");
  const configuredModels = [...cloudModels, ...localModels];
  if (configuredModels.length === 0) {
    el.innerHTML = '<div class="settings-model-health-empty">Add models in Settings first. After the app uses them, health signals will start appearing here.</div>';
    return;
  }

  const routeByModel = getRouteDiagnosticsByModel(diagnostics);
  const taskState = getEffectiveTaskRouteState(task, diagnostics);
  const bestCloud = findBestKnownRoute(diagnostics, "remote");
  const bestLocal = findBestKnownRoute(diagnostics, "local");
  const summaryCards = [
    {
      title: "Implementation",
      model: (settings.routing?.default ?? settings.defaultModel ?? "").trim(),
      help: "Primary bias for normal coding and generation work."
    },
    {
      title: "Repair",
      model: (settings.routing?.think ?? settings.defaultModel ?? "").trim(),
      help: "Preferred model when fix or recovery work is needed."
    },
    {
      title: "Planning",
      model: (settings.routing?.longContext ?? settings.defaultModel ?? "").trim(),
      help: "Preferred model when broader task planning needs more context."
    }
  ];

  el.innerHTML = `
    <div class="settings-model-health-summary">
      <div class="settings-model-health-card">
        <div class="settings-model-health-head">
          <div>
            <div class="settings-model-health-title">Working now</div>
            <div class="settings-model-health-help">Fast answer for which model is actually performing well.</div>
          </div>
          <div class="settings-model-health-badges">
            <span class="agent-history-badge ${bestCloud ? "ok" : ""}">${escHtml(bestCloud ? `Best ${getCloudProviderLabelFromBaseUrl(bestCloud.baseUrl)}: ${bestCloud.model}` : `Best ${activeCloudProviderName}: no signal`)}</span>
            <span class="agent-history-badge ${bestLocal ? "ok" : ""}">${escHtml(bestLocal ? `Best local: ${bestLocal.model}` : "Best local: no signal")}</span>
          </div>
        </div>
        <div class="settings-model-health-badges">
          ${summaryCards.map((entry) => {
            const route = routeByModel.get(entry.model);
            const status = describeModelHealth(entry.model, route, taskState);
            return `<span class="agent-history-badge ${buildModelHealthBadgeTone(status.tone)}" title="${escHtml(entry.help)}">${escHtml(`${entry.title}: ${status.label}`)}</span>`;
          }).join("")}
        </div>
        <div class="settings-model-health-help">${escHtml(taskState?.blacklistedModels.length ? `Active task blacklist: ${taskState.blacklistedModels.join(", ")}` : "No active task blacklist right now.")}</div>
      </div>
    </div>
    <div class="settings-model-health-list">
      ${configuredModels.map((model) => {
        const route = routeByModel.get(model);
        const status = describeModelHealth(model, route, taskState);
        return `
          <div class="settings-model-health-item status-${status.tone}">
            <div class="settings-model-health-top">
              <div class="settings-model-health-model">
                <strong>${escHtml(model)}</strong>
                <span>${escHtml(getCloudProviderLabelForModel(model, route))}</span>
              </div>
              <span class="agent-history-badge ${buildModelHealthBadgeTone(status.tone)}">${escHtml(status.label)}</span>
            </div>
            <div class="settings-model-health-meta">
              ${renderModelCapabilityBadges(model)}
              <span class="agent-history-badge">${escHtml(`Success ${route?.successes ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.failures ?? 0) > 0 ? "err" : ""}">${escHtml(`Hard fail ${route?.failures ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.transientFailures ?? 0) > 0 ? "err" : ""}">${escHtml(`Transient ${route?.transientFailures ?? 0}`)}</span>
              <span class="agent-history-badge ${(route?.semanticFailures ?? 0) > 0 ? "err" : ""}">${escHtml(`Semantic ${route?.semanticFailures ?? 0}`)}</span>
              ${typeof route?.score === "number" ? `<span class="agent-history-badge ${route.score >= 0 ? "ok" : "err"}">${escHtml(`Score ${route.score}`)}</span>` : ""}
            </div>
            ${route?.scoreFactors?.length ? `<div class="settings-model-health-meta">${renderRouteScoreFactors(route.scoreFactors)}</div>` : ""}
            <div class="settings-model-health-footnote">${escHtml(status.detail)}${route?.lastUsedAt ? ` Last used: ${formatRouteDiagnosticTimestamp(route.lastUsedAt)}.` : ""}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
