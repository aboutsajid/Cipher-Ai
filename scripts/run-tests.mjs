import { access, readdir } from "fs/promises";
import { join, resolve } from "path";
import { spawn } from "child_process";

async function collectTestFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTestFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files;
}

const testRoot = resolve("dist", "test");

function toCompiledTestPath(inputPath) {
  const normalized = String(inputPath ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized) return null;

  if (normalized.startsWith("src/test/") && normalized.endsWith(".test.ts")) {
    return resolve("dist", "test", normalized.slice("src/test/".length).replace(/\.ts$/, ".js"));
  }
  if (normalized.startsWith("dist/test/") && normalized.endsWith(".test.js")) {
    return resolve(normalized);
  }
  if (normalized.endsWith(".test.ts")) {
    return resolve(normalized.replace(/\.ts$/, ".js").replace(/^src\//, "dist/"));
  }
  return resolve(normalized);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveRequestedTests(argv) {
  const requested = argv.map((entry) => entry.trim()).filter(Boolean);
  if (requested.length === 0) return null;

  const testFiles = [];
  const missing = [];
  for (const requestPath of requested) {
    const compiledPath = toCompiledTestPath(requestPath);
    if (!compiledPath || !compiledPath.endsWith(".test.js")) {
      missing.push({ requestPath, compiledPath: compiledPath ?? "(invalid path)" });
      continue;
    }
    if (!(await fileExists(compiledPath))) {
      missing.push({ requestPath, compiledPath });
      continue;
    }
    if (!testFiles.includes(compiledPath)) {
      testFiles.push(compiledPath);
    }
  }

  if (missing.length > 0) {
    const details = missing
      .map(({ requestPath, compiledPath }) => `- ${requestPath} -> ${compiledPath}`)
      .join("\n");
    throw new Error(`Requested test files were not found after compilation:\n${details}`);
  }

  return testFiles;
}

const requestedTestFiles = await resolveRequestedTests(process.argv.slice(2));
const testFiles = requestedTestFiles ?? await collectTestFiles(testRoot).catch(() => []);

if (testFiles.length === 0) {
  const scopeMessage = requestedTestFiles ? "for the requested scope." : `under ${testRoot}.`;
  console.error(`No compiled test files found ${scopeMessage}`);
  process.exit(1);
}

await new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit",
    shell: false
  });
  child.once("error", rejectPromise);
  child.once("exit", (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }
    rejectPromise(new Error(`Tests failed with code ${code ?? "unknown"}.`));
  });
});
