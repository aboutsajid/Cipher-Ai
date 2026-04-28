import { setTimeout as delay } from "node:timers/promises";

function readErrorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

export function isRetriableWorkspaceFsError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
}

export function isNoSpaceLeftError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "ENOSPC" || /\bENOSPC\b|no space left on device/i.test(message);
}

export async function withWorkspaceFsRetry<T>(
  operation: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number; isRetriable?: (error: unknown) => boolean }
): Promise<T> {
  const attempts = options?.attempts ?? 4;
  const delayMs = options?.delayMs ?? 150;
  const isRetriable = options?.isRetriable ?? isRetriableWorkspaceFsError;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetriable(error) || attempt === attempts - 1) {
        throw error;
      }
      await delay(delayMs * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Workspace filesystem retry exhausted.");
}
