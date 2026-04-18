export interface BrowserSmokeSnapshot {
  readyState: string;
  title: string;
  hasHtml: boolean;
  hasBody: boolean;
  headingCount: number;
  actionCount: number;
  inputCount: number;
  collectionCount: number;
  rootCount: number;
  scriptCount: number;
  appScriptCount: number;
  textLength: number;
  htmlLength: number;
  localStorageKeys?: number;
  sessionStorageKeys?: number;
  textareaCount?: number;
  selectCount?: number;
  urlInputCount?: number;
  searchInputCount?: number;
  fileInputCount?: number;
  passwordInputCount?: number;
  summaryMarkerCount?: number;
  transcriptMarkerCount?: number;
  videoSourceMarkerCount?: number;
  searchMarkerCount?: number;
  persistenceMarkerCount?: number;
  exportActionCount?: number;
  ingestMarkerCount?: number;
  authMarkerCount?: number;
  settingsMarkerCount?: number;
}

export interface BrowserSmokeInteractionProbe {
  attempted: boolean;
  changed: boolean;
  details: string;
  typedValueVisible?: boolean;
  collectionDelta?: number;
  textDelta?: number;
  localStorageDelta?: number;
  sessionStorageDelta?: number;
  summaryMarkerDelta?: number;
}

export interface BrowserSmokeEvaluationResult {
  status: "passed" | "failed" | "skipped";
  details: string;
  diagnostics?: Record<string, unknown>;
}

export function createBrowserSmokeResult(
  status: BrowserSmokeEvaluationResult["status"],
  details: string,
  diagnostics: Record<string, unknown> = {}
): BrowserSmokeEvaluationResult {
  return { status, details, diagnostics };
}

export function summarizeBrowserSmokeSnapshot(snapshot: BrowserSmokeSnapshot | null | undefined): string {
  if (!snapshot) return "no-snapshot";
  return [
    `heading=${snapshot.headingCount}`,
    `action=${snapshot.actionCount}`,
    `input=${snapshot.inputCount}`,
    `collection=${snapshot.collectionCount}`,
    `text=${snapshot.textLength}`,
    `storage=${snapshot.localStorageKeys ?? 0}/${snapshot.sessionStorageKeys ?? 0}`
  ].join(", ");
}

