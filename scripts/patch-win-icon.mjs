import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { rcedit } from "rcedit";

const exePath = resolve("release", "win-unpacked", "Cipher Ai.exe");
const iconPath = resolve("src", "renderer", "assets", "cipher-ai-icon.ico");

if (!existsSync(exePath)) {
  throw new Error(`Windows executable not found: ${exePath}`);
}

if (!existsSync(iconPath)) {
  throw new Error(`Icon file not found: ${iconPath}`);
}

await rcedit(exePath, { icon: iconPath });
console.log(`Patched EXE icon: ${exePath}`);
