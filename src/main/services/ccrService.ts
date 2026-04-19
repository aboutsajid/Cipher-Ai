import { spawn, ChildProcess } from "node:child_process";
import {
  getCloudProviderDisplayName,
  inferCloudProvider
} from "../../shared/modelCatalog";
import type { SettingsStore } from "./settingsStore";
import type { RouterStatus } from "../../shared/types";

type RichMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type RichMessage = { role: string; content: string | RichMessagePart[] };

interface SendMessageOptions {
  baseUrl?: string;
  cloudProvider?: "openrouter" | "nvidia";
  apiKey?: string;
  skipAuth?: boolean;
  timeoutMs?: number;
}

interface CommandResult {
  code: number | null;
  output: string;
  error?: string;
}

interface ParsedStatus {
  running: boolean;
  pid?: number;
}

const CHAT_COMPLETION_TIMEOUT_MS = 30_000;

function inferCloudProviderName(baseUrl: string, preferredProvider?: string): "OpenRouter" | "NVIDIA" {
  return getCloudProviderDisplayName(inferCloudProvider(baseUrl, preferredProvider));
}

function isOpenRouterCloudProvider(baseUrl: string, preferredProvider?: string): boolean {
  return inferCloudProvider(baseUrl, preferredProvider) === "openrouter";
}

export class CcrService {
  private settingsStore: SettingsStore;
  private routerProcess: ChildProcess | null = null;
  private logBuffer: string[] = [];
  private onLog?: (line: string) => void;

  constructor(settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
  }

  setLogHandler(handler: (line: string) => void): void {
    this.onLog = handler;
  }

  private appendLog(line: string): void {
    this.logBuffer.push(line);
    if (this.logBuffer.length > 200) this.logBuffer.shift();
    this.onLog?.(line);
  }

