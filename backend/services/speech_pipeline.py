"""
Controller for the realtime voice path:
Audio In -> ASR -> Processing -> optional TTS -> Audio Out.
"""

from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

import requests

from ..config_validation import is_usable_azure_speech_key, normalize_env_value

try:
    import azure.cognitiveservices.speech as speechsdk

    AZURE_TTS_AVAILABLE = True
except Exception:
    speechsdk = None
    AZURE_TTS_AVAILABLE = False

from .speech_assessment import ASRResult, SpeechAssessmentService

logger = logging.getLogger(__name__)

GEMINI_API_BASE = os.getenv(
    "GEMINI_API_BASE",
    "https://generativelanguage.googleapis.com/v1beta/models",
)

DEFAULT_ASR_HINT = (
    "Customer support conversation between a CSR and a caller discussing a service concern."
)
DEFAULT_SYSTEM_PROMPT = (
    "You are the processing stage of a BPO speech pipeline. "
    "Respond as a calm, professional customer support representative. "
    "Acknowledge the caller's concern, state the next helpful action, and keep the reply under three sentences. "
    "Do not use markdown, bullet points, or placeholders. "
    "If the transcript is unclear or empty, politely ask the caller to repeat."
)


class SpeechPipelineError(RuntimeError):
    """Raised when the realtime speech pipeline cannot complete a turn."""


@dataclass
class TTSResult:
    audio_bytes: bytes
    mime_type: str
    provider: str
    voice_name: str


def _extract_text_from_gemini_response(payload: dict[str, Any]) -> Optional[str]:
    text_parts: list[str] = []
    for candidate in payload.get("candidates", []):
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    if not text_parts:
        return None

    return "\n".join(text_parts).strip()


def _history_to_gemini_contents(history: Optional[list[dict[str, Any]]]) -> list[dict[str, object]]:
    contents: list[dict[str, object]] = []
    for item in (history or [])[-8:]:
        role = str(item.get("role") or "user").strip().lower()
        if role == "system":
            continue

        text = item.get("text")
        if text is None:
            text = item.get("content")
        if not isinstance(text, str) or not text.strip():
            continue

        contents.append(
            {
                "role": "model" if role in {"assistant", "agent", "model"} else "user",
                "parts": [{"text": text.strip()}],
            }
        )

    return contents


def _pad_base64(payload: str) -> str:
    missing_padding = (-len(payload)) % 4
    if missing_padding:
        payload += "=" * missing_padding
    return payload


def _decode_audio_payload(encoded_audio: str, mime_type: str) -> tuple[bytes, str]:
    payload = (encoded_audio or "").strip()
    resolved_mime_type = mime_type or "audio/webm"

    if payload.startswith("data:"):
        header, _, body = payload.partition(",")
        payload = body
        if ";" in header:
            resolved_mime_type = header[5:].split(";", 1)[0] or resolved_mime_type

    if not payload:
        raise SpeechPipelineError("Audio payload was empty.")

    try:
        audio_bytes = base64.b64decode(_pad_base64(payload), validate=False)
    except Exception as exc:
        raise SpeechPipelineError("Audio payload was not valid base64 data.") from exc

    if not audio_bytes:
        raise SpeechPipelineError("Decoded audio payload was empty.")

    return audio_bytes, resolved_mime_type


