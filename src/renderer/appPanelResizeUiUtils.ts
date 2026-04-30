function setupRightPanelResizeControls(): void {
  const handle = document.getElementById("panel-resize-handle");
  const smallerBtn = document.getElementById("panel-width-smaller-btn");
  const largerBtn = document.getElementById("panel-width-larger-btn");
  const resetBtn = document.getElementById("panel-width-reset-btn");

  if (!(handle instanceof HTMLElement)) return;

  let dragging = false;
  let startX = 0;
  let startWidth = currentRightPanelWidth;

  const finishResize = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("panel-resizing");
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(currentRightPanelWidth));
  };

  const resizeToClientX = (clientX: number) => {
    const nextWidth = startWidth + (startX - clientX);
    applyRightPanelWidth(nextWidth, false);
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    dragging = true;
    startX = event.clientX;
    startWidth = currentRightPanelWidth;
    document.body.classList.add("panel-resizing");
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    resizeToClientX(event.clientX);
  });

  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("resize", () => applyRightPanelWidth(currentRightPanelWidth, false));

  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustRightPanelWidth(RIGHT_PANEL_WIDTH_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustRightPanelWidth(-RIGHT_PANEL_WIDTH_STEP);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applyRightPanelWidth(getRightPanelMaxWidth());
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applyRightPanelWidth(RIGHT_PANEL_MIN_WIDTH);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetRightPanelWidth();
    }
  });

  if (smallerBtn instanceof HTMLButtonElement) {
    smallerBtn.addEventListener("click", () => adjustRightPanelWidth(-RIGHT_PANEL_WIDTH_STEP));
  }
  if (largerBtn instanceof HTMLButtonElement) {
    largerBtn.addEventListener("click", () => adjustRightPanelWidth(RIGHT_PANEL_WIDTH_STEP));
  }
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener("click", resetRightPanelWidth);
  }
}

function setupSidebarResizeControls(): void {
  const handle = document.getElementById("sidebar-resize-handle");
  const smallerBtn = document.getElementById("sidebar-width-smaller-btn");
  const largerBtn = document.getElementById("sidebar-width-larger-btn");
  const resetBtn = document.getElementById("sidebar-width-reset-btn");

  if (!(handle instanceof HTMLElement)) return;

  let dragging = false;
  let startX = 0;
  let startWidth = currentSidebarWidth;

  const finishResize = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("sidebar-resizing");
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(currentSidebarWidth));
  };

  const resizeToClientX = (clientX: number) => {
    const nextWidth = startWidth + (clientX - startX);
    applySidebarWidth(nextWidth, false);
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    dragging = true;
    startX = event.clientX;
    startWidth = currentSidebarWidth;
    document.body.classList.add("sidebar-resizing");
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    resizeToClientX(event.clientX);
  });

  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("resize", () => applySidebarWidth(currentSidebarWidth, false));

  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustSidebarWidth(-SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustSidebarWidth(SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(getSidebarMaxWidth());
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(SIDEBAR_MIN_WIDTH);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetSidebarWidth();
    }
  });

  if (smallerBtn instanceof HTMLButtonElement) {
    smallerBtn.addEventListener("click", () => adjustSidebarWidth(-SIDEBAR_WIDTH_STEP));
  }
  if (largerBtn instanceof HTMLButtonElement) {
    largerBtn.addEventListener("click", () => adjustSidebarWidth(SIDEBAR_WIDTH_STEP));
  }
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener("click", resetSidebarWidth);
  }
}
