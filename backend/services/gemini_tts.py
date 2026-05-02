"""
Gemini Text-to-Speech service for generating audio from text.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import wave
from typing import Any, Optional

try:
    from google import genai
    from google.genai import types

    GEMINI_TTS_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GEMINI_TTS_AVAILABLE = False

from ..config_validation import normalize_env_value

logger = logging.getLogger(__name__)


class GeminiTextToSpeechEngine:
    """Gemini-powered TTS engine for generating audio responses."""

    def __init__(self) -> None:
        self.api_key = normalize_env_value(os.getenv("GEMINI_API_KEY"))
        self.client = None
        if GEMINI_TTS_AVAILABLE and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as exc:
                logger.warning("Failed to initialize Gemini TTS client: %s", exc)
                self.client = None

    def is_available(self) -> bool:
        return bool(GEMINI_TTS_AVAILABLE and self.client and self.api_key)

    def synthesize(
        self,
        text: str,
        *,
        voice_name: Optional[str] = None,
        speaking_style: Optional[str] = None,
        multi_speaker_config: Optional[list] = None
    ) -> Optional[bytes]:
        """
        Generate speech audio from text using Gemini TTS.

        Args:
            text: The text to convert to speech
            voice_name: Voice to use (e.g., 'Kore', 'Puck', etc.) - for single speaker
            speaking_style: Speaking style instruction (e.g., 'cheerfully')
            multi_speaker_config: List of speaker configs for multi-speaker conversations
                Each config should be a dict with 'speaker' and 'voice_config' keys

        Returns:
            WAV audio bytes if successful, None otherwise
        """
        if not self.is_available() or not text.strip():
            return None

        try:
            # Format the text with speaking style if provided
            content_text = text.strip()
            if speaking_style:
                content_text = f"Say {speaking_style}: {content_text}"

            config_kwargs = {}

            if multi_speaker_config:
                # Multi-speaker configuration
                speaker_configs = []
                for speaker_config in multi_speaker_config:
                    speaker_configs.append(
                        types.SpeakerVoiceConfig(
                            speaker=speaker_config['speaker'],
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                    voice_name=speaker_config['voice_name']
                                )
                            )
                        )
                    )
                
                config_kwargs['speech_config'] = types.SpeechConfig(
                    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                        speaker_voice_configs=speaker_configs
                    )
                )
            else:
                # Single speaker configuration
                config_kwargs['speech_config'] = types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name or "Kore",
                        )
                    ),
                )

            response = self.client.models.generate_content(
                model="gemini-3.1-flash-tts-preview",
                contents=content_text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    **config_kwargs
                )
            )

            audio_payload = self._extract_audio_payload(response)
            if audio_payload:
                audio_bytes, mime_type = audio_payload
                normalized_mime_type = (mime_type or "").lower()
                if audio_bytes[:4] == b"RIFF" or "wav" in normalized_mime_type or "wave" in normalized_mime_type:
                    return audio_bytes
                if "mpeg" in normalized_mime_type or "mp3" in normalized_mime_type or "ogg" in normalized_mime_type:
                    return audio_bytes
                return self._create_wav_file(audio_bytes)

            logger.warning("Gemini TTS response did not include any inline audio payload.")

        except Exception as exc:
            logger.warning("Gemini TTS synthesis failed: %s", exc)
            return None

    def _extract_audio_payload(self, response: Any) -> Optional[tuple[bytes, Optional[str]]]:
        """Scan Gemini candidates/parts until an inline audio payload is found."""
        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", []) or []:
                inline_data = getattr(part, "inline_data", None)
                if not inline_data:
                    continue
                audio_bytes = self._coerce_audio_bytes(getattr(inline_data, "data", None))
                if audio_bytes:
                    return audio_bytes, getattr(inline_data, "mime_type", None)
        return None

    def _coerce_audio_bytes(self, payload: Any) -> Optional[bytes]:
        """Normalize Gemini inline audio into raw bytes."""
        if payload is None:
            return None
        if isinstance(payload, bytes):
            return payload
        if isinstance(payload, bytearray):
            return bytes(payload)
        if isinstance(payload, memoryview):
            return payload.tobytes()
        if hasattr(payload, "tobytes"):
            try:
                return payload.tobytes()
            except Exception:
                return None
        if isinstance(payload, str):
            try:
                return base64.b64decode(payload, validate=True)
            except Exception:
                logger.warning("Gemini TTS returned string audio data that could not be base64-decoded.")
                return None
        return None

    def _create_wav_file(self, pcm_data: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2) -> bytes:
        """Create a WAV file from PCM audio data."""
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(pcm_data)
        return buffer.getvalue()


# Global instance for easy access
gemini_tts_engine = GeminiTextToSpeechEngine()
