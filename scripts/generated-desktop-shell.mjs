import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const launchScript = join(workspaceRoot, "scripts", "launch-electron.mjs");

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return (process.argv[index + 1] ?? "").trim();
}

const targetUrl = readFlag("--url");
const windowTitle = readFlag("--title") || "Generated Desktop App";

if (!targetUrl) {
  console.error("Missing required --url argument.");
  process.exit(1);
}

const child = spawn(process.execPath, [launchScript], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CIPHER_GENERATED_DESKTOP_URL: targetUrl,
    CIPHER_GENERATED_DESKTOP_TITLE: windowTitle
  }
});

child.once("exit", (code) => {
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
