import test from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapCommands } from "../main/services/bootstrapCommandBuilder";

test("buildBootstrapCommands returns Next.js scaffold command with npx alias per platform", () => {
  const windows = buildBootstrapCommands("nextjs", "generated-apps/next-app", { platform: "win32" });
  const linux = buildBootstrapCommands("nextjs", "generated-apps/next-app", { platform: "linux" });

  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.command, "npx.cmd");
  assert.equal(linux[0]?.command, "npx");
  assert.deepEqual(linux[0]?.args, [
    "create-next-app@latest",
    "generated-apps/next-app",
    "--ts",
    "--eslint",
    "--app",
    "--src-dir",
    "--use-npm",
    "--yes"
  ]);
});

test("buildBootstrapCommands returns no shell commands for static and node-package templates", () => {
  assert.deepEqual(buildBootstrapCommands("static", "generated-apps/static"), []);
  assert.deepEqual(buildBootstrapCommands("node-package", "generated-apps/pkg"), []);
});

test("buildBootstrapCommands returns Vite create and install commands for react-vite templates", () => {
  const commands = buildBootstrapCommands("react-vite", "generated-apps/react-app", { platform: "linux" });
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], {
    command: "npm",
    args: ["create", "vite@latest", "generated-apps/react-app", "--", "--template", "react-ts"],
    timeoutMs: 180000
  });
  assert.deepEqual(commands[1], {
    command: "npm",
    args: ["install"],
    cwd: "generated-apps/react-app",
    timeoutMs: 180000
  });
});
