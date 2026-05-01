function renderMessageBody(contentEl: HTMLElement, content: string, done: boolean): void {
  const renderMode = contentEl.dataset["renderMode"] ?? "markdown";

  if (rawModeEnabled) {
    contentEl.textContent = content;
    return;
  }

  contentEl.classList.toggle("is-plain", renderMode === "plain");
  if (renderMode === "plain") {
    contentEl.textContent = content;
    if (!done) {
      const cursor = document.createElement("span");
      cursor.className = "cursor-blink";
      contentEl.appendChild(cursor);
    }
    return;
  }

  if (done) {
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.innerHTML = renderMarkdown(content) + '<span class="cursor-blink"></span>';
  }
}

function shouldRenderMessageAsPlainText(msg: Message | undefined): boolean {
  return msg?.role === "system";
}

function updateMessageDensityState(): void {
  const container = document.getElementById("messages");
  if (!(container instanceof HTMLElement)) return;
  const hasEmptyState = Boolean(container.querySelector(":scope > .empty-state"));
  const sparseConversation = !hasEmptyState && renderedMessages.length > 0 && renderedMessages.length <= 2;
  container.classList.toggle("messages-sparse", sparseConversation);
}

function applyGeneratedImageAssetIds(contentEl: HTMLElement, msg: Message | undefined): void {
  const assetIds = msg?.metadata?.generatedImageAssetIds ?? [];
  const saveButtons = Array.from(contentEl.querySelectorAll<HTMLButtonElement>(".message-image-save-btn"));
  saveButtons.forEach((button, index) => {
    const assetId = assetIds[index] ?? "";
    if (assetId) button.dataset["imageAssetId"] = assetId;
    else delete button.dataset["imageAssetId"];
  });
}

function rerenderAllMessageBodies(done = true): void {
  const wrappers = document.querySelectorAll<HTMLElement>(".msg-wrapper");
  wrappers.forEach((wrapper) => {
    const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
    if (!contentEl) return;
    const raw = contentEl.dataset["raw"] ?? "";
    const messageId = wrapper.dataset["id"] ?? "";
    const message = renderedMessages.find((item) => item.id === messageId);
    contentEl.dataset["renderMode"] = shouldRenderMessageAsPlainText(message) ? "plain" : "markdown";
    renderMessageBody(contentEl, raw, done);
    applyGeneratedImageAssetIds(contentEl, message);
  });
}

function applyRawMode(enabled: boolean): void {
  rawModeEnabled = enabled;
  $("raw-toggle-btn").classList.toggle("active", enabled);
  rerenderAllMessageBodies(!isStreaming);
}