class ResponseProcessor:
    """Generates the text response for the processing stage."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model = (
            os.getenv("VOICE_PIPELINE_MODEL")
            or os.getenv("GEMINI_SUPPORT_MODEL")
            or "gemini-2.5-flash"
        )

    def generate(
        self,
        *,
        transcript: str,
        context_hint: Optional[str] = None,
        history: Optional[list[dict[str, Any]]] = None,
    ) -> tuple[str, str]:
        normalized_transcript = (transcript or "").strip()
        if not normalized_transcript:
            return (
                "I couldn't quite hear that. Could you please repeat your concern?",
                "rules",
            )

        if self.api_key:
            reply = self._generate_with_gemini(
                transcript=normalized_transcript,
                context_hint=context_hint,
                history=history,
            )
            if reply:
                return reply, f"gemini:{self.model}"

        return self._fallback_reply(normalized_transcript), "rules"

    def _generate_with_gemini(
        self,
        *,
        transcript: str,
        context_hint: Optional[str],
        history: Optional[list[dict[str, Any]]],
    ) -> Optional[str]:
        prompt = (
            f"{DEFAULT_SYSTEM_PROMPT}\n\n"
            f"Scenario context: {(context_hint or 'General BPO support call').strip()}\n"
            f"Caller transcript: {transcript}\n\n"
            "Return only the agent reply."
        )

        payload = {
            "contents": [
                *_history_to_gemini_contents(history),
                {"role": "user", "parts": [{"text": prompt}]},
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "text/plain",
            },
        }

        try:
            response = requests.post(
                f"{GEMINI_API_BASE}/{self.model}:generateContent",
                params={"key": self.api_key},
                json=payload,
                timeout=45,
            )
            response.raise_for_status()
        except Exception as exc:
            logger.warning("Gemini voice pipeline request failed: %s", exc)
            return None

        text = _extract_text_from_gemini_response(response.json())
        if not text:
            return None

        return text.strip().strip('"').strip()

    def _fallback_reply(self, transcript: str) -> str:
        lowered = transcript.lower()

        keyword_map = (
            (
                {"billing", "charge", "invoice", "payment", "refund"},
                "I can help with your billing concern. Let me review the account details and check the charge with you.",
            ),
            (
                {"password", "login", "access", "account locked", "sign in"},
                "I can help restore account access. Let me verify the account first and walk you through the next step.",
            ),
            (
                {"cancel", "cancellation", "terminate", "close account"},
                "I can help with that request. Let me first review the account status and explain the available options.",
            ),
            (
                {"delivery", "order", "shipment", "tracking"},
                "I can check the order status for you. Let me review the details and update you on the next action.",
            ),
            (
                {"technical", "error", "issue", "problem", "troubleshoot"},
                "I can help troubleshoot that issue. Let me confirm what happened and guide you through the next step.",
            ),
        )

        for keywords, reply in keyword_map:
            if any(keyword in lowered for keyword in keywords):
                return reply

        return "Thank you for explaining that. Let me review the concern and help you with the next best step."


class AzureTextToSpeechEngine:
    """Optional server-side TTS provider for audio responses."""

    def __init__(self) -> None:
        self.speech_key = normalize_env_value(os.getenv("AZURE_SPEECH_KEY"))
        self.speech_region = normalize_env_value(os.getenv("AZURE_SPEECH_REGION")) or "eastus"
        self.default_voice = normalize_env_value(os.getenv("AZURE_TTS_VOICE")) or "en-US-JennyNeural"

    def is_available(self) -> bool:
        return bool(
            AZURE_TTS_AVAILABLE
            and is_usable_azure_speech_key(self.speech_key)
            and self.speech_region
        )

    def synthesize(self, text: str, *, voice_name: Optional[str] = None) -> Optional[TTSResult]:
        if not self.is_available() or not text.strip():
            return None

        try:
            speech_config = speechsdk.SpeechConfig(
                subscription=self.speech_key,
                region=self.speech_region,
            )
            resolved_voice = voice_name or self.default_voice
            speech_config.speech_synthesis_voice_name = resolved_voice
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
                raise SpeechPipelineError(
                    f"Azure TTS failed to synthesize audio. {detail_text or ''}".strip()
                )

            audio_bytes = bytes(result.audio_data or b"")
            if not audio_bytes:
                raise SpeechPipelineError("Azure TTS completed without returning audio data.")

            return TTSResult(
                audio_bytes=audio_bytes,
                mime_type="audio/wav",
                provider="azure_speech",
                voice_name=resolved_voice,
            )
        except Exception as exc:
            logger.warning("Azure TTS synthesis failed: %s", exc)
            return None


class SpeechPipelineController:
    """Coordinates the speech stages used by the realtime websocket path."""

    def __init__(self) -> None:
        self.asr_service = SpeechAssessmentService(include_heuristic_fallback=False)
        self.processor = ResponseProcessor()
        self.tts_engine = AzureTextToSpeechEngine()

    def process_audio_turn(
        self,
        *,
        encoded_audio: str,
        mime_type: str = "audio/webm",
        context_hint: Optional[str] = None,
        history: Optional[list[dict[str, Any]]] = None,
        synthesize: bool = True,
        voice_name: Optional[str] = None,
        fallback_transcript: Optional[str] = None,
        user_dialect: Optional[str] = None,
    ) -> dict[str, Any]:
        audio_bytes, resolved_mime_type = _decode_audio_payload(encoded_audio, mime_type)

        try:
            asr_result = self.asr_service.transcribe(
                audio_bytes=audio_bytes,
                filename="realtime-input.webm",
                mime_type=resolved_mime_type,
                gold_script=(context_hint or DEFAULT_ASR_HINT),
                fallback_text=fallback_transcript,
                user_dialect=user_dialect,
            )
        except Exception as exc:
            raise SpeechPipelineError(
                "Audio was received, but no live ASR provider could transcribe it. "
                "Configure Google Speech-to-Text or OpenAI transcription for realtime audio turns."
            ) from exc

        return self._build_pipeline_result(
            transcript=asr_result.transcript,
            history=history,
            context_hint=context_hint,
            synthesize=synthesize,
            voice_name=voice_name,
            asr_result=asr_result,
        )

    def process_text_turn(
        self,
        *,
        text: str,
        context_hint: Optional[str] = None,
        history: Optional[list[dict[str, Any]]] = None,
        synthesize: bool = True,
        voice_name: Optional[str] = None,
    ) -> dict[str, Any]:
        transcript = (text or "").strip()
        if not transcript:
            raise SpeechPipelineError("Text input was empty.")

        return self._build_pipeline_result(
            transcript=transcript,
            history=history,
            context_hint=context_hint,
            synthesize=synthesize,
            voice_name=voice_name,
            asr_result=None,
        )

    def _build_pipeline_result(
        self,
        *,
        transcript: str,
        history: Optional[list[dict[str, Any]]],
        context_hint: Optional[str],
        synthesize: bool,
        voice_name: Optional[str],
        asr_result: Optional[ASRResult],
    ) -> dict[str, Any]:
        reply_text, processor_provider = self.processor.generate(
            transcript=transcript,
            context_hint=context_hint,
            history=history,
        )

        tts_result = None
        if synthesize:
            tts_result = self.tts_engine.synthesize(reply_text, voice_name=voice_name)

        stages = ["processing"] if asr_result is None else ["audio_in", "asr", "processing"]
        if tts_result:
            stages.extend(["tts", "audio_out"])

        return {
            "transcript": transcript,
            "reply_text": reply_text,
            "audio_base64": (
                base64.b64encode(tts_result.audio_bytes).decode("ascii")
                if tts_result
                else None
            ),
            "audio_mime_type": tts_result.mime_type if tts_result else None,
            "pipeline": {
                "stages": stages,
                "asr_provider": asr_result.provider if asr_result else None,
                "asr_metadata": asr_result.metadata if asr_result else None,
                "transcription_confidence": (
                    round(asr_result.confidence, 4) if asr_result else None
                ),
                "processor_provider": processor_provider,
                "tts_provider": tts_result.provider if tts_result else None,
                "voice_name": tts_result.voice_name if tts_result else voice_name,
                "context_hint": context_hint,
            },
        }
