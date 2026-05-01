function setClaudeStatus(text: string, tone: "ok" | "err" | "busy" | "" = ""): void {
  const btn = document.getElementById("quick-claude-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.title = text ? `Claude Code: ${text}` : "Claude Code";
  btn.classList.remove("status-ok", "status-err", "status-busy");
  if (tone) btn.classList.add(`status-${tone}`);
  btn.classList.toggle("active", currentMode === "claude");
}

function setClaudeModeActiveVisual(active: boolean): void {
  const quickBtn = document.getElementById("quick-claude-btn");
  if (quickBtn instanceof HTMLButtonElement) quickBtn.classList.toggle("active", active);
}

async function ensureClaudeSessionStarted(): Promise<boolean> {
  if (claudeSessionResetting) {
    setClaudeStatus("Resetting Claude Code...", "busy");
    return false;
  }
  if (claudeSessionRunning) {
    setClaudeStatus("Ready", "ok");
    return true;
  }
  if (claudeSessionStarting) {
    setClaudeStatus("Starting Claude Code...", "busy");
    return false;
  }

  claudeSessionStarting = true;
  setClaudeStatus("Starting Claude Code...", "busy");
  try {
    const res = await window.api.claude.start();
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3500);
      appendClaudeLine(res.message, "stderr");
      return false;
    }
    setClaudeStatus("Ready", "ok");
    if (res.message.toLowerCase().includes("session started")) appendClaudeLine(res.message, "system");
    return true;
  } catch (err) {
    claudeSessionRunning = false;
    const msg = err instanceof Error ? err.message : "Failed to start Claude Code.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3500);
    appendClaudeLine(msg, "stderr");
    return false;
  } finally {
    claudeSessionStarting = false;
  }
}

function ensureClaudeAssistantMessage(): string {
  const existingId = activeClaudeAssistantMessageId;
  if (existingId && renderedMessages.some((msg) => msg.id === existingId)) {
    return existingId;
  }

  const id = nextClientMessageId("claude-assistant");
  const message: Message = {
    id,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    model: CLAUDE_MODEL_LABEL
  };
  appendMessage(message);
  if (currentChatId) {
    void window.api.chat.appendMessage(currentChatId, message);
    void loadChatList();
  }
  activeStreamingMessageIds.add(id);
  activeClaudeAssistantMessageId = id;
  return id;
}

function scheduleClaudeMessageRender(msgId: string): void {
  claudeRenderMessageId = msgId;
  if (claudeRenderTimer) return;
  claudeRenderTimer = setTimeout(() => {
    claudeRenderTimer = null;
    const targetId = claudeRenderMessageId;
    if (!targetId) return;
    const draft = claudeDraftByMessage.get(targetId);
    if (typeof draft === "string") updateMessageContent(targetId, draft, false, false);
    claudeRenderMessageId = null;
  }, CLAUDE_RENDER_BATCH_MS);
}

function flushClaudeMessageRender(msgId: string, done: boolean): void {
  if (claudeRenderTimer) {
    clearTimeout(claudeRenderTimer);
    claudeRenderTimer = null;
  }
  claudeRenderMessageId = null;

  const draft = claudeDraftByMessage.get(msgId);
  if (typeof draft === "string") {
    updateMessageContent(msgId, draft, done, false);
    if (done) claudeDraftByMessage.delete(msgId);
    return;
  }

  if (done) {
    const raw = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    updateMessageContent(msgId, raw, true, false);
  }
}

function shouldVerifyClaudeSave(prompt: string, attachments: AttachmentPayload[]): ClaudeSaveGuard | null {
  const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
  const asksForSave = /(^|[\s,.:;])save($|[\s,.:;])/.test(normalizedPrompt)
    || normalizedPrompt.includes("edit and save")
    || normalizedPrompt.includes("edit aur save")
    || normalizedPrompt.includes("save kar")
    || normalizedPrompt.includes("same files")
    || normalizedPrompt.includes("directly edit");
  if (!asksForSave) return null;

  const expectedPaths = [
    ...getEditableSourcePaths(attachments),
    ...getWritableRootPaths(attachments)
  ];
  if (expectedPaths.length === 0) return null;

  return { requested: true, expectedPaths };
}

function verifyClaudeSaveClaim(content: string, guard: ClaudeSaveGuard | null): { verified: boolean; reason: string } {
  if (!guard?.requested) return { verified: true, reason: "" };

  const normalized = (content ?? "").trim().toLowerCase();
  if (!normalized) return { verified: false, reason: "No save confirmation was found." };
  if (normalized.includes("i could not save the files")) {
    return { verified: false, reason: "Claude explicitly said it could not save the files." };
  }

  const saveClaimed = normalized.includes("saved files")
    || normalized.includes("changes were made")
    || normalized.includes("i changed")
    || normalized.includes("i edited")
    || normalized.includes("i have edited")
    || normalized.includes("i've applied")
    || normalized.includes("applied the changes")
    || normalized.includes("directly edit and save")
    || normalized.includes("save kar diya")
    || normalized.includes("same files edit");

  if (!saveClaimed) {
    return { verified: false, reason: "Claude did not provide a trustworthy saved-files confirmation." };
  }

  const hasAnyExpectedPath = guard.expectedPaths.some((path) => normalized.includes(path.toLowerCase()));
  if (!hasAnyExpectedPath) {
    return { verified: false, reason: "No exact saved file path was listed in the response." };
  }

  return { verified: true, reason: "" };
}

function applyClaudeSaveGuard(msgId: string): void {
  const guard = pendingClaudeSaveGuard;
  pendingClaudeSaveGuard = null;
  if (!guard?.requested) return;

  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const verdict = verifyClaudeSaveClaim(current, guard);
  if (verdict.verified) return;

  const warning = [
    "[Save not verified]",
    verdict.reason,
    "Treat this response as unverified unless the exact saved file paths are listed.",
    ""
  ].join("\n");

  const next = `${warning}${current}`.trim();
  updateMessageContent(msgId, next, true, false);
  showToast("Claude save not verified.", 3200);
}

