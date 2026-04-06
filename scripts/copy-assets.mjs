import { cpSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

mkdirSync(join(root, "dist", "renderer"), { recursive: true });
mkdirSync(join(root, "dist", "scripts"), { recursive: true });

cpSync(join(root, "src", "renderer"), join(root, "dist", "renderer"), { recursive: true, filter: (src) => !src.endsWith(".ts") });
cpSync(join(root, "scripts", "transcribe_local.py"), join(root, "dist", "scripts", "transcribe_local.py"));

console.log("Assets copied.");