function normalizePromptRequirements(promptRequirements: readonly string[] | null | undefined): Set<string> {
  return new Set((promptRequirements ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function hasPromptRequirement(promptRequirements: Set<string>, id: string): boolean {
  return promptRequirements.has(id.toLowerCase());
}

export function requiresStatefulInteractionProbe(builderMode: string): boolean {
  return builderMode === "notes" || builderMode === "crud" || builderMode === "kanban";
}

export function requiresCapabilityInteractionProbe(
  builderMode: string,
  promptRequirements: readonly string[] | null | undefined = []
): boolean {
  const normalized = normalizePromptRequirements(promptRequirements);
  return requiresStatefulInteractionProbe(builderMode)
    || hasPromptRequirement(normalized, "req-summary")
    || hasPromptRequirement(normalized, "req-persistence");
}

function hasMeaningfulStatefulInteraction(
  builderMode: string,
  interactionProbe: BrowserSmokeInteractionProbe | null | undefined,
  promptRequirements: readonly string[] | null | undefined = []
): boolean {
  if (!interactionProbe?.attempted) return false;
  const normalizedRequirements = normalizePromptRequirements(promptRequirements);
  const typedValueVisible = Boolean(interactionProbe.typedValueVisible);
  const collectionDelta = Number(interactionProbe.collectionDelta ?? 0);
  const textDelta = Number(interactionProbe.textDelta ?? 0);
  const localStorageDelta = Number(interactionProbe.localStorageDelta ?? 0);
  const sessionStorageDelta = Number(interactionProbe.sessionStorageDelta ?? 0);
  const summaryMarkerDelta = Number(interactionProbe.summaryMarkerDelta ?? 0);

  if (builderMode === "notes" || builderMode === "crud" || builderMode === "kanban") {
    return typedValueVisible || collectionDelta > 0 || localStorageDelta !== 0 || sessionStorageDelta !== 0;
  }

  if (hasPromptRequirement(normalizedRequirements, "req-summary")) {
    return typedValueVisible
      || summaryMarkerDelta > 0
      || collectionDelta > 0
      || localStorageDelta !== 0
      || sessionStorageDelta !== 0
      || textDelta > 20;
  }

  if (hasPromptRequirement(normalizedRequirements, "req-persistence")) {
    return typedValueVisible || collectionDelta > 0 || localStorageDelta !== 0 || sessionStorageDelta !== 0;
  }

  return Boolean(interactionProbe.changed);
}

export function evaluateBrowserSmoke(
  snapshot: BrowserSmokeSnapshot,
  workspaceKind: string,
  builderMode: string,
  pageErrors: string[],
  interactionProbe?: BrowserSmokeInteractionProbe | null,
  promptRequirements: readonly string[] | null | undefined = []
): BrowserSmokeEvaluationResult {
  const failures: string[] = [];
  const normalizedRequirements = normalizePromptRequirements(promptRequirements);

  if (!snapshot?.hasHtml) failures.push("Rendered page did not expose documentElement.");
  if (!snapshot?.hasBody) failures.push("Rendered page did not expose body content.");
  if (!snapshot || snapshot.textLength <= 0) failures.push("Rendered page body text was empty.");
  if (snapshot && snapshot.htmlLength <= 32) failures.push("Rendered page HTML was unexpectedly small.");

  if (workspaceKind === "react" && snapshot.rootCount <= 0) {
    failures.push("Rendered React page did not expose a #root container.");
  }

  if (builderMode && ["landing", "announcement", "pricing", "dashboard", "notes", "crud", "kanban"].includes(builderMode)) {
    if (snapshot.headingCount <= 0) {
      failures.push("Rendered page did not include a visible heading.");
    }
  }

  if (builderMode && ["landing", "announcement", "pricing", "notes", "crud", "kanban"].includes(builderMode)) {
    if (snapshot.actionCount <= 0) {
      failures.push("Rendered page did not include a primary action.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-video-source")) {
    if ((snapshot.urlInputCount ?? 0) <= 0 && (snapshot.videoSourceMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose a video source or URL input flow.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-transcript")) {
    if ((snapshot.textareaCount ?? 0) <= 0 && (snapshot.transcriptMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose a transcript input surface.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-summary")) {
    if ((snapshot.summaryMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose a summary output surface.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-search-filter")) {
    if ((snapshot.searchInputCount ?? 0) <= 0 && (snapshot.searchMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose search or filter controls.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-persistence")) {
    const storageKeys = Number(snapshot.localStorageKeys ?? 0) + Number(snapshot.sessionStorageKeys ?? 0);
    if (snapshot.collectionCount <= 0 && storageKeys <= 0 && (snapshot.persistenceMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose a saved history, library, or persisted records surface.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-export")) {
    if ((snapshot.exportActionCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose copy, export, download, or share actions.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-ingest")) {
    if ((snapshot.fileInputCount ?? 0) <= 0 && (snapshot.textareaCount ?? 0) <= 0 && (snapshot.ingestMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose import, upload, paste, or file ingest controls.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-auth")) {
    if ((snapshot.passwordInputCount ?? 0) <= 0 && (snapshot.authMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose authentication controls.");
    }
  }

  if (hasPromptRequirement(normalizedRequirements, "req-settings")) {
    if ((snapshot.settingsMarkerCount ?? 0) <= 0) {
      failures.push("Rendered page did not expose settings or preferences UI.");
    }
  }

  if (requiresCapabilityInteractionProbe(builderMode, promptRequirements)) {
    if (snapshot.inputCount <= 0) {
      failures.push("Rendered page did not include an interactive input flow.");
    }
    if (requiresStatefulInteractionProbe(builderMode) && snapshot.collectionCount <= 0) {
      failures.push("Rendered page did not include a rendered collection view.");
    }
    if (!interactionProbe) {
      failures.push("Rendered page did not run a stateful interaction probe.");
    } else if (!interactionProbe.attempted) {
      failures.push(`Rendered page could not identify a usable stateful interaction. ${interactionProbe.details}`.trim());
    } else if (!hasMeaningfulStatefulInteraction(builderMode, interactionProbe, promptRequirements)) {
      failures.push(`Rendered page did not produce a meaningful stateful interaction signal. ${interactionProbe.details}`.trim());
    }
  }

  if (pageErrors.length > 0) {
    failures.push(`Browser console/runtime errors detected: ${pageErrors.join(" | ")}`);
  }

  if (failures.length > 0) {
    return createBrowserSmokeResult(
      "failed",
      `${failures.join(" ")} Snapshot: ${summarizeBrowserSmokeSnapshot(snapshot)}.${interactionProbe ? ` Interaction: ${interactionProbe.details}` : ""}`,
      { snapshot, pageErrors, interactionProbe }
    );
  }

  const interactionSummary = interactionProbe?.attempted
    ? ` Interaction: ${interactionProbe.details}`
    : "";
  return createBrowserSmokeResult(
    "passed",
    `Rendered page smoke passed. Snapshot: ${summarizeBrowserSmokeSnapshot(snapshot)}.${interactionSummary}`,
    { snapshot, pageErrors, interactionProbe }
  );
}
