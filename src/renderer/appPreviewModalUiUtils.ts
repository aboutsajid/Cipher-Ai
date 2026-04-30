function openCodePreview(html: string): void {
  const modal = $("code-preview-modal");
  const frame = $("code-preview-frame") as HTMLIFrameElement;
  const title = document.getElementById("code-preview-title");
  if (title) title.textContent = "HTML Preview";
  frame.removeAttribute("src");
  frame.srcdoc = html;
  modal.style.display = "flex";
}

function openImagePreview(item: GeneratedImageHistoryItem): void {
  const modal = document.getElementById("image-preview-modal");
  const image = document.getElementById("image-preview-image") as HTMLImageElement | null;
  const title = document.getElementById("image-preview-title");
  const meta = document.getElementById("image-preview-meta");
  if (!(modal instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

  const prompt = item.prompt.trim() || "Generated image preview";
  if (title instanceof HTMLElement) title.textContent = prompt;
  if (meta instanceof HTMLElement) {
    meta.textContent = `${compactModelName(item.model)} â€¢ ${item.aspectRatio} â€¢ ${formatImageHistoryTimestamp(item.createdAt)}`;
  }
  image.src = item.dataUrl;
  image.alt = prompt;
  modal.style.display = "flex";
}

function closePreviewWorkspace(): void {
  const workspace = document.getElementById("preview-workspace");
  const workspaceTitle = document.getElementById("preview-workspace-title");
  const workspaceTarget = document.getElementById("preview-workspace-target");
  const workspaceWebview = document.getElementById("preview-workspace-webview") as HTMLElement | null;
  const workspaceEmpty = document.getElementById("preview-workspace-empty");
  if (workspace) workspace.style.display = "none";
  if (workspaceTitle) workspaceTitle.textContent = "Task Output";
  if (workspaceTarget) workspaceTarget.textContent = "";
  if (workspaceWebview) workspaceWebview.setAttribute("src", "about:blank");
  if (workspaceEmpty) workspaceEmpty.classList.add("visible");
  document.body.classList.remove("preview-workspace-open");
}

function closeCodePreview(): void {
  const modal = $("code-preview-modal");
  const frame = $("code-preview-frame") as HTMLIFrameElement;
  const title = document.getElementById("code-preview-title");
  if (title) title.textContent = "HTML Preview";
  modal.style.display = "none";
  frame.removeAttribute("src");
  frame.srcdoc = "";
}

function closeImagePreviewModal(): void {
  const modal = document.getElementById("image-preview-modal");
  const image = document.getElementById("image-preview-image") as HTMLImageElement | null;
  const title = document.getElementById("image-preview-title");
  const meta = document.getElementById("image-preview-meta");
  if (title instanceof HTMLElement) title.textContent = "Image Preview";
  if (meta instanceof HTMLElement) meta.textContent = "Generated image";
  if (modal instanceof HTMLElement) modal.style.display = "none";
  if (image instanceof HTMLImageElement) {
    image.removeAttribute("src");
    image.alt = "Generated image preview";
  }
}

function closeStatsModal(): void {
  const statsModal = document.getElementById("stats-modal");
  if (statsModal instanceof HTMLElement) statsModal.style.display = "none";
  const statsBtn = document.getElementById("stats-btn");
  if (statsBtn instanceof HTMLElement) statsBtn.classList.remove("active");
}

async function openStatsModal(): Promise<void> {
  try {
    const stats = await window.api.stats.get();
    const setText = (id: string, value: string): void => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("stats-total-chats", String(stats.totalChats));
    setText("stats-total-messages", String(stats.totalMessages));
    setText("stats-most-used-model", stats.mostUsedModel);
    setText("stats-most-used-count", `${stats.mostUsedModelCount} messages`);
    setText("stats-avg-per-chat", String(stats.averageMessagesPerChat));

    const statsModal = document.getElementById("stats-modal");
    if (statsModal instanceof HTMLElement) statsModal.style.display = "flex";
    const statsBtn = document.getElementById("stats-btn");
    if (statsBtn instanceof HTMLElement) statsBtn.classList.add("active");
  } catch (err) {
    showToast(`Failed to load stats: ${err instanceof Error ? err.message : "unknown error"}`, 3200);
  }
}
