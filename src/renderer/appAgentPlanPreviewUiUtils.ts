interface AgentPlanPreviewModalResolution {
  approved: boolean;
  prompt: string;
}

interface AgentPlanPreviewModalState {
  runMode: AgentTaskRunMode;
  targetPath?: string;
  budget?: AgentTaskRunBudget;
}

let pendingAgentPlanPreviewResolve: ((result: AgentPlanPreviewModalResolution) => void) | null = null;
let activeAgentPlanPreviewState: AgentPlanPreviewModalState | null = null;

function formatAgentPlanPreviewBudget(budget?: AgentTaskRunBudget): string {
  if (!budget) return "Budgets: none";
  const labels: string[] = [];
  if (budget.maxRuntimeMs) labels.push(`runtime <= ${Math.ceil(budget.maxRuntimeMs / 60_000)} min`);
  if (budget.maxCommands) labels.push(`commands <= ${budget.maxCommands}`);
  if (budget.maxFileEdits) labels.push(`files <= ${budget.maxFileEdits}`);
  if (budget.maxRepairAttempts) labels.push(`repairs <= ${budget.maxRepairAttempts}`);
  return labels.length > 0 ? `Budgets: ${labels.join(" | ")}` : "Budgets: none";
}

function formatAgentPlanPreviewDetails(preview: AgentTaskPlanPreview): string {
  const lines: string[] = [];
  lines.push(`Artifact: ${preview.artifactType}`);
  lines.push(`Run mode: ${preview.runMode}`);
  lines.push(`Working directory: ${preview.workingDirectory}`);
  if (preview.targetPath) {
    lines.push(`Target path: ${preview.targetPath}`);
  }
  lines.push("");
  lines.push("Stages:");
  for (const stage of preview.stages) {
    lines.push(`- ${stage}`);
  }
  lines.push("");
  lines.push("Work items:");
  for (const item of preview.workItems) {
    lines.push(`- ${item}`);
  }
  if (preview.qualityGates.length > 0) {
    lines.push("");
    lines.push("Quality gates:");
    for (const gate of preview.qualityGates) {
      lines.push(`- ${gate}`);
    }
  }
  if (preview.requiredScripts.length > 0) {
    lines.push("");
    lines.push("Detected scripts:");
    lines.push(`- ${preview.requiredScripts.join(", ")}`);
  }
  if (preview.candidateFiles.length > 0) {
    lines.push("");
    lines.push("Likely touched files:");
    for (const file of preview.candidateFiles) {
      lines.push(`- ${file}`);
    }
  }
  return lines.join("\n");
}

async function refreshAgentPlanPreviewModal(): Promise<void> {
  const state = activeAgentPlanPreviewState;
  if (!state) return;
  const promptInput = $("agent-plan-preview-prompt") as HTMLTextAreaElement;
  const detailsEl = $("agent-plan-preview-details");
  const summaryEl = $("agent-plan-preview-summary");
  const normalizedPrompt = (promptInput.value ?? "").trim();
  if (!normalizedPrompt) {
    summaryEl.textContent = "Prompt is required to build a plan preview.";
    detailsEl.textContent = "";
    return;
  }
  summaryEl.textContent = "Building plan preview...";
  detailsEl.textContent = "";
  try {
    const preview = await window.api.agent.previewPlan({
      prompt: normalizedPrompt,
      runMode: state.runMode,
      targetPath: state.targetPath,
      budget: state.budget
    });
    summaryEl.textContent = preview.summary;
    detailsEl.textContent = formatAgentPlanPreviewDetails(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan preview failed.";
    summaryEl.textContent = message;
    detailsEl.textContent = "";
  }
}

function closeAgentPlanPreviewModal(result?: AgentPlanPreviewModalResolution): void {
  const resolver = pendingAgentPlanPreviewResolve;
  pendingAgentPlanPreviewResolve = null;
  activeAgentPlanPreviewState = null;
  const modal = document.getElementById("agent-plan-preview-modal");
  if (modal instanceof HTMLElement) {
    modal.style.display = "none";
  }
  if (!resolver) return;
  if (result) {
    resolver(result);
    return;
  }
  resolver({ approved: false, prompt: "" });
}

async function openAgentPlanPreviewModal(
  prompt: string,
  runMode: AgentTaskRunMode,
  targetPath?: string,
  budget?: AgentTaskRunBudget
): Promise<AgentPlanPreviewModalResolution> {
  if (pendingAgentPlanPreviewResolve) {
    closeAgentPlanPreviewModal({ approved: false, prompt: "" });
  }
  activeAgentPlanPreviewState = {
    runMode,
    targetPath: (targetPath ?? "").trim() || undefined,
    budget
  };
  const modal = $("agent-plan-preview-modal");
  const promptInput = $("agent-plan-preview-prompt") as HTMLTextAreaElement;
  const summaryEl = $("agent-plan-preview-summary");
  const detailsEl = $("agent-plan-preview-details");
  const budgetEl = $("agent-plan-preview-budget");
  promptInput.value = (prompt ?? "").trim();
  summaryEl.textContent = "Preview the plan and adjust prompt before run.";
  detailsEl.textContent = "";
  budgetEl.textContent = formatAgentPlanPreviewBudget(budget);
  modal.style.display = "flex";
  promptInput.focus();
  promptInput.selectionStart = promptInput.value.length;
  promptInput.selectionEnd = promptInput.value.length;
  void refreshAgentPlanPreviewModal();
  return await new Promise<AgentPlanPreviewModalResolution>((resolve) => {
    pendingAgentPlanPreviewResolve = resolve;
  });
}
