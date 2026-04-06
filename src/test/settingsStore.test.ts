import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettingsStore } from "../main/services/settingsStore";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cipher-settings-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("SettingsStore forces local voice off even when saved as enabled", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new SettingsStore(userDataPath);
    await store.init();

    await store.save({
      localVoiceEnabled: true,
      localVoiceModel: "medium"
    });

    const current = store.get();
    assert.equal(current.localVoiceEnabled, false);
    assert.equal(current.localVoiceModel, "medium");

    const persistedPath = join(userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { localVoiceEnabled?: boolean };
    assert.equal(persisted.localVoiceEnabled, false);
  });
});

test("SettingsStore degrades cleanly without Electron safeStorage", async () => {
  await withTempDir(async (userDataPath) => {
    const store = new SettingsStore(userDataPath);
    await store.init();

    await store.save({
      apiKey: "sk-or-v1-example-secret",
      baseUrl: "https://openrouter.ai/api/v1"
    });

    const current = store.get();
    assert.equal(current.apiKey, "sk-or-v1-example-secret");

    const persistedPath = join(userDataPath, "cipher-workspace", "cipher-workspace-settings.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as { apiKey?: string };
    assert.equal(persisted.apiKey, "sk-or-v1-example-secret");
  });
});