function applyChatSaveGuard(msgId: string): void {
  const guard = chatSaveGuardByMessageId.get(msgId) ?? null;
  chatSaveGuardByMessageId.delete(msgId);
  if (!guard?.requested) return;

  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const verdict = verifyClaudeSaveClaim(current, guard);
  if (verdict.verified) return;

  const next = [
    "[Save not verified]",
    verdict.reason,
    "Treat this response as unverified unless the exact saved file paths are listed.",
    "",
    current
  ].join("\n").trim();

  updateMessageContent(msgId, next, true, false);
  showToast("Model save not verified.", 3200);
}

function resetClaudeRenderState(): void {
  if (claudeRenderTimer) {
    clearTimeout(claudeRenderTimer);
    claudeRenderTimer = null;
  }
  claudeRenderMessageId = null;
  claudeDraftByMessage.clear();
  activeClaudeAssistantMessageId = null;
  pendingClaudeSaveGuard = null;
  pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
  pendingClaudeManagedBaselines = [];
  pendingClaudeManagedMode = "none";
  pendingChatSaveGuard = null;
  const previewModal = document.getElementById("managed-save-preview-modal");
  if (previewModal instanceof HTMLElement) previewModal.style.display = "none";
  pendingManagedSavePreview = null;
  chatSaveGuardByMessageId.clear();
}

function appendClaudeLine(text: string, kind: "stdout" | "stderr" | "system" | "user" = "stdout"): void {
  const normalized = (text ?? "").replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) return;

  if (kind === "user") {
    const message: Message = {
      id: nextClientMessageId("claude-user"),
      role: "user",
      content: lines.join("\n"),
      createdAt: new Date().toISOString()
    };
    appendMessage(message);
    if (currentChatId) {
      void window.api.chat.appendMessage(currentChatId, message);
      void loadChatList();
    }
    activeClaudeAssistantMessageId = null;
    refreshClaudeSafetyPanel();
    maybeAutoScroll();
    return;
  }

  if (kind === "system") {
    const message: Message = {
      id: nextClientMessageId("claude-system"),
      role: "system",
      content: lines.join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        systemNotice: true
      }
    };
    appendMessage(message);
    if (currentChatId) {
      void window.api.chat.appendMessage(currentChatId, message);
      void loadChatList();
    }
    refreshClaudeSafetyPanel();
    maybeAutoScroll();
    return;
  }

  const msgId = ensureClaudeAssistantMessage();
  const previous = claudeDraftByMessage.get(msgId) ?? renderedMessages.find((msg) => msg.id === msgId)?.content ?? "";
  const mapped = lines.map((line) => kind === "stderr" ? `Error: ${line}` : line);
  const nextContent = [previous, mapped.join("\n")].filter(Boolean).join("\n");
  claudeDraftByMessage.set(msgId, nextContent);
  scheduleClaudeMessageRender(msgId);
  refreshClaudeSafetyPanel();
  scheduleChunkAutoScroll();
}

function finalizeClaudeAssistantMessage(done: boolean): void {
  const msgId = activeClaudeAssistantMessageId;
  if (!msgId) {
    pendingClaudeSaveGuard = null;
    pendingClaudeManagedPermissions = { allowedPaths: [], allowedRoots: [] };
    pendingClaudeManagedBaselines = [];
    pendingClaudeManagedMode = "none";
    return;
  }
  flushClaudeMessageRender(msgId, done);
  if (done) applyClaudeSaveGuard(msgId);
  activeStreamingMessageIds.delete(msgId);
  claudeDraftByMessage.delete(msgId);
  if (done && currentChatId) {
    const content = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
    void window.api.chat.updateMessage(currentChatId, msgId, { content });
    void loadChatList();
  }
  activeClaudeAssistantMessageId = null;
  refreshClaudeSafetyPanel();
}

function parseClaudeManagedEditResponse(content: string): { summary: string; edits: ClaudeManagedEdit[] } | null {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return null;

  const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = (jsonMatch?.[1] ?? trimmed).trim();

  const extractFirstJsonObject = (input: string): string | null => {
    const start = input.indexOf("{");
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, i + 1).trim();
        }
      }
    }

    return null;
  };

  const jsonCandidate = extractFirstJsonObject(candidate) ?? candidate;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { summary?: unknown; edits?: unknown };
  if (!Array.isArray(record.edits)) return null;

  const edits = record.edits
    .filter((item): item is { path?: unknown; content?: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({
      path: typeof item.path === "string" ? item.path.trim() : "",
      content: typeof item.content === "string" ? item.content : ""
    }))
    .filter((item) => item.path);

  return {
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    edits
  };
}

function buildManagedSaveResultLines(
  heading: string,
  summary: string,
  result: ClaudeApplyEditsResult | null,
  verification?: ManagedWriteVerificationReport | null
): string[] {
  const verificationLines = verification ? buildManagedWriteVerificationLines(verification) : [];
  if (!result) {
    return [
      heading,
      summary,
      ...verificationLines,
      "Saved files:",
      "- none",
      "Backup files:",
      "- none",
      "Unchanged files:",
      "- none",
      "Unsaved files:",
      "- none",
      "Result: No file changes were returned."
    ];
  }

  return [
    heading,
    summary,
    ...verificationLines,
    "Saved files:",
    ...(result.savedFiles.length > 0 ? result.savedFiles.map((path) => `- ${path}`) : ["- none"]),
    "Backup files:",
    ...(result.backupFiles.length > 0
      ? result.backupFiles.map((item) => `- ${item.path} -> ${item.backupPath}`)
      : ["- none"]),
    "Unchanged files:",
    ...(result.unchangedFiles.length > 0 ? result.unchangedFiles.map((path) => `- ${path}`) : ["- none"]),
    "Unsaved files:",
    ...(result.failedFiles.length > 0 ? result.failedFiles.map((item) => `- ${item.path}: ${item.reason}`) : ["- none"]),
    `Result: ${result.message}`
  ];
}

