import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { rcedit } from "rcedit";

const winUnpackedDir = resolve("release", "win-unpacked");
const exeName = readdirSync(winUnpackedDir).find((entry) => entry.toLowerCase().endsWith(".exe"));
const exePath = exeName ? resolve(winUnpackedDir, exeName) : resolve(winUnpackedDir, "Cipher Workspace.exe");
const iconPath = resolve("src", "renderer", "assets", "cipher-ai-icon.ico");

if (!existsSync(exePath)) {
  throw new Error(`Windows executable not found: ${exePath}`);
}

if (!existsSync(iconPath)) {
  throw new Error(`Icon file not found: ${iconPath}`);
}

await rcedit(exePath, { icon: iconPath });
console.log(`Patched EXE icon: ${exePath}`);
