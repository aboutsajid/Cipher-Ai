import type { AgentTaskFailureCategory } from "../../shared/types";

export function buildFailureMemorySignature(category: AgentTaskFailureCategory, message: string): string {
  const normalized = (message ?? "").toLowerCase();
  if (category === "malformed-json") {
    if (normalized.includes("strict schema")) return "strict-schema-contract";
    if (normalized.includes("no usable edits")) return "json-no-usable-edits";
    return "managed-json-shape";
  }
  if (category === "unsupported-path") return "out-of-scope-edits";
  if (category === "wrong-scaffold") return "scaffold-mismatch";
  if (category === "asset-missing") return "missing-linked-assets";
  if (category === "missing-file") {
    if (normalized.includes("readme")) return "missing-readme";
    if (normalized.includes("index.html")) return "missing-index-entry";
    if (normalized.includes("main.tsx")) return "missing-react-entry";
    if (normalized.includes("desktop-launch")) return "missing-desktop-launcher";
    return "missing-required-file";
  }
  if (category === "build-error") {
    if (normalized.includes("package.json")) return "package-manifest-integrity";
    if (normalized.includes("dependency")) return "dependency-install";
    return "build-contract";
  }
  if (category === "runtime-error") {
    if (normalized.includes("usage")) return "cli-usage-output";
    if (normalized.includes("api probe") || normalized.includes("/health")) return "api-runtime-endpoints";
    if (normalized.includes("desktop preview")) return "desktop-preview-runtime";
    return "runtime-launch-path";
  }
  if (category === "preview-error") return "preview-bootstrap";
  if (category === "lint-error") return "lint-cleanup";
  if (category === "test-error") return "test-contract";
  if (category === "verification-error") {
    if (normalized.includes("api probe")) return "api-verification";
    if (normalized.includes("cli runtime")) return "cli-verification";
    if (normalized.includes("desktop interaction")) return "desktop-verification";
    return "verification-contract";
  }
  return normalized
    .replace(/\b\d+\b/g, "#")
    .replace(/[^\w\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "general";
}

export function buildFailureMemoryGuidance(options: {
  signature: string;
  message: string;
  categoryGuidance: string;
  compactFailureMessage: (message: string) => string;
}): string {
  const { signature, message, categoryGuidance, compactFailureMessage } = options;
  switch (signature) {
    case "strict-schema-contract":
      return "Return only the strict JSON contract with summary and scoped edits. No prose, no markdown fences, no alternate keys.";
    case "json-no-usable-edits":
      return "Do not stop at a summary. Return at least one concrete scoped file edit when a repair is required.";
    case "out-of-scope-edits":
      return "Keep edits inside the planned workspace files and avoid touching host-workspace or unsupported paths.";
    case "missing-readme":
      return "Restore the missing README and keep it aligned with run/build commands and deliverables.";
    case "missing-index-entry":
      return "Restore the preview entry HTML and ensure scripts/styles still point at real local assets.";
    case "missing-react-entry":
      return "Restore the main React entry and make sure the root render path is intact.";
    case "missing-desktop-launcher":
      return "Restore the desktop launcher script and keep packaged launch scripts pointed at the Electron entry.";
    case "package-manifest-integrity":
      return "Keep package.json valid JSON and preserve the expected build/start/test scripts for the project type.";
    case "dependency-install":
      return "Prefer dependency-safe repairs that keep package names, versions, and scripts consistent with the scaffold.";
    case "cli-usage-output":
      return "A CLI verification run must complete with real output, not just usage text. Accept fixture input when provided.";
    case "api-runtime-endpoints":
      return "Keep the API launch path stable and make sure /health plus the main collection endpoint return JSON.";
    case "desktop-preview-runtime":
      return "Keep the desktop preview interactive and ensure the built index.html remains smoke-testable.";
    case "preview-bootstrap":
      return "Preserve preview bootstrap wiring: entry HTML, linked assets, and root render/bootstrap markers.";
    default:
      return `${categoryGuidance} Recent example: ${compactFailureMessage(message)}`;
  }
}
