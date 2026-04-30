function getAgentApprovalWarning(prompt: string): string | null {
  const normalized = (prompt ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const warnings: string[] = [];
  if (["build a new", "create a new", "bootstrap", "scaffold", "generated-apps/"].some((term) => normalized.includes(term))) {
    warnings.push("This task may scaffold a new project folder.");
  }
  if (["npm install", "install dependencies", "install package", "add dependency", "package.json"].some((term) => normalized.includes(term))) {
    warnings.push("This task may install or change dependencies.");
  }
  if (["remove", "delete", "rewrite", "replace entire", "overwrite"].some((term) => normalized.includes(term))) {
    warnings.push("This task may overwrite or remove files.");
  }

  if (warnings.length === 0) return null;
  return `${warnings.join(" ")} A rollback snapshot will be created automatically. Continue?`;
}

function buildAgentChatContent(task: AgentTask, logs: string[]): string {
  const lines: string[] = [
    `Agent status: ${task.status}`,
    `Activity: ${buildAgentActivityLabel(task)}`,
    ...(buildAgentLatestUpdateLabel(task) ? [`Latest update: ${buildAgentLatestUpdateLabel(task)}`] : []),
    ...(task.artifactType ? [`Artifact: ${formatAgentArtifactType(task.artifactType)}`] : []),
    ...(task.executionSpec?.starterProfile ? [`Starter profile: ${formatStarterProfileLabel(task.executionSpec.starterProfile)}`] : []),
    ...(task.executionSpec?.domainFocus ? [`Domain focus: ${formatDomainFocusLabel(task.executionSpec.domainFocus)}`] : []),
    ...(task.executionSpec?.summary ? [`Execution brief: ${task.executionSpec.summary}`] : []),
    ...(task.executionSpec?.deliverables?.length ? [`Deliverables: ${task.executionSpec.deliverables.join(" | ")}`] : []),
    ...(task.executionSpec?.acceptanceCriteria?.length ? [`Acceptance: ${task.executionSpec.acceptanceCriteria.join(" | ")}`] : []),
    ...(task.executionSpec?.qualityGates?.length ? [`Quality gates: ${task.executionSpec.qualityGates.join(" | ")}`] : []),
    ...(task.output?.primaryAction ? [`Primary action: ${formatAgentPrimaryAction(task.output.primaryAction)}`] : []),
    ...(task.output?.runCommand ? [`Run command: ${task.output.runCommand}`] : []),
    ...(task.output?.workingDirectory ? [`Working directory: ${task.output.workingDirectory}`] : []),
    ...(task.output?.packageName ? [`Package: ${task.output.packageName}`] : []),
    ...(task.output?.usageTitle ? [`Usage title: ${task.output.usageTitle}`] : []),
    ...(task.output?.usageDetail ? [`Usage: ${task.output.usageDetail}`] : []),
    ...(task.targetPath ? [`Target: ${task.targetPath}`] : []),
    ...(task.rollbackSnapshotId ? [`Rollback: ${task.rollbackSnapshotId}`] : []),
    ...(task.completionSnapshotId ? [`After snapshot: ${task.completionSnapshotId}`] : []),
    ...(task.verification ? [`Verification: ${task.verification.summary}`] : []),
    ...(task.summary ? ["", task.summary] : [])
  ];

  if (task.verification?.checks.length) {
    lines.push(...task.verification.checks.map((check) => `Verification check: ${check.label} - ${check.status} - ${check.details}`));
  }

  if (task.steps.length > 0) {
    lines.push("", "Steps:");
    for (const step of task.steps) {
      lines.push(`- ${step.status.toUpperCase()} ${step.title}${step.summary ? `: ${step.summary}` : ""}`);
    }
  }

  const recentLogs = logs.slice(-6);
  if (recentLogs.length > 0) {
    lines.push("", "Recent logs:", "```text", ...recentLogs, "```");
  }

  return lines.join("\n").trim();
}

function buildAgentActivityLabel(task: AgentTask): string {
  const runningStep = task.steps.find((step) => step.status === "running");
  const latestStep = runningStep ?? task.steps[task.steps.length - 1];
  if (!latestStep) return "Agent is working...";

  const activityPhrase = humanizeAgentStepTitle(latestStep.title);

  if (!activityPhrase) return "Agent is working...";
  if (task.status === "completed") return "Agent completed the task.";
  if (task.status === "failed") return "Agent hit a failure.";
  return `Agent is ${activityPhrase}...`;
}

function buildAgentLatestUpdateLabel(task: AgentTask): string {
  const latestStep = task.steps[task.steps.length - 1];
  if (!latestStep) return "";
  if (latestStep.summary?.trim()) return latestStep.summary.trim();
  return latestStep.title.trim();
}

async function ensureChatForAgentOutput(): Promise<string> {
  if (currentChatId) return currentChatId;
  return createNewChat(false);
}

async function appendAgentTaskToChat(prompt: string, task: AgentTask): Promise<void> {
  const chatId = await ensureChatForAgentOutput();
  const now = new Date().toISOString();
  const userMessage: Message = {
    id: `agent-user-${task.id}`,
    role: "user",
    content: prompt,
    createdAt: now,
    metadata: task.attachments?.length ? { attachmentNames: task.attachments.map((attachment) => attachment.name) } : undefined
  };
  const assistantMessage: Message = {
    id: `agent-assistant-${task.id}`,
    role: "assistant",
    content: buildAgentChatContent(task, []),
    createdAt: now,
    model: "Agent"
  };

  await window.api.chat.appendMessage(chatId, userMessage);
  appendMessage(userMessage);
  await window.api.chat.appendMessage(chatId, assistantMessage);
  appendMessage(assistantMessage);
  agentChatMessageMap.set(task.id, {
    chatId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id
  });
}

async function updateAgentTaskInChat(task: AgentTask, logs: string[]): Promise<void> {
  const mapped = agentChatMessageMap.get(task.id);
  if (!mapped) return;
  const content = buildAgentChatContent(task, logs);
  updateMessageContent(mapped.assistantMessageId, content, true, true);
  try {
    await window.api.chat.updateMessage(mapped.chatId, mapped.assistantMessageId, {
      content,
      model: "Agent"
    });
  } catch {
    // Keep UI responsive even if persistence fails.
  }
}
