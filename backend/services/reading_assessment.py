"""
Reading Pronunciation Assessment Service.

The service compares the trainer's passage with the recognized speech, produces
word-level alignment, estimates pronunciation/fluency/completeness/confidence
scores, and derives BPO-focused sound issue summaries. It is intentionally
provider-neutral so a dedicated pronunciation engine can replace or enrich the
heuristics without changing route/UI contracts.
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class WordAlignment:
    expected_word: str
    spoken_word: Optional[str]
    status: str
    confidence: float
    feedback: str
    word_index: int = 0
    sound_issue: Optional[str] = None
    phoneme_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PronunciationScore:
    total_words: int
    correct_words: int
    mispronounced_words: int
    omitted_words: int
    extra_words: int
    repeated_words: int
    pronunciation_accuracy: float
    word_accuracy: float
    sentence_accuracy: float
    fluency_score: float
    completeness_score: float
    confidence_score: float
    overall_score: float
    words_per_minute: float
    duration_seconds: float


class ReadingPronunciationAnalyzer:
    """Analyze a reading-aloud attempt from transcript and optional ASR metadata."""

    MIN_CONFIDENCE_THRESHOLD = 0.50
    IDEAL_MIN_WPM = 105
    IDEAL_MAX_WPM = 170

    COMMON_CONFUSIONS = {
        "the": ["a", "ta", "thee", "da"],
        "that": ["dat", "thet"],
        "this": ["dis"],
        "thank": ["tank", "dank"],
        "three": ["tree"],
        "customer": ["costumer", "custommer"],
        "communication": ["communcation", "comunication"],
        "receive": ["recieve"],
        "service": ["servis"],
    }

    SOUND_PATTERNS = {
        "TH": re.compile(r"th", re.IGNORECASE),
        "R": re.compile(r"r", re.IGNORECASE),
        "L": re.compile(r"l", re.IGNORECASE),
        "V": re.compile(r"v", re.IGNORECASE),
        "F": re.compile(r"f|ph", re.IGNORECASE),
        "B": re.compile(r"b", re.IGNORECASE),
        "P": re.compile(r"p", re.IGNORECASE),
        "SH": re.compile(r"sh", re.IGNORECASE),
        "CH": re.compile(r"ch", re.IGNORECASE),
        "J": re.compile(r"j|g(?=[ei])|dge", re.IGNORECASE),
        "S": re.compile(r"s", re.IGNORECASE),
        "Z": re.compile(r"z", re.IGNORECASE),
        "ST cluster": re.compile(r"st", re.IGNORECASE),
        "Ending consonant": re.compile(r"[bcdfghjklmnpqrstvwxyz]$", re.IGNORECASE),
    }
    FILLER_WORDS = {"um", "uh", "ah", "er", "erm", "hmm"}

    def analyze_pronunciation(
        self,
        expected_text: str,
        audio_transcript: str,
        confidence_scores: Optional[dict[str, float]] = None,
        *,
        provider_words: Optional[list[dict[str, Any]]] = None,
        duration_seconds: Optional[float] = None,
    ) -> tuple[list[WordAlignment], PronunciationScore]:
        expected_words = self._tokenize_and_normalize(expected_text)
        spoken_words = self._tokenize_and_normalize(audio_transcript)
        word_confidences = confidence_scores or self._confidence_map_from_provider_words(provider_words or [])

        logger.info(
            "Analyzing reading pronunciation: expected=%s spoken=%s duration=%s",
            len(expected_words),
            len(spoken_words),
            duration_seconds,
        )

        alignment = self._align_words(expected_words, spoken_words, word_confidences)
        speech_timing = self._extract_speech_timing(provider_words or [])
        score = self._calculate_score(
            alignment,
            expected_text=expected_text,
            audio_transcript=audio_transcript,
            duration_seconds=duration_seconds or speech_timing.get("duration_seconds"),
        )
        if speech_timing:
            for item in alignment:
                item.phoneme_data = {
                    **item.phoneme_data,
                    "speech_timing_available": True,
                } if item.phoneme_data else item.phoneme_data
        return alignment, score

    def _tokenize_and_normalize(self, text: str) -> list[str]:
        normalized = re.sub(r"[^\w\s']", " ", text or "")
        normalized = re.sub(r"\s+", " ", normalized).strip().lower()
        return [word.strip("'") for word in normalized.split() if word.strip("'")]

    def _confidence_map_from_provider_words(self, provider_words: list[dict[str, Any]]) -> dict[str, float]:
        confidences: dict[str, list[float]] = defaultdict(list)
        for item in provider_words:
            word = self._tokenize_and_normalize(str(item.get("word") or ""))
            if not word:
                continue
            raw_confidence = item.get("confidence")
            try:
                confidence = float(raw_confidence)
            except (TypeError, ValueError):
                confidence = 0.85
            confidences[word[0]].append(max(0.0, min(1.0, confidence)))

        return {
            word: sum(values) / len(values)
            for word, values in confidences.items()
            if values
        }

    def _extract_speech_timing(self, provider_words: list[dict[str, Any]]) -> dict[str, Any]:
        timed_words = []
        for item in provider_words:
            try:
                start = float(item.get("start"))
                end = float(item.get("end"))
            except (TypeError, ValueError):
                continue
            if end >= start:
                timed_words.append({"start": start, "end": end, "word": item.get("word")})
        if not timed_words:
            return {}

        timed_words.sort(key=lambda item: item["start"])
        pauses = []
        previous_end = timed_words[0]["end"]
        for item in timed_words[1:]:
            gap = item["start"] - previous_end
            if gap >= 0.75:
                pauses.append({
                    "start": round(previous_end, 2),
                    "end": round(item["start"], 2),
                    "duration": round(gap, 2),
                })
            previous_end = max(previous_end, item["end"])

        return {
            "duration_seconds": round(max(item["end"] for item in timed_words), 2),
            "long_pauses": pauses,
            "long_pause_count": len(pauses),
        }

    def _align_words(
        self,
        expected_words: list[str],
        spoken_words: list[str],
        confidence_scores: dict[str, float],
    ) -> list[WordAlignment]:
        alignment: list[WordAlignment] = []
        matcher = SequenceMatcher(None, expected_words, spoken_words, autojunk=False)

        for tag, expected_start, expected_end, spoken_start, spoken_end in matcher.get_opcodes():
            expected_slice = expected_words[expected_start:expected_end]
            spoken_slice = spoken_words[spoken_start:spoken_end]

            if tag == "equal":
                for offset, expected_word in enumerate(expected_slice):
                    spoken_word = spoken_slice[offset]
                    confidence = confidence_scores.get(spoken_word, 0.92)
                    alignment.append(
                        WordAlignment(
                            expected_word=expected_word,
                            spoken_word=spoken_word,
                            status="correct",
                            confidence=confidence,
                            feedback="Correctly pronounced.",
                            word_index=expected_start + offset,
                        )
                    )
                continue

            if tag == "replace":
                pair_count = min(len(expected_slice), len(spoken_slice))
                for offset in range(pair_count):
                    expected_word = expected_slice[offset]
                    spoken_word = spoken_slice[offset]
                    status, confidence = self._evaluate_match(
                        expected_word,
                        spoken_word,
                        confidence_scores.get(spoken_word, 0.78),
                    )
                    sound_issue = self._infer_sound_issue(expected_word, spoken_word, status)
                    alignment.append(
                        WordAlignment(
                            expected_word=expected_word,
                            spoken_word=spoken_word,
                            status=status,
                            confidence=confidence,
                            feedback=self._get_feedback(expected_word, spoken_word, status, sound_issue),
                            word_index=expected_start + offset,
                            sound_issue=sound_issue,
                            phoneme_data=self._build_phoneme_data(expected_word, spoken_word, sound_issue),
                        )
                    )

                for offset, expected_word in enumerate(expected_slice[pair_count:], start=pair_count):
                    alignment.append(
                        WordAlignment(
                            expected_word=expected_word,
                            spoken_word=None,
                            status="omitted",
                            confidence=0.0,
                            feedback=f"Skipped the word '{expected_word}'.",
                            word_index=expected_start + offset,
                            sound_issue="Skipped word",
                        )
                    )

                for offset, spoken_word in enumerate(spoken_slice[pair_count:], start=pair_count):
                    alignment.append(
                        self._extra_alignment(
                            spoken_word,
                            spoken_index=spoken_start + offset,
                            confidence=confidence_scores.get(spoken_word, 0.60),
                            previous_expected=expected_slice[-1] if expected_slice else None,
                        )
                    )
                continue

            if tag == "delete":
                for offset, expected_word in enumerate(expected_slice):
                    alignment.append(
                        WordAlignment(
                            expected_word=expected_word,
                            spoken_word=None,
                            status="omitted",
                            confidence=0.0,
                            feedback=f"Skipped the word '{expected_word}'.",
                            word_index=expected_start + offset,
                            sound_issue="Skipped word",
                        )
                    )
                continue

            if tag == "insert":
                previous_expected = expected_words[expected_start - 1] if expected_start > 0 else None
                for offset, spoken_word in enumerate(spoken_slice):
                    alignment.append(
                        self._extra_alignment(
                            spoken_word,
                            spoken_index=spoken_start + offset,
                            confidence=confidence_scores.get(spoken_word, 0.60),
                            previous_expected=previous_expected,
                        )
                    )

        return alignment

    def _extra_alignment(
        self,
        spoken_word: str,
        *,
        spoken_index: int,
        confidence: float,
        previous_expected: Optional[str],
    ) -> WordAlignment:
        repeated = bool(previous_expected and spoken_word == previous_expected)
        return WordAlignment(
            expected_word="",
            spoken_word=spoken_word,
            status="repeated" if repeated else "extra",
            confidence=confidence,
            feedback=(
                f"Repeated '{spoken_word}'."
                if repeated
                else f"Inserted extra word '{spoken_word}' not found in the passage."
            ),
            word_index=10_000 + spoken_index,
            sound_issue="Repeated word" if repeated else "Inserted word",
        )

    def _evaluate_match(self, expected_word: str, spoken_word: str, confidence: float) -> tuple[str, float]:
        if expected_word == spoken_word:
            return "correct", max(0.0, min(1.0, confidence))

        similarity = SequenceMatcher(None, expected_word, spoken_word).ratio()
        is_common_confusion = spoken_word in self.COMMON_CONFUSIONS.get(expected_word, [])

        if similarity > 0.92 and confidence >= self.MIN_CONFIDENCE_THRESHOLD:
            return "correct", min(confidence, similarity)
        if similarity >= 0.58 or is_common_confusion:
            return "mispronounced", max(0.0, min(1.0, confidence))
        return "uncertain", max(0.0, min(1.0, confidence))

    def _get_feedback(
        self,
        expected: str,
        spoken: Optional[str],
        status: str,
        sound_issue: Optional[str] = None,
    ) -> str:
        if status == "correct":
            return "Correctly pronounced."
        if status == "mispronounced":
            issue = f" Focus on the {sound_issue} sound." if sound_issue else ""
            return f"Pronounced as '{spoken}' instead of '{expected}'.{issue}"
        if status == "omitted":
            return f"Skipped the word '{expected}'."
        if status == "extra":
            return f"Inserted extra word '{spoken}'."
        if status == "repeated":
            return f"Repeated '{spoken}'."
        if status == "uncertain":
            return f"Could not clearly match '{spoken}' to '{expected}'."
        return "No feedback available."

    def _infer_sound_issue(self, expected: str, spoken: Optional[str], status: str) -> Optional[str]:
        if status not in {"mispronounced", "uncertain"} or not expected:
            return None
        spoken_value = spoken or ""

        if "th" in expected and "th" not in spoken_value:
            return "TH"
        if "v" in expected and "v" not in spoken_value:
            return "V"
        if "f" in expected and "f" not in spoken_value and "ph" not in spoken_value:
            return "F"
        if "sh" in expected and "sh" not in spoken_value:
            return "SH"
        if "ch" in expected and "ch" not in spoken_value:
            return "CH"
        if (
            (expected.startswith("j") or re.search(r"g(?=[ei])|dge", expected, re.IGNORECASE))
            and not re.search(r"j|g(?=[ei])|dge", spoken_value, re.IGNORECASE)
        ):
            return "J"
        if "st" in expected and "st" not in spoken_value:
            return "ST cluster"
        if expected.endswith(tuple("bcdfghjklmnpqrstvwxyz")) and not spoken_value.endswith(expected[-1]):
            return "Ending consonant"

        for sound, pattern in self.SOUND_PATTERNS.items():
            if pattern.search(expected) and not pattern.search(spoken_value):
                return sound
        return None

    def _build_phoneme_data(
        self,
        expected: str,
        spoken: Optional[str],
        sound_issue: Optional[str],
    ) -> dict[str, Any]:
        if not sound_issue:
            return {}
        return {
            "sound": sound_issue,
            "expected_word": expected,
            "recognized_word": spoken,
            "issue_type": "sound_substitution",
        }

    def _sentence_accuracy(self, expected_text: str, alignment: list[WordAlignment]) -> float:
        sentence_count = len([chunk for chunk in re.split(r"[.!?]+", expected_text or "") if chunk.strip()])
        if sentence_count <= 0:
            return 0.0
        error_count = sum(1 for item in alignment if item.status != "correct")
        estimated_sentence_errors = min(sentence_count, error_count)
        return round(((sentence_count - estimated_sentence_errors) / sentence_count) * 100, 2)

    def _calculate_score(
        self,
        alignment: list[WordAlignment],
        *,
        expected_text: str,
        audio_transcript: str,
        duration_seconds: Optional[float],
    ) -> PronunciationScore:
        correct_count = sum(1 for item in alignment if item.status == "correct")
        mispronounced_count = sum(1 for item in alignment if item.status == "mispronounced")
        omitted_count = sum(1 for item in alignment if item.status == "omitted")
        uncertain_count = sum(1 for item in alignment if item.status == "uncertain")
        extra_count = sum(1 for item in alignment if item.status == "extra")
        repeated_count = sum(1 for item in alignment if item.status == "repeated")
        total_expected = correct_count + mispronounced_count + omitted_count + uncertain_count

        word_accuracy = (correct_count / total_expected * 100) if total_expected else 0.0
        pronunciation_accuracy = (
            ((correct_count + (0.35 * uncertain_count)) / total_expected) * 100
            if total_expected
            else 0.0
        )
        completeness = ((total_expected - omitted_count) / total_expected * 100) if total_expected else 0.0

        expected_or_spoken_duration = float(duration_seconds or 0.0)
        spoken_count = len(self._tokenize_and_normalize(audio_transcript))
        words_per_minute = (
            (spoken_count / expected_or_spoken_duration) * 60
            if expected_or_spoken_duration > 0
            else 0.0
        )
        fluency = self._calculate_fluency_score(
            words_per_minute=words_per_minute,
            total_expected=total_expected,
            extra_count=extra_count,
            repeated_count=repeated_count,
            omitted_count=omitted_count,
        )
        confidence_values = [item.confidence for item in alignment if item.spoken_word]
        confidence_score = (
            (sum(confidence_values) / len(confidence_values)) * 100
            if confidence_values
            else 0.0
        )
        sentence_accuracy = self._sentence_accuracy(expected_text, alignment)

        if total_expected and correct_count == total_expected and not extra_count and not repeated_count:
            fluency = 100.0
            confidence_score = 100.0
        if total_expected and not spoken_count:
            fluency = 0.0

        overall = (
            pronunciation_accuracy * 0.40
            + word_accuracy * 0.20
            + completeness * 0.20
            + fluency * 0.15
            + confidence_score * 0.05
        )

        return PronunciationScore(
            total_words=total_expected,
            correct_words=correct_count,
            mispronounced_words=mispronounced_count + uncertain_count,
            omitted_words=omitted_count,
            extra_words=extra_count,
            repeated_words=repeated_count,
            pronunciation_accuracy=round(min(100.0, max(0.0, pronunciation_accuracy)), 2),
            word_accuracy=round(min(100.0, max(0.0, word_accuracy)), 2),
            sentence_accuracy=sentence_accuracy,
            fluency_score=round(min(100.0, max(0.0, fluency)), 2),
            completeness_score=round(min(100.0, max(0.0, completeness)), 2),
            confidence_score=round(min(100.0, max(0.0, confidence_score)), 2),
            overall_score=round(min(100.0, max(0.0, overall)), 2),
            words_per_minute=round(max(0.0, words_per_minute), 2),
            duration_seconds=round(max(0.0, expected_or_spoken_duration), 2),
        )

    def _calculate_fluency_score(
        self,
        *,
        words_per_minute: float,
        total_expected: int,
        extra_count: int,
        repeated_count: int,
        omitted_count: int,
    ) -> float:
        if total_expected <= 0:
            return 0.0
        if words_per_minute <= 0:
            pace_score = 80.0
        elif self.IDEAL_MIN_WPM <= words_per_minute <= self.IDEAL_MAX_WPM:
            pace_score = 100.0
        elif words_per_minute < self.IDEAL_MIN_WPM:
            pace_score = max(45.0, 100.0 - (self.IDEAL_MIN_WPM - words_per_minute) * 0.8)
        else:
            pace_score = max(45.0, 100.0 - (words_per_minute - self.IDEAL_MAX_WPM) * 0.8)

        disruption_penalty = ((extra_count + repeated_count + omitted_count) / total_expected) * 45.0
        return pace_score - disruption_penalty

    def extract_common_issues(self, alignment: list[WordAlignment]) -> dict[str, Any]:
        mispronounced = []
        omitted = []
        inserted = []
        repeated = []
        fillers = []
        sound_counts: Counter[str] = Counter()
        sound_totals: Counter[str] = Counter()

        for item in alignment:
            if (item.spoken_word or "").lower() in self.FILLER_WORDS:
                fillers.append(item.spoken_word)
            for sound, pattern in self.SOUND_PATTERNS.items():
                if item.expected_word and pattern.search(item.expected_word):
                    sound_totals[sound] += 1
            if item.status in {"mispronounced", "uncertain"}:
                mispronounced.append(
                    {
                        "expected": item.expected_word,
                        "recognized": item.spoken_word,
                        "confidence": round(float(item.confidence), 4),
                        "sound_issue": item.sound_issue,
                    }
                )
                if item.sound_issue:
                    sound_counts[item.sound_issue] += 1
            elif item.status == "omitted":
                omitted.append(item.expected_word)
            elif item.status == "extra":
                inserted.append(item.spoken_word)
            elif item.status == "repeated":
                repeated.append(item.spoken_word)

        sound_analysis = []
        for sound, issue_count in sound_counts.most_common():
            total = sound_totals.get(sound, issue_count)
            sound_analysis.append(
                {
                    "sound": sound,
                    "issue_count": issue_count,
                    "total_occurrences": total,
                    "accuracy": round(max(0.0, ((total - issue_count) / total) * 100), 2) if total else 0.0,
                }
            )

        return {
            "mispronounced_words": mispronounced,
            "omitted_words": omitted,
            "inserted_words": inserted,
            "repeated_words": repeated,
            "filler_words": fillers,
            "filler_count": len(fillers),
            "most_common_mistakes": [
                {"word": word, "count": count}
                for word, count in Counter(item["expected"] for item in mispronounced).most_common(10)
            ],
            "sound_analysis": sound_analysis,
        }

    def generate_strengths_feedback(self, alignment: list[WordAlignment], score: PronunciationScore) -> str:
        if score.overall_score < 50:
            return "Keep practicing. Focus on clear pronunciation of each word and try to complete the whole passage."
        if score.overall_score >= 85:
            prefix = "Outstanding. "
        else:
            prefix = ""
        strengths = []
        if score.pronunciation_accuracy >= 85:
            strengths.append("Pronunciation was clear across most of the passage.")
        if score.completeness_score >= 90:
            strengths.append("You covered the passage with very few skipped words.")
        if score.fluency_score >= 85:
            strengths.append("Your pacing was steady and easy to follow.")
        if score.confidence_score >= 80:
            strengths.append("Speech recognition confidence was strong, suggesting clear delivery.")
        return prefix + (" ".join(strengths) or "You completed the reading attempt and created a useful baseline for improvement.")

    def generate_improvement_feedback(
        self,
        alignment: list[WordAlignment],
        common_issues: dict[str, Any],
        score: PronunciationScore,
    ) -> str:
        suggestions = []
        if score.omitted_words:
            suggestions.append(f"Slow down and include the {score.omitted_words} skipped word(s).")
        if score.repeated_words:
            suggestions.append("Reduce repeated words by pausing briefly at punctuation marks.")
        if common_issues.get("filler_count"):
            suggestions.append("Reduce filler words by taking a silent breath before continuing.")
        if common_issues.get("long_pause_count"):
            suggestions.append("Shorten long pauses so the reading sounds more confident and continuous.")
        top_words = [item["expected"] for item in common_issues.get("mispronounced_words", [])[:4]]
        if top_words:
            suggestions.append(f"Practice these words: {', '.join(top_words)}.")
        top_sounds = [item["sound"] for item in common_issues.get("sound_analysis", [])[:3]]
        if top_sounds:
            suggestions.append(f"Focus on these sounds: {', '.join(top_sounds)}.")
        if score.words_per_minute and score.words_per_minute > self.IDEAL_MAX_WPM:
            suggestions.append("Speak slightly slower so ending consonants remain clear.")
        if score.words_per_minute and score.words_per_minute < self.IDEAL_MIN_WPM:
            suggestions.append("Build smoother pacing while keeping each word complete.")
        return " ".join(suggestions) or "Keep practicing the same passage to improve consistency and confidence."

    def generate_recommendations(self, common_issues: dict[str, Any]) -> str:
        sound_names = [item["sound"] for item in common_issues.get("sound_analysis", [])[:3]]
        if sound_names:
            return (
                f"Practice minimal-pair drills for {', '.join(sound_names)} sounds, then reread the passage "
                "while recording yourself and checking skipped or repeated words."
            )
        return "Reread the passage once for accuracy, then once for natural call-center pacing."
