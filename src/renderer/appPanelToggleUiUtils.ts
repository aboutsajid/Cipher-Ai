let rightPanelTab = "settings";

function openPanel(tab: string) {
  if (tab !== "agent" && agentHistoryCollapsedPanelWidth !== null) {
    applyRightPanelWidth(agentHistoryCollapsedPanelWidth);
    agentHistoryCollapsedPanelWidth = null;
  }

  rightPanelTab = tab;
  const panel = $("right-panel");
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.dataset["openTab"] = tab;
  $("panel-title").textContent = tab === "router"
    ? "Router"
    : tab === "agent"
      ? "Agent"
      : tab === "preview"
        ? "Preview"
        : "Settings";

  document.querySelectorAll<HTMLElement>(".panel-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset["tab"] === tab);
  });
  setPanelBody(tab);

  const settingsBtn = document.getElementById("settings-toggle-btn");
  const routerBtn = document.getElementById(ROUTER_TOGGLE_BUTTON_ID);
  const agentBtn = document.getElementById(AGENT_TOGGLE_BUTTON_ID);
  if (!(settingsBtn instanceof HTMLElement)) return;
  settingsBtn.classList.toggle("active", tab === "settings");
  if (routerBtn instanceof HTMLElement) routerBtn.classList.toggle("active", tab === "router");
  if (agentBtn instanceof HTMLElement) agentBtn.classList.toggle("active", tab === "agent");

  if (tab === "router") {
    void refreshRouterStatus({ includeLogs: true });
    void refreshMcpStatus();
  }
  if (tab === "agent") {
    syncAgentHistoryPanelWidth();
    void refreshAgentTask(true);
  }
}

function togglePanel(tab: string) {
  const panel = $("right-panel");
  const isOpen = panel.style.display !== "none";
  const openTab = panel.dataset["openTab"] ?? rightPanelTab;
  if (isOpen && openTab === tab) {
    closeRightPanel();
  } else {
    openPanel(tab);
  }
}
