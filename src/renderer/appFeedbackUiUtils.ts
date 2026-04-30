function mountTopbarControls(): void {
  const topbarControls = document.getElementById("app-topbar-controls");
  const workspaceHeader = document.querySelector(".chat-header");
  const controls = workspaceHeader?.querySelector(".chat-header-right");
  if (!(topbarControls instanceof HTMLElement) || !(controls instanceof HTMLElement)) return;
  topbarControls.replaceChildren(controls);
}

function showToast(msg: string, duration = 2500) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const normalized = (text ?? "").trim();
  if (!normalized) return false;

  try {
    await navigator.clipboard.writeText(normalized);
    return true;
  } catch {
    try {
      return await window.api.clipboard.writeText(normalized);
    } catch {
      return false;
    }
  }
}

function setStatus(msg: string, type: "ok" | "err" | "" = "") {
  const el = $("settings-status");
  el.textContent = msg;
  el.className = "status-msg " + type;
}
