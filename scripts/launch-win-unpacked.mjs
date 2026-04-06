import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const executable = join(root, "release", "win-unpacked", "Cipher Workspace.exe");
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, [], {
  stdio: "inherit",
  cwd: join(root, "release", "win-unpacked"),
  env: childEnv
});

child.on("exit", (code) => process.exit(code ?? 0));
