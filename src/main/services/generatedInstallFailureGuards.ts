import type { TerminalCommandResult } from "../../shared/types";

function buildNormalizedOutput(result: TerminalCommandResult): string {
  return `${result.combinedOutput || ""}\n${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
}

export function isRecoverableGeneratedInstallFailure(result: TerminalCommandResult): boolean {
  const normalized = buildNormalizedOutput(result);
  return [
    "no matching version found",
    "error code etarget",
    "error notarget",
    "unable to resolve dependency tree",
    "could not resolve dependency",
    "conflicting peer dependency",
    "404 not found - get https://registry.npmjs.org/"
  ].some((term) => normalized.includes(term));
}

export function isTransientGeneratedInstallLockFailure(result: TerminalCommandResult): boolean {
  const normalized = buildNormalizedOutput(result);
  return normalized.includes("error code ebusy")
    || normalized.includes("resource busy or locked")
    || normalized.includes("default_app.asar")
    || normalized.includes("errno -4082");
}

export function isTransientGeneratedPackagingLockFailure(result: TerminalCommandResult): boolean {
  const normalized = buildNormalizedOutput(result);
  return normalized.includes("error code ebusy")
    || normalized.includes("error code eperm")
    || normalized.includes("errno -4082")
    || normalized.includes("resource busy or locked")
    || normalized.includes("the process cannot access the file because it is being used by another process")
    || normalized.includes("win-unpacked\\resources\\app.asar")
    || normalized.includes("win-unpacked/resources/app.asar")
    || normalized.includes("operation not permitted, unlink")
    || normalized.includes("cannot unlink")
    || normalized.includes("err_electron_builder_cannot_execute");
}
