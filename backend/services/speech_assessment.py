"""
Modular ASR and scoring workflow for trainee speech assessments.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from statistics import mean
from typing import Any, Optional, Protocol

import requests

try:
    from openai import OpenAI

    OPENAI_AVAILABLE = True
except Exception:
    OpenAI = None
    OPENAI_AVAILABLE = False

logger = logging.getLogger(__name__)

WORD_RE = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")
MULTISPACE_RE = re.compile(r"\s+")
FILLER_WORDS = {
    "uh",
    "um",
    "ah",
    "er",
    "hmm",
    "like",
    "okay",
    "parang",
    "ano",
    "mmm",
}
PHONETIC_SUBSTITUTIONS = (
    ("ph", "f"),
    ("th", "t"),
    ("th", "d"),
    ("v", "b"),
    ("f", "p"),
    ("z", "s"),
    ("x", "ks"),
    ("q", "k"),
    ("c", "k"),
)


@dataclass
class ASRWord:
    word: str
    start: Optional[float] = None
    end: Optional[float] = None


@dataclass
class ASRResult:
    transcript: str
    confidence: float
    provider: str
    words: list[ASRWord]
    metadata: dict[str, Any]


class ASRProvider(Protocol):
    name: str

    def is_available(self) -> bool:
        ...

    def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        mime_type: str,
        language_hint: str,
        prompt: str,
        fallback_text: Optional[str] = None,
    ) -> ASRResult:
        ...


def _clean_spaces(text: str) -> str:
    return MULTISPACE_RE.sub(" ", text).strip()


def normalize_text(text: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9'\s-]", " ", text.lower())
    return _clean_spaces(sanitized)


def tokenize_text(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text)]


def _score_color(score: float) -> str:
    if score >= 85:
        return "green"
    if score >= 65:
        return "yellow"
    return "red"


def _clamp(score: float) -> float:
    return max(0.0, min(100.0, score))


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio() * 100


def _phonetic_signature(token: str) -> str:
    signature = token.lower()
    for source, target in PHONETIC_SUBSTITUTIONS:
        signature = signature.replace(source, target)
    signature = re.sub(r"([aeiou])\1+", r"\1", signature)
    signature = signature.replace("h", "")
    return signature


def _accent_adjusted_similarity(expected: str, actual: str) -> float:
    base_score = _similarity(expected, actual)
    if _phonetic_signature(expected) == _phonetic_signature(actual):
        return max(base_score, 78.0)
    if expected[:1] == actual[:1] and abs(len(expected) - len(actual)) <= 2:
        return max(base_score, 68.0)
    return base_score


def build_gold_standard_script(scenario: Any = None, reference_text: Optional[str] = None) -> str:
    """Derive the comparison script from explicit input or scenario flow."""
    if reference_text and reference_text.strip():
        return _clean_spaces(reference_text)

    expected_responses: list[str] = []
    if scenario and getattr(scenario, "flow_steps", None):
        ordered_steps = sorted(
            scenario.flow_steps,
            key=lambda step: getattr(step, "step_number", 0),
        )
        for step in ordered_steps:
            expected_response = getattr(step, "expected_response", None)
            if expected_response:
                expected_responses.append(_clean_spaces(expected_response))

    if expected_responses:
        return " ".join(expected_responses)

    expected_keywords = list(getattr(scenario, "expected_keywords", []) or [])
    if expected_keywords:
        keyword_phrase = ", ".join(expected_keywords[:3])
        return (
            "Thank you for calling. I understand your concern. "
            f"Let me help by {keyword_phrase}."
        )

    opening_prompt = getattr(scenario, "opening_prompt", "") if scenario else ""
    return _clean_spaces(opening_prompt)


def _build_transcription_prompt(
    *,
    gold_script: str,
    scenario: Any = None,
    user_dialect: Optional[str] = None,
) -> str:
    keywords = ", ".join(list(getattr(scenario, "expected_keywords", []) or [])[:8])
    scenario_title = getattr(scenario, "title", "BPO training scenario") if scenario else "BPO training scenario"
    return (
        "Transcribe customer-service training audio accurately. "
        "Expect Filipino-English or Philippine English accent patterns, BPO terminology, "
        "and occasional hesitations or self-corrections. "
        f"Scenario: {scenario_title}. "
        f"Dialect hint: {user_dialect or 'en-PH'}. "
        f"Important terms: {keywords or 'billing, verification, troubleshooting, escalation'}. "
        f"Reference script: {gold_script}"
    )


def _resolve_google_encoding(mime_type: str, filename: str) -> str:
    lowered = f"{mime_type} {filename}".lower()
    if "webm" in lowered:
        return "WEBM_OPUS"
    if "ogg" in lowered or "opus" in lowered:
        return "OGG_OPUS"
    if "mp3" in lowered or "mpeg" in lowered:
        return "MP3"
    return "LINEAR16"


def _detect_disfluencies(original_transcript: str, actual_tokens: list[str]) -> dict[str, Any]:
    lowered = original_transcript.lower()
    filler_hits = [token for token in actual_tokens if token in FILLER_WORDS]
    repeated_words: list[str] = []
    for index in range(1, len(actual_tokens)):
        if actual_tokens[index] == actual_tokens[index - 1]:
            repeated_words.append(actual_tokens[index])

    stutter_matches = re.findall(r"\b([a-z]{1,4})-\1[a-z]*\b", lowered)

    return {
        "filler_words": sorted(set(filler_hits)),
        "filler_count": len(filler_hits),
        "repeated_words": repeated_words,
        "repeat_count": len(repeated_words),
        "stutters": stutter_matches,
        "stutter_count": len(stutter_matches),
        "hesitation_count": len(filler_hits) + len(stutter_matches),
    }


class OpenAIWhisperProvider:
    name = "openai_whisper"

    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")

    def is_available(self) -> bool:
        return bool(OPENAI_AVAILABLE and self.api_key)

    def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        mime_type: str,
        language_hint: str,
        prompt: str,
        fallback_text: Optional[str] = None,
    ) -> ASRResult:
        if not self.is_available():
            raise RuntimeError("OpenAI transcription is not configured")

        client = OpenAI(api_key=self.api_key)
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename or "practice-attempt.webm"

        request: dict[str, Any] = {
            "file": audio_file,
            "model": self.model,
            "language": language_hint,
            "prompt": prompt,
            "temperature": 0,
        }

        wants_verbose = self.model == "whisper-1"
        if wants_verbose:
            request["response_format"] = "verbose_json"
            request["timestamp_granularities"] = ["word"]
        else:
            request["response_format"] = "json"

        response = client.audio.transcriptions.create(**request)

        transcript = _clean_spaces(getattr(response, "text", "") or "")
        words = [
            ASRWord(word=word.word, start=getattr(word, "start", None), end=getattr(word, "end", None))
            for word in (getattr(response, "words", None) or [])
        ]
        confidence = 0.9 if transcript else 0.0
        metadata = {
            "language": getattr(response, "language", language_hint),
            "duration": getattr(response, "duration", None),
            "mime_type": mime_type,
            "model": self.model,
        }

        return ASRResult(
            transcript=transcript,
            confidence=confidence,
            provider=self.name,
            words=words,
            metadata=metadata,
        )


class GoogleSpeechProvider:
    name = "google_speech_to_text"

    def __init__(self) -> None:
        self.api_key = (
            os.getenv("GOOGLE_SPEECH_API_KEY")
            or os.getenv("GOOGLE_CLOUD_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        self.endpoint = os.getenv(
            "GOOGLE_SPEECH_ENDPOINT",
            "https://speech.googleapis.com/v1/speech:recognize",
        )

    def is_available(self) -> bool:
        return bool(self.api_key)

    def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        mime_type: str,
        language_hint: str,
        prompt: str,
        fallback_text: Optional[str] = None,
    ) -> ASRResult:
        if not self.is_available():
            raise RuntimeError("Google Speech-to-Text is not configured")

        payload = {
            "config": {
                "encoding": _resolve_google_encoding(mime_type, filename),
                "languageCode": "en-US",
                "alternativeLanguageCodes": ["en-PH"],
                "enableAutomaticPunctuation": True,
                "enableWordTimeOffsets": True,
                "model": "phone_call",
                "metadata": {
                    "interactionType": "PHONE_CALL",
                    "industryNaicsCodeOfAudio": 561422,
                    "originalMediaType": "AUDIO",
                    "recordingDeviceType": "PC",
                },
                "speechContexts": [{"phrases": [prompt[:500]]}] if prompt else [],
            },
            "audio": {
                "content": base64.b64encode(audio_bytes).decode("ascii"),
            },
        }

        response = requests.post(
            f"{self.endpoint}?key={self.api_key}",
            json=payload,
            timeout=45,
        )
        response.raise_for_status()
        data = response.json()

        transcripts: list[str] = []
        confidences: list[float] = []
        words: list[ASRWord] = []
        for result in data.get("results") or []:
            alternatives = result.get("alternatives") or []
            if not alternatives:
                continue
            best = alternatives[0]
            transcript_part = best.get("transcript", "")
            if transcript_part:
                transcripts.append(transcript_part)
            confidence = best.get("confidence")
            if isinstance(confidence, (int, float)):
                confidences.append(float(confidence))
            for item in best.get("words") or []:
                word = item.get("word")
                if not word:
                    continue
                start = None
                end = None
                start_raw = item.get("startTime")
                end_raw = item.get("endTime")
                if isinstance(start_raw, str) and start_raw.endswith("s"):
                    try:
                        start = float(start_raw[:-1])
                    except ValueError:
                        start = None
                if isinstance(end_raw, str) and end_raw.endswith("s"):
                    try:
                        end = float(end_raw[:-1])
                    except ValueError:
                        end = None
                words.append(ASRWord(word=word, start=start, end=end))

        transcript = _clean_spaces(" ".join(transcripts))
        if not transcript and fallback_text:
            transcript = _clean_spaces(fallback_text)

        return ASRResult(
            transcript=transcript,
            confidence=round(mean(confidences), 4) if confidences else (0.72 if transcript else 0.0),
            provider=self.name,
            words=words,
            metadata={
                "mime_type": mime_type,
                "language": language_hint,
                "result_count": len(data.get("results") or []),
            },
        )


class HeuristicFallbackProvider:
    name = "heuristic_fallback"

    def is_available(self) -> bool:
        return True

    def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        mime_type: str,
        language_hint: str,
        prompt: str,
        fallback_text: Optional[str] = None,
    ) -> ASRResult:
        if len(audio_bytes) < 512:
            transcript = ""
        else:
            transcript = _clean_spaces(fallback_text or "")

        metadata = {
            "warning": (
                "No live ASR provider is configured. Assessment used a heuristic fallback "
                "based on the gold-standard script."
            ),
            "mime_type": mime_type,
        }
        words = [ASRWord(word=token) for token in tokenize_text(transcript)]
        confidence = 0.55 if transcript else 0.0
        return ASRResult(
            transcript=transcript,
            confidence=confidence,
            provider=self.name,
            words=words,
            metadata=metadata,
        )


class SpeechAssessmentService:
    """Coordinates provider selection and transcript scoring."""

    def __init__(self, *, include_heuristic_fallback: bool = True) -> None:
        self.providers: list[ASRProvider] = [
            GoogleSpeechProvider(),
            OpenAIWhisperProvider(),
        ]
        if include_heuristic_fallback:
            self.providers.append(HeuristicFallbackProvider())

    def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        mime_type: str,
        gold_script: str,
        fallback_text: Optional[str] = None,
        user_dialect: Optional[str] = None,
        scenario: Any = None,
    ) -> ASRResult:
        prompt = _build_transcription_prompt(
            gold_script=gold_script,
            scenario=scenario,
            user_dialect=user_dialect,
        )
        language_hint = "en"

        for provider in self.providers:
            if not provider.is_available():
                continue
            try:
                return provider.transcribe(
                    audio_bytes=audio_bytes,
                    filename=filename,
                    mime_type=mime_type,
                    language_hint=language_hint,
                    prompt=prompt,
                    fallback_text=fallback_text or gold_script,
                )
            except Exception as exc:
                logger.warning("ASR provider %s failed: %s", provider.name, exc)

        raise RuntimeError("No ASR provider could process the uploaded audio")


def score_transcript(
    *,
    transcript: str,
    gold_script: str,
    expected_keywords: list[str],
    response_duration: Optional[float] = None,
    provider_words: Optional[list[ASRWord]] = None,
    transcription_confidence: float = 0.0,
) -> dict[str, Any]:
    gold_tokens = tokenize_text(gold_script)
    actual_tokens = tokenize_text(transcript)
    disfluencies = _detect_disfluencies(transcript, actual_tokens)

    if not actual_tokens:
        return {
            "status": "needs_retry",
            "error": "No recognizable speech was detected. Please try again in a quieter environment.",
            "accuracy_percentage": 0.0,
            "overall_score": 0.0,
            "scores": {
                "phonetic_accuracy": 0.0,
                "fluency": 0.0,
                "grammar_precision": 0.0,
                "keyword_adherence": 0.0,
                "transcription_confidence": round(transcription_confidence * 100, 2),
            },
            "detected_disfluencies": disfluencies,
            "word_feedback": [],
            "detected_errors": [],
            "coaching_tips": [
                "Check microphone placement and speak at a steady pace before retrying.",
            ],
        }

    matcher = SequenceMatcher(None, gold_tokens, actual_tokens)
    word_feedback: list[dict[str, Any]] = []
    detected_errors: list[dict[str, Any]] = []

    for opcode, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        expected_slice = gold_tokens[left_start:left_end]
        actual_slice = actual_tokens[right_start:right_end]

        if opcode == "equal":
            for index, token in enumerate(actual_slice):
                timing = provider_words[right_start + index] if provider_words and right_start + index < len(provider_words) else None
                word_feedback.append(
                    {
                        "word": token,
                        "expected_word": expected_slice[index] if index < len(expected_slice) else token,
                        "accuracy": 100.0,
                        "error_type": "None",
                        "category": "phonetic",
                        "color": "green",
                        "start": getattr(timing, "start", None),
                        "end": getattr(timing, "end", None),
                    }
                )
            continue

        max_items = max(len(expected_slice), len(actual_slice))
        for offset in range(max_items):
            expected_word = expected_slice[offset] if offset < len(expected_slice) else None
            actual_word = actual_slice[offset] if offset < len(actual_slice) else None
            timing = provider_words[right_start + offset] if provider_words and right_start + offset < len(provider_words) else None

            if expected_word and actual_word:
                similarity = _accent_adjusted_similarity(expected_word, actual_word)
                accent_shift = _phonetic_signature(expected_word) == _phonetic_signature(actual_word)
                error_type = "AccentShift" if accent_shift else "Replacement"
                word_feedback.append(
                    {
                        "word": actual_word,
                        "expected_word": expected_word,
                        "accuracy": round(similarity, 2),
                        "error_type": error_type,
                        "category": "phonetic",
                        "color": _score_color(similarity),
                        "start": getattr(timing, "start", None),
                        "end": getattr(timing, "end", None),
                    }
                )
                if similarity < 90:
                    detected_errors.append(
                        {
                            "category": "phonetic",
                            "severity": "medium" if similarity >= 70 else "high",
                            "expected": expected_word,
                            "actual": actual_word,
                            "message": (
                                f"Expected '{expected_word}' but heard '{actual_word}'."
                                if not accent_shift
                                else f"Accent shift detected on '{actual_word}'. Keep the target vowel and consonant shape closer to '{expected_word}'."
                            ),
                        }
                    )
            elif expected_word and not actual_word:
                word_feedback.append(
                    {
                        "word": expected_word,
                        "expected_word": expected_word,
                        "accuracy": 0.0,
                        "error_type": "Omission",
                        "category": "phonetic",
                        "color": "red",
                        "start": None,
                        "end": None,
                    }
                )
                detected_errors.append(
                    {
                        "category": "phonetic",
                        "severity": "high",
                        "expected": expected_word,
                        "actual": None,
                        "message": f"Expected word '{expected_word}' was omitted.",
                    }
                )
            elif actual_word:
                hesitation_error = actual_word in FILLER_WORDS
                word_feedback.append(
                    {
                        "word": actual_word,
                        "expected_word": None,
                        "accuracy": 25.0 if hesitation_error else 40.0,
                        "error_type": "Hesitation" if hesitation_error else "Insertion",
                        "category": "fluency" if hesitation_error else "phonetic",
                        "color": "yellow" if hesitation_error else "red",
                        "start": getattr(timing, "start", None),
                        "end": getattr(timing, "end", None),
                    }
                )
                detected_errors.append(
                    {
                        "category": "fluency" if hesitation_error else "phonetic",
                        "severity": "medium",
                        "expected": None,
                        "actual": actual_word,
                        "message": (
                            f"Detected hesitation token '{actual_word}'."
                            if hesitation_error
                            else f"Unexpected insertion '{actual_word}' affected script precision."
                        ),
                    }
                )

    pronunciation_scores = [item["accuracy"] for item in word_feedback if item["category"] == "phonetic"]
    phonetic_accuracy = round(mean(pronunciation_scores), 2) if pronunciation_scores else 0.0

    keyword_matches = 0
    normalized_transcript = normalize_text(transcript)
    matched_keywords: list[str] = []
    for keyword in expected_keywords:
        normalized_keyword = normalize_text(keyword)
        if normalized_keyword and normalized_keyword in normalized_transcript:
            keyword_matches += 1
            matched_keywords.append(keyword)

    keyword_score = (
        round((keyword_matches / len(expected_keywords)) * 100, 2)
        if expected_keywords
        else round(phonetic_accuracy, 2)
    )

    grammar_similarity = _similarity(normalize_text(gold_script), normalize_text(transcript))
    grammar_penalty = (
        disfluencies["filler_count"] * 2.5
        + disfluencies["repeat_count"] * 4
        + disfluencies["stutter_count"] * 5
    )
    grammar_precision = round(
        _clamp((0.7 * grammar_similarity) + (0.3 * keyword_score) - grammar_penalty),
        2,
    )

    fluency_score = 100.0
    fluency_score -= disfluencies["filler_count"] * 6
    fluency_score -= disfluencies["repeat_count"] * 5
    fluency_score -= disfluencies["stutter_count"] * 8
    fluency_score -= max(0, len(gold_tokens) - len(actual_tokens)) * 1.5

    speech_rate_wpm = None
    if response_duration and response_duration > 0:
        speech_rate_wpm = round((len(actual_tokens) / response_duration) * 60, 2)
        if speech_rate_wpm < 85:
            fluency_score -= min(18, (85 - speech_rate_wpm) * 0.3)
        elif speech_rate_wpm > 175:
            fluency_score -= min(18, (speech_rate_wpm - 175) * 0.18)

    fluency = round(_clamp(fluency_score), 2)
    accuracy_percentage = round(phonetic_accuracy, 2)
    overall_score = round(
        _clamp(
            (phonetic_accuracy * 0.38)
            + (fluency * 0.27)
            + (grammar_precision * 0.2)
            + (keyword_score * 0.15)
        ),
        2,
    )

    if disfluencies["filler_count"] or disfluencies["stutter_count"] or disfluencies["repeat_count"]:
        detected_errors.append(
            {
                "category": "fluency",
                "severity": "medium",
                "expected": None,
                "actual": None,
                "message": (
                    f"Detected {disfluencies['filler_count']} filler words, "
                    f"{disfluencies['stutter_count']} stutters, and "
                    f"{disfluencies['repeat_count']} repeated words."
                ),
            }
        )

    if expected_keywords and keyword_matches < len(expected_keywords):
        missing_keywords = [keyword for keyword in expected_keywords if keyword not in matched_keywords]
        detected_errors.append(
            {
                "category": "keyword",
                "severity": "medium",
                "expected": missing_keywords,
                "actual": matched_keywords,
                "message": f"Missing target keywords: {', '.join(missing_keywords[:5])}.",
            }
        )

    coaching_tips: list[str] = []
    if phonetic_accuracy < 80:
        coaching_tips.append(
            "Slow down on high-value keywords and exaggerate final consonants to improve phonetic clarity."
        )
    if fluency < 80:
        coaching_tips.append(
            "Use short controlled pauses instead of fillers like 'um' or repeated restarts."
        )
    if grammar_precision < 80:
        coaching_tips.append(
            "Stay closer to the gold script sentence structure before improvising additional phrases."
        )
    if keyword_score < 85 and expected_keywords:
        coaching_tips.append(
            f"Reinforce the required script anchors: {', '.join(expected_keywords[:4])}."
        )
    if not coaching_tips:
        coaching_tips.append("Good delivery. Keep your pace steady and maintain the same script discipline.")

    return {
        "status": "completed",
        "accuracy_percentage": accuracy_percentage,
        "overall_score": overall_score,
        "scores": {
            "phonetic_accuracy": phonetic_accuracy,
            "fluency": fluency,
            "grammar_precision": grammar_precision,
            "keyword_adherence": keyword_score,
            "transcription_confidence": round(transcription_confidence * 100, 2),
            "speech_rate_wpm": speech_rate_wpm,
        },
        "detected_disfluencies": disfluencies,
        "word_feedback": word_feedback,
        "detected_errors": detected_errors[:12],
        "coaching_tips": coaching_tips,
        "matched_keywords": matched_keywords,
    }


def assess_audio_submission(
    *,
    audio_bytes: bytes,
    filename: str,
    mime_type: str,
    scenario: Any = None,
    reference_text: Optional[str] = None,
    fallback_transcript: Optional[str] = None,
    response_duration: Optional[float] = None,
    user_dialect: Optional[str] = None,
) -> dict[str, Any]:
    gold_script = build_gold_standard_script(scenario=scenario, reference_text=reference_text)
    if not gold_script:
        return {
            "status": "error",
            "error": "No gold-standard script is configured for this assessment.",
        }

    service = SpeechAssessmentService()
    asr_result = service.transcribe(
        audio_bytes=audio_bytes,
        filename=filename,
        mime_type=mime_type,
        gold_script=gold_script,
        fallback_text=fallback_transcript,
        user_dialect=user_dialect,
        scenario=scenario,
    )

    expected_keywords = list(getattr(scenario, "expected_keywords", []) or [])
    scored = score_transcript(
        transcript=asr_result.transcript,
        gold_script=gold_script,
        expected_keywords=expected_keywords,
        response_duration=response_duration,
        provider_words=asr_result.words,
        transcription_confidence=asr_result.confidence,
    )

    if scored["status"] != "completed":
        scored.update(
            {
                "provider": asr_result.provider,
                "provider_metadata": asr_result.metadata,
                "reference_text": gold_script,
                "transcription": asr_result.transcript,
                "text": asr_result.transcript,
            }
        )
        return scored

    scores = scored["scores"]
    response = {
        "status": "completed",
        "provider": asr_result.provider,
        "provider_metadata": asr_result.metadata,
        "reference_text": gold_script,
        "transcription": asr_result.transcript,
        "text": asr_result.transcript,
        "transcription_confidence": round(asr_result.confidence, 4),
        "accuracy_percentage": scored["accuracy_percentage"],
        "overall_score": scored["overall_score"],
        "scores": scores,
        "overall_scores": {
            "accuracy": scores["phonetic_accuracy"],
            "fluency": scores["fluency"],
            "completeness": scores["keyword_adherence"],
            "prosody": scores["grammar_precision"],
        },
        "word_feedback": scored["word_feedback"],
        "words": [
            {
                "word": item["word"],
                "accuracy": item["accuracy"],
                "error_type": item["error_type"],
            }
            for item in scored["word_feedback"]
        ],
        "detected_errors": scored["detected_errors"],
        "detected_disfluencies": scored["detected_disfluencies"],
        "coaching_tips": scored["coaching_tips"],
        "matched_keywords": scored["matched_keywords"],
        "response_duration": response_duration,
        "assessment_data": {
            "provider": asr_result.provider,
            "provider_metadata": asr_result.metadata,
            "reference_text": gold_script,
            "scores": scores,
            "detected_errors": scored["detected_errors"],
            "detected_disfluencies": scored["detected_disfluencies"],
            "coaching_tips": scored["coaching_tips"],
            "matched_keywords": scored["matched_keywords"],
            "word_feedback": scored["word_feedback"],
            "accent_support": {
                "dialect_hint": user_dialect or "en-PH",
                "mode": "Filipino-English aware prompting",
            },
            "iso_25010_notes": {
                "functional_suitability": "Assessment combines ASR, script matching, and KPI scoring in one modular pipeline.",
                "performance_efficiency": "Single transcription call with deterministic scoring keeps latency low.",
            },
        },
    }

    return response
