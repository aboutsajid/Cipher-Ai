function setLocalAgentStatus(message: string, tone: "ok" | "err" | "" = ""): void {
  const el = document.getElementById("local-agent-status");
  if (!(el instanceof HTMLElement)) return;
  el.textContent = message;
  el.classList.remove("ok", "err");
  if (tone) el.classList.add(tone);
}

function setLocalAgentWorkspacePath(pathText: string): void {
  const el = document.getElementById("local-agent-workspace-path");
  if (!(el instanceof HTMLElement)) return;
  el.textContent = pathText;
  el.title = pathText;
}

async function refreshLocalAgentWorkspacePath(): Promise<void> {
  setLocalAgentWorkspacePath("Loading...");
  try {
    const workspacePath = await window.api.app.workspacePath();
    workspaceRootPath = workspacePath;
    setLocalAgentWorkspacePath(workspacePath);
  } catch (err) {
    workspaceRootPath = "";
    const message = err instanceof Error ? err.message : "Unavailable";
    setLocalAgentWorkspacePath(`Unavailable: ${message}`);
  }
}

async function resetClaudeSessionAfterManagedWrite(): Promise<void> {
  if (claudeSessionResetting) return;

  claudeSessionResetting = true;
  suppressClaudeExitNotice = true;
  claudeSessionRunning = false;
  setClaudeStatus("Resetting Claude Code...", "busy");

  try {
    await window.api.claude.stop();
  } catch {
    // A failed stop is non-fatal here; the next start attempt will surface a real error if needed.
  }

  try {
    const res = await window.api.claude.start();
    claudeSessionRunning = Boolean(res.running);
    if (!res.ok) {
      setClaudeStatus(res.message, "err");
      showToast(res.message, 3500);
      appendClaudeLine(res.message, "stderr");
      return;
    }
    setClaudeStatus("Ready", "ok");
  } catch (err) {
    claudeSessionRunning = false;
    const msg = err instanceof Error ? err.message : "Failed to restart Claude Code.";
    setClaudeStatus(msg, "err");
    showToast(msg, 3500);
    appendClaudeLine(msg, "stderr");
  } finally {
    claudeSessionResetting = false;
  }
}

async function ensureWorkspaceRootPath(): Promise<string> {
  if (workspaceRootPath.trim()) return workspaceRootPath.trim();

  try {
    const workspacePath = (await window.api.app.workspacePath()).trim();
    workspaceRootPath = workspacePath;
    if (workspacePath) setLocalAgentWorkspacePath(workspacePath);
    return workspacePath;
  } catch {
    return "";
  }
}

function getAgentTargetInput(): HTMLInputElement | null {
  const input = document.getElementById("agent-target-input");
  return input instanceof HTMLInputElement ? input : null;
}

function setAgentTargetInputValue(value: string): void {
  const targetInput = getAgentTargetInput();
  if (!targetInput) return;
  targetInput.value = value;
  targetInput.dispatchEvent(new Event("input"));
}

function normalizeAgentTargetPath(value: string, workspaceRoot = workspaceRootPath): string {
  let normalized = (value ?? "").trim().replace(/\\/g, "/");
  if (!normalized) return "";

  const normalizedWorkspaceRoot = (workspaceRoot ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedWorkspaceRoot) {
    const loweredPath = normalized.toLowerCase();
    const loweredRoot = normalizedWorkspaceRoot.toLowerCase();
    if (loweredPath === loweredRoot) {
      return ".";
    }
    if (loweredPath.startsWith(`${loweredRoot}/`)) {
      normalized = normalized.slice(normalizedWorkspaceRoot.length).replace(/^\/+/, "");
    }
  }

  normalized = normalized.replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/+$/, "");
  return normalized || ".";
}

function getRequestedAgentTargetPath(): string {
  return normalizeAgentTargetPath(getAgentTargetInput()?.value ?? "");
}

function shouldPromptForAgentTargetSelection(prompt: string): boolean {
  const normalizedPrompt = (prompt ?? "").trim().toLowerCase();
  if (!normalizedPrompt) return false;
  if (normalizedPrompt.includes("generated-apps/")) return false;

  const actionSignals = ["build", "create", "make", "start", "bootstrap", "scaffold", "give me", "i want", "i need"];
  const scopeSignals = [
    "app",
    "project",
    "page",
    "site",
    "website",
    "landing page",
    "pricing page",
    "microsite",
    "showcase page",
    "marketing page",
    "dashboard",
    "admin panel",
    "analytics",
    "crud",
    "inventory",
    "contacts",
    "api",
    "service",
    "tool",
    "cli",
    "script",
    "library",
    "package",
    "module",
    "sdk",
    "kanban",
    "board",
    "workspace",
    "desktop",
    "desk",
    "tracker"
  ];
  const explicitlyNew = ["new app", "new project", "from scratch"].some((term) => normalizedPrompt.includes(term));
  const hasAction = actionSignals.some((term) => normalizedPrompt.includes(term));
  const hasScope = scopeSignals.some((term) => normalizedPrompt.includes(term));
  return (hasAction && hasScope) || explicitlyNew;
}

