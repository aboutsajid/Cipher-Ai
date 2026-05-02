function isImageCapableModel(model: string): boolean {
  return /image|flux|riverflow|sourceful|vision/.test((model ?? "").trim().toLowerCase());
}

function getActiveImageGenerationProvider(): ImageProviderMode {
  return getImageProviderFromSettings(settings);
}

function getImageGenerationModelOptions(provider: ImageProviderMode): string[] {
  if (provider === "comfyui") return COMFYUI_IMAGE_MODELS;
  return provider === "nvidia" ? NVIDIA_IMAGE_MODELS : OPENROUTER_IMAGE_MODELS;
}

function isProviderCompatibleImageModel(provider: ImageProviderMode, model: string): boolean {
  const normalized = (model ?? "").trim();
  if (provider === "comfyui") {
    return getImageGenerationModelOptions(provider).includes(normalized)
      || /\.safetensors$/i.test(normalized);
  }
  return getImageGenerationModelOptions(provider).includes(normalized);
}

function refreshImageGenerationModelOptions(provider: ImageProviderMode): void {
  const datalist = document.getElementById("image-generation-model-options");
  if (!(datalist instanceof HTMLDataListElement)) return;
  datalist.innerHTML = "";
  for (const model of getImageGenerationModelOptions(provider)) {
    const option = document.createElement("option");
    option.value = model;
    datalist.appendChild(option);
  }
}

function populateImageGenerationAspectRatioOptions(): void {
  const selectIds = ["image-studio-aspect-select", "image-generation-aspect-select"];
  for (const selectId of selectIds) {
    const select = document.getElementById(selectId);
    if (!(select instanceof HTMLSelectElement)) continue;
    const currentValue = select.value;
    select.innerHTML = "";
    for (const ratio of IMAGE_GENERATION_ASPECT_RATIOS) {
      const option = document.createElement("option");
      option.value = ratio;
      option.textContent = ratio;
      select.appendChild(option);
    }
    select.value = IMAGE_GENERATION_ASPECT_RATIOS.includes(currentValue as ImageGenerationAspectRatio)
      ? currentValue
      : "1:1";
  }
}

function updateImageProviderButtons(provider: ImageProviderMode): void {
  document.getElementById("image-provider-openrouter-btn")?.classList.toggle("active", provider === "openrouter");
  document.getElementById("image-provider-nvidia-btn")?.classList.toggle("active", provider === "nvidia");
  document.getElementById("image-provider-comfyui-btn")?.classList.toggle("active", provider === "comfyui");
}

async function setImageProvider(provider: ImageProviderMode): Promise<void> {
  const current = getImageProviderFromSettings(settings);
  if (current === provider) {
    syncImageStudioControls(false);
    return;
  }
  settings = await window.api.settings.save({ imageProvider: provider });
  syncImageStudioControls(false);
}

function updateImageGenerationModalHelp(provider: ImageProviderMode): void {
  const help = document.getElementById("image-generation-help");
  if (!(help instanceof HTMLElement)) return;
  help.textContent = provider === "comfyui"
    ? "Local image generation uses ComfyUI. No cloud API key is required. Press Ctrl+Enter to submit."
    : provider === "nvidia"
      ? "Hosted image generation uses NVIDIA cloud APIs for this MVP free-tier path. Press Ctrl+Enter to submit."
      : "Hosted image generation uses OpenRouter. Press Ctrl+Enter to submit.";
}

function updateImageStudioHelp(provider: ImageProviderMode): void {
  const help = document.getElementById("image-studio-help");
  const status = document.getElementById("image-studio-status");
  if (help instanceof HTMLElement) {
    help.textContent = provider === "comfyui"
      ? "Local ComfyUI is active. Use a checkpoint like sd_xl_base_1.0.safetensors."
      : provider === "nvidia"
        ? "NVIDIA cloud image generation is active."
        : "OpenRouter hosted image generation is active.";
  }
  if (status instanceof HTMLElement && !imageGenerationSubmitting) {
    status.textContent = `${getImageProviderDisplayName(provider)} selected. Press Ctrl+Enter to generate.`;
  }
}

