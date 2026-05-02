function syncComposerAgentPrompts(source: "composer" | "agent"): void {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (!(composerInput instanceof HTMLTextAreaElement) || !(agentInput instanceof HTMLTextAreaElement)) return;

  if (source === "composer") {
    agentInput.value = composerInput.value;
    return;
  }

  composerInput.value = agentInput.value;
  composerInput.dispatchEvent(new Event("input"));
}

function resolveAgentPromptInput(): { input: HTMLTextAreaElement; source: "composer" | "agent" } | null {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (!(composerInput instanceof HTMLTextAreaElement) || !(agentInput instanceof HTMLTextAreaElement)) return null;

  const composerPrompt = composerInput.value.trim();
  const agentPrompt = agentInput.value.trim();
  const activeElement = document.activeElement;

  if (activeElement === agentInput && agentPrompt) return { input: agentInput, source: "agent" };
  if (activeElement === composerInput && composerPrompt) return { input: composerInput, source: "composer" };
  if (agentPrompt) return { input: agentInput, source: "agent" };
  if (composerPrompt) return { input: composerInput, source: "composer" };
  return null;
}

function clearAgentPrompts(): void {
  const composerInput = document.getElementById("composer-input");
  const agentInput = document.getElementById("agent-prompt-input");
  if (composerInput instanceof HTMLTextAreaElement) {
    composerInput.value = "";
    composerInput.dispatchEvent(new Event("input"));
  }
  if (agentInput instanceof HTMLTextAreaElement) {
    agentInput.value = "";
    agentInput.dispatchEvent(new Event("input"));
  }
}
