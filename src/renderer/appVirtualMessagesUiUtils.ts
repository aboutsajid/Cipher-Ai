function buildVirtualItemsFromMessages(messages: Message[]): VirtualChatItem[] {
  const items: VirtualChatItem[] = [];
  const compareIndexByGroup = new Map<string, number>();

  for (const msg of messages) {
    const compareGroup = msg.metadata?.compareGroup;
    const compareSlot = msg.metadata?.compareSlot;
    const isCompareMessage = msg.role === "assistant" && compareGroup && compareSlot;

    if (!isCompareMessage) {
      items.push({
        key: `msg:${msg.id}`,
        type: "single",
        message: msg
      });
      continue;
    }

    const existingIndex = compareIndexByGroup.get(compareGroup);
    if (existingIndex === undefined) {
      const item: VirtualChatItem = {
        key: `compare:${compareGroup}`,
        type: "compare",
        compareGroup
      };
      if (compareSlot === "A") item.slotA = msg;
      else item.slotB = msg;
      compareIndexByGroup.set(compareGroup, items.length);
      items.push(item);
      continue;
    }

    const item = items[existingIndex];
    if (compareSlot === "A") item.slotA = msg;
    else item.slotB = msg;
  }

  return items;
}

function rebuildVirtualItems(): void {
  virtualItems = buildVirtualItemsFromMessages(renderedMessages);
}

function getVirtualItemHeight(item: VirtualChatItem): number {
  return virtualItemHeights.get(item.key) ?? VIRTUAL_ESTIMATED_ITEM_HEIGHT;
}

function ensureVirtualMessageElements(): {
  topSpacer: HTMLDivElement;
  host: HTMLDivElement;
  bottomSpacer: HTMLDivElement;
} {
  const container = $("messages");

  let topSpacer = container.querySelector<HTMLDivElement>("#messages-virtual-top");
  let host = container.querySelector<HTMLDivElement>("#messages-virtual-host");
  let bottomSpacer = container.querySelector<HTMLDivElement>("#messages-virtual-bottom");

  if (!topSpacer) {
    topSpacer = document.createElement("div");
    topSpacer.id = "messages-virtual-top";
  }
  if (!host) {
    host = document.createElement("div");
    host.id = "messages-virtual-host";
  }
  if (!bottomSpacer) {
    bottomSpacer = document.createElement("div");
    bottomSpacer.id = "messages-virtual-bottom";
  }

  if (topSpacer.parentElement !== container) container.appendChild(topSpacer);
  if (host.parentElement !== container) container.appendChild(host);
  if (bottomSpacer.parentElement !== container) container.appendChild(bottomSpacer);

  return { topSpacer, host, bottomSpacer };
}

function renderVirtualItem(item: VirtualChatItem): HTMLElement {
  if (item.type === "single" && item.message) {
    const wrapper = createMessageWrapper(item.message);
    wrapper.dataset["virtualItemKey"] = item.key;
    return wrapper;
  }

  const row = document.createElement("div");
  row.className = "compare-row";
  row.dataset["group"] = item.compareGroup ?? "";
  row.dataset["virtualItemKey"] = item.key;

  if (item.slotA) {
    const colA = document.createElement("div");
    colA.className = "compare-col";
    colA.dataset["slot"] = "A";
    colA.appendChild(createMessageWrapper(item.slotA));
    row.appendChild(colA);
  }
  if (item.slotB) {
    const colB = document.createElement("div");
    colB.className = "compare-col";
    colB.dataset["slot"] = "B";
    colB.appendChild(createMessageWrapper(item.slotB));
    row.appendChild(colB);
  }

  return row;
}

function hostIntersectsViewport(container: HTMLElement, host: HTMLElement): boolean {
  if (host.childElementCount === 0) return false;
  const containerRect = container.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return hostRect.bottom >= containerRect.top && hostRect.top <= containerRect.bottom;
}

