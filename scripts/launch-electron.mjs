import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const electron = (await import("electron")).default;
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(String(electron), [join(root, "dist", "main", "main.js")], {
  stdio: "inherit",
  cwd: root,
  env: childEnv
});

child.on("exit", (code) => process.exit(code ?? 0));