function buildManagedWriteVerificationLines(report: ManagedWriteVerificationReport): string[] {
  const reviewer = report.reviewerModel ? ` (${report.reviewerModel})` : "";
  return [
    `Verification: ${report.status}${reviewer}`,
    report.summary || "No verification summary provided.",
    ...(report.findings.length > 0
      ? report.findings.map((finding) => `- ${finding.severity.toUpperCase()}${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`)
      : ["- No findings"])
  ];
}

async function verifyManagedEditsWithFallback(edits: ClaudeManagedEdit[]): Promise<ManagedWriteVerificationReport> {
  try {
    return await window.api.claude.verifyManagedEdits(edits);
  } catch (err) {
    return {
      ok: true,
      status: "skipped",
      summary: `Verification skipped: ${err instanceof Error ? err.message : "unknown error"}`,
      findings: []
    };
  }
}

async function repairManagedEditsWithFallback(
  edits: ClaudeManagedEdit[],
  verification: ManagedWriteVerificationReport
): Promise<ManagedWriteRepairResult> {
  try {
    return await window.api.claude.repairManagedEdits(edits, verification);
  } catch (err) {
    return {
      ok: false,
      summary: `Auto-repair failed: ${err instanceof Error ? err.message : "unknown error"}`,
      edits: [],
      error: err instanceof Error ? err.message : "unknown error"
    };
  }
}

function hideManagedSavePreview(): void {
  managedSaveApplying = false;
  pendingManagedSavePreview = null;
  const applyBtn = document.getElementById("managed-save-apply-btn");
  const cancelBtn = document.getElementById("managed-save-cancel-btn");
  const closeBtn = document.getElementById("managed-save-preview-close-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = false;
    applyBtn.textContent = "Save Changes";
  }
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
  if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = false;
  $("managed-save-preview-modal").style.display = "none";
}

function showManagedSavePreview(
  msgId: string,
  parsed: { summary: string; edits: ClaudeManagedEdit[] },
  permissions: ClaudeManagedEditPermissions,
  verification: ManagedWriteVerificationReport | null,
  baselines: ClaudeManagedEditBaseline[] = pendingClaudeManagedBaselines
): void {
  pendingManagedSavePreview = {
    msgId,
    parsed,
    permissions,
    baselines: baselines.map((item) => ({ ...item })),
    verification
  };
  $("managed-save-preview-modal").style.display = "flex";
  const summaryLines = [
    parsed.summary || "Review Claude's proposed file changes before saving.",
    `${parsed.edits.length} file(s) proposed. The app will only write exact attached files or new/existing files inside selected writable folders.`,
    ...(verification ? buildManagedWriteVerificationLines(verification) : [])
  ];
  $("managed-save-preview-summary").textContent = summaryLines.join(" ");
  $("managed-save-preview-files").textContent = parsed.edits.map((edit) => edit.path).join("\n");
  ($("managed-save-preview-content") as HTMLTextAreaElement).value = parsed.edits
    .map((edit) => `===== ${edit.path} =====\n${edit.content}`)
    .join("\n\n");
  const applyBtn = document.getElementById("managed-save-apply-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = verification?.status === "blocked";
    applyBtn.textContent = verification?.status === "blocked" ? "Blocked By Verifier" : "Save Changes";
  }
}

