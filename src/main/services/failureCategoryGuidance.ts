import type { AgentTaskFailureCategory } from "../../shared/types";

export function buildFailureCategoryGuidance(category: AgentTaskFailureCategory): string {
  switch (category) {
    case "missing-file":
      return "Restore or create the missing entry file and update references only where required.";
    case "malformed-json":
      return "Return strict schema-shaped JSON only and remove any prose, markdown, or malformed fields.";
    case "unsupported-path":
      return "Keep all edits inside the provided workspace files and avoid unsupported or escaping paths.";
    case "wrong-scaffold":
      return "Preserve the expected scaffold and remove conflicting files from the wrong project shape.";
    case "asset-missing":
      return "Repair broken asset references or restore the missing linked assets.";
    case "build-error":
      return "Focus on compile-time or bundling fixes in the failing files before changing working behavior.";
    case "runtime-error":
      return "Fix startup/runtime exceptions and keep the launch path intact.";
    case "preview-error":
      return "Repair preview entry wiring, linked assets, and bootstrap flow without changing unrelated files.";
    case "lint-error":
      return "Fix lint violations with the smallest code changes that preserve runtime behavior.";
    case "test-error":
      return "Fix the failing test path or implementation mismatch without broad unrelated rewrites.";
    case "verification-error":
      return "Address the exact verification failure and keep the rest of the project unchanged.";
    default:
      return "Use the failure output to produce the smallest valid repair for the provided files.";
  }
}
