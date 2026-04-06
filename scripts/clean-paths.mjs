import { rm } from "fs/promises";
import { resolve } from "path";

const targets = process.argv.slice(2).map((target) => target.trim()).filter(Boolean);

if (targets.length === 0) {
  console.error("Usage: node scripts/clean-paths.mjs <path> [more-paths]");
  process.exit(1);
}

await Promise.all(targets.map(async (target) => {
  const absolutePath = resolve(process.cwd(), target);
  await rm(absolutePath, { recursive: true, force: true });
}));
