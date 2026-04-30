function parseArgsInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((arg) => String(arg)).filter(Boolean);
  } catch {
    return [];
  }
}

function getEnabledToolNames(): string[] {
  return [...enabledMcpTools];
}

function renderMcpTools(): void {
  const host = $("mcp-tools-list");
  host.innerHTML = "";

  if (mcpStatus.tools.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mcp-tool-item";
    empty.textContent = "No MCP tools available. Start a server to expose tools here.";
    host.appendChild(empty);
    return;
  }

  for (const tool of mcpStatus.tools) {
    const row = document.createElement("div");
    row.className = "mcp-tool-item";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabledMcpTools.has(tool);
    checkbox.onchange = () => {
      if (checkbox.checked) enabledMcpTools.add(tool);
      else enabledMcpTools.delete(tool);
      updateDirectSaveUi();
    };
    const text = document.createElement("span");
    text.textContent = tool;
    label.appendChild(checkbox);
    label.appendChild(text);
    row.appendChild(label);
    host.appendChild(row);
  }
}

function renderMcpServers(): void {
  const host = $("mcp-list");
  host.innerHTML = "";
  const logEl = $("mcp-log");
  logEl.textContent = "";

  if (mcpStatus.servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mcp-item";
    empty.textContent = "No MCP servers configured yet.";
    host.appendChild(empty);
    logEl.textContent = "MCP logs will appear here after a server starts.";
    return;
  }

  for (const server of mcpStatus.servers) {
    const row = document.createElement("div");
    row.className = "mcp-item";

    const left = document.createElement("span");
    left.textContent = server.running ? `${server.name} (running)` : server.name;

    const actions = document.createElement("div");
    actions.className = "btn-row";

    const startStop = document.createElement("button");
    startStop.className = "btn-ghost-sm";
    startStop.type = "button";
    startStop.textContent = server.running ? "Stop" : "Start";
    startStop.onclick = async () => {
      startStop.disabled = true;
      remove.disabled = true;
      startStop.textContent = server.running ? "Stopping..." : "Starting...";
      try {
        const response = server.running
          ? await window.api.mcp.stop(server.name)
          : await window.api.mcp.start(server.name);
        showToast(response.message, response.ok ? 1800 : 3200);
        await refreshMcpStatus();
      } catch (err) {
        showToast(`MCP action failed: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
        startStop.disabled = false;
        remove.disabled = false;
        startStop.textContent = server.running ? "Stop" : "Start";
      }
    };

    const remove = document.createElement("button");
    remove.className = "btn-ghost-sm";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.onclick = async () => {
      startStop.disabled = true;
      remove.disabled = true;
      remove.textContent = "Removing...";
      try {
        await window.api.mcp.remove(server.name);
        showToast(`${server.name} removed.`, 1800);
        await refreshMcpStatus();
      } catch (err) {
        showToast(`Failed to remove MCP server: ${err instanceof Error ? err.message : "unknown error"}`, 3400);
        startStop.disabled = false;
        remove.disabled = false;
        remove.textContent = "Remove";
      }
    };

    actions.appendChild(startStop);
    actions.appendChild(remove);
    row.appendChild(left);
    row.appendChild(actions);
    host.appendChild(row);

    if (server.logs.length > 0) {
      logEl.textContent += `[${server.name}]\n${server.logs.join("\n")}\n`;
    }
  }

  if (!logEl.textContent.trim()) {
    logEl.textContent = "No MCP logs yet.";
  }
  logEl.scrollTop = logEl.scrollHeight;
}

async function refreshMcpStatus(): Promise<void> {
  mcpStatus = await window.api.mcp.status();
  const allowed = new Set(mcpStatus.tools);
  for (const tool of [...enabledMcpTools]) {
    if (!allowed.has(tool)) enabledMcpTools.delete(tool);
  }
  renderMcpServers();
  renderMcpTools();
  updateDirectSaveUi();
}

function renderOllamaModels(models: string[]): void {
  const list = $("ollama-models-list");
  if (models.length === 0) {
    list.textContent = "No local models found.";
    return;
  }
  list.textContent = models.join("\n");
}

function toggleOllamaSettingsVisibility(): void {
  applyProviderUiState(providerMode);
}
