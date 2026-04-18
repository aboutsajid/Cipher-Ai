import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("app info ipc resolves display version from package metadata instead of Electron runtime version", () => {
  const ipcSource = readProjectFile("src/main/chatAppIpc.ts");

  assert.match(ipcSource, /function resolveDisplayAppVersion\(\): string/);
  assert.match(ipcSource, /runtimeVersion !== process\.versions\.electron/);
  assert.match(ipcSource, /readVersionFromPackageJson\(join\(app\.getAppPath\(\), "package\.json"\)\)/);
  assert.match(ipcSource, /readVersionFromPackageJson\(join\(process\.cwd\(\), "package\.json"\)\)/);
  assert.match(ipcSource, /version: resolveDisplayAppVersion\(\)/);
});
