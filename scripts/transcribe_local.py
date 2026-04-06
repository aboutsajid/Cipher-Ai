import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: transcribe_local.py <audio_path> <model>"}))
        return 1

    audio_path = sys.argv[1]
    model_name = sys.argv[2] or "base"
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

    if not os.path.exists(audio_path):
        print(json.dumps({"ok": False, "error": f"Audio file not found: {audio_path}"}))
        return 1

    try:
        from faster_whisper import WhisperModel
    except Exception:
        print(json.dumps({
            "ok": False,
            "error": "Local voice dependency missing. Install it with: python -m pip install faster-whisper"
        }))
        return 2

    device_order = ["cuda", "cpu"]
    last_error = None

    for device in device_order:
        try:
            compute_type = "float16" if device == "cuda" else "int8"
            model = WhisperModel(model_name, device=device, compute_type=compute_type)
            segments, _info = model.transcribe(
                audio_path,
                beam_size=5,
                vad_filter=True,
                language=language or None
            )
            text = " ".join((segment.text or "").strip() for segment in segments).strip()
            if not text:
                print(json.dumps({"ok": False, "error": "No speech was transcribed from the audio."}))
                return 3
            print(json.dumps({"ok": True, "text": text, "device": device, "model": model_name}))
            return 0
        except Exception as exc:
            last_error = str(exc)

    print(json.dumps({"ok": False, "error": last_error or "Local transcription failed."}))
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
