async function promptForTextInput(options: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.display = "flex";

    const modal = document.createElement("div");
    modal.className = "modal";

    const titleEl = document.createElement("p");
    titleEl.className = "modal-title";
    titleEl.textContent = options.title;

    const inputEl: HTMLInputElement | HTMLTextAreaElement = options.multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    inputEl.className = "field-input";
    inputEl.placeholder = options.placeholder ?? "";
    inputEl.value = options.initialValue ?? "";
    if (inputEl instanceof HTMLInputElement) {
      inputEl.type = "text";
    } else {
      inputEl.rows = 6;
      inputEl.style.minHeight = "140px";
    }

    const buttonRow = document.createElement("div");
    buttonRow.className = "btn-row";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn-primary";
    confirmBtn.type = "button";
    confirmBtn.textContent = options.confirmLabel ?? "Save";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-ghost";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    buttonRow.appendChild(confirmBtn);
    buttonRow.appendChild(cancelBtn);
    modal.appendChild(titleEl);
    modal.appendChild(inputEl);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);

    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(value);
    };

    const submit = (): void => {
      finish(inputEl.value);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      if (event.key === "Enter") {
        const canSubmit = !options.multiline || event.ctrlKey || event.metaKey;
        if (!canSubmit) return;
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
    };

    overlay.addEventListener("click", (event: Event) => {
      if (event.target === overlay) finish(null);
    });
    cancelBtn.onclick = () => finish(null);
    confirmBtn.onclick = submit;
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      inputEl.focus();
      if (inputEl instanceof HTMLInputElement) inputEl.select();
    });
  });
}

async function queueMessageForResend(content: string): Promise<void> {
  if (activeAttachments.length > 0) {
    showToast("Clear pending attachments before resend.", 2200);
    return;
  }

  const text = content.trim();
  if (!text) return;
  const input = $("composer-input") as HTMLTextAreaElement;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  input.focus();
  await sendMessage();
}

async function editUserMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const message = chat.messages.find((item) => item.id === msgId && item.role === "user");
  if (!message) return;

  const edited = await promptForTextInput({
    title: "Edit message",
    initialValue: message.content,
    confirmLabel: "Resend",
    multiline: true
  });
  if (edited === null) return;
  const text = edited.trim();
  if (!text) {
    showToast("Message cannot be empty.", 2000);
    return;
  }

  await queueMessageForResend(text);
}

async function regenerateAssistantMessage(msgId: string): Promise<void> {
  if (isStreaming) {
    showToast("Wait for current response to finish.", 2200);
    return;
  }
  if (!currentChatId) return;

  const chat = await window.api.chat.get(currentChatId);
  if (!chat) return;

  const assistantIndex = chat.messages.findIndex((item) => item.id === msgId && item.role === "assistant");
  if (assistantIndex < 0) return;

  let lastUserContent = "";
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    const candidate = chat.messages[i];
    if (candidate.role === "user" && candidate.content.trim()) {
      lastUserContent = candidate.content;
      break;
    }
  }

  if (!lastUserContent) {
    showToast("No user message found to regenerate.", 2200);
    return;
  }

  await queueMessageForResend(lastUserContent);
}
