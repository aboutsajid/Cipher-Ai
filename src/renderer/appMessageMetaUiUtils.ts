function refreshCompareUi(): void {
  const compareBtn = $("compare-toggle-btn");
  const comparePill = $("compare-model-pill");
  compareBtn.style.display = "none";
  comparePill.style.display = compareModeEnabled ? "inline-flex" : "none";
  compareBtn.classList.toggle("active", compareModeEnabled);
}

function renderMessageAttachmentNames(body: HTMLElement, msg: Message): void {
  const names = msg.metadata?.attachmentNames ?? [];
  if (names.length === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "msg-attachments";
  for (const name of names) {
    const pill = document.createElement("span");
    pill.className = "msg-attachment-pill";
    pill.textContent = name;
    wrap.appendChild(pill);
  }
  body.appendChild(wrap);
}

function updateHeaderBuildLabel(name: string, version: string): void {
  const buildLabel = document.getElementById("header-build-value");
  if (!(buildLabel instanceof HTMLElement)) return;
  const trimmedName = (name ?? "").trim() || "Cipher Workspace";
  const trimmedVersion = (version ?? "").trim();
  buildLabel.textContent = trimmedVersion ? `v${trimmedVersion}` : trimmedName;
  buildLabel.title = trimmedVersion ? `${trimmedName} v${trimmedVersion}` : trimmedName;
}
