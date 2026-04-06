import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAudioBytes, transcribeAudio } from "../main/voiceSupport";

test("normalizeAudioBytes accepts Uint8Array, ArrayBuffer, and number arrays", () => {
  const fromUint8 = normalizeAudioBytes(Uint8Array.from([1, 2, 3]));
  const fromBuffer = normalizeAudioBytes(Uint8Array.from([4, 5]).buffer);
  const fromArray = normalizeAudioBytes([6.2, -4, 999, "7"]);

  assert.deepEqual([...fromUint8], [1, 2, 3]);
  assert.deepEqual([...fromBuffer], [4, 5]);
  assert.deepEqual([...fromArray], [6, 0, 255, 7]);
});

test("normalizeAudioBytes rejects unsupported payloads", () => {
  assert.throws(() => normalizeAudioBytes({ nope: true }), /Invalid audio payload/);
});

test("transcribeAudio reports the unsupported build clearly", async () => {
  await assert.rejects(
    () => transcribeAudio({} as never, Uint8Array.from([1, 2, 3])),
    /Local voice transcription is not supported in this build/
  );
});