function syncImageStudioControls(prefillPrompt = false): void {
  const provider = getActiveImageGenerationProvider();
  const promptInput = document.getElementById("image-studio-prompt-input");
  const modelInput = document.getElementById("image-studio-model-input");
  const aspectSelect = document.getElementById("image-studio-aspect-select");
  const composerInput = document.getElementById("composer-input");
  const comfyuiBaseUrlInput = document.getElementById("comfyui-base-url-input");

  refreshImageGenerationModelOptions(provider);
  updateImageGenerationModalHelp(provider);
  updateImageStudioHelp(provider);
  updateImageProviderButtons(provider);

  if (promptInput instanceof HTMLTextAreaElement && prefillPrompt && composerInput instanceof HTMLTextAreaElement) {
    const composerText = composerInput.value.trim();
    if (composerText && !promptInput.value.trim()) {
      promptInput.value = composerText;
    }
  }

  if (modelInput instanceof HTMLInputElement) {
    const currentModel = modelInput.value.trim();
    modelInput.value = isProviderCompatibleImageModel(provider, currentModel)
      ? currentModel
      : getDefaultImageGenerationModel(provider);
  }

  if (comfyuiBaseUrlInput instanceof HTMLInputElement) {
    comfyuiBaseUrlInput.value = (settings?.comfyuiBaseUrl ?? "").trim() || COMFYUI_DEFAULT_BASE_URL;
  }

  if (aspectSelect instanceof HTMLSelectElement && !aspectSelect.value) {
    aspectSelect.value = "1:1";
  }
}

