async function refreshRouterStatus(options?: { includeLogs?: boolean }) {
  const status = await window.api.router.status();
  const dot = $("router-dot");
  const text = $("router-status-text");
  const portEl = $("router-port-text");

  if (status.running) {
    dot.className = "router-dot on";
    text.textContent = "Router Running";
    portEl.textContent = `Port ${status.port} - PID ${status.pid ?? "?"}`;
  } else {
    dot.className = "router-dot off";
    text.textContent = "Router Stopped";
    portEl.textContent = `Port ${status.port}`;
  }

  if (options?.includeLogs) {
    await loadRouterLogs();
  }
}

async function loadRouterLogs() {
  const logs = await window.api.router.logs();
  $("router-log").textContent = logs.join("\n");
}
