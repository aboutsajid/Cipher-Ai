function mergeAttachments(nextItems: AttachmentPayload[]): AttachmentPayload[] {
  const merged: AttachmentPayload[] = [];
  const seen = new Set<string>();
  for (const attachment of [...activeAttachments, ...nextItems]) {
    const key = `${attachment.type}:${attachment.name}:${attachment.content.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

function renderComposerAttachments(): void {
  const holder = $("composer-attachments");
  holder.innerHTML = "";

  if (activeAttachments.length === 0) {
    holder.style.display = "none";
    updateAttachButtonState();
    updateDirectSaveUi();
    return;
  }

  for (const attachment of activeAttachments) {
    const pill = document.createElement("div");
    pill.className = "attachment-pill";
    pill.title = attachment.name;
    const name = document.createElement("span");
    name.textContent = attachment.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "âœ•";
    remove.onclick = () => {
      activeAttachments = activeAttachments.filter((item) => !(item.name === attachment.name && item.content === attachment.content));
      renderComposerAttachments();
    };
    pill.appendChild(name);
    pill.appendChild(remove);
    holder.appendChild(pill);
  }

  holder.style.display = "flex";
  updateAttachButtonState();
  updateDirectSaveUi();
}

function updateAttachButtonState(): void {
  const btn = $("attach-btn") as HTMLButtonElement;
  const count = activeAttachments.length;
  const label = count > 0
    ? `Attached ${count} item${count === 1 ? "" : "s"} (click to add more files/folders)`
    : "Attach files or folders";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.classList.toggle("has-items", count > 0);
}