function setImageStudioStatus(message: string): void {
  const status = document.getElementById("image-studio-status");
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

async function submitImageGeneration(): Promise<void> {
  if (imageGenerationSubmitting) return;

  const promptInput = $("image-generation-prompt-input") as HTMLTextAreaElement;
  const modelInput = $("image-generation-model-input") as HTMLInputElement;
  const aspectSelect = $("image-generation-aspect-select") as HTMLSelectElement;
  const submitBtn = $("image-generation-submit-btn") as HTMLButtonElement;
  const cancelBtn = $("image-generation-cancel-btn") as HTMLButtonElement;
  const prompt = promptInput.value.trim();
  const imageProvider = getActiveImageGenerationProvider() ?? "openrouter";
  const requestedModel = modelInput.value.trim();
  const model = isProviderCompatibleImageModel(imageProvider, requestedModel)
    ? requestedModel
    : getDefaultImageGenerationModel(imageProvider);
  const aspectRatio = (aspectSelect.value || "1:1") as ImageGenerationAspectRatio;

  if (!prompt) {
    showToast("Image prompt required.", 2200);
    promptInput.focus();
    return;
  }

  imageGenerationSubmitting = true;
  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  submitBtn.textContent = "Generating...";

  const chatId = await ensureActiveChatId();
  const userMessage: Message = {
    id: nextClientMessageId("img-user"),
    role: "user",
    content: buildImageGenerationUserPrompt(prompt, aspectRatio),
    createdAt: new Date().toISOString()
  };

  appendMessage(userMessage);
  await window.api.chat.appendMessage(chatId, userMessage);
  void loadChatList();
  setStreamingUi(true, "Generating image...");

  try {
    const result = await window.api.images.generate({ prompt, provider: imageProvider, model, aspectRatio });
    const assistantMessage: Message = {
      id: nextClientMessageId("img-assistant"),
      role: "assistant",
      content: buildImageGenerationAssistantMessage(result),
      createdAt: new Date().toISOString(),
      model: result.model,
      metadata: result.images.some((image) => Boolean(image.id))
        ? { generatedImageAssetIds: result.images.map((image) => image.id ?? "").filter(Boolean) }
        : undefined
    };
    appendMessage(assistantMessage);
    await window.api.chat.appendMessage(chatId, assistantMessage);
    void loadChatList();
    void maybeGenerateTitle(chatId);
    if (document.getElementById("image-history-modal") instanceof HTMLElement
      && ($("image-history-modal") as HTMLElement).style.display !== "none") {
      void refreshImageHistory();
    }
    closeImageGenerationModal(true);
    showToast(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`, 2200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed.";
    const assistantError: Message = {
      id: nextClientMessageId("img-error"),
      role: "assistant",
      content: message,
      createdAt: new Date().toISOString(),
      model: "Image Generation",
      error: message
    };
    appendMessage(assistantError);
    await window.api.chat.appendMessage(chatId, assistantError);
    void loadChatList();
    showToast(message, 3600);
  } finally {
    imageGenerationSubmitting = false;
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
    submitBtn.textContent = "Generate";
    setStreamingUi(false);
  }
}

function getDefaultImageGenerationModel(provider = getActiveImageGenerationProvider()): string {
  if (provider === "comfyui") {
    return COMFYUI_DEFAULT_IMAGE_MODEL;
  }

  const selectedModel = (($("model-select") as HTMLSelectElement | null)?.value ?? "").trim();
  if (isImageCapableModel(selectedModel)) return selectedModel;

  const configuredModels = settings?.models ?? [];
  return configuredModels.find((model) => isImageCapableModel(model))
    ?? getImageGenerationModelOptions(provider).find((model) => configuredModels.includes(model))
    ?? (provider === "nvidia" ? NVIDIA_DEFAULT_IMAGE_MODEL : OPENROUTER_DEFAULT_IMAGE_MODEL);
}

function buildImageGenerationUserPrompt(prompt: string, aspectRatio: ImageGenerationAspectRatio): string {
  return [
    `Generate image: ${prompt}`,
    `Aspect ratio: ${aspectRatio}`
  ].join("\n");
}

function buildImageGenerationAssistantMessage(result: ImageGenerationResult): string {
  const summary = result.text.trim() || `Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`;
  const imageBlocks = result.images
    .map((image, index) => `![Generated image ${index + 1}](${image.dataUrl})`)
    .join("\n\n");

  return [
    summary,
    "",
    `Provider: \`${getImageProviderDisplayName(result.provider)}\``,
    `Model: \`${result.model}\``,
    `Aspect ratio: \`${result.aspectRatio}\``,
    "",
    imageBlocks
  ].join("\n").trim();
}

function formatImageHistoryTimestamp(value?: string): string {
  if (!value) return "Not saved yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getImageHistorySortTime(item: GeneratedImageHistoryItem): number {
  const timestamps = [item.updatedAt, item.createdAt, item.lastSavedAt];
  for (const value of timestamps) {
    const parsed = Date.parse(value ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseImageStudioSortMode(value: string): ImageStudioSortMode {
  if (value === "oldest" || value === "prompt-az" || value === "prompt-za") return value;
  return "newest";
}

function getLatestImageHistoryItemId(items: GeneratedImageHistoryItem[]): string | null {
  let latestId: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const sortTime = getImageHistorySortTime(item);
    if (sortTime > latestTime) {
      latestTime = sortTime;
      latestId = item.id;
    }
  }
  return latestId;
}

function getImageStudioSearchText(item: GeneratedImageHistoryItem): string {
  return [
    item.prompt,
    item.text,
    item.model,
    item.aspectRatio
  ]
    .map((value) => (value ?? "").toLowerCase())
    .join(" ");
}

function getImageStudioVisibleItems(allItems: GeneratedImageHistoryItem[]): GeneratedImageHistoryItem[] {
  const query = imageStudioSearchQuery.trim().toLowerCase();
  let items = query
    ? allItems.filter((item) => getImageStudioSearchText(item).includes(query))
    : [...allItems];

  const newestSort = (left: GeneratedImageHistoryItem, right: GeneratedImageHistoryItem): number =>
    getImageHistorySortTime(right) - getImageHistorySortTime(left);
  const oldestSort = (left: GeneratedImageHistoryItem, right: GeneratedImageHistoryItem): number =>
    getImageHistorySortTime(left) - getImageHistorySortTime(right);
  const promptSort = (left: GeneratedImageHistoryItem, right: GeneratedImageHistoryItem, direction: 1 | -1): number => {
    const leftPrompt = (left.prompt ?? "").trim();
    const rightPrompt = (right.prompt ?? "").trim();
    const promptOrder = leftPrompt.localeCompare(rightPrompt, undefined, { sensitivity: "base" });
    if (promptOrder !== 0) return promptOrder * direction;
    return newestSort(left, right);
  };

  switch (imageStudioSortMode) {
    case "oldest":
      items = items.sort(oldestSort);
      break;
    case "prompt-az":
      items = items.sort((left, right) => promptSort(left, right, 1));
      break;
    case "prompt-za":
      items = items.sort((left, right) => promptSort(left, right, -1));
      break;
    case "newest":
    default:
      items = items.sort(newestSort);
      break;
  }
  return items;
}

function mergeImageHistoryItems(
  existingItems: GeneratedImageHistoryItem[],
  nextItems: GeneratedImageHistoryItem[]
): GeneratedImageHistoryItem[] {
  const byId = new Map<string, GeneratedImageHistoryItem>();
  for (const item of existingItems) byId.set(item.id, item);
  for (const item of nextItems) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => getImageHistorySortTime(right) - getImageHistorySortTime(left));
}

function createImageHistoryChip(label: string, tone: "default" | "accent" = "default"): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = `image-history-chip${tone === "accent" ? " accent" : ""}`;
  chip.textContent = label;
  chip.title = label;
  return chip;
}

function renderImageHistoryListInto(listId: string, emptyId: string): void {
  const list = document.getElementById(listId);
  const emptyState = document.getElementById(emptyId);
  if (!(list instanceof HTMLElement) || !(emptyState instanceof HTMLElement)) return;
  const isStudioVariant = listId === "image-studio-history-list";
  const newestSort = (left: GeneratedImageHistoryItem, right: GeneratedImageHistoryItem): number =>
    getImageHistorySortTime(right) - getImageHistorySortTime(left);

  list.innerHTML = "";
  if (imageHistoryLoading) {
    emptyState.style.display = "block";
    emptyState.textContent = "Loading image history...";
    return;
  }

  if (imageHistoryItems.length === 0) {
    emptyState.style.display = "block";
    emptyState.textContent = "No generated images in history yet.";
    return;
  }

  const latestHistoryItemId = getLatestImageHistoryItemId(imageHistoryItems);
  const items = isStudioVariant
    ? getImageStudioVisibleItems(imageHistoryItems)
    : [...imageHistoryItems].sort(newestSort);
  if (items.length === 0) {
    emptyState.style.display = "block";
    emptyState.textContent = "No images match the current search.";
    return;
  }

  emptyState.style.display = "none";
  for (const item of items) {
    const card = document.createElement("article");
    card.className = `image-history-entry${isStudioVariant ? " is-gallery" : ""}`;

    const figure = document.createElement("figure");
    figure.className = `message-image-card image-history-card${isStudioVariant ? " is-gallery-card" : ""}`;

    const visual = document.createElement("div");
    visual.className = "image-history-visual";

    const image = document.createElement("img");
    image.className = "message-image";
    image.src = item.dataUrl;
    image.alt = item.prompt || "Generated image";
    image.loading = "lazy";
    visual.appendChild(image);
    figure.appendChild(visual);

    const caption = document.createElement("figcaption");
    caption.className = "image-history-caption";

    const top = document.createElement("div");
    top.className = "image-history-top";

    const info = document.createElement("div");
    info.className = "image-history-meta";

    const eyebrow = document.createElement("div");
    eyebrow.className = "image-history-overline";
    eyebrow.textContent = item.saveCount > 0
      ? "Saved asset"
      : item.id === latestHistoryItemId
        ? "Latest render"
        : "Generated asset";
    info.appendChild(eyebrow);

    const prompt = document.createElement("strong");
    prompt.className = "image-history-prompt";
    prompt.textContent = item.prompt || "Untitled image prompt";
    prompt.title = prompt.textContent;
    info.appendChild(prompt);

    const chips = document.createElement("div");
    chips.className = "image-history-chips";
    chips.appendChild(createImageHistoryChip(compactModelName(item.model)));
    chips.appendChild(createImageHistoryChip(item.aspectRatio));
    chips.appendChild(createImageHistoryChip(formatImageHistoryTimestamp(item.createdAt)));
    if (item.saveCount > 0) {
      chips.appendChild(createImageHistoryChip(`Saved ${item.saveCount}x`, "accent"));
    }
    info.appendChild(chips);

    const details = document.createElement("div");
    details.className = "image-history-details image-history-meta-line";
    details.textContent = `${compactModelName(item.model)} â€¢ ${item.aspectRatio} â€¢ ${formatImageHistoryTimestamp(item.createdAt)}`;
    info.appendChild(details);

    const saved = document.createElement("div");
    saved.className = "image-history-details image-history-status-line";
    saved.textContent = item.saveCount > 0
      ? `Saved ${item.saveCount} time${item.saveCount === 1 ? "" : "s"} â€¢ ${formatImageHistoryTimestamp(item.lastSavedAt)}`
      : "Not saved outside Cipher yet";
    info.appendChild(saved);

    if (item.text.trim()) {
      const text = document.createElement("div");
      text.className = "image-history-note";
      text.textContent = item.text.trim();
      text.title = text.textContent;
      info.appendChild(text);
    }

    const actions = document.createElement("div");
    actions.className = "image-history-actions";

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "btn-ghost-sm image-history-preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.onclick = () => {
      openImagePreview(item);
    };
    actions.appendChild(previewBtn);

    if (isStudioVariant) {
      const reuseBtn = document.createElement("button");
      reuseBtn.type = "button";
      reuseBtn.className = "btn-ghost-sm image-history-reuse-btn";
      reuseBtn.textContent = "Reuse Prompt";
      reuseBtn.onclick = () => {
        const promptInput = document.getElementById("image-studio-prompt-input");
        if (!(promptInput instanceof HTMLTextAreaElement)) {
          showToast("Image Studio prompt input is unavailable.", 2800);
          return;
        }
        const promptText = item.prompt.trim();
        if (!promptText) {
          showToast("This image has no reusable prompt.", 2400);
          return;
        }
        promptInput.value = promptText;
        promptInput.focus();
        const cursor = promptInput.value.length;
        promptInput.setSelectionRange(cursor, cursor);
        setImageStudioStatus(`Prompt loaded from gallery (${compactModelName(item.model)} / ${item.aspectRatio}).`);
      };
      actions.appendChild(reuseBtn);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "message-image-save-btn";
    saveBtn.dataset["imageName"] = sanitizeDownloadName(item.prompt || "cipher-generated-image");
    saveBtn.dataset["imageAssetId"] = item.id;
    saveBtn.textContent = "Save image";
    saveBtn.onclick = async () => {
      try {
        const result = await window.api.images.save(item.dataUrl, saveBtn.dataset["imageName"], item.id);
        showToast(result.message, result.ok ? 2200 : 2800);
        if (result.ok) {
          await refreshImageHistory();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Image save failed.", 2800);
      }
    };
    actions.appendChild(saveBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-ghost-sm image-history-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
      const promptPreview = item.prompt.trim();
      const clippedPrompt = promptPreview.length > 90 ? `${promptPreview.slice(0, 87)}...` : promptPreview;
      const confirmed = window.confirm(
        clippedPrompt
          ? `Delete this image from history?\n\nPrompt: "${clippedPrompt}"`
          : "Delete this image from history?"
      );
      if (!confirmed) return;
      try {
        const result = await window.api.images.deleteHistory(item.id);
        showToast(result.message, result.ok ? 2200 : 2800);
        if (result.ok) {
          imageHistoryItems = imageHistoryItems.filter((entry) => entry.id !== item.id);
          renderImageHistoryViews();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Delete failed.", 2800);
      }
    };
    actions.appendChild(deleteBtn);

    top.appendChild(info);
    top.appendChild(actions);
    caption.appendChild(top);
    figure.appendChild(caption);
    card.appendChild(figure);
    list.appendChild(card);
  }

  if (imageHistoryHasMore || imageHistoryLoadingMore) {
    const footer = document.createElement("div");
    footer.className = "image-history-footer";

    const status = document.createElement("span");
    status.className = "image-history-status";
    status.textContent = imageHistoryLoadingMore ? "Loading more images..." : "More history available.";
    footer.appendChild(status);

    if (imageHistoryHasMore) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.type = "button";
      loadMoreBtn.className = "btn-ghost-sm";
      loadMoreBtn.textContent = imageHistoryLoadingMore ? "Loading..." : "Load More";
      loadMoreBtn.disabled = imageHistoryLoadingMore;
      loadMoreBtn.onclick = () => {
        void loadMoreImageHistory();
      };
      footer.appendChild(loadMoreBtn);
    }

    list.appendChild(footer);
  }
}

function renderImageHistoryViews(): void {
  renderImageHistoryListInto("image-history-list", "image-history-empty");
  renderImageHistoryListInto("image-studio-history-list", "image-studio-empty");
}

async function loadMoreImageHistory(): Promise<void> {
  if (imageHistoryLoading || imageHistoryLoadingMore || !imageHistoryHasMore) return;
  imageHistoryLoadingMore = true;
  renderImageHistoryViews();
  try {
    const page = await window.api.images.listHistoryPage({
      offset: imageHistoryOffset,
      limit: IMAGE_HISTORY_PAGE_SIZE
    });
    imageHistoryItems = mergeImageHistoryItems(imageHistoryItems, page.items);
    imageHistoryOffset = page.nextOffset;
    imageHistoryHasMore = page.hasMore;
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Failed to load more images.", 3200);
  } finally {
    imageHistoryLoadingMore = false;
    renderImageHistoryViews();
  }
}

async function refreshImageHistory(): Promise<void> {
  imageHistoryLoading = true;
  imageHistoryLoadingMore = false;
  imageHistoryOffset = 0;
  imageHistoryHasMore = false;
  renderImageHistoryViews();
  try {
    const page = await window.api.images.listHistoryPage({
      offset: 0,
      limit: IMAGE_HISTORY_PAGE_SIZE
    });
    imageHistoryItems = page.items;
    imageHistoryOffset = page.nextOffset;
    imageHistoryHasMore = page.hasMore;
  } catch (err) {
    imageHistoryItems = [];
    imageHistoryOffset = 0;
    imageHistoryHasMore = false;
    showToast(err instanceof Error ? err.message : "Failed to load image history.", 3200);
  } finally {
    imageHistoryLoading = false;
    renderImageHistoryViews();
  }
}

function closeImageHistoryModal(): void {
  const modal = document.getElementById("image-history-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "none";
}

async function openImageHistoryModal(): Promise<void> {
  const modal = document.getElementById("image-history-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "flex";
  await refreshImageHistory();
}

function closeImageGenerationModal(force = false): void {
  if (imageGenerationSubmitting && !force) return;
  const modal = document.getElementById("image-generation-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.style.display = "none";
  ($("image-generation-submit-btn") as HTMLButtonElement).disabled = false;
  ($("image-generation-cancel-btn") as HTMLButtonElement).disabled = false;
}

function openImageGenerationModal(): void {
  const imageProvider = getActiveImageGenerationProvider();
  if (imageProvider !== "comfyui" && !settings?.apiKey?.trim()) {
    showToast(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to generate images.`, 3200);
    openPanel("settings");
    return;
  }

  const promptInput = $("image-generation-prompt-input") as HTMLTextAreaElement;
  const modelInput = $("image-generation-model-input") as HTMLInputElement;
  const aspectSelect = $("image-generation-aspect-select") as HTMLSelectElement;
  const composerInput = $("composer-input") as HTMLTextAreaElement;
  const modal = $("image-generation-modal");
  const composerText = composerInput.value.trim();

  refreshImageGenerationModelOptions(imageProvider);
  updateImageGenerationModalHelp(imageProvider);
  promptInput.value = composerText || promptInput.value.trim();
  const currentModel = modelInput.value.trim();
  modelInput.value = isProviderCompatibleImageModel(imageProvider, currentModel)
    ? currentModel
    : getDefaultImageGenerationModel(imageProvider);
  aspectSelect.value = aspectSelect.value || "1:1";
  modal.style.display = "flex";
  promptInput.focus();
  promptInput.select();
}

async function submitImageStudioGeneration(): Promise<void> {
  if (imageGenerationSubmitting) return;

  const imageProvider = getActiveImageGenerationProvider();
  if (imageProvider !== "comfyui" && !settings?.apiKey?.trim()) {
    setImageStudioStatus(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to continue.`);
    showToast(`Paste your ${getImageProviderDisplayName(imageProvider)} key in Settings to generate images.`, 3200);
    openPanel("settings");
    return;
  }

  const promptInput = document.getElementById("image-studio-prompt-input");
  const modelInput = document.getElementById("image-studio-model-input");
  const aspectSelect = document.getElementById("image-studio-aspect-select");
  const generateBtn = document.getElementById("image-studio-generate-btn");

  if (!(promptInput instanceof HTMLTextAreaElement)
    || !(modelInput instanceof HTMLInputElement)
    || !(aspectSelect instanceof HTMLSelectElement)
    || !(generateBtn instanceof HTMLButtonElement)) {
    showToast("Image Studio controls are unavailable.", 3200);
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    setImageStudioStatus("Image prompt required.");
    promptInput.focus();
    showToast("Image prompt required.", 2200);
    return;
  }

  const requestedModel = modelInput.value.trim();
  const model = isProviderCompatibleImageModel(imageProvider, requestedModel)
    ? requestedModel
    : getDefaultImageGenerationModel(imageProvider);
  const aspectRatio = (aspectSelect.value || "1:1") as ImageGenerationAspectRatio;

  imageGenerationSubmitting = true;
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  modelInput.value = model;
  setImageStudioStatus(`Generating with ${compactModelName(model)}...`);

  try {
    const result = await window.api.images.generate({ prompt, provider: imageProvider, model, aspectRatio });
    await refreshImageHistory();
    setImageStudioStatus(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"} with ${compactModelName(result.model)} via ${getImageProviderDisplayName(result.provider)}.`);
    showToast(`Generated ${result.images.length} image${result.images.length === 1 ? "" : "s"}.`, 2200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed.";
    setImageStudioStatus(message);
    showToast(message, 3600);
  } finally {
    imageGenerationSubmitting = false;
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Image";
  }
}
