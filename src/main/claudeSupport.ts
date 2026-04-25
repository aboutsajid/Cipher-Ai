import { ChildProcess, spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildClaudeMessageContent } from "./attachmentSupport";
import { executeClaudeChatFilesystemTool, type ClaudeChatFilesystemToolCall } from "./claudeChatFilesystem";
import type { AttachmentPayload, ClaudeChatFilesystemSettings } from "../shared/types";

interface ClaudeRuntime {
  process: ChildProcess;
  stdoutBuffer: string;
  awaitingResult: boolean;
  assistantTextBuffer: string;
  pendingFilesystemToolCall: ClaudeChatFilesystemToolCall | null;
  pendingPromptOptions: ClaudePromptOptions;
  toolCallCount: number;
  cancelRequested: boolean;
}

interface ClaudePromptOptions {
  includeFullTextAttachments?: boolean;
  filesystemAccess?: ClaudeChatFilesystemSettings;
}

type ClaudeOutputStream = "stdout" | "stderr" | "system";
type ClaudeRendererSender = (channel: "claude:output" | "claude:error" | "claude:exit", payload: unknown) => void;

interface ClaudeSessionManagerDeps {
  spawnCommand?: typeof spawn;
  model?: string;
  platform?: NodeJS.Platform;
  workingDirectory?: string;
  auditLogPath?: string;
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
const MAX_CLAUDE_TOOL_CALLS = 24;

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
  private readonly workingDirectory: string | undefined;
  private readonly auditLogPath: string | undefined;

