from __future__ import annotations

import os
import sys
from pathlib import Path


def _bootstrap_path() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    project_root = backend_dir.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))


def main() -> int:
    _bootstrap_path()

    from backend.config_validation import resolve_gemini_api_key
    from backend.env_loader import load_backend_environment
    from backend.services.gemini_tts import GeminiTextToSpeechEngine

    load_backend_environment()

    api_key = resolve_gemini_api_key(os.getenv)
    if not api_key:
        print("Gemini TTS check failed: no GOOGLE_API_KEY or GEMINI_API_KEY is configured.")
        return 1

    engine = GeminiTextToSpeechEngine()
    print(f"Gemini TTS model: {engine.model_name}")

    if not engine.is_available():
        detail = engine.disabled_reason or engine.last_error or "Gemini TTS client is unavailable."
        print(f"Gemini TTS check failed before synthesis: {detail}")
        return 2

    audio_bytes = engine.synthesize(
        "Say clearly: Gemini text to speech verification succeeded.",
        voice_name="Kore",
        speaking_style="professional",
    )
    if not audio_bytes:
        detail = engine.disabled_reason or engine.last_error or "No audio was returned."
        print(f"Gemini TTS synthesis failed: {detail}")
        return 3

    print(f"Gemini TTS synthesis succeeded. Returned {len(audio_bytes)} bytes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
