function setPanelBody(tab: string): void {
  const settingsBody = document.querySelector<HTMLElement>('.panel-body[data-panel="settings"]');
  const routerBody = document.querySelector<HTMLElement>('.panel-body[data-panel="router"]');
  const agentBody = document.querySelector<HTMLElement>('.panel-body[data-panel="agent"]');
  if (!settingsBody || !routerBody || !agentBody) return;

  const showSettings = tab === "settings";
  const showRouter = tab === "router";
  const showAgent = tab === "agent";
  settingsBody.classList.toggle("active", showSettings);
  settingsBody.style.display = showSettings ? "flex" : "none";

  routerBody.classList.toggle("active", showRouter);
  routerBody.style.display = showRouter ? "flex" : "none";

  agentBody.classList.toggle("active", showAgent);
  agentBody.style.display = showAgent ? "flex" : "none";
}

function refreshPreviewFrame(): void {
  if (!activePreviewUrl) return;
  const separator = activePreviewUrl.includes("?") ? "&" : "?";
  const refreshedUrl = `${activePreviewUrl}${separator}refresh=${Date.now()}`;
  const workspaceWebview = document.getElementById("preview-workspace-webview") as HTMLElement | null;
  if (workspaceWebview) {
    workspaceWebview.setAttribute("src", refreshedUrl);
  }
}

async function openManagedPreview(targetPath: string, preferredUrl = "", auto = false): Promise<void> {
  const result = await window.api.app.openPreview(targetPath, preferredUrl);
  if (!result.ok || !result.url) {
    showToast(result.message || "Preview open failed", result.ok ? 2000 : 2600);
    return;
  }

  closePreviewWorkspace();
  activePreviewUrl = result.url;
  activePreviewTarget = targetPath;
  await openDetachedPreview();
  if (!auto) showToast(result.message || "Task preview ready.", 1800);
}
