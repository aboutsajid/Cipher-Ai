import { ChildProcess, spawn } from "node:child_process";
import { buildClaudeMessageContent } from "./attachmentSupport";
import type { AttachmentPayload } from "../shared/types";

interface ClaudeRuntime {
  process: ChildProcess;
  stdoutBuffer: string;
  awaitingResult: boolean;
}

interface ClaudePromptOptions {
  includeFullTextAttachments?: boolean;
}

type ClaudeOutputStream = "stdout" | "stderr" | "system";
type ClaudeRendererSender = (channel: "claude:output" | "claude:error" | "claude:exit", payload: unknown) => void;

interface ClaudeSessionManagerDeps {
  spawnCommand?: typeof spawn;
  model?: string;
  platform?: NodeJS.Platform;
}

export interface ClaudeSessionStatus {
  running: boolean;
  pid?: number;
  model: string;
}

export interface ClaudeSessionResult extends ClaudeSessionStatus {
  ok: boolean;
  message: string;
}

const DEFAULT_CLAUDE_MODEL = "minimax-m2.5:cloud";
const CLAUDE_STREAM_SUFFIX = ["--", "-p", "--bare", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"];

export async function probeOllamaInstalled(
  spawnCommand: typeof spawn = spawn,
  platform: NodeJS.Platform = process.platform
): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const probe = spawnCommand("ollama", ["--version"], {
      shell: platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stderr = "";

    probe.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    probe.once("error", () => {
      resolve({ ok: false, message: "Ollama is not installed or not available in PATH." });
    });

    probe.once("exit", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const detail = stderr.trim();
      resolve({
        ok: false,
        message: detail ? `Ollama check failed: ${detail}` : "Ollama is not installed or not available in PATH."
      });
    });
  });
}

export class ClaudeSessionManager {
  private runtime: ClaudeRuntime | null = null;
  private sessionEnabled = false;
  private readonly spawnCommand: typeof spawn;
  private readonly model: string;
  private readonly platform: NodeJS.Platform;

  constructor(
    private readonly sendToRenderer: ClaudeRendererSender,
    deps: ClaudeSessionManagerDeps = {}
  ) {
    this.spawnCommand = deps.spawnCommand ?? spawn;
    this.model = deps.model ?? DEFAULT_CLAUDE_MODEL;
    this.platform = deps.platform ?? process.platform;
  }

  status(): ClaudeSessionStatus {
    const runtime = this.getActiveRuntime();
    return {
      running: this.sessionEnabled && Boolean(runtime),
      pid: runtime?.process.pid,
      model: this.model
    };
  }

  async start(): Promise<ClaudeSessionResult> {
    const ollamaCheck = await probeOllamaInstalled(this.spawnCommand, this.platform);
    if (!ollamaCheck.ok) {
      const message = ollamaCheck.message ?? "Ollama is not installed or not available in PATH.";
      this.emitError(message);
      return this.buildResult(false, message);
    }

    this.sessionEnabled = true;
    const result = this.startRuntime();
    if (!result.ok) this.sessionEnabled = false;
    return result;
  }

  sendPrompt(
    prompt: string,
    attachments: AttachmentPayload[] = [],
    enabledTools: string[] = [],
    options: ClaudePromptOptions = {}
  ): ClaudeSessionResult {
    if (!this.sessionEnabled) {
      const message = "Claude Code session is not started.";
      this.emitError(message);
      return this.buildResult(false, message);
    }

    const runtime = this.getActiveRuntime();
    if (!runtime || !runtime.process.stdin || runtime.process.stdin.writableEnded) {
      const message = "Claude Code session is not connected.";
      this.emitError(message);
      return this.buildResult(false, message);
    }

    if (runtime.awaitingResult) {
      return this.buildResult(false, "Claude Code is still generating a response. Please wait.");
    }

    try {
      const content = buildClaudeMessageContent(prompt, attachments, enabledTools, options);
      const packet = JSON.stringify({ type: "user", message: { role: "user", content } });
      runtime.process.stdin.write(`${packet}\n`);
      runtime.awaitingResult = true;
      return this.buildResult(true, "Prompt sent.");
    } catch (err) {
      runtime.awaitingResult = false;
      const message = err instanceof Error ? err.message : "Failed to send prompt.";
      this.emitError(message);
      return this.buildResult(false, message);
    }
  }

  async stop(): Promise<ClaudeSessionResult> {
    this.sessionEnabled = false;
    await this.stopRuntime();
    return this.buildResult(true, "Claude Code session stopped.");
  }

  private buildResult(ok: boolean, message: string): ClaudeSessionResult {
    return { ok, message, ...this.status() };
  }

  private getActiveRuntime(): ClaudeRuntime | null {
    if (!this.runtime) return null;
    const alive = this.runtime.process.exitCode === null && !this.runtime.process.killed;
    if (!alive) {
      this.runtime = null;
      return null;
    }
    return this.runtime;
  }

