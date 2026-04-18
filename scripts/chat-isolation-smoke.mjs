import { spawn } from "child_process";
import { readFile, rm } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const electron = (await import("electron")).default;
const timeoutMs = Number.parseInt(process.env["CIPHER_CHAT_ISOLATION_TIMEOUT_MS"] ?? "30000", 10);
const resultPath = join(root, "tmp", "chat-isolation-result.json");
const errorPath = join(root, "tmp", "chat-isolation-error.txt");
const childEnv = {
  ...process.env
};

delete childEnv.ELECTRON_RUN_AS_NODE;

await rm(resultPath, { force: true }).catch(() => {});
await rm(errorPath, { force: true }).catch(() => {});

let stdout = "";
let stderr = "";
let timedOut = false;

function writeChunk(stream, chunk) {
  const text = chunk.toString();
  stream.write(text);
  return text;
}

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(String(electron), [join(root, "scripts", "chat-isolation-electron.cjs")], {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000);

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

function parseLastJsonLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep scanning upward until we find the emitted result payload.
    }
  }
  return null;
}

if (timedOut) {
  throw new Error("Chat isolation smoke timed out before the app completed the provider-switch flow.");
}

if (exitCode !== 0) {
  throw new Error(`Chat isolation smoke failed with exit code ${exitCode}.`);
}

const parsedResult = await readFile(resultPath, "utf8")
  .then((raw) => JSON.parse(raw))
  .catch(() => null);
const normalizedResult = parsedResult?.ok
  ? parsedResult
  : parsedResult?.result?.ok
    ? parsedResult.result
    : parseLastJsonLine(stdout);

if (!normalizedResult?.ok) {
  const artifactError = await readFile(errorPath, "utf8").catch(() => "");
  const childOutput = `${stdout}\n${stderr}`.trim();
  const details = [artifactError.trim(), childOutput].filter(Boolean).join("\n\n");
  throw new Error(`Chat isolation smoke finished without emitting a passing JSON result.${details ? `\n\n${details}` : ""}`);
}