function extractAgentPromptTerms(prompt: string): string[] {
  const stopWords = new Set([
    "a", "an", "and", "app", "application", "build", "create", "for", "from", "in", "into", "make", "new",
    "page", "project", "site", "that", "the", "to", "tool", "with"
  ]);
  return (prompt ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !stopWords.has(term))
    .slice(0, 3);
}

function buildSuggestedAgentTargetPath(prompt: string): string {
  const namedMatch = /(?:called|named)\s+["']?([a-z0-9][a-z0-9 -]{1,40})["']?/i.exec(prompt);
  const rawName = namedMatch?.[1] ?? extractAgentPromptTerms(prompt).join("-");
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `generated-apps/${slug || "agent-app"}`;
}

function closeAgentTargetPromptModal(choice: AgentTargetPromptChoice | null = null): void {
  const modal = document.getElementById("agent-target-modal");
  if (modal instanceof HTMLElement) {
    modal.style.display = "none";
  }
  const resolvePrompt = pendingAgentTargetPromptResolve;
  pendingAgentTargetPromptResolve = null;
  resolvePrompt?.(choice);
}

function openAgentTargetPromptModal(prompt: string): Promise<AgentTargetPromptChoice | null> {
  if (pendingAgentTargetPromptResolve) {
    closeAgentTargetPromptModal(null);
  }

  const modal = $("agent-target-modal");
  const suggestion = buildSuggestedAgentTargetPath(prompt);
  $("agent-target-modal-suggestion").textContent = suggestion;
  modal.style.display = "flex";
  const suggestBtn = document.getElementById("agent-target-modal-suggest-btn");
  if (suggestBtn instanceof HTMLButtonElement) {
    suggestBtn.focus();
  }
  return new Promise((resolve) => {
    pendingAgentTargetPromptResolve = resolve;
  });
}

async function ensureAgentTargetSelectionBeforeStart(prompt: string): Promise<boolean> {
  if (getRequestedAgentTargetPath()) return true;
  if (!shouldPromptForAgentTargetSelection(prompt)) return true;

  const choice = await openAgentTargetPromptModal(prompt);
  if (choice === "suggested") {
    setAgentTargetInputValue(buildSuggestedAgentTargetPath(prompt));
    return true;
  }
  if (choice === "choose") {
    const picked = await pickAgentTargetFolder();
    if (!picked) {
      setAgentStatus("Agent start paused. No target folder selected.");
      return false;
    }
    return true;
  }
  if (choice === "skip") {
    return true;
  }

  setAgentStatus("Agent start cancelled.");
  return false;
}

async function pickAgentTargetFolder(): Promise<boolean> {
  const picked = await window.api.attachments.pickWritableRoots();
  const pickedPath = (picked[0]?.writableRoot ?? "").trim();
  if (!pickedPath) {
    return false;
  }

  const workspaceRoot = await ensureWorkspaceRootPath();
  const normalizedWorkspaceRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPickedPath = pickedPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const loweredRoot = normalizedWorkspaceRoot.toLowerCase();
  const loweredPicked = normalizedPickedPath.toLowerCase();

  if (!normalizedWorkspaceRoot || (loweredPicked !== loweredRoot && !loweredPicked.startsWith(`${loweredRoot}/`))) {
    const message = "Choose a folder inside the current workspace root.";
    setAgentStatus(message, "err");
    showToast(message, 2800);
    return false;
  }

  const targetInput = getAgentTargetInput();
  if (!targetInput) return false;

  targetInput.value = normalizeAgentTargetPath(pickedPath, workspaceRoot);
  targetInput.dispatchEvent(new Event("input"));
  targetInput.focus();
  showToast(`Agent target set to ${targetInput.value || "."}.`, 2200);
  return true;
}

function pickPreferredLocalCoderModel(models: string[]): string {
  const normalized = models
    .map((model) => model.trim())
    .filter(Boolean);

  const preferredMatchers = [
    /qwen2\.5-coder:14b/i,
    /qwen2\.5-coder:7b/i,
    /qwen2\.5-coder/i,
    /qwen3/i,
    /deepseek-coder/i,
    /codellama/i,
    /starcoder/i,
    /codegemma/i
  ];

  for (const matcher of preferredMatchers) {
    const hit = normalized.find((model) => matcher.test(model));
    if (hit) return hit;
  }

  return normalized[0] ?? "";
}

async function setupFreeLocalCodingMode(): Promise<void> {
  const setupBtn = document.getElementById("setup-local-agent-btn");
  if (setupBtn instanceof HTMLButtonElement) setupBtn.disabled = true;
  setLocalAgentStatus("Checking local Ollama runtime...");

  try {
    const check = await window.api.ollama.check();
    if (!check.ok) {
      setProviderMode("ollama");
      setLocalAgentStatus(
        (check.message ?? "Ollama is not installed.")
        + ` Install Ollama, run \`ollama pull ${LOCAL_CODER_PRIMARY}\`, then retry.`,
        "err"
      );
      showToast("Ollama not found. Install it and pull a local coder model first.", 4200);
      return;
    }

    setProviderMode("ollama");
    const baseUrl = ($("ollama-base-url-input") as HTMLInputElement).value.trim() || "http://localhost:11434/v1";
    const models = await window.api.ollama.listModels(baseUrl);
    if (settings) settings.ollamaModels = models;
    renderOllamaModels(models);

    if (models.length === 0) {
      populateModels();
      setLocalAgentStatus(`Ollama is installed, but no local models were found. Run \`ollama pull ${LOCAL_CODER_PRIMARY}\` and try again.`, "err");
      showToast("No local Ollama models found. Pull a model first.", 3600);
      return;
    }

    const preferredModel = pickPreferredLocalCoderModel(models);
    const defaultModel = `ollama/${preferredModel}`;
    ($("default-model-input") as HTMLInputElement).value = defaultModel;
    ($("models-textarea") as HTMLTextAreaElement).value = models.map((model) => `ollama/${model}`).join("\n");

    settings = await window.api.settings.save({
      defaultModel,
      ollamaEnabled: true,
      ollamaBaseUrl: baseUrl,
      ollamaModels: models
    });

    renderOllamaModels(settings.ollamaModels ?? []);
    setProviderMode("ollama");
    populateModels();
    autoSwitchToOllamaIfNeeded();
    setStatus("Local Ollama mode saved.", "ok");
    setLocalAgentStatus(`Local coding mode is ready with ${preferredModel}. Recommended fallback: ${LOCAL_CODER_FALLBACK}. Next: prepare Filesystem MCP for this workspace.`, "ok");
    showToast(`Local mode ready: ${preferredModel}`, 2600);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to configure local mode.";
    setLocalAgentStatus(`Local setup failed: ${message}`, "err");
    showToast(`Local setup failed: ${message}`, 3600);
  } finally {
    if (setupBtn instanceof HTMLButtonElement) setupBtn.disabled = false;
  }
}

async function prepareWorkspaceFilesystemMcp(): Promise<void> {
  const prepBtn = document.getElementById("setup-filesystem-mcp-btn");
  if (prepBtn instanceof HTMLButtonElement) prepBtn.disabled = true;
  setLocalAgentStatus("Preparing Filesystem MCP for this workspace...");

  try {
    const workspacePath = await window.api.app.workspacePath();
    setLocalAgentWorkspacePath(workspacePath);
    const command = navigator.platform.toLowerCase().includes("win") ? "npx.cmd" : "npx";
    const args = ["-y", "@modelcontextprotocol/server-filesystem", workspacePath];

    ($("mcp-name-input") as HTMLInputElement).value = "Filesystem";
    ($("mcp-command-input") as HTMLInputElement).value = command;
    ($("mcp-args-input") as HTMLInputElement).value = JSON.stringify(args);

    await window.api.mcp.add({ name: "Filesystem", command, args });
    await refreshMcpStatus();
    openPanel("router");

    setLocalAgentStatus("Filesystem MCP saved for this workspace. Start it in the Router panel and enable the tool checkbox.", "ok");
    showToast("Filesystem MCP saved for this workspace.", 2600);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to prepare Filesystem MCP.";
    setLocalAgentStatus(`Filesystem MCP setup failed: ${message}`, "err");
    showToast(`Filesystem MCP setup failed: ${message}`, 3600);
  } finally {
    if (prepBtn instanceof HTMLButtonElement) prepBtn.disabled = false;
  }
}

function findFilesystemServer(): McpServerRuntime | null {
  return mcpStatus.servers.find((server) => {
    const haystack = `${server.name} ${server.command} ${server.args.join(" ")} ${server.tools.join(" ")}`.toLowerCase();
    return haystack.includes("file") || haystack.includes("filesystem") || haystack.includes("server-filesystem");
  }) ?? null;
}

function findFilesystemToolName(): string {
  const tool = mcpStatus.tools.find((name) => {
    const normalized = name.toLowerCase();
    return normalized.includes("file") || normalized.includes("filesystem") || normalized.includes("fs");
  });
  return tool ?? "Filesystem.tool";
}

async function ensureFilesystemToolReadyForEditSave(): Promise<boolean> {
  try {
    let filesystemServer = findFilesystemServer();
    if (!filesystemServer) {
      await prepareWorkspaceFilesystemMcp();
      await refreshMcpStatus();
      filesystemServer = findFilesystemServer();
    }

    if (!filesystemServer) {
      showToast("Filesystem MCP tayar nahi ho saka.", 3200);
      return false;
    }

    if (!filesystemServer.running) {
      const response = await window.api.mcp.start(filesystemServer.name);
      showToast(response.message, 2200);
      await refreshMcpStatus();
    }

    enabledMcpTools.add(findFilesystemToolName());
    renderMcpTools();
    updateDirectSaveUi();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filesystem tool auto-start failed.";
    showToast(message, 3600);
    return false;
  }
}