  private emitOutput(text: string, stream: ClaudeOutputStream = "stdout"): void {
    const normalized = text.replace(/\r/g, "");
    const lines = normalized.split("\n").map((line) => line.trimEnd()).filter(Boolean);
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("launching claude code with ")) continue;
      this.sendToRenderer("claude:output", { text: line, stream });
    }
  }

  private emitError(message: string): void {
    const normalized = (message ?? "").trim() || "Unknown Claude Code error.";
    this.sendToRenderer("claude:error", normalized);
  }

  private isModelUnavailableLine(input: string): boolean {
    const lower = input.toLowerCase();
    return (lower.includes("model") && lower.includes("not found"))
      || lower.includes("unknown model")
      || lower.includes("no such model");
  }

  private parseStreamLine(runtime: ClaudeRuntime, rawLine: string): void {
    const line = rawLine.trim();
    if (!line) return;

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      this.emitOutput(line, "stdout");
      return;
    }

    if (!payload || typeof payload !== "object") return;
    const packet = payload as Record<string, unknown>;
    const packetType = typeof packet.type === "string" ? packet.type : "";

    if (packetType === "assistant") {
      const message = packet.message;
      if (!message || typeof message !== "object") return;
      const content = (message as Record<string, unknown>).content;
      if (!Array.isArray(content)) return;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const typed = part as Record<string, unknown>;
        if (typed.type !== "text") continue;
        const text = typeof typed.text === "string" ? typed.text.trim() : "";
        if (text) this.emitOutput(text, "stdout");
      }
      return;
    }

    if (packetType === "result") {
      runtime.awaitingResult = false;
      const resultText = typeof packet.result === "string" ? packet.result.trim() : "";
      if (packet.is_error === true && resultText) this.emitOutput(resultText, "stderr");
      this.sendToRenderer("claude:exit", { code: 0, signal: null });
    }
  }

  private startRuntime(): ClaudeSessionResult {
    if (this.getActiveRuntime()) {
      return this.buildResult(true, "Claude Code session already started.");
    }

    let proc: ChildProcess;
    try {
      proc = this.spawnCommand("ollama", ["launch", "claude", "--model", this.model, ...CLAUDE_STREAM_SUFFIX], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown launch error.";
      this.emitError(message);
      return this.buildResult(false, `Failed to start Claude Code: ${message}`);
    }

    const runtime: ClaudeRuntime = { process: proc, stdoutBuffer: "", awaitingResult: false };
    this.runtime = runtime;

    proc.stdout?.on("data", (chunk: Buffer) => {
      runtime.stdoutBuffer += chunk.toString().replace(/\r/g, "");
      const lines = runtime.stdoutBuffer.split("\n");
      runtime.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) this.parseStreamLine(runtime, line);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      this.emitOutput(text, "stderr");
      text.split(/\r?\n/).forEach((line) => {
        if (this.isModelUnavailableLine(line.trim())) {
          this.emitError(`Model unavailable: ${this.model}. Pull or configure access in Ollama.`);
        }
      });
    });

    proc.once("error", (err) => {
      if (this.runtime?.process === proc) this.runtime = null;
      this.sessionEnabled = false;
      this.emitError(`Claude Code process error: ${err.message}`);
      this.sendToRenderer("claude:exit", { code: null, signal: "error" });
    });

    proc.once("exit", (code, signal) => {
      if (runtime.stdoutBuffer.trim()) this.parseStreamLine(runtime, runtime.stdoutBuffer);
      runtime.stdoutBuffer = "";
      if (this.runtime?.process === proc) this.runtime = null;
      const stoppedByUser = signal === "SIGTERM";
      if (!stoppedByUser) {
        this.sessionEnabled = false;
        const signalLabel = signal ?? "none";
        this.emitOutput(
          `Claude Code exited${typeof code === "number" ? ` with code ${code}` : ""} (signal: ${signalLabel}).`,
          "system"
        );
      }
      this.sendToRenderer("claude:exit", { code: code ?? null, signal: signal ?? null });
    });

    return this.buildResult(true, "Claude Code session started.");
  }

  private async stopRuntime(): Promise<void> {
    const runtime = this.getActiveRuntime();
    if (!runtime) return;

    const proc = runtime.process;
    const pid = proc.pid;

    try {
      if (!pid) {
        try {
          proc.kill("SIGTERM");
        } catch {
          // noop
        }
        return;
      }

      if (this.platform === "win32") {
        await new Promise<void>((resolve) => {
          const killer = this.spawnCommand("taskkill", ["/pid", String(pid), "/f", "/t"], {
            stdio: "ignore",
            windowsHide: true
          });
          killer.once("error", () => resolve());
          killer.once("exit", () => resolve());
        });
        return;
      }

      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          proc.kill("SIGTERM");
        } catch {
          // noop
        }
      }
    } finally {
      this.runtime = null;
    }
  }
}
