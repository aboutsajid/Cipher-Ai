function createEmptyStateElement(): HTMLDivElement {
  const applyComposerDraft = (content: string) => {
    const input = $("composer-input") as HTMLTextAreaElement;
    input.value = content;
    input.dispatchEvent(new Event("input"));
    input.focus();
  };

  const recentChats = cachedChatSummaries.slice(0, 3);
  const quickActions: Array<{
    label: string;
    desc: string;
    benefit: string;
    content: string;
    icon: string;
  }> = currentInteractionMode === "agent"
    ? [
        {
          label: "Build UI",
          desc: "Ship a focused feature with verification.",
          benefit: "Best for scoped feature delivery.",
          content: AGENT_MODE_TEMPLATES[0]?.content ?? "Build this feature in the current project, verify build/lint, and summarize what changed.",
          icon: "&#128736;"
        },
        {
          label: "Fix Bug",
          desc: "Investigate and patch a safe fix.",
          benefit: "Best for root-cause + safe patch.",
          content: AGENT_MODE_TEMPLATES[1]?.content ?? "Investigate this bug, make the smallest safe fix, run verification, and explain the root cause.",
          icon: "&#9888;"
        },
        {
          label: "Continue Build",
          desc: "Keep momentum on an existing task output.",
          benefit: "Best for iteration on recent output.",
          content: AGENT_MODE_TEMPLATES[2]?.content ?? "Continue working on the current task output. Improve it, keep scope focused, and make sure it runs cleanly.",
          icon: "&#10227;"
        }
      ]
    : [
        {
          label: "Explain Code",
          desc: "Break down logic, risks, and edge cases.",
          benefit: "Best for quick code understanding.",
          content: CHAT_MODE_TEMPLATES[0]?.content ?? "Explain this code clearly.",
          icon: "&#8505;"
        },
        {
          label: "Write Reply",
          desc: "Draft a concise, natural response.",
          benefit: "Best for polished communication.",
          content: CHAT_MODE_TEMPLATES[1]?.content ?? "Help me write a clear reply.",
          icon: "&#9998;"
        },
        {
          label: "Debug Idea",
          desc: "Think through likely causes and fixes.",
          benefit: "Best for investigation planning.",
          content: CHAT_MODE_TEMPLATES[2]?.content ?? "Think through this bug with me.",
          icon: "&#129504;"
        }
      ];

  const empty = document.createElement("div");
  empty.className = `empty-state${currentInteractionMode === "agent" ? " agent-empty-state" : " chat-empty-state"}`;
  empty.innerHTML = currentInteractionMode === "agent"
    ? '<div class="empty-hero"><div class="empty-kicker">Agent Mode</div><p><span class="empty-heading-icon" aria-hidden="true">&#9881;</span><span class="empty-heading-text">Run supervised coding tasks.</span></p><span class="empty-hero-copy empty-hero-copy-strong">Agent mode inspects, edits, verifies, and logs progress.</span><div class="empty-hero-metrics"><span>Safe edits</span><span>Verification checkpoints</span><span>Replayable run history</span></div></div>'
    : '<div class="empty-hero"><div class="empty-kicker">Workspace Home</div><p><span class="empty-heading-icon" aria-hidden="true">&#10024;</span><span class="empty-heading-text">Start work from a smarter home screen.</span></p><span class="empty-hero-copy"><span class="empty-subtle-icon">&#8984;</span> Chat, think, write, and launch focused tasks from one workspace.</span></div>';

  const actions = document.createElement("div");
  actions.className = "empty-actions";
  actions.innerHTML = currentInteractionMode === "agent"
    ? '<button class="btn-primary empty-action-btn" type="button" data-empty-action="local">Setup Local AI</button><button class="btn-ghost empty-action-btn" type="button" data-empty-action="open-settings">Open Settings</button>'
    : '<button class="btn-primary empty-action-btn" type="button" data-empty-action="new-chat">Start Chat</button><button class="btn-ghost empty-action-btn" type="button" data-empty-action="local">Setup Local AI</button>';
  empty.appendChild(actions);

  if (currentInteractionMode === "agent") {
    const startStrip = document.createElement("section");
    startStrip.className = "empty-start-strip";
    startStrip.innerHTML = '<div class="empty-panel-head"><span class="empty-panel-kicker">Start Here</span><strong>Launch your first run in three short steps</strong></div>';

    const steps = document.createElement("div");
    steps.className = "empty-start-grid";
    const stepItems: Array<{ title: string; detail: string; run: () => void }> = [
      {
        title: "Select provider",
        detail: "Choose OpenRouter, NVIDIA, or Ollama in Settings.",
        run: () => {
          openPanel("settings");
          showToast("Choose provider, model, then save settings.", 2200);
        }
      },
      {
        title: "Confirm workspace",
        detail: "Check local workspace root before running tasks.",
        run: () => {
          openPanel("settings");
          const rootDisplay = document.getElementById("local-agent-workspace-path");
          if (rootDisplay instanceof HTMLElement) {
            rootDisplay.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          showToast("Workspace root selected in Settings.", 2200);
        }
      },
      {
        title: "Start first task",
        detail: "Insert a starter prompt and press Enter to run.",
        run: () => {
          applyComposerDraft(quickActions[0]?.content ?? "Build this feature in the current project, verify build/lint, and summarize what changed.");
          showToast("Starter task added to composer.", 2000);
        }
      }
    ];
    stepItems.forEach((step, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "empty-start-step";
      btn.innerHTML = `<span class="empty-start-step-index">${idx + 1}</span><span class="empty-start-step-copy"><strong>${step.title}</strong><small>${step.detail}</small></span>`;
      btn.onclick = step.run;
      steps.appendChild(btn);
    });
    startStrip.appendChild(steps);
    empty.appendChild(startStrip);
  }

  const grid = document.createElement("div");
  grid.className = `empty-workspace-grid${currentInteractionMode === "agent" ? " agent-layout" : " chat-layout"}`;

  const quickSection = document.createElement("section");
  quickSection.className = `empty-panel empty-panel-quick${currentInteractionMode === "agent" ? " empty-panel-inline" : ""}`;
  quickSection.innerHTML = `<div class="empty-panel-head"><span class="empty-panel-kicker">Quick Actions</span><strong>${currentInteractionMode === "agent" ? "Launch a task" : "Start with a strong prompt"}</strong></div>`;
  const quickList = document.createElement("div");
  quickList.className = "empty-action-grid";
  for (const action of quickActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "empty-quick-card";
    button.innerHTML = `<span class="empty-quick-card-icon" aria-hidden="true">${action.icon}</span><span class="empty-quick-card-copy"><strong>${action.label}</strong><span>${action.desc}</span><small>${action.benefit}</small></span>`;
    button.onclick = () => applyComposerDraft(action.content);
    quickList.appendChild(button);
  }
  quickSection.appendChild(quickList);
  grid.appendChild(quickSection);

  const recentSection = document.createElement("section");
  recentSection.className = `empty-panel${currentInteractionMode === "agent" ? " empty-panel-recent" : ""}`;
  recentSection.innerHTML = currentInteractionMode === "agent"
    ? `<div class="empty-panel-head"><span class="empty-panel-kicker">Recent Runs</span><strong>${cachedAgentTasks.length > 0 ? "Resume recent runs" : "No recent tasks yet"}</strong></div>`
    : `<div class="empty-panel-head"><span class="empty-panel-kicker">Recent Chats</span><strong>${recentChats.length > 0 ? "Jump back into your work" : "No recent chats yet"}</strong></div>`;
  const recentList = document.createElement("div");
  recentList.className = currentInteractionMode === "agent" ? "empty-agent-task-list" : "empty-chat-list";
  if (currentInteractionMode === "agent") {
    recentList.innerHTML = buildMainAgentTaskCards(cachedAgentTasks);
  } else {
    recentList.innerHTML = buildMainChatCards(recentChats);
  }
  recentSection.appendChild(recentList);
  grid.appendChild(recentSection);

  empty.appendChild(grid);

  return empty;
}

async function handleGuidedUiAction(action: string): Promise<void> {
  switch (action) {
    case "local":
      applyUiExperience("simple");
      setProviderMode("ollama");
      openPanel("settings");
      await setupFreeLocalCodingMode();
      return;
    case "open-settings":
      openPanel("settings");
      return;
    case "new-chat":
      await createNewChat();
      return;
    default:
      return;
  }
}

function setupGuidedUiControls(): void {
  document.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const emptyAction = target?.closest<HTMLElement>("[data-empty-action]");
    const quickAction = target?.closest<HTMLElement>("[data-quick-action]");
    const action = emptyAction?.dataset["emptyAction"] ?? quickAction?.dataset["quickAction"] ?? "";
    if (!action) return;
    void handleGuidedUiAction(action);
  });
}
