import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeSessionManager, probeOllamaInstalled } from "../main/claudeSupport";

class FakeStream extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
  pid?: number;
  exitCode: number | null = null;
  killed = false;
  stdout = new FakeStream();
  stderr = new FakeStream();
  stdin = {
    writableEnded: false,
    writes: [] as string[],
    write: (value: string) => {
      this.stdin.writes.push(value);
      return true;
    }
  };

  constructor(pid = 1010) {
    super();
    this.pid = pid;
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

async function waitFor(condition: () => boolean, attempts = 100): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}

test("probeOllamaInstalled reports missing ollama on spawn error", async () => {
  const result = await probeOllamaInstalled((() => {
    const proc = new FakeChildProcess();
    queueMicrotask(() => proc.emit("error", new Error("missing")));
    return proc as never;
  }) as never, "win32");

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /not installed/i);
});

test("ClaudeSessionManager starts, sends prompts, and emits parsed output", async () => {
  const probe = new FakeChildProcess(1);
  const runtime = new FakeChildProcess(2020);
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let spawnCalls = 0;
  const spawnOptions: Array<Record<string, unknown> | undefined> = [];
  const manager = new ClaudeSessionManager(
    (channel, payload) => {
      sent.push({ channel, payload });
    },
    {
      spawnCommand: ((_command: string, _args: string[], options?: Record<string, unknown>) => {
        spawnCalls += 1;
        spawnOptions.push(options);
        return (spawnCalls === 1 ? probe : runtime) as never;
      }) as never,
      platform: "linux",
      workingDirectory: "/tmp/cipher-claude-neutral"
    }
  );

  queueMicrotask(() => probe.emit("exit", 0));

  const started = await manager.start();
  assert.equal(started.ok, true);
  assert.equal(started.running, true);
  assert.equal(spawnOptions[1]?.["cwd"], "/tmp/cipher-claude-neutral");

  const promptResult = manager.sendPrompt("Review this");
  assert.equal(promptResult.ok, true);
  assert.match(runtime.stdin.writes[0] ?? "", /Review this/);

  runtime.stdout.emit("data", Buffer.from("{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"done\"}]}}\n"));
  runtime.stdout.emit("data", Buffer.from("{\"type\":\"result\",\"result\":\"ok\",\"is_error\":false}\n"));

  assert.deepEqual(sent, [
    { channel: "claude:output", payload: { text: "done", stream: "stdout" } },
    { channel: "claude:exit", payload: { code: 0, signal: null } }
  ]);
});

test("ClaudeSessionManager clears the enabled state after a failed launch", async () => {
  const probe = new FakeChildProcess(1);
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let spawnCalls = 0;
  const manager = new ClaudeSessionManager(
    (channel, payload) => {
      sent.push({ channel, payload });
    },
    {
      spawnCommand: (() => {
        spawnCalls += 1;
        if (spawnCalls === 1) return probe as never;
        throw new Error("launch failed");
      }) as never,
      platform: "linux"
    }
  );

  queueMicrotask(() => probe.emit("exit", 0));

  const started = await manager.start();
  assert.equal(started.ok, false);
  assert.equal(manager.status().running, false);

  const sendResult = manager.sendPrompt("Hello");
  assert.equal(sendResult.ok, false);
  assert.equal(sendResult.message, "Claude Code session is not started.");
  assert.deepEqual(sent, [
    { channel: "claude:error", payload: "launch failed" },
    { channel: "claude:error", payload: "Claude Code session is not started." }
  ]);
});

test("ClaudeSessionManager executes approved filesystem tool calls before emitting final output", async () => {
  const probe = new FakeChildProcess(1);
  const runtime = new FakeChildProcess(2020);
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let spawnCalls = 0;
  const manager = new ClaudeSessionManager(
    (channel, payload) => {
      sent.push({ channel, payload });
    },
    {
      spawnCommand: (() => {
        spawnCalls += 1;
        return (spawnCalls === 1 ? probe : runtime) as never;
      }) as never,
      platform: "linux"
    }
  );

  const root = await mkdtemp(join(tmpdir(), "cipher-claude-fs-"));
  const filePath = join(root, "notes.txt");
  await writeFile(filePath, "hello from disk", "utf8");

  queueMicrotask(() => probe.emit("exit", 0));
  const started = await manager.start();
  assert.equal(started.ok, true);

  const promptResult = manager.sendPrompt("Read the file and summarize it.", [], [], {
    filesystemAccess: { roots: [root], allowWrite: false }
  });
  assert.equal(promptResult.ok, true);

  runtime.stdout.emit("data", Buffer.from(`{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"tool\\":\\"read_file\\",\\"args\\":{\\"path\\":\\"${filePath.replace(/\\/g, "\\\\")}\\"}}"}]}}\n`));
  runtime.stdout.emit("data", Buffer.from("{\"type\":\"result\",\"result\":\"ok\",\"is_error\":false}\n"));
  assert.equal(await waitFor(() => runtime.stdin.writes.length >= 2), true);

  assert.match(runtime.stdin.writes[1] ?? "", /\[Claude tool result\] read_file/);
  assert.match(runtime.stdin.writes[1] ?? "", /hello from disk/);
  assert.equal(sent.length, 0);

  runtime.stdout.emit("data", Buffer.from("{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"The file says hello from disk.\"}]}}\n"));
  runtime.stdout.emit("data", Buffer.from("{\"type\":\"result\",\"result\":\"ok\",\"is_error\":false}\n"));
  assert.equal(await waitFor(() => sent.length >= 2), true);

  assert.deepEqual(sent, [
    { channel: "claude:output", payload: { text: "The file says hello from disk.", stream: "stdout" } },
    { channel: "claude:exit", payload: { code: 0, signal: null } }
  ]);
});
