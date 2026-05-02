import type {
  AgentTask,
  AgentTaskRunMode,
  AgentVerificationCheck
} from "../../shared/types";

export interface TaskApprovalPackageManifestLike {
  main?: string;
}

export interface TaskApprovalScriptsLike {
  build?: string;
  start?: string;
  dev?: string;
  [key: string]: string | undefined;
}

export function ensureVerificationRequired(task: AgentTask, runMode: AgentTaskRunMode = "build-product"): void {
  const normalizedRunMode: AgentTaskRunMode = runMode === "standard" ? "standard" : "build-product";
  const implementationStep = task.steps.find((step) => step.title === "Implement requested changes");
  if (!implementationStep || implementationStep.status !== "completed") {
    throw new Error("Implementation is required before completing an agent task.");
  }
  const verificationStep = task.steps.find((step) => step.title === "Verify build and quality scripts");
  if (!verificationStep || verificationStep.status !== "completed") {
    throw new Error("Verification is required before completing an agent task.");
  }

  if (normalizedRunMode === "build-product") {
    const repairStep = task.steps.find((step) => step.title === "Repair verification failures");
    if (!repairStep || repairStep.status !== "completed") {
      throw new Error("Repair gate is required before completing an agent task.");
    }
    const packagingStep = task.steps.find((step) => step.title === "Package Windows installer");
    if (!packagingStep || packagingStep.status !== "completed") {
      throw new Error("Packaging gate is required before completing an agent task.");
    }
    const installerSmokeStep = task.steps.find((step) => step.title === "Run Windows installer smoke");
    if (!installerSmokeStep || installerSmokeStep.status !== "completed") {
      throw new Error("Installer smoke gate is required before completing an agent task.");
    }
  }

  const approvalStep = task.steps.find((step) => step.title === "Approve generated output");
  if (!approvalStep || approvalStep.status !== "completed") {
    throw new Error("Approval is required before completing an agent task.");
  }

  const verification = task.verification;
  if (!verification || verification.checks.length === 0) {
    throw new Error("Verification report is required before completing an agent task.");
  }
}

export function buildTaskApproval(
  task: AgentTask,
  packageManifest: TaskApprovalPackageManifestLike | null,
  scripts: TaskApprovalScriptsLike,
  requiresDesktopApproval: boolean
): { ok: boolean; summary: string } {
  const verification = task.verification;
  if (!verification || verification.checks.length === 0) {
    return {
      ok: false,
      summary: "Approval failed: verification report is missing."
    };
  }

  const failedChecks = verification.checks.filter((check) => check.status === "failed");
  if (failedChecks.length > 0) {
    return {
      ok: false,
      summary: `Approval failed: verification still has failing checks (${failedChecks.map((check) => check.label).join(", ")}).`
    };
  }

  if (!requiresDesktopApproval) {
    return {
      ok: true,
      summary: "Approval passed: verification checks are clear."
    };
  }

  const findings: string[] = [];
  if (task.artifactType !== "desktop-app") {
    findings.push("artifact was not classified as a desktop app");
  }
  if (!packageManifest) {
    findings.push("package.json is missing");
  }
  if (packageManifest && (!packageManifest.main || !packageManifest.main.trim())) {
    findings.push("package.json is missing the Electron main entry");
  }
  if (!scripts.build) {
    findings.push("build script is missing");
  }
  if (!scripts.start && !scripts.dev) {
    findings.push("runtime launch script is missing");
  }
  if (typeof scripts["package:win"] !== "string" || !scripts["package:win"]?.trim()) {
    findings.push("package:win script is missing");
  }

  if (findings.length > 0) {
    return {
      ok: false,
      summary: `Approval failed for desktop output: ${findings.join("; ")}.`
    };
  }

  return {
    ok: true,
    summary: "Approval passed for desktop output: verification cleared and packaging signals are present."
  };
}

export function upsertVerificationCheck(
  checks: AgentVerificationCheck[],
  next: AgentVerificationCheck
): void {
  const index = checks.findIndex((check) => check.id === next.id);
  if (index >= 0) {
    checks[index] = next;
    return;
  }
  checks.push(next);
}