  constructor(
    private readonly sendToRenderer: ClaudeRendererSender,
    deps: ClaudeSessionManagerDeps = {}
    ) {
    this.spawnCommand = deps.spawnCommand ?? spawn;
    this.model = deps.model ?? DEFAULT_CLAUDE_MODEL;
    this.platform = deps.platform ?? process.platform;
    this.workingDirectory = deps.workingDirectory?.trim() || undefined;
    this.auditLogPath = deps.auditLogPath?.trim() || undefined;
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
      runtime.cancelRequested = false;
      runtime.assistantTextBuffer = "";
      runtime.pendingPromptOptions = { ...options };
      runtime.toolCallCount = 0;
      this.sendUserPacket(runtime, content);
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

  private extractJsonObjectCandidate(input: string): string | null {
    const trimmed = (input ?? "").trim();
    if (!trimmed) return null;
    const fenceMatch = trimmed.match(/^```json\s*([\s\S]*?)```$/i) ?? trimmed.match(/^```\s*([\s\S]*?)```$/i);
    const candidate = (fenceMatch?.[1] ?? trimmed).trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null;
    return candidate;
  }

  private parseFilesystemToolCall(input: string): ClaudeChatFilesystemToolCall | null {
    const candidate = this.extractJsonObjectCandidate(input);
    if (!candidate) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      try {
        const repaired = candidate.replace(
          /"path"\s*:\s*"([^"]*)"/g,
          (_match, rawPath: string) => `"path":"${rawPath.replace(/\\/g, "\\\\")}"`
        );
        parsed = JSON.parse(repaired);
      } catch {
        return null;
      }
    }

    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { tool?: unknown; args?: unknown };
    const tool = typeof record.tool === "string" ? record.tool.trim() : "";
    if (!["list_files", "read_file", "search_files", "write_plan", "write_file", "write_files", "write_binary", "write_binaries", "mkdir_path", "move_path", "delete_path"].includes(tool)) return null;
    return {
      tool: tool as ClaudeChatFilesystemToolCall["tool"],
      args: record.args && typeof record.args === "object" ? record.args as Record<string, unknown> : {}
    };
  }

  private parseFilesystemToolUse(part: Record<string, unknown>): ClaudeChatFilesystemToolCall | null {
    const type = typeof part.type === "string" ? part.type.trim() : "";
    if (type !== "tool_use") return null;

    const tool = typeof part.name === "string" ? part.name.trim() : "";
    if (!["list_files", "read_file", "search_files", "write_plan", "write_file", "write_files", "write_binary", "write_binaries", "mkdir_path", "move_path", "delete_path"].includes(tool)) {
      return null;
    }

    const input = part.input;
    return {
      tool: tool as ClaudeChatFilesystemToolCall["tool"],
      args: input && typeof input === "object" ? input as Record<string, unknown> : {}
    };
  }

  private isMissingFilesystemToolError(input: string): boolean {
    const lower = (input ?? "").toLowerCase();
    return ["list_files", "read_file", "search_files", "write_plan", "write_file", "write_files", "write_binary", "write_binaries", "mkdir_path", "move_path", "delete_path"]
      .some((tool) => lower.includes(tool) && (lower.includes("no such tool available") || lower.includes("tool") && lower.includes("not available")));
  }

  private sendUserPacket(runtime: ClaudeRuntime, content: unknown): void {
    if (!runtime.process.stdin || runtime.process.stdin.writableEnded) {
      throw new Error("Claude Code session is not connected.");
    }
    const packet = JSON.stringify({ type: "user", message: { role: "user", content } });
    runtime.process.stdin.write(`${packet}\n`);
    runtime.awaitingResult = true;
  }

  private async handleFilesystemToolCall(runtime: ClaudeRuntime, toolCall: ClaudeChatFilesystemToolCall): Promise<boolean> {
    if (runtime.cancelRequested || this.runtime?.process !== runtime.process) {
      return false;
    }
    const filesystemAccess = runtime.pendingPromptOptions.filesystemAccess;
    if (!filesystemAccess || !Array.isArray(filesystemAccess.roots) || filesystemAccess.roots.length === 0) {
      this.emitError("Claude chat filesystem access is not configured.");
      return false;
    }
    const maxToolCalls = Math.max(1, filesystemAccess.budgets?.maxToolCallsPerTurn ?? MAX_CLAUDE_TOOL_CALLS);
    if (runtime.toolCallCount >= maxToolCalls) {
      this.emitError("Claude chat filesystem tool limit reached for this turn.");
      return false;
    }

    runtime.toolCallCount += 1;
    try {
      const result = await executeClaudeChatFilesystemTool(toolCall, filesystemAccess, {
        onProgress: (message) => {
          if (runtime.cancelRequested) return;
          this.emitOutput(`[Claude filesystem] ${message}`, "system");
        },
        onAudit: async (entry) => {
          if (!filesystemAccess.auditEnabled || !this.auditLogPath) return;
          await this.appendAuditEntry(entry);
        }
      });
      if (runtime.cancelRequested || this.runtime?.process !== runtime.process) {
        return false;
      }
      this.sendUserPacket(
        runtime,
        [
          `[Claude tool result] ${toolCall.tool}`,
          JSON.stringify(result, null, 2),
          "Continue the same task.",
          "If you need another filesystem action, reply with the next strict JSON tool call only.",
          "Otherwise reply with the final answer for the user."
        ].join("\n\n")
      );
      return true;
    } catch (err) {
      if (runtime.cancelRequested || this.runtime?.process !== runtime.process) {
        return false;
      }
      this.sendUserPacket(
        runtime,
        [
          `[Claude tool error] ${toolCall.tool}`,
          err instanceof Error ? err.message : "Unknown filesystem tool error.",
          "Continue the same task.",
          "If another filesystem action is needed, reply with the next strict JSON tool call only.",
          "Otherwise explain the limitation to the user."
        ].join("\n\n")
      );
      return true;
    }
  }

  private async appendAuditEntry(entry: {
    tool: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }): Promise<void> {
    if (!this.auditLogPath) return;
    try {
      await mkdir(dirname(this.auditLogPath), { recursive: true });
      await appendFile(this.auditLogPath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry
      })}\n`, "utf8");
    } catch {
      // Audit failures should never block the chat flow.
    }
  }

  private isModelUnavailableLine(input: string): boolean {
    const lower = input.toLowerCase();
    return (lower.includes("model") && lower.includes("not found"))
      || lower.includes("unknown model")
      || lower.includes("no such model");
  }

  private async parseStreamLine(runtime: ClaudeRuntime, rawLine: string): Promise<void> {
    if (runtime.cancelRequested || this.runtime?.process !== runtime.process) return;
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
      const collected: string[] = [];
      let pendingToolCall: ClaudeChatFilesystemToolCall | null = null;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const typed = part as Record<string, unknown>;
        const toolUse = this.parseFilesystemToolUse(typed);
        if (toolUse) {
          pendingToolCall = toolUse;
          continue;
        }
        if (typed.type !== "text") continue;
        const text = typeof typed.text === "string" ? typed.text.trim() : "";
        if (text) collected.push(text);
      }
      if (pendingToolCall) runtime.pendingFilesystemToolCall = pendingToolCall;
      if (collected.length > 0) {
        runtime.assistantTextBuffer = [runtime.assistantTextBuffer, collected.join("\n")].filter(Boolean).join("\n");
      }
      return;
    }

    if (packetType === "result") {
      const resultText = typeof packet.result === "string" ? packet.result.trim() : "";
      const assistantText = runtime.assistantTextBuffer.trim();
      const pendingToolCall = runtime.pendingFilesystemToolCall;
      runtime.assistantTextBuffer = "";
      runtime.pendingFilesystemToolCall = null;

      if (packet.is_error === true) {
        if (pendingToolCall && this.isMissingFilesystemToolError([assistantText, resultText].filter(Boolean).join("\n"))) {
          const continued = await this.handleFilesystemToolCall(runtime, pendingToolCall);
          if (continued) return;
          if (runtime.cancelRequested || this.runtime?.process !== runtime.process) return;
        }
        runtime.awaitingResult = false;
        runtime.toolCallCount = 0;
        const errorMessages = [assistantText, resultText]
          .map((message) => message.trim())
          .filter(Boolean)
          .filter((message, index, messages) => messages.indexOf(message) === index);
        this.emitError(errorMessages.join("\n") || "Claude Code returned an error.");
        this.sendToRenderer("claude:exit", { code: 0, signal: null });
        return;
      }

      const toolCall = pendingToolCall ?? this.parseFilesystemToolCall(assistantText);
      if (toolCall) {
        const continued = await this.handleFilesystemToolCall(runtime, toolCall);
        if (continued) return;
        if (runtime.cancelRequested || this.runtime?.process !== runtime.process) return;
      }

      runtime.awaitingResult = false;
      runtime.toolCallCount = 0;
      if (assistantText) this.emitOutput(assistantText, "stdout");
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
        cwd: this.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown launch error.";
      this.emitError(message);
      return this.buildResult(false, `Failed to start Claude Code: ${message}`);
    }

    const runtime: ClaudeRuntime = {
      process: proc,
      stdoutBuffer: "",
      awaitingResult: false,
      assistantTextBuffer: "",
      pendingFilesystemToolCall: null,
      pendingPromptOptions: {},
      toolCallCount: 0,
      cancelRequested: false
    };
    this.runtime = runtime;

    proc.stdout?.on("data", async (chunk: Buffer) => {
      runtime.stdoutBuffer += chunk.toString().replace(/\r/g, "");
      const lines = runtime.stdoutBuffer.split("\n");
      runtime.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (runtime.cancelRequested) break;
        await this.parseStreamLine(runtime, line);
      }
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

    proc.once("exit", async (code, signal) => {
      if (!runtime.cancelRequested && runtime.stdoutBuffer.trim()) await this.parseStreamLine(runtime, runtime.stdoutBuffer);
      runtime.stdoutBuffer = "";
      runtime.assistantTextBuffer = "";
      runtime.pendingFilesystemToolCall = null;
      runtime.toolCallCount = 0;
      if (this.runtime?.process === proc) this.runtime = null;
      const stoppedByUser = runtime.cancelRequested || signal === "SIGTERM";
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
    runtime.cancelRequested = true;
    runtime.awaitingResult = false;
    runtime.stdoutBuffer = "";
    runtime.assistantTextBuffer = "";
    runtime.pendingFilesystemToolCall = null;
    runtime.toolCallCount = 0;

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
        await new Promise<void>((resolvePromise) => {
          const killer = this.spawnCommand("taskkill", ["/pid", String(pid), "/f", "/t"], {
            stdio: "ignore",
            windowsHide: true
          });
          killer.once("error", () => resolvePromise());
          killer.once("exit", () => resolvePromise());
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
