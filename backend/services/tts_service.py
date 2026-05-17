"""
TTS Service for Call Simulation
Provides text-to-speech functionality for AI member responses.
"""

from __future__ import annotations

import base64
import logging
import os
import subprocess
import tempfile
from typing import Any, Optional

from ..config_validation import is_usable_azure_speech_key, normalize_env_value
from .gemini_tts import GeminiTextToSpeechEngine

try:
    import azure.cognitiveservices.speech as speechsdk

    AZURE_TTS_AVAILABLE = True
except Exception:
    speechsdk = None
    AZURE_TTS_AVAILABLE = False

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool = False) -> bool:
    normalized = normalize_env_value(os.getenv(name)).lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "on"}


def _default_local_tts_enabled() -> bool:
    normalized = normalize_env_value(os.getenv("ENABLE_LOCAL_TTS")).lower()
    if not normalized or normalized not in {"1", "true", "yes", "on"}:
        return False

    # Offline local fallback is meant for local desktop development, not Render/Linux containers.
    is_render = normalize_env_value(os.getenv("RENDER")).lower() in {"1", "true", "yes", "on"}
    is_docker = os.path.exists("/.dockerenv")
    if is_render or is_docker or os.name != "nt":
        logger.info(
            "Ignoring ENABLE_LOCAL_TTS because offline server-side fallback is only supported in local Windows development."
        )
        return False

    return True


