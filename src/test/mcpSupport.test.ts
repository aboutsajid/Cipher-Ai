import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { McpRuntimeManager, quotePowershellArg } from "../main/mcpSupport";

class FakeStream extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
  pid?: number;
  exitCode: number | null = null;
  killed = false;
  stdout = new FakeStream();
  stderr = new FakeStream();

  constructor(pid = 1234) {
    super();
    this.pid = pid;
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

test("quotePowershellArg escapes embedded single quotes", () => {
  assert.equal(quotePowershellArg("O'Reilly"), "'O''Reilly'");
});

test("McpRuntimeManager start collects logs and exit clears the runtime", async () => {
  const child = new FakeChildProcess();
  const manager = new McpRuntimeManager(
    {
      listMcpServers: () => [{ name: "Demo", command: "demo.cmd", args: ["serve"] }]
    } as never,
    {
      spawnProcess: () => child as never
    }
  );

  const started = await manager.start("Demo");
  assert.equal(started.ok, true);
  assert.deepEqual(started.tools, ["Demo.tool"]);
  assert.equal(started.servers[0]?.running, true);

  child.stdout.emit("data", Buffer.from("ready\n"));
  child.stderr.emit("data", Buffer.from("warn\n"));

  const runningStatus = manager.buildStatus();
  assert.deepEqual(runningStatus.servers[0]?.logs, [
    "[MCP] Starting Demo ...",
    "[out] ready",
    "[err] warn"
  ]);

  child.emit("exit", 0);

  const stoppedStatus = manager.buildStatus();
  assert.equal(stoppedStatus.servers[0]?.running, false);
  assert.deepEqual(stoppedStatus.tools, []);
});

test("McpRuntimeManager stop uses the injected stop handler and clears runtime state", async () => {
  const child = new FakeChildProcess(4321);
  let stoppedPid: number | undefined;
  const manager = new McpRuntimeManager(
    {
      listMcpServers: () => [{ name: "Demo", command: "demo.cmd", args: [] }]
    } as never,
    {
      spawnProcess: () => child as never,
      stopProcess: async (proc) => {
        stoppedPid = proc.pid;
      }
    }
  );

  await manager.start("Demo");
  const result = await manager.stop("Demo");

  assert.equal(result.ok, true);
  assert.equal(stoppedPid, 4321);
  assert.equal(result.servers[0]?.running, false);
});

test("McpRuntimeManager triggers onChanged notifications for runtime updates", async () => {
  const child = new FakeChildProcess();
  let notifyCount = 0;
  const manager = new McpRuntimeManager(
    {
      listMcpServers: () => [{ name: "Demo", command: "demo.cmd", args: [] }]
    } as never,
    {
      spawnProcess: () => child as never,
      onChanged: () => {
        notifyCount += 1;
      }
    }
  );

  await manager.start("Demo");
  child.stdout.emit("data", Buffer.from("ready\n"));
  child.emit("exit", 0);

  await delay(220);
  assert.ok(notifyCount >= 1);
});
