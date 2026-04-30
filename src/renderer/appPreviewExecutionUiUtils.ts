function renderCodeOutput(block: HTMLElement, output: string, isError = false): void {
  let panel = block.querySelector<HTMLElement>(".code-output");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "code-output";
    block.appendChild(panel);
  }
  panel.classList.toggle("error", isError);
  panel.textContent = output;
}

async function openDetachedPreview(): Promise<void> {
  if (!activePreviewUrl) {
    showToast("No preview loaded.", 1800);
    return;
  }

  const title = activePreviewTarget
    ? activePreviewTarget.split("/").pop() ?? "Cipher Preview"
    : "Cipher Preview";
  const result = await window.api.app.openPreviewWindow(activePreviewUrl, title);
  showToast(result.message, result.ok ? 1800 : 2600);
}

function runJavaScriptPreview(block: HTMLElement, code: string): void {
  const lines: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (...args: unknown[]) => {
      lines.push(args.map(formatConsoleValue).join(" "));
    };
    new Function(code)();
    if (lines.length === 0) lines.push("[no console output]");
    renderCodeOutput(block, lines.join("\n"), false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    renderCodeOutput(block, `Error: ${message}`, true);
  } finally {
    console.log = originalLog;
  }
}