class TTSService:
    """Text-to-Speech service for call simulation."""

    def __init__(self) -> None:
        self.gemini_tts = GeminiTextToSpeechEngine()
        self.azure_speech_key = normalize_env_value(os.getenv("AZURE_SPEECH_KEY"))
        self.azure_speech_region = normalize_env_value(os.getenv("AZURE_SPEECH_REGION")) or "eastus"
        self.azure_voice_name = normalize_env_value(os.getenv("AZURE_TTS_VOICE")) or "en-US-JennyNeural"
        self.enable_local_tts = _default_local_tts_enabled()
        if not self.enable_local_tts:
            logger.info("Local server-side TTS fallback is disabled. Browser fallback will be used when Gemini/Azure audio is unavailable.")

    def is_available(self) -> bool:
        return (
            self.gemini_tts.is_available()
            or self._azure_tts_available()
            or self._local_tts_available()
        )

    def _azure_tts_available(self) -> bool:
        return bool(
            AZURE_TTS_AVAILABLE
            and is_usable_azure_speech_key(self.azure_speech_key)
            and self.azure_speech_region
        )

    def _windows_sapi_available(self) -> bool:
        return self.enable_local_tts and os.name == "nt"

    def _local_tts_available(self) -> bool:
        if not self.enable_local_tts:
            return False
        if self._windows_sapi_available():
            return True
        try:
            import pyttsx3  # noqa: F401

            return True
        except Exception:
            return False

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
            return {
                "audio_url": None,
                "audio_base64": None,
                "audio_bytes": None,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": 0,
                "provider": None,
                "error": "Text is required.",
            }

        # Try Gemini TTS first
        gemini_error: Optional[str] = None
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
                        "audio_bytes": audio_bytes,
                        "audio_content_type": "audio/wav",
                        "audio_extension": "wav",
                        "duration": len(audio_bytes) / 16000,  # Approximate duration
                        "provider": "gemini",
                        "error": None,
                    }
            except Exception as e:
                logger.warning("Gemini TTS failed. Browser fallback may be used: %s", e)
                gemini_error = str(e)

            if not gemini_error:
                gemini_error = "Gemini TTS returned no audio."

        # Try Azure TTS next when it is configured.
        azure_error: Optional[str] = None
        if self._azure_tts_available():
            try:
                azure_result = self._synthesize_azure(
                    text,
                    voice_name=voice_name or self.azure_voice_name,
                )
                if azure_result:
                    return azure_result
            except Exception as e:
                logger.warning("Azure TTS failed. Browser fallback may be used: %s", e)
                azure_error = str(e)

            if not azure_error:
                azure_error = "Azure TTS returned no audio."

        if not self.enable_local_tts:
            provider_errors = [error for error in [gemini_error, azure_error] if error]
            return {
                "audio_url": None,
                "audio_base64": None,
                "audio_bytes": None,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": 0,
                "provider": "browser_fallback",
                "error": ". ".join(provider_errors) if provider_errors else "Server-side TTS is unavailable.",
                "fallback_mode": "browser",
            }

        # Fallback to native Windows SAPI or pyttsx3 only for local development.
        fallback_result = await self._fallback_tts(text)
        if fallback_result.get("audio_bytes") or fallback_result.get("audio_base64"):
            if not fallback_result.get("error"):
                fallback_result["error"] = " | ".join(
                    error
                    for error in [gemini_error, azure_error]
                    if error
                ) or None
            return fallback_result

        fallback_error = str(fallback_result.get("error") or "").strip()
        provider_errors = [error for error in [gemini_error, azure_error] if error]
        if provider_errors and fallback_error:
            fallback_result["error"] = f"{'. '.join(provider_errors)}. Fallback TTS failed: {fallback_error}"
        elif provider_errors:
            fallback_result["error"] = ". ".join(provider_errors)
        return fallback_result

    def _synthesize_azure(
        self,
        text: str,
        *,
        voice_name: str,
    ) -> Optional[dict[str, Any]]:
        if not self._azure_tts_available() or not text.strip():
            return None

        speech_config = speechsdk.SpeechConfig(
            subscription=self.azure_speech_key,
            region=self.azure_speech_region,
        )
        speech_config.speech_synthesis_voice_name = voice_name
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
        )
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=None,
        )
        result = synthesizer.speak_text_async(text).get()

        if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
            details = getattr(result, "cancellation_details", None)
            detail_text = getattr(details, "error_details", None) or getattr(details, "reason", None)
            raise RuntimeError(
                f"Azure TTS failed to synthesize audio. {detail_text or ''}".strip()
            )

        audio_bytes = bytes(result.audio_data or b"")
        if not audio_bytes:
            raise RuntimeError("Azure TTS completed without returning audio data.")

        return {
            "audio_url": None,
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
            "audio_bytes": audio_bytes,
            "audio_content_type": "audio/wav",
            "audio_extension": "wav",
            "duration": len(audio_bytes) / 32000,
            "provider": "azure_speech",
            "error": None,
        }

    def _synthesize_windows_sapi(self, text: str) -> Optional[dict[str, Any]]:
        if not self._windows_sapi_available() or not text.strip():
            return None

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name

        encoded_text = base64.b64encode(text.encode("utf-8")).decode("ascii")
        encoded_path = base64.b64encode(temp_path.encode("utf-8")).decode("ascii")
        script = f"""
$ErrorActionPreference = 'Stop'
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded_text}'))
$outputPath = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded_path}'))
$voice = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Open($outputPath, 3, $false)
try {{
    $voice.AudioOutputStream = $stream
    [void]$voice.Speak($text)
}} finally {{
    try {{ $stream.Close() }} catch {{}}
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($stream) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($voice) | Out-Null
}}
"""

        try:
            completed = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    script,
                ],
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
            if completed.returncode != 0:
                stderr = (completed.stderr or completed.stdout or "").strip()
                raise RuntimeError(stderr or "Windows SAPI speech synthesis failed.")

            with open(temp_path, "rb") as audio_file:
                audio_bytes = audio_file.read()

            if len(audio_bytes) <= 64:
                raise RuntimeError("Windows SAPI created an empty or invalid audio file.")

            return {
                "audio_url": None,
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
                "audio_bytes": audio_bytes,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": len(audio_bytes) / 32000,
                "provider": "windows_sapi",
                "error": None,
            }
        finally:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except OSError:
                logger.warning("Unable to remove temporary Windows SAPI audio file: %s", temp_path)

    async def _fallback_tts(self, text: str) -> dict[str, Any]:
        """Fallback TTS using native Windows SAPI, then pyttsx3."""
        if not self.enable_local_tts:
            return {
                "audio_url": None,
                "audio_base64": None,
                "audio_bytes": None,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": 0,
                "provider": None,
                "error": "Local server-side TTS fallback is disabled.",
            }

        windows_error: Optional[str] = None
        try:
            windows_result = self._synthesize_windows_sapi(text)
            if windows_result:
                return windows_result
        except Exception as exc:
            windows_error = str(exc)
            logger.warning("Windows SAPI fallback TTS failed: %s", exc)

        try:
            import pyttsx3

            engine = pyttsx3.init()

            # Create a temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
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
                "audio_bytes": audio_bytes,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": len(audio_bytes) / 16000,
                "provider": "pyttsx3",
                "error": windows_error,
            }

        except Exception as e:
            logger.warning("Local pyttsx3 fallback TTS failed: %s", e)
            error_parts = [part for part in [windows_error, str(e)] if part]
            return {
                "audio_url": None,
                "audio_base64": None,
                "audio_bytes": None,
                "audio_content_type": "audio/wav",
                "audio_extension": "wav",
                "duration": 0,
                "provider": None,
                "error": " | ".join(error_parts) if error_parts else str(e),
            }


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
