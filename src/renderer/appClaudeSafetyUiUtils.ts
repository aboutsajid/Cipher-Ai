function setClaudeStatus(text: string, tone: "ok" | "err" | "busy" | "" = ""): void {
  const btn = document.getElementById("quick-claude-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.title = text ? `Claude Code: ${text}` : "Claude Code";
  btn.classList.remove("status-ok", "status-err", "status-busy");
  if (tone) btn.classList.add(`status-${tone}`);
  btn.classList.toggle("active", currentMode === "claude");
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
