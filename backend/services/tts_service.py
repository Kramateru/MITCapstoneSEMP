"""
TTS Service for Call Simulation
Provides text-to-speech functionality for AI member responses.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any, Optional

from .gemini_tts import GeminiTextToSpeechEngine

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-Speech service for call simulation."""

    def __init__(self) -> None:
        self.gemini_tts = GeminiTextToSpeechEngine()

    def is_available(self) -> bool:
        return self.gemini_tts.is_available()

    async def synthesize(
        self,
        text: str,
        voice_name: Optional[str] = None,
        speaking_style: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Convert text to speech.

        Args:
            text: The text to convert to speech
            voice_name: Optional voice name
            speaking_style: Optional speaking style (e.g., 'professional', 'friendly')

        Returns:
            Dictionary with audio_url, audio_base64, and duration
        """
        if not text:
            return {"audio_url": None, "audio_base64": None, "duration": 0}

        # Try Gemini TTS first
        if self.gemini_tts.is_available():
            try:
                audio_bytes = self.gemini_tts.synthesize(
                    text=text,
                    voice_name=voice_name or "Puck",
                    speaking_style=speaking_style or "professional",
                )

                if audio_bytes:
                    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
                    return {
                        "audio_url": None,
                        "audio_base64": audio_base64,
                        "duration": len(audio_bytes) / 16000,  # Approximate duration
                    }
            except Exception as e:
                logger.error(f"Gemini TTS failed: {e}")

        # Fallback to pyttsx3 or other TTS
        return await self._fallback_tts(text)

    async def _fallback_tts(self, text: str) -> dict[str, Any]:
        """Fallback TTS using pyttsx3."""
        try:
            import pyttsx3

            engine = pyttsx3.init()
            # Save to bytes
            import io
            from pydub import AudioSegment

            # Create a temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                temp_path = tmp.name

            engine.save_to_file(text, temp_path)
            engine.runAndWait()

            # Read the file
            with open(temp_path, "rb") as f:
                audio_bytes = f.read()

            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

            # Clean up
            os.remove(temp_path)

            return {
                "audio_url": None,
                "audio_base64": audio_base64,
                "duration": len(audio_bytes) / 16000,
            }

        except Exception as e:
            logger.error(f"Fallback TTS failed: {e}")
            return {"audio_url": None, "audio_base64": None, "duration": 0}


# Singleton instance
_tts_service: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    """Get the singleton TTS service instance."""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service


async def text_to_speech(
    text: str,
    voice_name: Optional[str] = None,
    speaking_style: Optional[str] = None,
) -> dict[str, Any]:
    """
    Convert text to speech.

    Args:
        text: The text to convert
        voice_name: Optional voice name
        speaking_style: Optional speaking style

    Returns:
        Dictionary with audio data
    """
    service = get_tts_service()
    return await service.synthesize(text, voice_name, speaking_style)