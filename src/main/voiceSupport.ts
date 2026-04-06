import type { SettingsStore } from "./services/settingsStore";

export function normalizeAudioBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) {
    const ints = raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(255, Math.round(value))));
    return Uint8Array.from(ints);
  }
  throw new Error("Invalid audio payload.");
}

export async function transcribeAudio(_settingsStore: SettingsStore, _bytes: Uint8Array, _mimeType?: string): Promise<string> {
  throw new Error("Local voice transcription is not supported in this build.");
}
