import { ChildProcess, spawn } from "node:child_process";
import type { SettingsStore } from "./services/settingsStore";
import type { McpServerConfig } from "../shared/types";

interface McpRuntime {
  process: ChildProcess;
  logs: string[];
  tools: string[];
}

export interface McpServerRuntime extends McpServerConfig {
  running: boolean;
  pid?: number;
  tools: string[];
  logs: string[];
}

export interface McpStatus {
  servers: McpServerRuntime[];
  tools: string[];
}

export interface McpActionResult extends McpStatus {
  ok: boolean;
  message: string;
}

interface McpRuntimeManagerDeps {
  spawnProcess?: (command: string, args: string[]) => ChildProcess;
  stopProcess?: (proc: ChildProcess) => Promise<void>;
  onChanged?: () => void;
}

export class McpRuntimeManager {
  private readonly runtimes = new Map<string, McpRuntime>();
  private readonly spawnProcess: (command: string, args: string[]) => ChildProcess;
  private readonly stopProcess: (proc: ChildProcess) => Promise<void>;
  private readonly onChanged?: () => void;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly settingsStore: Pick<SettingsStore, "listMcpServers">,
    deps: McpRuntimeManagerDeps = {}
  ) {
    this.spawnProcess = deps.spawnProcess ?? ((command, args) => spawnMcpProcess(command, args));
    this.stopProcess = deps.stopProcess ?? ((proc) => stopMcpProcess(proc));
    this.onChanged = deps.onChanged;
  }

  private queueChangedNotification(): void {
    if (!this.onChanged) return;
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.onChanged?.();
    }, 180);
  }

  buildStatus(): McpStatus {
    const servers = this.settingsStore.listMcpServers().map((server) => {
      const key = server.name.toLowerCase();
      const runtime = this.runtimes.get(key);
      return {
        ...server,
        running: Boolean(runtime),
        pid: runtime?.process.pid,
        tools: runtime?.tools ?? [],
        logs: runtime?.logs ?? []
      };
    });

    return { servers, tools: this.collectTools() };
  }

  async start(serverName: string): Promise<McpActionResult> {
    const normalizedName = (serverName ?? "").trim();
    if (!normalizedName) {
      return { ok: false, message: "Server name required.", ...this.buildStatus() };
    }

    const key = normalizedName.toLowerCase();
    if (this.runtimes.has(key)) {
      return { ok: false, message: "Server already running.", ...this.buildStatus() };
    }

    const config = this.settingsStore.listMcpServers().find((server) => server.name.toLowerCase() === key);
    if (!config) {
      return { ok: false, message: "Server not found.", ...this.buildStatus() };
    }

    let proc: ChildProcess;
    try {
      proc = this.spawnProcess(config.command, config.args);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `Failed to start ${config.name}: ${message}`, ...this.buildStatus() };
    }

    const runtime: McpRuntime = {
      process: proc,
      logs: [],
      tools: [`${config.name}.tool`]
    };
    this.appendLog(runtime, `[MCP] Starting ${config.name} ...`);
    this.runtimes.set(key, runtime);

    const collect = (prefix: string, chunk: Buffer) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => this.appendLog(runtime, `[${prefix}] ${line}`));
    };

    proc.stdout?.on("data", (chunk: Buffer) => collect("out", chunk));
    proc.stderr?.on("data", (chunk: Buffer) => collect("err", chunk));
    proc.once("error", (err) => {
      this.appendLog(runtime, `[MCP] Error: ${err.message}`);
    });
    proc.once("exit", (code) => {
      this.appendLog(runtime, `[MCP] Exited${typeof code === "number" ? ` with code ${code}` : ""}`);
      this.runtimes.delete(key);
      this.queueChangedNotification();
    });

    return { ok: true, message: `${config.name} started.`, ...this.buildStatus() };
  }

  async stop(serverName: string): Promise<McpActionResult> {
    const normalizedName = (serverName ?? "").trim();
    if (!normalizedName) {
      return { ok: false, message: "Server name required.", ...this.buildStatus() };
    }

    await this.stopRuntime(normalizedName.toLowerCase());
    return { ok: true, message: `${normalizedName} stopped.`, ...this.buildStatus() };
  }

  async stopIfRunning(serverName: string): Promise<void> {
    await this.stopRuntime((serverName ?? "").trim().toLowerCase());
  }

  private async stopRuntime(key: string): Promise<void> {
    const runtime = this.runtimes.get(key);
    if (!runtime) return;

    try {
      await this.stopProcess(runtime.process);
    } finally {
      this.runtimes.delete(key);
      this.queueChangedNotification();
    }
  }

  private appendLog(runtime: McpRuntime, line: string): void {
    runtime.logs.push(line);
    if (runtime.logs.length > 200) runtime.logs.shift();
    this.queueChangedNotification();
  }

  private collectTools(): string[] {
    const seen = new Set<string>();
    const tools: string[] = [];
    for (const runtime of this.runtimes.values()) {
      for (const tool of runtime.tools) {
        if (seen.has(tool)) continue;
        seen.add(tool);
        tools.push(tool);
      }
    }
    return tools;
  }
}

export function quotePowershellArg(value: string): string {
  const normalized = String(value ?? "");
  return `'${normalized.replace(/'/g, "''")}'`;
}

export function spawnMcpProcess(
  command: string,
  args: string[],
  spawnCommand: typeof spawn = spawn,
  platform: NodeJS.Platform = process.platform
): ChildProcess {
  const normalizedCommand = (command ?? "").trim();
  const normalizedArgs = Array.isArray(args) ? args.map((arg) => String(arg)) : [];

  if (platform === "win32" && /\.(cmd|bat)$/i.test(normalizedCommand)) {
    const powershellCommand = `& ${[normalizedCommand, ...normalizedArgs].map(quotePowershellArg).join(" ")}`;
    return spawnCommand("powershell.exe", ["-NoProfile", "-Command", powershellCommand], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
  }

  return spawnCommand(normalizedCommand, normalizedArgs, {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
}

export async function stopMcpProcess(
  proc: ChildProcess,
  spawnCommand: typeof spawn = spawn,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  const pid = proc.pid;

  if (!pid) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // noop
    }
    return;
  }

  if (platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawnCommand("taskkill", ["/pid", String(pid), "/f", "/t"], {
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
