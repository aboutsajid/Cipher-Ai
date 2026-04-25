import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GeneratedImagesStore } from "../main/services/generatedImagesStore";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "cipher-generated-images-test-"));
  const store = new GeneratedImagesStore(dir);
  await store.init();
  return { dir, store };
}

test("GeneratedImagesStore records, saves, lists, and deletes generated assets", async () => {
  const { dir, store } = await createStore();

  try {
    const recorded = await store.recordGeneration({
      prompt: "A studio portrait with dramatic lighting",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "4:5",
      text: "Portrait ready.",
      images: [
        {
          dataUrl: "data:image/png;base64,YWJj",
          mimeType: "image/png"
        }
      ]
    });

    assert.equal(recorded.length, 1);
    assert.ok(recorded[0]?.id);
    assert.equal(recorded[0]?.prompt, "A studio portrait with dramatic lighting");
    assert.equal(recorded[0]?.dataUrl, "data:image/png;base64,YWJj");

    const saved = await store.markSaved(recorded[0]!.id, "C:\\Exports\\portrait.png");
    assert.equal(saved?.saveCount, 1);
    assert.equal(saved?.lastSavedPath, "C:\\Exports\\portrait.png");

    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, recorded[0]?.id);
    assert.equal(listed[0]?.saveCount, 1);

    const deleted = await store.delete(recorded[0]!.id);
    assert.equal(deleted, true);
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
