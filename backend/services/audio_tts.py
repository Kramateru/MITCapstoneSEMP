"""
Text-to-Speech service for accessibility features.
Converts audio transcripts to speech for trainees who prefer listening.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import Optional

from ..config_validation import normalize_env_value, resolve_gemini_api_key

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"

def _default_local_tts_enabled() -> bool:
    normalized = normalize_env_value(os.getenv("ENABLE_LOCAL_TTS")).lower()
    if not normalized or normalized not in {"1", "true", "yes", "on"}:
        return False

    # Local offline TTS is only supported for local desktop development.
    is_render = normalize_env_value(os.getenv("RENDER")).lower() in {"1", "true", "yes", "on"}
    is_docker = os.path.exists("/.dockerenv")
    if is_render or is_docker or os.name != "nt":
        logger.info(
            "Ignoring ENABLE_LOCAL_TTS because offline pyttsx3 fallback is only supported in local Windows development."
        )
        return False

    return True


def _load_pyttsx3():
    try:
        import pyttsx3
    except ImportError:
        return None

    return pyttsx3


# Try to import Gemini TTS
try:
    from google import genai
    from google.genai import types

    GEMINI_TTS_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GEMINI_TTS_AVAILABLE = False


@dataclass
class TTSResult:
    """Result of text-to-speech conversion"""

    audio_bytes: bytes
    format: str  # "wav", "mp3"
    duration_seconds: float
    provider: str  # "gemini", "pyttsx3"
    error: Optional[str] = None  # Error message if synthesis failed


class TextToSpeechService:
    """Multi-provider text-to-speech service for accessibility"""

    def __init__(self):
        # Gemini TTS configuration
        self.gemini_api_key = resolve_gemini_api_key(os.getenv)
        self.gemini_tts_model = normalize_env_value(os.getenv("GEMINI_TTS_MODEL")) or DEFAULT_GEMINI_TTS_MODEL
        self.enable_local_tts = _default_local_tts_enabled()
        self.gemini_client = None
        if GEMINI_TTS_AVAILABLE and self.gemini_api_key:
            try:
                self.gemini_client = genai.Client(api_key=self.gemini_api_key)
                logger.info("Gemini TTS client initialized.")
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini TTS client: {e}")

        # pyttsx3 offline TTS
        self.pyttsx3_engine = None
        if self.enable_local_tts:
            pyttsx3 = _load_pyttsx3()
            if pyttsx3 is None:
                logger.warning("pyttsx3 is not installed. Local TTS generation is disabled.")
            else:
                try:
                    self.pyttsx3_engine = pyttsx3.init()
                    # Configure voice properties
                    self.pyttsx3_engine.setProperty("rate", 150)  # Words per minute
                    self.pyttsx3_engine.setProperty("volume", 1.0)  # 0.0 to 1.0
                    logger.info("pyttsx3 TTS engine initialized.")
                except Exception as e:
                    logger.warning(f"Failed to initialize pyttsx3 engine: {e}")
        else:
            logger.info(
                "Local microlearning TTS fallback is disabled. Browser fallback should be used when server audio is unavailable."
            )

    def is_available(self) -> bool:
        """Check if any TTS provider is available"""
        return bool(self.gemini_client or self.pyttsx3_engine)

    def get_available_providers(self) -> list[str]:
        """Get list of available TTS providers"""
        providers = []
        if self.gemini_client:
            providers.append("gemini")
        if self.pyttsx3_engine:
            providers.append("pyttsx3")
        return providers

    def synthesize(
        self,
        text: str,
        language_code: str = "en-US",
        provider: Optional[str] = None,
        voice_name: Optional[str] = None,
    ) -> Optional[TTSResult]:
        """
        Convert text to speech audio.

        Args:
            text: Text to convert to speech
            language_code: Language code (affects voice selection)
            provider: Force specific provider ("gemini", "pyttsx3") or None for auto
            voice_name: Voice name (for Gemini: "Kore", "Puck"; for pyttsx3: voice ID)

        Returns:
            TTSResult with audio bytes and metadata, or None if no providers available
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for TTS")
            return None

        # Auto-select provider if not specified
        if not provider:
            provider = self._select_provider()

        if provider == "gemini":
            result = self._synthesize_gemini(text, language_code, voice_name)
            # Return result even if it has an error (caller will check error field)
            return result
        if provider == "pyttsx3":
            result = self._synthesize_pyttsx3(text, language_code, voice_name)
            # Return result even if it has an error (caller will check error field)
            return result

        error_msg = f"Unknown or unavailable TTS provider: {provider}"
        logger.error(error_msg)
        return TTSResult(
            audio_bytes=b"",
            format="wav",
            duration_seconds=0,
            provider=provider or "unknown",
            error=error_msg,
        )

    def _select_provider(self) -> str:
        """Select best available provider"""
        if self.gemini_client:
            return "gemini"
        if self.pyttsx3_engine:
            return "pyttsx3"
        return "pyttsx3"  # Fallback (will fail gracefully)

    def _synthesize_gemini(
        self,
        text: str,
        language_code: str,
        voice_name: Optional[str],
    ) -> Optional[TTSResult]:
        """Synthesize speech using Gemini TTS"""
        if not self.gemini_client:
            logger.warning("Gemini client not available")
            return None

        try:
            # Map language code to voice
            # Gemini supports: Kore (en-US), Puck (en-US), etc.
            if not voice_name:
                voice_name = "Kore"  # Default professional voice

            # Determine speaking style based on content
            speaking_style = self._detect_speaking_style(text)

            config_kwargs = {
                "speech_config": types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name,
                        )
                    ),
                )
            }

            logger.info(f"Generating Gemini TTS with voice: {voice_name}, style: {speaking_style}")
            
            response = self.gemini_client.models.generate_content(
                model=self.gemini_tts_model,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    **config_kwargs,
                ),
            )

            # Extract audio data - handle different response structures
            audio_data = None
            
            # Try to extract from candidates
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                
                if hasattr(candidate, 'content') and candidate.content:
                    content = candidate.content
                    
                    # Check for parts in content
                    if hasattr(content, 'parts') and content.parts and len(content.parts) > 0:
                        part = content.parts[0]
                        
                        # Check for inline_data
                        if hasattr(part, 'inline_data') and part.inline_data:
                            if hasattr(part.inline_data, 'data'):
                                audio_data = part.inline_data.data
                            elif isinstance(part.inline_data, dict) and 'data' in part.inline_data:
                                audio_data = part.inline_data['data']
            
            if not audio_data:
                error_msg = "No audio data found in Gemini response. Response structure: " + str(response)
                logger.warning(error_msg)
                return TTSResult(
                    audio_bytes=b"",
                    format="wav",
                    duration_seconds=0,
                    provider="gemini",
                    error=error_msg,
                )

            # Convert to WAV format if needed
            import wave

            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data)

            audio_bytes = buffer.getvalue()
            
            if not audio_bytes or len(audio_bytes) < 44:  # WAV header is at least 44 bytes
                error_msg = f"Generated audio is invalid or empty (size: {len(audio_bytes)} bytes)"
                logger.error(error_msg)
                return TTSResult(
                    audio_bytes=b"",
                    format="wav",
                    duration_seconds=0,
                    provider="gemini",
                    error=error_msg,
                )

            # Estimate duration (rough)
            duration = len(audio_data) / (24000 * 2) if audio_data else 0

            logger.info(f"Successfully generated Gemini TTS audio: {len(audio_bytes)} bytes, {duration:.2f}s")
            
            return TTSResult(
                audio_bytes=audio_bytes,
                format="wav",
                duration_seconds=duration,
                provider="gemini",
                error=None,
            )

        except Exception as e:
            error_msg = f"Gemini TTS synthesis failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return TTSResult(
                audio_bytes=b"",
                format="wav",
                duration_seconds=0,
                provider="gemini",
                error=error_msg,
            )

    def _synthesize_pyttsx3(
        self,
        text: str,
        language_code: str,
        voice_name: Optional[str],
    ) -> Optional[TTSResult]:
        """Synthesize speech using pyttsx3 (offline)"""
        if not self.pyttsx3_engine:
            error_msg = "pyttsx3 engine not available"
            logger.warning(error_msg)
            return TTSResult(
                audio_bytes=b"",
                format="wav",
                duration_seconds=0,
                provider="pyttsx3",
                error=error_msg,
            )

        try:
            # Get available voices
            voices = self.pyttsx3_engine.getProperty("voices")

            # Try to find a matching voice
            selected_voice = None
            lang_prefix = language_code.split("-")[0].lower()

            for voice in voices:
                if lang_prefix in voice.languages:
                    selected_voice = voice.id
                    break

            if selected_voice:
                self.pyttsx3_engine.setProperty("voice", selected_voice)

            if voice_name and voice_name.isdigit():
                # Voice ID provided
                self.pyttsx3_engine.setProperty("voice", voice_name)

            self.pyttsx3_engine.save_to_file(text, "temp.wav")
            self.pyttsx3_engine.runAndWait()

            # Read the temp file
            with open("temp.wav", "rb") as f:
                audio_bytes = f.read()

            try:
                os.remove("temp.wav")
            except OSError:
                pass

            if not audio_bytes or len(audio_bytes) < 44:
                error_msg = f"pyttsx3 generated invalid audio (size: {len(audio_bytes)} bytes)"
                logger.error(error_msg)
                return TTSResult(
                    audio_bytes=b"",
                    format="wav",
                    duration_seconds=0,
                    provider="pyttsx3",
                    error=error_msg,
                )

            # Estimate duration
            duration = len(audio_bytes) / (22050 * 2)  # Default pyttsx3 rate

            logger.info(f"Successfully generated pyttsx3 TTS audio: {len(audio_bytes)} bytes, {duration:.2f}s")
            
            return TTSResult(
                audio_bytes=audio_bytes,
                format="wav",
                duration_seconds=duration,
                provider="pyttsx3",
                error=None,
            )

        except Exception as e:
            error_msg = f"pyttsx3 TTS synthesis failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return TTSResult(
                audio_bytes=b"",
                format="wav",
                duration_seconds=0,
                provider="pyttsx3",
                error=error_msg,
            )

    def _detect_speaking_style(self, text: str) -> str:
        """Detect appropriate speaking style based on text content"""
        text_lower = text.lower()

        if any(word in text_lower for word in ["question", "quiz", "answer", "?"]):
            return "professionally"
        if any(word in text_lower for word in ["!", "excited", "great", "amazing"]):
            return "cheerfully"
        if any(word in text_lower for word in ["sorry", "apologize", "regret"]):
            return "sadly"
        return "calmly"


# Global instance for easy access
text_to_speech_service = TextToSpeechService()