async function confirmManagedSavePreview(): Promise<void> {
  const pending = pendingManagedSavePreview;
  if (!pending || managedSaveApplying) return;
  if (pending.verification?.status === "blocked") {
    showToast("Managed save is blocked by verifier findings.", 3200);
    return;
  }

  managedSaveApplying = true;
  const applyBtn = document.getElementById("managed-save-apply-btn");
  const cancelBtn = document.getElementById("managed-save-cancel-btn");
  const closeBtn = document.getElementById("managed-save-preview-close-btn");
  if (applyBtn instanceof HTMLButtonElement) {
    applyBtn.disabled = true;
    applyBtn.textContent = "Saving...";
  }
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;
  if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = true;

  try {
    const result = await window.api.claude.applyEdits(
      pending.parsed.edits,
      pending.permissions,
      pending.baselines
    );
    hideManagedSavePreview();
    const lines = buildManagedSaveResultLines(
      result.ok ? "[Managed save applied]" : "[Managed save partially applied]",
      pending.parsed.summary || "Managed edit completed.",
      result,
      pending.verification
    );

    updateMessageContent(pending.msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    await loadChatList();
    showToast(result.ok ? "Managed save applied." : "Managed save completed with issues.", 2600);
  } catch (err) {
    managedSaveApplying = false;
    if (applyBtn instanceof HTMLButtonElement) {
      applyBtn.disabled = false;
      applyBtn.textContent = "Save Changes";
    }
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
    if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = false;
    showToast(`Managed save failed: ${err instanceof Error ? err.message : "unknown error"}`, 3600);
  }
}

function cancelManagedSavePreview(): void {
  const pending = pendingManagedSavePreview;
  hideManagedSavePreview();
  if (!pending) return;

  const lines = buildManagedSaveResultLines(
    "[Managed save cancelled]",
    pending.parsed.summary || "Claude proposed file changes, but save was cancelled.",
    null,
    pending.verification
  );
  lines[lines.length - 1] = "Result: Save cancelled before any files were written.";
  updateMessageContent(pending.msgId, lines.join("\n"), true, false);
  pendingClaudeSaveGuard = null;
}

async function applyManagedClaudeEdits(
  msgId: string,
  permissions: ClaudeManagedEditPermissions,
  mode: "edit" | "chat",
  baselines: ClaudeManagedEditBaseline[] = pendingClaudeManagedBaselines
): Promise<void> {
  if (permissions.allowedPaths.length === 0 && permissions.allowedRoots.length === 0) return;
  const current = renderedMessages.find((message) => message.id === msgId)?.content ?? "";
  const parsed = parseClaudeManagedEditResponse(current);
  if (!parsed) {
    const lines = mode === "edit"
      ? [
          "[Managed save not applied]",
          "Claude did not return valid JSON for Edit & Save.",
          "Result: No files were written. Ask for the same change again with a more exact instruction."
        ]
      : [
          "[Managed write not applied]",
          "Claude replied in normal chat format instead of managed-write JSON.",
          "Result: No files were written. Ask again with an exact project or file instruction."
        ];
    updateMessageContent(msgId, mode === "chat" ? `${current.trim()}\n\n${lines.join("\n")}`.trim() : lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast(mode === "edit" ? "Claude returned invalid Edit & Save JSON." : "Claude did not return valid managed-write JSON.", 3400);
    return;
  }

  if (parsed.edits.length === 0) {
    const lines = buildManagedSaveResultLines(
      "[Managed save not applied]",
      parsed.summary || "Claude returned no file edits.",
      null
    );
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    return;
  }

  const inspection = await window.api.claude.inspectEdits(parsed.edits, permissions, baselines);
  if (!inspection.ok) {
    const lines = buildManagedSaveResultLines(
      "[Managed save not applied]",
      inspection.failedFiles.length > 0
        ? `${parsed.summary || "Claude proposed file changes."} Local safety checks rejected the proposal before review.`
        : parsed.summary || "Claude proposed no actionable file changes.",
      inspection
    );
    lines[lines.length - 1] = `Result: ${inspection.message}`;
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast(
      inspection.failedFiles.length > 0
        ? "Managed save blocked before review."
        : "No actionable file changes to review.",
      3200
    );
    return;
  }

  let verification: ManagedWriteVerificationReport | null = await verifyManagedEditsWithFallback(parsed.edits);

  if (verification.status === "blocked") {
    showToast("Verifier blocked the proposal. Attempting auto-repair...", 3200);
    const repair = await repairManagedEditsWithFallback(parsed.edits, verification);
    if (repair.ok && repair.edits.length > 0) {
      const repairedVerification = await verifyManagedEditsWithFallback(repair.edits);
      if (repairedVerification.status !== "blocked") {
        const repairedSummary = [
          parsed.summary || "Claude proposed file changes.",
          `Auto-repair applied${repair.reviewerModel ? ` by ${repair.reviewerModel}` : ""}: ${repair.summary || "Verifier issues were corrected."}`
        ].join(" ");
        showToast("Auto-repair generated a corrected proposal.", 2800);
        showManagedSavePreview(
          msgId,
          { summary: repairedSummary, edits: repair.edits },
          permissions,
          repairedVerification
        );
        return;
      }

      verification = repairedVerification;
      const lines = buildManagedSaveResultLines(
        "[Managed save blocked]",
        `${repair.summary || "Auto-repair generated a new proposal."} The repaired proposal is still blocked by verifier findings.`,
        null,
        verification
      );
      lines[lines.length - 1] = "Result: No files were written because verifier findings still block the repaired proposal.";
      updateMessageContent(msgId, lines.join("\n"), true, false);
      pendingClaudeSaveGuard = null;
      showToast("Auto-repair ran, but verifier still blocked the result.", 3600);
      return;
    }

    const lines = buildManagedSaveResultLines(
      "[Managed save blocked]",
      `${parsed.summary || "Claude proposed file changes, but verification blocked them."} Auto-repair did not produce a valid fix${repair.reviewerModel ? ` from ${repair.reviewerModel}` : ""}. ${repair.summary || ""}`.trim(),
      null,
      verification
    );
    lines[lines.length - 1] = "Result: No files were written because verifier findings blocked the proposal and auto-repair failed.";
    updateMessageContent(msgId, lines.join("\n"), true, false);
    pendingClaudeSaveGuard = null;
    showToast("Managed save blocked. Auto-repair failed.", 3400);
    return;
  }

  showManagedSavePreview(msgId, parsed, permissions, verification);
}

function formatClaudeElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

function renderClaudeElapsedStatus(): void {
  const status = document.getElementById("stream-status");
  if (!(status instanceof HTMLElement)) return;
  if (!claudeElapsedStartedAt) return;
  const elapsed = formatClaudeElapsed(Date.now() - claudeElapsedStartedAt);
  status.textContent = claudeElapsedStatusText ? `${claudeElapsedStatusText} (${elapsed})` : elapsed;
}

function startClaudeElapsedTimer(statusText: string): void {
  claudeElapsedStatusText = statusText || "Claude is thinking...";
  claudeElapsedStartedAt = Date.now();
  if (claudeElapsedTimer) {
    clearInterval(claudeElapsedTimer);
  }
  renderClaudeElapsedStatus();
  claudeElapsedTimer = setInterval(() => {
    renderClaudeElapsedStatus();
  }, 1000);
}

function stopClaudeElapsedTimer(): void {
  if (claudeElapsedTimer) {
    clearInterval(claudeElapsedTimer);
    claudeElapsedTimer = null;
  }
  claudeElapsedStartedAt = 0;
  claudeElapsedStatusText = "";
}

function isClaudeRateLimitError(message: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return /api error:\s*429|rate_limit_error|rate limit|session usage limit/.test(normalized);
}

function normalizeClaudeChatFilesystemRoots(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value.join("\n") : value;
  return [...new Set(
    String(raw ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
}

function normalizeClaudeChatFilesystemRootDrafts(
  value: ClaudeChatFilesystemRootDraft[] | Array<{
    path?: string;
    label?: string;
    allowWrite?: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  }>,
  fallbackAllowWrite = false,
  fallbackOverwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite" = "allow-overwrite"
): ClaudeChatFilesystemRootDraft[] {
  const byPath = new Map<string, ClaudeChatFilesystemRootDraft>();
  for (const item of value ?? []) {
    const path = String(item?.path ?? "").trim();
    if (!path) continue;
    byPath.set(path, {
      path,
      label: String(item?.label ?? "").trim() || undefined,
      allowWrite: item?.allowWrite === true || (item?.allowWrite !== false && fallbackAllowWrite),
      overwritePolicy: item?.overwritePolicy === "create-only" || item?.overwritePolicy === "ask-before-overwrite"
        ? item.overwritePolicy
        : fallbackOverwritePolicy
    });
  }
  return [...byPath.values()];
}

function getClaudeChatFilesystemRootDraftsFromUi(): ClaudeChatFilesystemRootDraft[] {
  const list = document.getElementById("claude-chat-fs-root-list");
  const globalWriteToggle = document.getElementById("claude-chat-fs-write-toggle");
  const globalWriteEnabled = globalWriteToggle instanceof HTMLInputElement && globalWriteToggle.checked;
  const globalOverwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const fallbackOverwritePolicy = globalOverwritePolicy instanceof HTMLSelectElement
    && (globalOverwritePolicy.value === "create-only" || globalOverwritePolicy.value === "ask-before-overwrite")
    ? globalOverwritePolicy.value
    : "allow-overwrite";
  if (!(list instanceof HTMLElement)) return [];

  const drafts: ClaudeChatFilesystemRootDraft[] = [];
  for (const row of Array.from(list.querySelectorAll<HTMLElement>("[data-claude-fs-root-row='true']"))) {
    const pathInput = row.querySelector<HTMLInputElement>("[data-role='path']");
    const labelInput = row.querySelector<HTMLInputElement>("[data-role='label']");
    const writeInput = row.querySelector<HTMLInputElement>("[data-role='allow-write']");
    const overwriteInput = row.querySelector<HTMLSelectElement>("[data-role='overwrite-policy']");
    const path = (pathInput?.value ?? "").trim();
    if (!path) continue;
    drafts.push({
      path,
      label: (labelInput?.value ?? "").trim() || undefined,
      allowWrite: globalWriteEnabled && writeInput?.checked === true,
      overwritePolicy: overwriteInput?.value === "create-only" || overwriteInput?.value === "ask-before-overwrite"
        ? overwriteInput.value
        : fallbackOverwritePolicy
    });
  }
  return normalizeClaudeChatFilesystemRootDrafts(drafts, globalWriteEnabled, fallbackOverwritePolicy);
}

function renderClaudeChatFilesystemRootList(
  drafts: ClaudeChatFilesystemRootDraft[],
  globalWriteEnabled: boolean
): void {
  const list = document.getElementById("claude-chat-fs-root-list");
  if (!(list instanceof HTMLElement)) return;

  list.innerHTML = "";
  if (drafts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "field-help";
    empty.textContent = "No approved Claude folders yet.";
    list.appendChild(empty);
    return;
  }

  drafts.forEach((draft, index) => {
    const row = document.createElement("div");
    row.dataset["claudeFsRootRow"] = "true";
    row.className = "claude-fs-root-row";

    const pathInput = document.createElement("input");
    pathInput.className = "field-input";
    pathInput.type = "text";
    pathInput.value = draft.path;
    pathInput.placeholder = "Folder path";
    pathInput.dataset["role"] = "path";

    const labelInput = document.createElement("input");
    labelInput.className = "field-input";
    labelInput.type = "text";
    labelInput.value = draft.label ?? "";
    labelInput.placeholder = "Optional label";
    labelInput.dataset["role"] = "label";

    const writeWrap = document.createElement("label");
    writeWrap.className = "toggle-field";
    const writeInput = document.createElement("input");
    writeInput.type = "checkbox";
    writeInput.checked = draft.allowWrite;
    writeInput.disabled = !globalWriteEnabled;
    writeInput.dataset["role"] = "allow-write";
    const writeText = document.createElement("span");
    writeText.textContent = "Write";
    writeWrap.append(writeInput, writeText);

    const overwriteInput = document.createElement("select");
    overwriteInput.className = "field-input";
    overwriteInput.dataset["role"] = "overwrite-policy";
    overwriteInput.innerHTML = [
      `<option value="allow-overwrite"${draft.overwritePolicy === "allow-overwrite" ? " selected" : ""}>Allow overwrite</option>`,
      `<option value="create-only"${draft.overwritePolicy === "create-only" ? " selected" : ""}>Create only</option>`,
      `<option value="ask-before-overwrite"${draft.overwritePolicy === "ask-before-overwrite" ? " selected" : ""}>Ask before overwrite</option>`
    ].join("");

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-ghost-sm";
    removeBtn.textContent = "Remove";
    removeBtn.dataset["role"] = "remove";
    removeBtn.dataset["index"] = String(index);

    row.append(pathInput, labelInput, writeWrap, overwriteInput, removeBtn);
    list.appendChild(row);
  });
}

function getClaudeChatFilesystemSettingsDraft(): {
  roots: string[];
  allowWrite: boolean;
  overwritePolicy: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  rootConfigs: ClaudeChatFilesystemRootDraft[];
  temporaryRoots: string[];
  budgets: { maxFilesPerTurn?: number; maxBytesPerTurn?: number; maxToolCallsPerTurn?: number };
  auditEnabled: boolean;
  requireWritePlan: boolean;
} {
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  const overwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const tempRootsInput = document.getElementById("claude-chat-fs-temp-roots");
  const maxFilesInput = document.getElementById("claude-chat-fs-max-files");
  const maxBytesInput = document.getElementById("claude-chat-fs-max-bytes");
  const maxToolsInput = document.getElementById("claude-chat-fs-max-tools");
  const auditToggle = document.getElementById("claude-chat-fs-audit-toggle");
  const planToggle = document.getElementById("claude-chat-fs-plan-toggle");
  const parseOptionalInt = (element: HTMLElement | null): number | undefined => {
    if (!(element instanceof HTMLInputElement)) return undefined;
    const value = element.value.trim();
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const rootConfigs = getClaudeChatFilesystemRootDraftsFromUi();
  return {
    roots: rootConfigs.map((item) => item.path),
    allowWrite: writeToggle instanceof HTMLInputElement && writeToggle.checked,
    overwritePolicy: overwritePolicy instanceof HTMLSelectElement
      && (overwritePolicy.value === "create-only" || overwritePolicy.value === "ask-before-overwrite")
      ? overwritePolicy.value
      : "allow-overwrite",
    rootConfigs,
    temporaryRoots: normalizeClaudeChatFilesystemRoots(tempRootsInput instanceof HTMLTextAreaElement ? tempRootsInput.value : temporaryClaudeChatFilesystemRoots),
    budgets: {
      maxFilesPerTurn: parseOptionalInt(maxFilesInput),
      maxBytesPerTurn: parseOptionalInt(maxBytesInput),
      maxToolCallsPerTurn: parseOptionalInt(maxToolsInput)
    },
    auditEnabled: !(auditToggle instanceof HTMLInputElement) || auditToggle.checked,
    requireWritePlan: planToggle instanceof HTMLInputElement && planToggle.checked
  };
}

function renderClaudeChatFilesystemSettingsUi(filesystem: {
  roots: string[];
  allowWrite: boolean;
  overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  rootConfigs?: Array<{
    path?: string;
    label?: string;
    allowWrite?: boolean;
    overwritePolicy?: "create-only" | "allow-overwrite" | "ask-before-overwrite";
  }>;
  temporaryRoots?: string[];
  budgets?: { maxFilesPerTurn?: number; maxBytesPerTurn?: number; maxToolCallsPerTurn?: number };
  auditEnabled?: boolean;
  requireWritePlan?: boolean;
} | null | undefined): void {
  const writeToggle = document.getElementById("claude-chat-fs-write-toggle");
  const overwritePolicy = document.getElementById("claude-chat-fs-overwrite-policy");
  const tempRootsInput = document.getElementById("claude-chat-fs-temp-roots");
  const maxFilesInput = document.getElementById("claude-chat-fs-max-files");
  const maxBytesInput = document.getElementById("claude-chat-fs-max-bytes");
  const maxToolsInput = document.getElementById("claude-chat-fs-max-tools");
  const auditToggle = document.getElementById("claude-chat-fs-audit-toggle");
  const planToggle = document.getElementById("claude-chat-fs-plan-toggle");
  const status = document.getElementById("claude-chat-fs-status");
  const normalized = {
    roots: normalizeClaudeChatFilesystemRoots(filesystem?.roots ?? []),
    allowWrite: filesystem?.allowWrite === true,
    overwritePolicy: filesystem?.overwritePolicy ?? "allow-overwrite",
    rootConfigs: normalizeClaudeChatFilesystemRootDrafts(
      Array.isArray(filesystem?.rootConfigs) && filesystem!.rootConfigs!.length > 0
        ? filesystem!.rootConfigs!
        : normalizeClaudeChatFilesystemRoots(filesystem?.roots ?? []).map((path) => ({
            path,
            allowWrite: filesystem?.allowWrite === true,
            overwritePolicy: filesystem?.overwritePolicy ?? "allow-overwrite"
          })),
      filesystem?.allowWrite === true,
      filesystem?.overwritePolicy ?? "allow-overwrite"
    ),
    temporaryRoots: normalizeClaudeChatFilesystemRoots(filesystem?.temporaryRoots ?? temporaryClaudeChatFilesystemRoots),
    budgets: {
      maxFilesPerTurn: filesystem?.budgets?.maxFilesPerTurn,
      maxBytesPerTurn: filesystem?.budgets?.maxBytesPerTurn,
      maxToolCallsPerTurn: filesystem?.budgets?.maxToolCallsPerTurn
    },
    auditEnabled: filesystem?.auditEnabled !== false,
    requireWritePlan: filesystem?.requireWritePlan === true
  };

  if (writeToggle instanceof HTMLInputElement) {
    writeToggle.checked = normalized.allowWrite;
  }
  if (overwritePolicy instanceof HTMLSelectElement) {
    overwritePolicy.value = normalized.overwritePolicy;
  }
  if (tempRootsInput instanceof HTMLTextAreaElement) {
    tempRootsInput.value = normalized.temporaryRoots.join("\n");
  }
  if (maxFilesInput instanceof HTMLInputElement) {
    maxFilesInput.value = normalized.budgets.maxFilesPerTurn ? String(normalized.budgets.maxFilesPerTurn) : "";
  }
  if (maxBytesInput instanceof HTMLInputElement) {
    maxBytesInput.value = normalized.budgets.maxBytesPerTurn ? String(normalized.budgets.maxBytesPerTurn) : "";
  }
  if (maxToolsInput instanceof HTMLInputElement) {
    maxToolsInput.value = normalized.budgets.maxToolCallsPerTurn ? String(normalized.budgets.maxToolCallsPerTurn) : "";
  }
  if (auditToggle instanceof HTMLInputElement) {
    auditToggle.checked = normalized.auditEnabled;
  }
  if (planToggle instanceof HTMLInputElement) {
    planToggle.checked = normalized.requireWritePlan;
  }
  renderClaudeChatFilesystemRootList(normalized.rootConfigs, normalized.allowWrite);
  if (status instanceof HTMLElement) {
    const writeEnabledCount = normalized.rootConfigs.filter((item) => item.allowWrite).length;
    status.textContent = normalized.rootConfigs.length === 0
      ? "Claude chat filesystem access is off."
      : normalized.allowWrite
        ? `Claude chat can read ${normalized.rootConfigs.length} approved folder${normalized.rootConfigs.length === 1 ? "" : "s"} and write in ${writeEnabledCount} folder${writeEnabledCount === 1 ? "" : "s"}.`
        : `Claude chat can read, list, and search inside ${normalized.rootConfigs.length} approved folder${normalized.rootConfigs.length === 1 ? "" : "s"}.`;
  }
}

function getActiveClaudeChatFilesystemSettings(): Settings["claudeChatFilesystem"] | undefined {
  if (!settings?.claudeChatFilesystem) return undefined;
  return {
    ...settings.claudeChatFilesystem,
    temporaryRoots: [...temporaryClaudeChatFilesystemRoots]
  };
}

function getClaudeWritableRootDraftsFromFilesystem(
  filesystem: Settings["claudeChatFilesystem"] | undefined
): ClaudeChatFilesystemRootDraft[] {
  if (!filesystem) return [];
  const fallbackAllowWrite = filesystem.allowWrite === true;
  const fallbackOverwritePolicy = filesystem.overwritePolicy ?? "allow-overwrite";
  const temporaryRootConfigs = normalizeClaudeChatFilesystemRoots(filesystem.temporaryRoots ?? []).map((path) => ({
    path,
    label: "",
    allowWrite: fallbackAllowWrite,
    overwritePolicy: fallbackOverwritePolicy
  }));
  const configuredRootDrafts = normalizeClaudeChatFilesystemRootDrafts(
    Array.isArray(filesystem.rootConfigs) && filesystem.rootConfigs.length > 0
      ? filesystem.rootConfigs
      : (filesystem.roots ?? []).map((path) => ({
          path,
          label: "",
          allowWrite: fallbackAllowWrite,
          overwritePolicy: fallbackOverwritePolicy
        })),
    fallbackAllowWrite,
    fallbackOverwritePolicy
  );
  return normalizeClaudeChatFilesystemRootDrafts(
    [...temporaryRootConfigs, ...configuredRootDrafts],
    fallbackAllowWrite,
    fallbackOverwritePolicy
  )
    .filter((root) => root.allowWrite && root.path);
}

function getConfiguredClaudeWritableRootDrafts(): ClaudeChatFilesystemRootDraft[] {
  return getClaudeWritableRootDraftsFromFilesystem(getActiveClaudeChatFilesystemSettings());
}

function getConfiguredClaudeWritableRoots(): string[] {
  return getConfiguredClaudeWritableRootDrafts().map((root) => root.path);
}

function parseClaudeFilesystemEventLine(line: string, createdAt: string): ClaudeFilesystemEvent | null {
  const match = line.trim().match(/^\[Claude filesystem\]\s+(staging|writing|created|creating directory|moving|deleting|deleted)\s+(.+)$/i);
  if (!match) return null;
  const rawPath = (match[2] ?? "").trim().split(/\s+->\s+/)[0]?.trim() ?? "";
  if (!rawPath) return null;
  return {
    action: (match[1] ?? "").toLowerCase(),
    path: normalizePathForComparison(rawPath),
    createdAt
  };
}

function getClaudeFilesystemEvents(messages: Message[] = renderedMessages): ClaudeFilesystemEvent[] {
  const events: ClaudeFilesystemEvent[] = [];
  for (const message of messages) {
    if (message.role !== "system") continue;
    const lines = String(message.content ?? "").split("\n");
    for (const line of lines) {
      const event = parseClaudeFilesystemEventLine(line, message.createdAt);
      if (event) events.push(event);
    }
  }
  return events;
}

function isLikelyClaudeProjectRootRelativePath(relativePath: string): boolean {
  const segments = normalizePathForComparison(relativePath).split("\\").filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.length === 1) return true;

  const firstSegment = segments[0].toLowerCase();
  if (firstSegment.startsWith(".")) return true;
  if (/\.[a-z0-9][a-z0-9_-]{0,12}$/i.test(firstSegment)) return true;

  const structuralSegments = new Set([
    "api",
    "app",
    "apps",
    "assets",
    "backend",
    "build",
    "client",
    "components",
    "config",
    "configs",
    "dist",
    "docs",
    "electron",
    "features",
    "frontend",
    "lib",
    "libs",
    "modules",
    "node_modules",
    "packages",
    "pages",
    "public",
    "routes",
    "scripts",
    "server",
    "spec",
    "specs",
    "src",
    "static",
    "styles",
    "test",
    "tests",
    "views"
  ]);
  return structuralSegments.has(firstSegment);
}

function getClaudeProjectCandidateForPath(path: string, approvedRoots: string[]): string {
  const normalizedPath = normalizePathForComparison(path);
  const matchingRoot = approvedRoots
    .map(normalizePathForComparison)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((root) => isSameOrInsidePath(normalizedPath, root));

  if (matchingRoot) {
    const relative = normalizedPath.slice(matchingRoot.length).replace(/^[\\]+/, "");
    const firstSegment = relative.split("\\").filter(Boolean)[0] ?? "";
    if (!firstSegment || isLikelyClaudeProjectRootRelativePath(relative)) return matchingRoot;
    return firstSegment ? `${matchingRoot}\\${firstSegment}` : matchingRoot;
  }

  return getParentPath(normalizedPath);
}

function inferClaudeProjectTargetPath(
  events: ClaudeFilesystemEvent[] = getClaudeFilesystemEvents(),
  approvedRoots: string[] = getConfiguredClaudeWritableRoots()
): string {
  if (events.length === 0) return "";
  const candidates = new Map<string, { count: number; latestIndex: number }>();

  events.forEach((event, index) => {
    const candidate = getClaudeProjectCandidateForPath(event.path, approvedRoots);
    if (!candidate) return;
    if (approvedRoots.length > 0 && !approvedRoots.some((root) => isSameOrInsidePath(candidate, root))) return;
    const prior = candidates.get(candidate) ?? { count: 0, latestIndex: -1 };
    candidates.set(candidate, { count: prior.count + 1, latestIndex: Math.max(prior.latestIndex, index) });
  });

  return [...candidates.entries()]
    .sort((left, right) => {
      const countDelta = right[1].count - left[1].count;
      if (countDelta !== 0) return countDelta;
      return right[1].latestIndex - left[1].latestIndex;
    })[0]?.[0] ?? "";
}

function getClaudeLockedProjectTarget(): string {
  return inferClaudeProjectTargetPath();
}

function buildLockedClaudeFilesystemAccess<T extends NonNullable<Settings["claudeChatFilesystem"]>>(filesystemAccess: T | undefined): T | undefined {
  if (!filesystemAccess) return filesystemAccess;
  const target = getClaudeLockedProjectTarget();
  if (!target) return filesystemAccess;

  const rootDrafts = getClaudeWritableRootDraftsFromFilesystem(filesystemAccess);
  const root = rootDrafts.find((candidate) => isSameOrInsidePath(target, candidate.path));
  if (!root) return filesystemAccess;

  return {
    ...filesystemAccess,
    roots: [target],
    rootConfigs: [{
      path: target,
      label: "Locked target",
      allowWrite: true,
      overwritePolicy: root.overwritePolicy ?? filesystemAccess.overwritePolicy ?? "allow-overwrite"
    }],
    temporaryRoots: [],
    allowWrite: true,
    overwritePolicy: root.overwritePolicy ?? filesystemAccess.overwritePolicy ?? "allow-overwrite"
  };
}

function inferClaudeResumeProjectPath(): string {
  const lockedTarget = getClaudeLockedProjectTarget();
  if (lockedTarget) return lockedTarget;

  const writableRoots = getConfiguredClaudeWritableRoots();
  return writableRoots[0] ?? "";
}

function buildClaudeRateLimitResumePrompt(projectPath: string): string {
  const target = (projectPath ?? "").trim();
  if (target) {
    return `Continue the existing project in ${target}. First list the existing files in that target, identify what is still missing, then complete only the remaining files using Claude filesystem tools. Do not create a sibling project folder.`;
  }
  return "Continue the existing approved-folder project. First list the existing files, identify what is still missing, then complete only the remaining files using Claude filesystem tools. Do not create a sibling project folder.";
}

function maybeShowClaudeRateLimitResumeGuidance(message: string): void {
  if (!isClaudeRateLimitError(message)) return;
  const prompt = buildClaudeRateLimitResumePrompt(inferClaudeResumeProjectPath());
  const lines = [
    "[Claude rate limit]",
    "Claude hit a provider usage limit after writing part of the project.",
    "Resume prompt:",
    prompt
  ];
  appendClaudeLine(lines.join("\n"), "system");
  showToast("Claude hit a rate limit. Resume prompt added below.", 3600);
}

function hasClaudeRateLimitNotice(messages: Message[] = renderedMessages): boolean {
  return messages.some((message) => isClaudeRateLimitError(message.content));
}

function refreshClaudeSafetyPanel(): void {
  const panel = document.getElementById("claude-chat-safety-panel");
  const chip = document.getElementById("claude-target-chip");
  const resumeBtn = document.getElementById("claude-resume-btn");
  const timeline = document.getElementById("claude-fs-timeline");
  if (!(panel instanceof HTMLElement)
    || !(chip instanceof HTMLElement)
    || !(resumeBtn instanceof HTMLButtonElement)
    || !(timeline instanceof HTMLElement)) return;

  const events = getClaudeFilesystemEvents();
  const target = getClaudeLockedProjectTarget();
  const visible = currentMode === "claude" || currentMode === "edit" || events.length > 0 || Boolean(target);
  panel.style.display = visible ? "flex" : "none";

  chip.textContent = target ? `Target: ${target}` : "Target: not locked";
  chip.title = target
    ? `Claude writes are locked to ${target} for this chat`
    : "Claude will use the configured approved folders";

  const showResume = events.length > 0 || hasClaudeRateLimitNotice();
  resumeBtn.style.display = showResume ? "inline-flex" : "none";
  resumeBtn.disabled = isStreaming;
  resumeBtn.title = isStreaming ? "Claude is still running" : "Prepare a continuation prompt from the last filesystem activity";

  const recentEvents = events.slice(-4).reverse();
  timeline.innerHTML = recentEvents.map((event) => {
    const action = event.action === "writing"
      ? "wrote"
      : event.action === "creating directory"
        ? "created dir"
        : event.action === "moving"
          ? "moved"
          : event.action;
    const displayPath = formatClaudeTimelinePath(event.path, target);
    return [
      '<span class="claude-fs-event">',
      `<span class="claude-fs-event-action">${escHtml(action)}</span>`,
      `<span class="claude-fs-event-path" title="${escHtml(event.path)}">${escHtml(displayPath)}</span>`,
      "</span>"
    ].join("");
  }).join("");
}

function fillClaudeResumePrompt(): void {
  if (isStreaming) {
    showToast("Wait for the current Claude run to finish.", 2200);
    return;
  }
  applyMode("claude");
  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = buildClaudeRateLimitResumePrompt(inferClaudeResumeProjectPath());
  input.dispatchEvent(new Event("input"));
  input.focus();
  showToast("Resume prompt ready.", 1600);
}
