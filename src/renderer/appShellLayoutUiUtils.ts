function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: ThemeMode): void {
  currentTheme = theme;
  document.body.dataset["theme"] = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  const icon = $("theme-toggle-icon");
  const label = $("theme-toggle-label");
  const btn = $("theme-toggle-btn");

  if (theme === "dark") {
    icon.textContent = "\u2600";
    label.textContent = "Light";
    btn.title = "Switch to light mode";
  } else {
    icon.textContent = "\u263E";
    label.textContent = "Dark";
    btn.title = "Switch to dark mode";
  }
}

function toggleTheme(): void {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function getInitialUiExperience(): UiExperienceMode {
  const saved = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return saved === "simple" ? "simple" : "default";
}

function applyUiExperience(mode: UiExperienceMode): void {
  currentUiExperience = mode;
  document.body.dataset["uiMode"] = mode;
  localStorage.setItem(UI_MODE_STORAGE_KEY, mode);

  const toggleBtn = document.getElementById("ui-mode-toggle-btn");
  const help = document.getElementById("ui-mode-help");
  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.textContent = mode === "simple" ? "Switch to Advanced UI" : "Switch to Simple UI";
  }
  if (help instanceof HTMLElement) {
    help.textContent = mode === "simple"
      ? "Simple UI is active. Setup stays focused on provider, API key, and default model."
      : "Simple UI hides route tuning, diagnostics, and other advanced controls until you need them.";
  }

  if (mode === "simple") {
    if (currentMode === "think") applyMode("code");
    const panel = document.getElementById("right-panel");
    const openTab = panel?.dataset["openTab"] ?? "";
    if (openTab === "router") openPanel("settings");
    const systemPromptPanel = document.getElementById("system-prompt-panel");
    if (systemPromptPanel instanceof HTMLElement) systemPromptPanel.style.display = "none";
    document.getElementById("system-prompt-toggle-btn")?.classList.remove("active");
  }

  applyProviderUiState(providerMode);
}

function toggleUiExperience(): void {
  applyUiExperience(currentUiExperience === "simple" ? "default" : "simple");
}

function getSidebarMaxWidth(): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 560));
}

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function updateSidebarWidthUi(width: number): void {
  const widthLabel = document.getElementById("sidebar-width-label");
  if (widthLabel instanceof HTMLElement) {
    widthLabel.textContent = `${width}px`;
  }

  const handle = document.getElementById("sidebar-resize-handle");
  if (handle instanceof HTMLElement) {
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemax", String(getSidebarMaxWidth()));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
  }
}

function applySidebarWidth(width: number, persist = true): void {
  currentSidebarWidth = clampSidebarWidth(width);
  document.documentElement.style.setProperty("--sidebar-w", `${currentSidebarWidth}px`);
  updateSidebarWidthUi(currentSidebarWidth);

  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(currentSidebarWidth));
  }
}

function getInitialSidebarWidth(): number {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(saved)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(saved);
}

function adjustSidebarWidth(delta: number): void {
  applySidebarWidth(currentSidebarWidth + delta);
}

function resetSidebarWidth(): void {
  applySidebarWidth(SIDEBAR_DEFAULT_WIDTH);
}

function getRightPanelMaxWidth(): number {
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, window.innerWidth - 220));
}

function clampRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(getRightPanelMaxWidth(), Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

function updateRightPanelWidthUi(width: number): void {
  const widthLabel = document.getElementById("panel-width-label");
  if (widthLabel instanceof HTMLElement) {
    widthLabel.textContent = `${width}px`;
  }

  const handle = document.getElementById("panel-resize-handle");
  if (handle instanceof HTMLElement) {
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemax", String(getRightPanelMaxWidth()));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
  }
}

function applyRightPanelWidth(width: number, persist = true): void {
  currentRightPanelWidth = clampRightPanelWidth(width);
  document.documentElement.style.setProperty("--panel-w", `${currentRightPanelWidth}px`);
  updateRightPanelWidthUi(currentRightPanelWidth);

  if (persist) {
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(currentRightPanelWidth));
  }
}

function getInitialRightPanelWidth(): number {
  const saved = Number(localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(saved)) return RIGHT_PANEL_DEFAULT_WIDTH;
  return clampRightPanelWidth(saved);
}

function adjustRightPanelWidth(delta: number): void {
  applyRightPanelWidth(currentRightPanelWidth + delta);
}

function resetRightPanelWidth(): void {
  applyRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
}

function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
}

function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen";
}

function hideOnboarding(): void {
  const modal = document.getElementById("onboarding-modal");
  if (modal instanceof HTMLElement) modal.style.display = "none";
  markOnboardingSeen();
}

function shouldShowOnboarding(): boolean {
  if (hasSeenOnboarding()) return false;
  const hasChats = cachedChatSummaries.length > 0;
  if (hasChats) return false;
  const hasCloudKey = Boolean((settings?.apiKey ?? "").trim());
  const hasOllama = (settings?.ollamaModels ?? []).length > 0;
  return !hasCloudKey && !hasOllama;
}

function showOnboarding(): void {
  const modal = document.getElementById("onboarding-modal");
  if (modal instanceof HTMLElement) modal.style.display = "flex";
}
