function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toDisplayLabel(value: string, fallback = "Desktop app"): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return fallback;

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canPromptToLaunchDesktopApp(task: AgentTask): boolean {
  return task.status === "completed"
    && task.artifactType === "desktop-app"
    && task.output?.primaryAction === "run-desktop"
    && Boolean(task.output.runCommand?.trim())
    && Boolean((task.output.workingDirectory ?? task.targetPath)?.trim());
}

async function promptToLaunchDesktopApp(task: AgentTask): Promise<void> {
  if (!canPromptToLaunchDesktopApp(task)) return;
  handledDesktopLaunchPromptTasks.add(task.id);
  pendingDesktopLaunchPromptTasks.delete(task.id);

  const workingDirectory = (task.output?.workingDirectory ?? task.targetPath ?? "").trim();
  const runCommand = (task.output?.runCommand ?? "").trim();
  if (!workingDirectory || !runCommand) return;

  const packageName = toDisplayLabel(task.output?.packageName?.trim() || "", "Desktop app");
  const shouldOpen = window.confirm(
    `${packageName} build successful. Do you want to open it now?\n\nCommand: ${runCommand}\nFolder: ${workingDirectory}`
  );
  if (!shouldOpen) {
    showToast("Desktop app is ready. You can run it later from the generated folder.", 2600);
    return;
  }

  const launchScript = [
    `$wd = ${quotePowerShellLiteral(workingDirectory)}`,
    `$cmd = ${quotePowerShellLiteral(runCommand)}`,
    "Start-Process -FilePath 'cmd.exe' -WorkingDirectory $wd -ArgumentList @('/k', $cmd)"
  ].join("; ");

  try {
    const result = await window.api.terminal.run({
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", launchScript],
      timeoutMs: 10000
    });
    if (result.ok) {
      showToast("Desktop app launch started.", 2200);
      return;
    }
    showToast("Desktop app launch failed. Use the Run command shown in the result card.", 3200);
  } catch {
    showToast("Desktop app launch failed. Run it manually from the generated folder.", 3200);
  }
}
