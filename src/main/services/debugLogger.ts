import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logPath = "";
let initialized = false;
let processHooksRegistered = false;

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
  if (!logPath) return;
  const text = parts
    .map((part) => normalizePart(part))
    .join(" ")
    .slice(0, MAX_PART_LENGTH);

  const line = `${new Date().toISOString()} [${level}] ${text}\n`;
  try {
    appendFileSync(logPath, line, "utf8");
  } catch {
    // Best-effort logging only.
  }
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
  });

  process.on("unhandledRejection", (reason) => {
    writeLine("FATAL", ["unhandledRejection", reason]);
  });
}

export function initDebugLogger(userDataPath: string): string {
  const logsDir = join(userDataPath, "cipher-workspace", "logs");
  mkdirSync(logsDir, { recursive: true });
  logPath = join(logsDir, "main.log");

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