function renderAllVirtualItems(
  host: HTMLDivElement,
  topSpacer: HTMLDivElement,
  bottomSpacer: HTMLDivElement
): void {
  topSpacer.style.height = "0px";
  bottomSpacer.style.height = "0px";
  host.dataset["start"] = "0";
  host.dataset["end"] = String(virtualItems.length);
  host.innerHTML = "";
  for (const item of virtualItems) {
    host.appendChild(renderVirtualItem(item));
  }
}

function renderAgentMessageBody(contentEl: HTMLElement, content: string): void {
  const parsed = parseAgentMessageContent(content);
  const statusTone = parsed.status === "completed" ? "ok" : parsed.status === "failed" ? "err" : "busy";
  const failedSteps = parsed.steps.filter((step) => step.startsWith("FAILED"));
  const previewable = isPreviewableAgentResult(parsed);
  const openTargetLabel = getArtifactOpenLabel(parsed.artifactType);
  const actionsHtml = `
    <div class="agent-card-actions">
      ${parsed.summary ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-summary">Copy summary</button>` : ""}
      ${parsed.target ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-target" data-agent-target="${escHtml(parsed.target)}">Copy target</button>` : ""}
      ${parsed.output?.runCommand ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-run-command">${escHtml(getAgentRunCommandButtonLabel(parsed.output.primaryAction))}</button>` : ""}
      ${parsed.target ? `<button class="agent-inline-btn" type="button" data-agent-action="open-target" data-agent-target="${escHtml(parsed.target)}">${escHtml(openTargetLabel)}</button>` : ""}
      ${previewable ? `<button class="agent-inline-btn" type="button" data-agent-action="open-preview" data-agent-target="${escHtml(parsed.target ?? "")}" data-agent-preview="${escHtml(parsed.previewUrl ?? "")}">Preview</button>` : ""}
      ${parsed.logs.length > 0 ? `<button class="agent-inline-btn" type="button" data-agent-action="copy-logs">Copy logs</button>` : ""}
    </div>
  `.trim();
  const activityHtml = parsed.activity
    ? `<div class="agent-card-activity"><span class="agent-card-activity-label">Live activity</span><strong>${escHtml(parsed.activity)}</strong></div>`
    : "";
  const latestUpdateHtml = parsed.latestUpdate
    ? `<div class="agent-card-update"><span class="agent-card-update-label">Latest update</span><strong>${escHtml(parsed.latestUpdate)}</strong></div>`
    : "";
  const artifactHtml = parsed.artifactType
    ? `<div class="agent-card-update"><span class="agent-card-update-label">Artifact</span><strong>${escHtml(formatAgentArtifactType(parsed.artifactType))}</strong></div>`
    : "";
  const failureHtml = failedSteps.length > 0
    ? `<div class="agent-card-failure"><span class="agent-card-failure-label">Needs attention</span><strong>${escHtml(failedSteps[failedSteps.length - 1] ?? "")}</strong></div>`
    : "";
  const resultOverviewHtml = buildParsedResultOverview(parsed);
  const filesHtml = parsed.files.length > 0
    ? `<section class="agent-mini-panel">
        <div class="agent-mini-panel-head">
          <div class="agent-mini-panel-title">Updated files</div>
          <button class="agent-inline-btn agent-inline-btn-compact" type="button" data-agent-action="copy-files">Copy files</button>
        </div>
        <div class="agent-file-grid">${parsed.files.map((file) => `<button class="agent-file-chip" type="button" data-agent-action="copy-file" data-agent-file="${escHtml(file)}">${escHtml(file)}</button>`).join("")}</div>
      </section>`
    : "";
  const verifyHtml = (parsed.verifySummary || parsed.verifyChecks.length > 0)
    ? `<section class="agent-mini-panel agent-mini-panel-verify">
        <div class="agent-mini-panel-head">
          <div class="agent-mini-panel-title">Verification</div>
          ${previewable ? `<button class="agent-inline-btn agent-inline-btn-preview" type="button" data-agent-action="open-preview" data-agent-target="${escHtml(parsed.target ?? "")}" data-agent-preview="${escHtml(parsed.previewUrl ?? "")}">Preview</button>` : ""}
        </div>
        ${parsed.verifySummary ? `<strong>${escHtml(parsed.verifySummary)}</strong>` : ""}
        ${parsed.verifyChecks.length > 0 ? `<div class="agent-verify-list">${parsed.verifyChecks.map((check) => `<div class="agent-verify-row"><span class="agent-verify-pill agent-verify-pill-${check.status}">${escHtml(check.label)}</span><span>${escHtml(check.details)}</span></div>`).join("")}</div>` : ""}
      </section>`
    : "";
  const stepsHtml = parsed.steps.length > 0
    ? `<details class="agent-card-steps-wrap"${parsed.status === "failed" ? " open" : ""}>
        <summary>Steps <span>${parsed.steps.length}</span></summary>
        <ol class="agent-card-steps">${parsed.steps.map((step) => {
      const tone = step.startsWith("COMPLETED") ? "ok" : step.startsWith("FAILED") ? "err" : "busy";
      return `<li><span class="agent-step-badge agent-step-badge-${tone}"></span><span>${escHtml(step)}</span></li>`;
    }).join("")}</ol>
      </details>`
    : `<p class="agent-card-empty">No step updates yet.</p>`;
  const logsHtml = parsed.logs.length > 0
    ? `<details class="agent-card-logs"><summary>Recent logs</summary><pre>${escHtml(parsed.logs.join("\n"))}</pre></details>`
    : "";

  contentEl.innerHTML = `
    <section class="agent-card">
      <div class="agent-card-header">
        <span class="agent-badge agent-badge-${statusTone}">${escHtml(parsed.status ?? "running")}</span>
        ${parsed.target ? `<span class="agent-badge">${escHtml(parsed.target)}</span>` : ""}
        ${parsed.rollback ? `<span class="agent-badge agent-badge-muted">${escHtml(parsed.rollback)}</span>` : ""}
      </div>
      ${actionsHtml}
        ${activityHtml}
        ${latestUpdateHtml}
        ${artifactHtml}
        ${failureHtml}
      ${resultOverviewHtml}
      ${(filesHtml || verifyHtml) ? `<div class="agent-card-panels">${filesHtml}${verifyHtml}</div>` : ""}
      <div class="agent-card-section">${stepsHtml}</div>
      ${logsHtml}
    </section>
  `.trim();
}

function measureVirtualHostItems(host: HTMLDivElement): boolean {
  let changedMeasurements = false;
  const renderedEls = host.querySelectorAll<HTMLElement>("[data-virtual-item-key]");
  renderedEls.forEach((el) => {
    const key = el.dataset["virtualItemKey"] ?? "";
    if (!key) return;
    const measured = Math.max(1, Math.ceil(el.getBoundingClientRect().height));
    const known = virtualItemHeights.get(key) ?? VIRTUAL_ESTIMATED_ITEM_HEIGHT;
    if (Math.abs(known - measured) > 1) {
      virtualItemHeights.set(key, measured);
      changedMeasurements = true;
    }
  });
  return changedMeasurements;
}

function renderVirtualMessages(force = false): void {
  const container = $("messages");
  const { topSpacer, host, bottomSpacer } = ensureVirtualMessageElements();

  if (virtualItems.length === 0) {
    topSpacer.style.height = "0px";
    bottomSpacer.style.height = "0px";
    host.innerHTML = "";
    updateScrollBottomButton();
    return;
  }

  if (virtualItems.length <= VIRTUAL_FULL_RENDER_THRESHOLD) {
    const prevStart = Number(host.dataset["start"] ?? "-1");
    const prevEnd = Number(host.dataset["end"] ?? "-1");
    const renderedAllItems =
      prevStart === 0 &&
      prevEnd === virtualItems.length &&
      host.childElementCount === virtualItems.length;
    if (force || !renderedAllItems) {
      renderAllVirtualItems(host, topSpacer, bottomSpacer);
    }
    if (measureVirtualHostItems(host)) {
      requestAnimationFrame(() => renderVirtualMessages(false));
    }
    updateScrollBottomButton();
    return;
  }

  const scrollTop = container.scrollTop;
  const viewportHeight = Math.max(1, container.clientHeight);
  const visibleHeightTarget = viewportHeight + VIRTUAL_OVERSCAN_ITEMS * VIRTUAL_ESTIMATED_ITEM_HEIGHT;

  let start = 0;
  let accumulatedBeforeStart = 0;
  while (start < virtualItems.length) {
    const h = getVirtualItemHeight(virtualItems[start]);
    if (accumulatedBeforeStart + h >= scrollTop) break;
    accumulatedBeforeStart += h;
    start += 1;
  }
  start = Math.max(0, start - VIRTUAL_OVERSCAN_ITEMS);

  let topHeight = 0;
  for (let i = 0; i < start; i += 1) topHeight += getVirtualItemHeight(virtualItems[i]);

  let end = start;
  let covered = 0;
  while (end < virtualItems.length && covered < visibleHeightTarget) {
    covered += getVirtualItemHeight(virtualItems[end]);
    end += 1;
  }
  end = Math.min(virtualItems.length, end + VIRTUAL_OVERSCAN_ITEMS);

  let bottomHeight = 0;
  for (let i = end; i < virtualItems.length; i += 1) bottomHeight += getVirtualItemHeight(virtualItems[i]);

  const prevStart = Number(host.dataset["start"] ?? "-1");
  const prevEnd = Number(host.dataset["end"] ?? "-1");
  if (!force && prevStart === start && prevEnd === end) {
    topSpacer.style.height = `${topHeight}px`;
    bottomSpacer.style.height = `${bottomHeight}px`;
    return;
  }

  topSpacer.style.height = `${topHeight}px`;
  bottomSpacer.style.height = `${bottomHeight}px`;
  host.dataset["start"] = String(start);
  host.dataset["end"] = String(end);
  host.innerHTML = "";

  for (let i = start; i < end; i += 1) {
    host.appendChild(renderVirtualItem(virtualItems[i]));
  }

  if (!hostIntersectsViewport(container, host)) {
    renderAllVirtualItems(host, topSpacer, bottomSpacer);
  }

  if (measureVirtualHostItems(host)) {
    requestAnimationFrame(() => renderVirtualMessages(false));
  }
  updateScrollBottomButton();
}

function scheduleVirtualRender(force = false): void {
  if (force) {
    renderVirtualMessages(true);
    return;
  }
  if (virtualRenderScheduled) return;
  virtualRenderScheduled = true;
  requestAnimationFrame(() => {
    virtualRenderScheduled = false;
    renderVirtualMessages(false);
  });
}

function appendMessage(msg: Message): HTMLElement {
  const container = $("messages");
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();

  const existingIndex = renderedMessages.findIndex((item) => item.id === msg.id);
  if (existingIndex >= 0) renderedMessages[existingIndex] = msg;
  else renderedMessages.push(msg);

  normalizeRenderedMessageOrder();
  rebuildVirtualItems();
  updateMessageDensityState();
  scheduleVirtualRender(true);
  if (shouldAutoScroll || msg.role === "user") {
    requestAnimationFrame(() => scrollToBottom(msg.role === "user"));
  }

  return (document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msg.id}"]`) ?? document.createElement("div"));
}

function updateMessageContent(msgId: string, content: string, done = false, allowContainerFallback = true) {
  const index = renderedMessages.findIndex((item) => item.id === msgId);
  if (index >= 0) {
    renderedMessages[index] = { ...renderedMessages[index], content };
  }

  const wrapper = document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msgId}"]`);
  if (!wrapper) {
    if (allowContainerFallback) {
      normalizeRenderedMessageOrder();
      rebuildVirtualItems();
      scheduleVirtualRender(true);
    }
    return;
  }
  const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
  if (!contentEl) return;
  contentEl.dataset["raw"] = content;
  const message = renderedMessages.find((item) => item.id === msgId);
  if (message?.model === "Agent") {
    renderAgentMessageBody(contentEl, content);
  } else {
    contentEl.dataset["renderMode"] = shouldRenderMessageAsPlainText(message) ? "plain" : "markdown";
    renderMessageBody(contentEl, content, done);
    applyGeneratedImageAssetIds(contentEl, message);
  }

}
