function getMessagesBottomDistance(): number {
  const el = $("messages");
  return Math.max(0, el.scrollHeight - (el.scrollTop + el.clientHeight));
}

function isNearBottom(threshold = NEAR_BOTTOM_THRESHOLD_PX): boolean {
  return getMessagesBottomDistance() <= threshold;
}

function ensureScrollBottomButton(): HTMLButtonElement | null {
  const existing = document.getElementById("scroll-bottom-btn");
  if (existing instanceof HTMLButtonElement) return existing;

  const messages = document.getElementById("messages");
  if (!messages) return null;

  const btn = document.createElement("button");
  btn.id = "scroll-bottom-btn";
  btn.className = "scroll-bottom-btn";
  btn.type = "button";
  btn.style.display = "none";
  btn.title = "Jump to latest message";
  btn.textContent = "Latest â†“";
  messages.appendChild(btn);
  btn.onclick = () => {
    scrollToBottom(true);
  };
  return btn;
}

function updateScrollBottomButton(): void {
  const btn = ensureScrollBottomButton();
  if (!btn) return;
  const hasMessages = renderedMessages.length > 0;
  const show = hasMessages && !isNearBottom();
  btn.style.display = show ? "inline-flex" : "none";
}

function syncAutoScrollState(): void {
  shouldAutoScroll = isNearBottom();
  updateScrollBottomButton();
}

function scrollToBottom(forceAuto = false): void {
  const el = $("messages");
  el.scrollTop = el.scrollHeight;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    if (forceAuto) shouldAutoScroll = true;
    updateScrollBottomButton();
  });
}

function maybeAutoScroll(): void {
  if (shouldAutoScroll) {
    scrollToBottom();
    return;
  }
  updateScrollBottomButton();
}

function scheduleChunkAutoScroll(): void {
  if (chunkAutoScrollTimer) return;
  chunkAutoScrollTimer = setTimeout(() => {
    chunkAutoScrollTimer = null;
    maybeAutoScroll();
  }, 90);
}

function flushChunkAutoScroll(): void {
  if (chunkAutoScrollTimer) {
    clearTimeout(chunkAutoScrollTimer);
    chunkAutoScrollTimer = null;
  }
  maybeAutoScroll();
}
