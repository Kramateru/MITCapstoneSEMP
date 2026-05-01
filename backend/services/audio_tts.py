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

from ..config_validation import normalize_env_value

logger = logging.getLogger(__name__)

# Try to import Gemini TTS
try:
    from google import genai
    from google.genai import types
    GEMINI_TTS_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GEMINI_TTS_AVAILABLE = False

# Try pyttsx3 as offline fallback
try:
    import pyttsx3
    PYTTSX3_AVAILABLE = True
except ImportError:
    pyttsx3 = None
    PYTTSX3_AVAILABLE = False


@dataclass
class TTSResult:
    """Result of text-to-speech conversion"""
    audio_bytes: bytes
    format: str  # "wav", "mp3"
    duration_seconds: float
    provider: str  # "gemini", "pyttsx3"


class TextToSpeechService:
    """Multi-provider text-to-speech service for accessibility"""

    def __init__(self):
        # Gemini TTS configuration
        self.gemini_api_key = normalize_env_value(os.getenv("GEMINI_API_KEY"))
        self.gemini_client = None
        if GEMINI_TTS_AVAILABLE and self.gemini_api_key:
            try:
                self.gemini_client = genai.Client(api_key=self.gemini_api_key)
                logger.info("✓ Gemini TTS client initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini TTS client: {e}")

        # pyttsx3 offline TTS
        self.pyttsx3_engine = None
        if PYTTSX3_AVAILABLE:
            try:
                self.pyttsx3_engine = pyttsx3.init()
                # Configure voice properties
                self.pyttsx3_engine.setProperty('rate', 150)  # Words per minute
                self.pyttsx3_engine.setProperty('volume', 1.0)  # 0.0 to 1.0
                logger.info("✓ pyttsx3 TTS engine initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize pyttsx3 engine: {e}")

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
            TTSResult with audio bytes and metadata
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for TTS")
            return None

        # Auto-select provider if not specified
        if not provider:
            provider = self._select_provider()

        if provider == "gemini":
            return self._synthesize_gemini(text, language_code, voice_name)
        elif provider == "pyttsx3":
            return self._synthesize_pyttsx3(text, language_code, voice_name)
        else:
            logger.error(f"Unknown or unavailable TTS provider: {provider}")
            return None

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
                'speech_config': types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name,
                        )
                    ),
                )
            }

            response = self.gemini_client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    **config_kwargs
                )
            )

            # Extract audio data
            if not (response.candidates and 
                    response.candidates[0].content and 
                    response.candidates[0].content.parts and
                    response.candidates[0].content.parts[0].inline_data):
                logger.warning("No audio in Gemini response")
                return None

            audio_data = response.candidates[0].content.parts[0].inline_data.data

            # Convert to WAV format
            import wave
            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data)
            
            audio_bytes = buffer.getvalue()
            
            # Estimate duration (rough)
            duration = len(audio_data) / (24000 * 2)

            return TTSResult(
                audio_bytes=audio_bytes,
                format="wav",
                duration_seconds=duration,
                provider="gemini",
            )

        except Exception as e:
            logger.error(f"Gemini TTS synthesis failed: {e}")
            return None

    def _synthesize_pyttsx3(
        self,
        text: str,
        language_code: str,
        voice_name: Optional[str],
    ) -> Optional[TTSResult]:
        """Synthesize speech using pyttsx3 (offline)"""
        if not self.pyttsx3_engine:
            logger.warning("pyttsx3 engine not available")
            return None

        try:
            # Get available voices
            voices = self.pyttsx3_engine.getProperty('voices')
            
            # Try to find a matching voice
            selected_voice = None
            lang_prefix = language_code.split("-")[0].lower()
            
            for voice in voices:
                if lang_prefix in voice.languages:
                    selected_voice = voice.id
                    break
            
            if selected_voice:
                self.pyttsx3_engine.setProperty('voice', selected_voice)
            
            if voice_name and voice_name.isdigit():
                # Voice ID provided
                self.pyttsx3_engine.setProperty('voice', voice_name)

            # Generate audio to bytes
            buffer = io.BytesIO()
            self.pyttsx3_engine.save_to_file(text, 'temp.wav')
            self.pyttsx3_engine.runAndWait()
            
            # Read the temp file
            with open('temp.wav', 'rb') as f:
                audio_bytes = f.read()
            
            # Clean up
            try:
                os.remove('temp.wav')
            except:
                pass

            # Estimate duration
            duration = len(audio_bytes) / (22050 * 2)  # Default pyttsx3 rate

            return TTSResult(
                audio_bytes=audio_bytes,
                format="wav",
                duration_seconds=duration,
                provider="pyttsx3",
            )

        except Exception as e:
            logger.error(f"pyttsx3 TTS synthesis failed: {e}")
            return None

    def _detect_speaking_style(self, text: str) -> str:
        """Detect appropriate speaking style based on text content"""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['question', 'quiz', 'answer', '?']):
            return "professionally"
        elif any(word in text_lower for word in ['!', 'excited', 'great', 'amazing']):
            return "cheerfully"
        elif any(word in text_lower for word in ['sorry', 'apologize', 'regret']):
            return "sadly"
        else:
            return "calmly"


# Global instance for easy access
text_to_speech_service = TextToSpeechService()