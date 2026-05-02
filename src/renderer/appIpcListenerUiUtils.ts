function registerIpcListener(unsubscribe: (() => void) | void): void {
  if (typeof unsubscribe === "function") {
    ipcListenerUnsubscribers.push(unsubscribe);
  }
}

function teardownIpcListeners(): void {
  while (ipcListenerUnsubscribers.length > 0) {
    const unsubscribe = ipcListenerUnsubscribers.pop();
    try {
      unsubscribe?.();
    } catch {
      // Best-effort cleanup during teardown.
    }
  }
  ipcListenersInitialized = false;
}

function setupIpcListeners() {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;
  registerIpcListener(window.api.chat.onStoreChanged((payload) => {
    void syncChatStoreAcrossWindows(payload);
  }));

  registerIpcListener(window.api.chat.onMessage((chatId, msg) => {
    if (msg.role === "assistant" && pendingChatSaveGuard?.requested && pendingChatSaveGuard.chatId === chatId) {
      chatSaveGuardByMessageId.set(msg.id, {
        requested: true,
        expectedPaths: [...pendingChatSaveGuard.expectedPaths]
      });
    }
    if (chatId !== currentChatId) return;
    if (msg.role === "assistant" && !msg.error) activeStreamingMessageIds.add(msg.id);
    appendMessage(msg);
    maybeAutoScroll();
  }));

  registerIpcListener(window.api.chat.onChunk((chatId, msgId, _chunk) => {
    if (chatId !== currentChatId) return;
    const existing = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    const updated = existing + _chunk;
    updateMessageContent(msgId, updated, false, false);
    scheduleChunkAutoScroll();
  }));

  registerIpcListener(window.api.chat.onDone((chatId, msgId) => {
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        pendingChatSaveGuard = null;
        setStreamingUi(false);
        void loadChatList();
      }
    }
    void maybeGenerateTitle(chatId);

    if (chatId !== currentChatId) return;
    const raw = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    updateMessageContent(msgId, raw, true);
    applyChatSaveGuard(msgId);
    flushChunkAutoScroll();
  }));

  registerIpcListener(window.api.chat.onError((chatId, msgId, err) => {
    chatSaveGuardByMessageId.delete(msgId);
    activeStreamingMessageIds.delete(msgId);
    if (activeStreamChatId === chatId && pendingStreamResponses > 0) {
      pendingStreamResponses -= 1;
      if (pendingStreamResponses <= 0) {
        pendingStreamResponses = 0;
        activeStreamChatId = null;
        pendingChatSaveGuard = null;
        setStreamingUi(false);
        void loadChatList();
      }
    }

    if (chatId !== currentChatId) return;
    const index = renderedMessages.findIndex((message) => message.id === msgId);
    if (index >= 0) {
      renderedMessages[index] = { ...renderedMessages[index], content: err, error: err };
      normalizeRenderedMessageOrder();
      rebuildVirtualItems();
    }

    const wrapper = document.querySelector<HTMLElement>(`.msg-wrapper[data-id="${msgId}"]`);
    if (wrapper) {
      const contentEl = wrapper.querySelector<HTMLElement>(".msg-content");
      if (contentEl) {
        contentEl.className = "msg-content error";
        contentEl.dataset["raw"] = err;
        renderMessageBody(contentEl, err, true);
      }
    } else {
      scheduleVirtualRender(true);
    }
    flushChunkAutoScroll();
    showToast("Error: " + err, 4000);
  }));

  registerIpcListener(window.api.agent.onChanged((payload) => {
    lastAgentTaskChangeAt = Date.now();
    const changedTaskId = (payload?.taskId ?? "").trim();
    const activeTaskId = (activeAgentTaskId ?? "").trim();
    const isLogEvent = payload?.reason === "log";
    const shouldForceLogs = isLogEvent && (!changedTaskId || changedTaskId === activeTaskId);
    if (isLogEvent && activeTaskId && changedTaskId && changedTaskId !== activeTaskId) {
      scheduleAgentTaskRefreshFromEvent(false);
      return;
    }
    scheduleAgentTaskRefreshFromEvent(shouldForceLogs);
  }));

  registerIpcListener(window.api.settings.onChanged(() => {
    void syncSettingsAcrossWindows();
  }));

  registerIpcListener(window.api.router.onStateChanged(() => {
    void syncRouterStateAcrossWindows();
  }));

  registerIpcListener(window.api.mcp.onChanged(() => {
    const panel = $("right-panel");
    if (panel.style.display !== "none" && (panel.dataset["openTab"] ?? "") === "router") {
      void refreshMcpStatus();
    }
  }));

  registerIpcListener(window.api.claude.onOutput((payload) => {
    if (
      suppressClaudeExitNotice
      && payload.stream === "system"
      && /Claude Code exited/i.test(payload.text)
    ) {
      return;
    }
    claudeSessionRunning = true;
    const stream = payload.stream === "stderr" ? "stderr" : payload.stream === "system" ? "system" : "stdout";
    appendClaudeLine(payload.text, stream);
    setClaudeStatus("Running...", "busy");
  }));

  registerIpcListener(window.api.claude.onError((message) => {
      claudeSessionRunning = false;
      claudeSessionChatId = null;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
    appendClaudeLine(message, "stderr");
    finalizeClaudeAssistantMessage(true);
    maybeShowClaudeRateLimitResumeGuidance(message);
    setClaudeStatus(message, "err");
    setStreamingUi(false);
    showToast(message, 3500);
  }));

  registerIpcListener(window.api.claude.onExit((payload) => {
    const normalCompletion = payload.code === 0 && payload.signal === null;
    const suppressExitNotice = suppressClaudeExitNotice;
    suppressClaudeExitNotice = false;
    const msgId = activeClaudeAssistantMessageId;
      const permissions = {
        allowedPaths: [...pendingClaudeManagedPermissions.allowedPaths],
        allowedRoots: [...pendingClaudeManagedPermissions.allowedRoots]
      };
      const baselines = pendingClaudeManagedBaselines.map((item) => ({ ...item }));
      const managedMode = pendingClaudeManagedMode;
      pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
      pendingClaudeManagedBaselines = [];
      pendingClaudeManagedMode = "none";
    finalizeClaudeAssistantMessage(true);
      setStreamingUi(false);
      if (msgId && managedMode !== "none") {
        void applyManagedClaudeEdits(msgId, permissions, managedMode, baselines);
      }
    if (managedMode !== "none") {
      void resetClaudeSessionAfterManagedWrite();
    }
    if (normalCompletion) {
      if (!claudeSessionResetting) {
        setClaudeStatus("Ready for next prompt", "ok");
        claudeSessionRunning = true;
        if (currentChatId) claudeSessionChatId = currentChatId;
      }
      return;
    }
    claudeSessionRunning = false;
    claudeSessionChatId = null;
    if (suppressExitNotice) return;
    const detail = `Claude Code session closed${typeof payload.code === "number" ? ` (code ${payload.code})` : ""}.`;
    appendClaudeLine(detail, "system");
    setClaudeStatus("Stopped", "");
  }));

  registerIpcListener(window.api.router.onLog((line) => {
    const log = $("router-log");
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
  }));
}
