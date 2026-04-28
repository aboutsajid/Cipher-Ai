import { appendFileSync, mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createBufferedLogWriter, redactDebugLogText, type BufferedLogWriter } from "./debugLogBuffer";

let logPath = "";
let initialized = false;
let processHooksRegistered = false;
let bufferedWriter: BufferedLogWriter | null = null;

const MAX_PART_LENGTH = 6000;

function normalizePart(part: unknown): string {
  if (typeof part === "string") return part;
  if (part instanceof Error) return `${part.name}: ${part.message}\n${part.stack ?? ""}`.trim();
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function writeLine(level: string, parts: unknown[]): void {
  if (!logPath || !bufferedWriter) return;
  const text = parts
    .map((part) => normalizePart(part))
    .join(" ")
    .slice(0, MAX_PART_LENGTH);
  const sanitized = redactDebugLogText(text);

  const line = `${new Date().toISOString()} [${level}] ${sanitized}\n`;
  bufferedWriter.appendLine(line);
}

function patchConsole(): void {
  if (initialized) return;
  initialized = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    writeLine("INFO", args);
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    writeLine("WARN", args);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    writeLine("ERROR", args);
    originalError(...args);
  };
}

function registerProcessHooks(): void {
  if (processHooksRegistered) return;
  processHooksRegistered = true;

  process.on("uncaughtException", (err) => {
    writeLine("FATAL", ["uncaughtException", err]);
    flushDebugLoggerSync();
  });

  process.on("unhandledRejection", (reason) => {
    writeLine("FATAL", ["unhandledRejection", reason]);
    flushDebugLoggerSync();
  });

  process.on("beforeExit", () => {
    flushDebugLoggerSync();
  });

  process.on("exit", () => {
    flushDebugLoggerSync();
  });
}

export function initDebugLogger(userDataPath: string): string {
  const logsDir = join(userDataPath, "cipher-workspace", "logs");
  mkdirSync(logsDir, { recursive: true });
  logPath = join(logsDir, "main.log");
  bufferedWriter = createBufferedLogWriter({
    append: async (chunk) => appendFile(logPath, chunk, "utf8"),
    appendSync: (chunk) => appendFileSync(logPath, chunk, "utf8")
  });

  patchConsole();
  registerProcessHooks();
  writeLine("INFO", ["debug logger initialized"]);
  return logPath;
}

export function writeDebugLog(level: string, ...parts: unknown[]): void {
  writeLine(level, parts);
}

export function getDebugLogPath(): string {
  return logPath;
}

export async function flushDebugLogger(): Promise<void> {
  if (!bufferedWriter) return;
  await bufferedWriter.flush();
}

export function flushDebugLoggerSync(): void {
  bufferedWriter?.flushSync();
}

export function shutdownDebugLogger(): void {
  flushDebugLoggerSync();
}
