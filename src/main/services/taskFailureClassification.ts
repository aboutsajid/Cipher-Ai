import type {
  AgentTaskFailureCategory,
  AgentTaskFinalVerificationResult,
  AgentVerificationReport
} from "../../shared/types";

export function classifyFailureCategory(stage: string, message: string): AgentTaskFailureCategory {
  const normalized = `${stage} ${message}`.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("malformed json") || normalized.includes("valid structured json") || normalized.includes("json without usable edits")) {
    return "malformed-json";
  }
  if (normalized.includes("path escapes") || normalized.includes("outside allowed") || normalized.includes("outside planned") || normalized.includes("unsupported path")) {
    return "unsupported-path";
  }
  if (normalized.includes("wrong scaffold") || normalized.includes("scaffold") || normalized.includes("react leftovers") || normalized.includes("conflicting static scaffold")) {
    return "wrong-scaffold";
  }
  if ((normalized.includes("missing") || normalized.includes("not found")) && normalized.includes("asset")) {
    return "asset-missing";
  }
  if ((normalized.includes("missing") || normalized.includes("not found")) && (normalized.includes("file") || normalized.includes("entry"))) {
    return "missing-file";
  }
  if (
    normalized.includes("dependency install")
    || normalized.includes("npm install")
    || normalized.includes("dependency")
    || normalized.includes("package.json")
    || normalized.includes("node_modules")
  ) {
    return "build-error";
  }
  if (normalized.includes("preview")) return "preview-error";
  if (normalized.includes("lint")) return "lint-error";
  if (normalized.includes("test")) return "test-error";
  if (normalized.includes("launch") || normalized.includes("runtime") || normalized.includes("startup") || normalized.includes("boot")) {
    return "runtime-error";
  }
  if (normalized.includes("build")) return "build-error";
  if (normalized.includes("verify") || normalized.includes("verification")) return "verification-error";
  return "unknown";
}

export function deriveFinalVerificationResult(
  report: AgentVerificationReport
): AgentTaskFinalVerificationResult | undefined {
  const checks = report.checks ?? [];
  if (checks.length === 0) return undefined;
  if (checks.some((check) => check.status === "failed")) return "failed";
  const passedCount = checks.filter((check) => check.status === "passed").length;
  const skippedCount = checks.filter((check) => check.status === "skipped").length;
  if (passedCount > 0) return "passed";
  if (skippedCount > 0) return "skipped";
  return undefined;
}
