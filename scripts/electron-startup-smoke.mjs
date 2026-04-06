import { spawn } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const electron = (await import("electron")).default;
const smokeWorkspaceRoot = await mkdtemp(join(tmpdir(), "cipher-startup-smoke-"));
const smokeDelayMs = process.env["CIPHER_SMOKE_EXIT_DELAY_MS"] ?? "2500";
const timeoutMs = Number.parseInt(process.env["CIPHER_SMOKE_TIMEOUT_MS"] ?? "20000", 10);
const childEnv = {
  ...process.env,
  CIPHER_SMOKE_STARTUP: "1",
  CIPHER_SMOKE_EXIT_DELAY_MS: smokeDelayMs,
  CIPHER_WORKSPACE_ROOT: smokeWorkspaceRoot
};

delete childEnv.ELECTRON_RUN_AS_NODE;

let stdout = "";
let stderr = "";
let timedOut = false;

function writeChunk(stream, chunk) {
  const text = chunk.toString();
  stream.write(text);
  return text;
}

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(String(electron), [join(root, "dist", "main", "main.js")], {
      cwd: root,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000);

    child.stdout.on("data", (chunk) => {
      stdout += writeChunk(process.stdout, chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += writeChunk(process.stderr, chunk);
    });

    child.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code ?? (timedOut ? 1 : 0));
    });
  });

  if (timedOut) {
    throw new Error("Electron startup smoke timed out before the app reported a healthy startup.");
  }

  if (exitCode !== 0) {
    throw new Error(`Electron startup smoke failed with exit code ${exitCode}.`);
  }
} finally {
  await rm(smokeWorkspaceRoot, { recursive: true, force: true }).catch(() => {});
}

if (!/\[smoke\] Electron startup smoke passed\./.test(`${stdout}\n${stderr}`)) {
  throw new Error("Electron startup smoke exited cleanly but did not report a passing startup marker.");
}
