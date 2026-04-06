import { readdir } from "fs/promises";
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
const testFiles = await collectTestFiles(testRoot).catch(() => []);

if (testFiles.length === 0) {
  console.error(`No compiled test files found under ${testRoot}.`);
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