  private appendOutput(output: string): void {
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => this.appendLog(line));
  }

  private parseOutput(data: Buffer, onLine: (line: string) => void): void {
    data
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach(onLine);
  }

  private async runCcrCommand(args: string[], timeoutMs = 8000): Promise<CommandResult> {
    return new Promise((resolve) => {
      let settled = false;
      let timedOut = false;
      let stdout = "";
      let stderr = "";

      const finish = (result: CommandResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let cmd: ChildProcess;
      try {
        cmd = spawn("ccr", args, {
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
      } catch (err) {
        finish({
          code: null,
          output: "",
          error: err instanceof Error ? err.message : "unknown error"
        });
        return;
      }

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          cmd.kill("SIGTERM");
        } catch {
          // noop
        }
      }, timeoutMs);

      cmd.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      cmd.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      cmd.once("error", (err) => {
        clearTimeout(timer);
        finish({
          code: null,
          output: `${stdout}\n${stderr}`.trim(),
          error: err.message
        });
      });

      cmd.once("exit", (code) => {
        clearTimeout(timer);
        const output = `${stdout}\n${stderr}`.trim();
        if (timedOut) {
          finish({
            code,
            output,
            error: `Timed out after ${timeoutMs}ms`
          });
          return;
        }
        finish({ code, output });
      });
    });
  }

  private parseStatusOutput(output: string): ParsedStatus {
    const lower = output.toLowerCase();
    const notRunning = lower.includes("status: not running");
    const running = !notRunning && (lower.includes("status: running") || lower.includes("ready to use"));
    const pidMatch = output.match(/process id:\s*(\d+)/i);
    const pid = pidMatch ? Number(pidMatch[1]) : undefined;
    return { running, pid };
  }

  private async fetchStatus(timeoutMs = 5000): Promise<ParsedStatus> {
    const statusRes = await this.runCcrCommand(["status"], timeoutMs);
    if (statusRes.output) this.appendOutput(statusRes.output);

    if (statusRes.error && !statusRes.output) {
      return {
        running: this.routerProcess !== null && !this.routerProcess.killed,
        pid: this.routerProcess?.pid
      };
    }

    return this.parseStatusOutput(statusRes.output);
  }

  private async terminateProcessTree(proc: ChildProcess): Promise<void> {
    const pid = proc.pid;

    if (!pid) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // noop
      }
      return;
    }

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
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
  }

  async getStatus(): Promise<RouterStatus> {
    const status = await this.fetchStatus(3000);
    return {
      running: status.running,
      pid: status.pid ?? this.routerProcess?.pid,
      port: this.settingsStore.get().routerPort
    };
  }

  getLogs(): string[] {
    return [...this.logBuffer];
  }

  async startRouter(): Promise<{ ok: boolean; message: string }> {
    const already = await this.fetchStatus(3000);
    if (already.running) {
      return { ok: false, message: "Router is already running." };
    }

    const successMarkers = ["started successfully", "listening", "server is running", "3456", String(this.settingsStore.get().routerPort)].map(
      (m) => m.toLowerCase()
    );

    return new Promise((resolve) => {
      let settled = false;
      let startupTimeout: NodeJS.Timeout | null = null;
      let proc: ChildProcess;

      const finish = (result: { ok: boolean; message: string }) => {
        if (settled) return;
        settled = true;
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
        resolve(result);
      };

      const verifyRunning = async (successMessage: string, failMessage: string) => {
        const status = await this.fetchStatus(4000);
        if (status.running) {
          finish({ ok: true, message: successMessage });
        } else {
          finish({ ok: false, message: failMessage });
        }
      };

      try {
        proc = spawn("ccr", ["start"], {
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
      } catch (err) {
        finish({ ok: false, message: `Failed to start router: ${err instanceof Error ? err.message : "unknown error"}` });
        return;
      }

      this.routerProcess = proc;

      const handleLine = (line: string) => {
        this.appendLog(line);
        const lower = line.toLowerCase();
        if (successMarkers.some((marker) => lower.includes(marker))) {
          void verifyRunning("Router started.", "Router reported startup but is not running.");
        }
      };

      proc.stdout?.on("data", (data: Buffer) => {
        this.parseOutput(data, handleLine);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        this.parseOutput(data, handleLine);
      });

      proc.once("error", (err) => {
        this.routerProcess = null;
        finish({ ok: false, message: `Failed to start router: ${err.message}` });
      });

      proc.once("exit", (code) => {
        if (this.routerProcess === proc) this.routerProcess = null;
        this.appendLog("[CCR] Router process exited.");
        if (settled) return;
        const codeMsg = typeof code === "number" ? ` (code ${code})` : "";
        void verifyRunning("Router started.", `Router exited before startup${codeMsg}.`);
      });

      startupTimeout = setTimeout(() => {
        if (settled) return;
        this.appendLog("[CCR] Router startup timed out. Checking status...");
        void verifyRunning("Router started.", "Router start timed out after 8 seconds.");
      }, 8000);
    });
  }

  async stopRouter(): Promise<{ ok: boolean; message: string }> {
    const statusBefore = await this.fetchStatus(3000);
    if (!statusBefore.running && (!this.routerProcess || this.routerProcess.killed)) {
      return { ok: false, message: "Router is not running." };
    }

    const stopRes = await this.runCcrCommand(["stop"], 10000);
    if (stopRes.output) this.appendOutput(stopRes.output);
    if (stopRes.error) this.appendLog(`[CCR] Stop command error: ${stopRes.error}`);

    if (this.routerProcess && !this.routerProcess.killed) {
      await this.terminateProcessTree(this.routerProcess);
      this.routerProcess = null;
    }

    const statusAfter = await this.fetchStatus(3000);
    if (!statusAfter.running) {
      this.appendLog("[CCR] Router stopped.");
      return { ok: true, message: "Router stopped." };
    }

    return { ok: false, message: "Router did not stop cleanly." };
  }

  async sendMessage(
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    return this.sendMessageAdvanced(messages, model, onChunk, signal);
  }

  async sendMessageAdvanced(
    messages: RichMessage[],
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options: SendMessageOptions = {}
  ): Promise<string> {
    const settings = this.settingsStore.get();
    const baseUrl = (options.baseUrl ?? settings.baseUrl).replace(/\/+$/, "");
    const cloudProvider = options.cloudProvider ?? settings.cloudProvider;
    const apiKey = options.apiKey ?? settings.apiKey;
    const skipAuth = options.skipAuth ?? false;
    const timeoutMs = Math.max(5_000, options.timeoutMs ?? CHAT_COMPLETION_TIMEOUT_MS);
    const maxOutputTokens = 8192;
    const providerName = inferCloudProviderName(baseUrl, cloudProvider);

    if (!skipAuth && !apiKey) throw new Error(`No API key set. Go to Settings and add your ${providerName} key.`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (!skipAuth && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      if (isOpenRouterCloudProvider(baseUrl, cloudProvider)) {
        headers["HTTP-Referer"] = "https://cipher-ai.local";
        headers["X-Title"] = "Cipher Workspace";
      }
    }

    const requestUrl = `${baseUrl}/chat/completions`;
    const requestBody = JSON.stringify({ model, messages, stream: true, max_tokens: maxOutputTokens });
    const createRequestSignal = () => signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const sendCompletionRequest = () => fetch(requestUrl, {
      method: "POST",
      headers,
      body: requestBody,
      signal: createRequestSignal()
    });
    let response = await sendCompletionRequest();

    if (response.status === 429) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      response = await sendCompletionRequest();
    }

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) throw new Error(`Invalid API key. Check your ${providerName} key in Settings.`);
      if (response.status === 402) {
        throw new Error(`Insufficient ${providerName} credits/budget for this request. Add credits or try a cheaper model.`);
      }
      if (response.status === 429) throw new Error("Rate limit hit. Try a different model.");
      throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
    }

    if (!response.body) {
      throw new Error("API returned an empty response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.replace(/^data:\s*/, "");
        if (payload === "[DONE]") return result;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            result += delta;
            onChunk(delta);
          }
        } catch {
          // skip malformed
        }
      }
    }

    return result;
  }

  async listOllamaModels(baseUrl: string): Promise<string[]> {
    const normalized = (baseUrl || "http://localhost:11434/v1").trim().replace(/\/+$/, "");
    const tagsUrl = `${normalized.replace(/\/v1$/i, "")}/api/tags`;
    const response = await fetch(tagsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}`);
    }

    const payload = await response.json() as { models?: Array<{ name?: string }> };
    const names = Array.isArray(payload.models)
      ? payload.models.map((model) => (model?.name ?? "").trim()).filter(Boolean)
      : [];

    return names;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const settings = this.settingsStore.get();
    const providerName = inferCloudProviderName(settings.baseUrl, settings.cloudProvider);
    if (!settings.apiKey) return { ok: false, message: `No API key set for ${providerName}.` };
    try {
      const res = await fetch(`${settings.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { ok: false, message: `API returned ${res.status}` };
      return { ok: true, message: `${providerName} connection successful!` };
    } catch (err) {
      return { ok: false, message: `${providerName} connection failed: ${err instanceof Error ? err.message : "unknown"}` };
    }
  }
}
