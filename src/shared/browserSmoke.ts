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

export function requiresStatefulInteractionProbe(builderMode: string): boolean {
  return builderMode === "notes" || builderMode === "crud" || builderMode === "kanban";
}

export function evaluateBrowserSmoke(
  snapshot: BrowserSmokeSnapshot,
  workspaceKind: string,
  builderMode: string,
  pageErrors: string[],
  interactionProbe?: BrowserSmokeInteractionProbe | null
): BrowserSmokeEvaluationResult {
  const failures: string[] = [];

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

  if (requiresStatefulInteractionProbe(builderMode)) {
    if (snapshot.inputCount <= 0) {
      failures.push("Rendered page did not include an interactive input flow.");
    }
    if (snapshot.collectionCount <= 0) {
      failures.push("Rendered page did not include a rendered collection view.");
    }
    if (!interactionProbe) {
      failures.push("Rendered page did not run a stateful interaction probe.");
    } else if (!interactionProbe.attempted) {
      failures.push(`Rendered page could not identify a usable stateful interaction. ${interactionProbe.details}`.trim());
    } else if (!interactionProbe.changed) {
      failures.push(`Rendered page did not react to a basic stateful interaction. ${interactionProbe.details}`.trim());
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
