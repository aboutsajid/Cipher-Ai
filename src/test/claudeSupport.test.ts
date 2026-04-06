import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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
  const manager = new ClaudeSessionManager(
    (channel, payload) => {
      sent.push({ channel, payload });
    },
    {
      spawnCommand: ((command: string) => {
        spawnCalls += 1;
        return (spawnCalls === 1 ? probe : runtime) as never;
      }) as never,
      platform: "linux"
    }
  );

  queueMicrotask(() => probe.emit("exit", 0));

  const started = await manager.start();
  assert.equal(started.ok, true);
  assert.equal(started.running, true);

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
