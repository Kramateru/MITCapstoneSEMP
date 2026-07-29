"""
Reading Pronunciation Assessment Service
Handles speech-to-text processing, word alignment, pronunciation scoring, and feedback generation.
"""

import logging
import re
from typing import Any, Optional, List, Dict, Tuple
from dataclasses import dataclass
from difflib import SequenceMatcher
from collections import Counter

logger = logging.getLogger(__name__)


@dataclass
class WordAlignment:
    """Result of aligning expected word with spoken word."""
    expected_word: str
    spoken_word: Optional[str]
    status: str  # 'correct', 'mispronounced', 'omitted', 'extra', 'uncertain'
    confidence: float  # 0-1
    feedback: str


@dataclass
class PronunciationScore:
    """Pronunciation assessment scoring results."""
    total_words: int
    correct_words: int
    mispronounced_words: int
    omitted_words: int
    extra_words: int
    pronunciation_accuracy: float  # 0-100
    completion_rate: float  # 0-100
    overall_score: float  # 0-100


class ReadingPronunciationAnalyzer:
    """
    Analyzes pronunciation by comparing expected reading text with spoken transcript.
    Uses word alignment, confidence scoring, and phonetic analysis where available.
    """
    
    # Minimum confidence threshold for speech recognition
    MIN_CONFIDENCE_THRESHOLD = 0.50
    
    # Similar sounding words often confused
    COMMON_CONFUSIONS = {
        'the': ['a', 'ta', 'thee'],
        'that': ['dat', 'thet'],
        'customer': ['costumer', 'customer'],
        'communication': ['communcation', 'comunication'],
        'receive': ['recieve'],
    }
    
    def __init__(self):
        self.alignment_cache: Dict[str, List[WordAlignment]] = {}
    
    def analyze_pronunciation(
        self,
        expected_text: str,
        audio_transcript: str,
        confidence_scores: Optional[Dict[str, float]] = None,
    ) -> Tuple[List[WordAlignment], PronunciationScore]:
        """
        Main entry point for pronunciation analysis.
        
        Args:
            expected_text: Original reading passage
            audio_transcript: Speech-to-text output from audio
            confidence_scores: Optional per-word confidence from speech engine
        
        Returns:
            Tuple of (word alignments, pronunciation score)
        """
        # Normalize both texts
        expected_words = self._tokenize_and_normalize(expected_text)
        spoken_words = self._tokenize_and_normalize(audio_transcript)
        
        logger.info(
            f"Analyzing pronunciation: {len(expected_words)} expected words, "
            f"{len(spoken_words)} spoken words"
        )
        
        # Perform word alignment
        alignment = self._align_words(expected_words, spoken_words, confidence_scores or {})
        
        # Calculate scores
        score = self._calculate_score(alignment)
        
        return alignment, score
    
    def _tokenize_and_normalize(self, text: str) -> List[str]:
        """Tokenize text into words and normalize."""
        # Remove punctuation and convert to lowercase
        text = re.sub(r'[^\w\s]', '', text)
        words = text.lower().split()
        return [w for w in words if w]  # Remove empty strings
    
    def _align_words(
        self,
        expected_words: List[str],
        spoken_words: List[str],
        confidence_scores: Dict[str, float],
    ) -> List[WordAlignment]:
        """
        Align expected words with spoken words using sequence matching.
        Handles insertions, deletions, and substitutions.
        """
        alignment: List[WordAlignment] = []
        
        # Use SequenceMatcher for optimal alignment
        matcher = SequenceMatcher(None, expected_words, spoken_words, autojunk=False)
        
        # Track which words have been matched
        matched_expected = set()
        matched_spoken = set()
        
        # Process matching blocks first (exact or high-confidence matches)
        for block in matcher.get_matching_blocks():
            for i in range(block.size):
                exp_idx = block.a + i
                spk_idx = block.b + i
                
                expected_word = expected_words[exp_idx]
                spoken_word = spoken_words[spk_idx]
                
                # Determine if truly correct or just similar
                status, confidence = self._evaluate_match(
                    expected_word,
                    spoken_word,
                    confidence_scores.get(spoken_word, 0.8)
                )
                
                alignment.append(WordAlignment(
                    expected_word=expected_word,
                    spoken_word=spoken_word,
                    status=status,
                    confidence=confidence,
                    feedback=self._get_feedback(expected_word, spoken_word, status)
                ))
                
                matched_expected.add(exp_idx)
                matched_spoken.add(spk_idx)
        
        # Handle omitted words (expected but not spoken)
        for exp_idx, expected_word in enumerate(expected_words):
            if exp_idx not in matched_expected:
                alignment.append(WordAlignment(
                    expected_word=expected_word,
                    spoken_word=None,
                    status='omitted',
                    confidence=0.0,
                    feedback=f"Missing word: '{expected_word}' was not spoken."
                ))
                matched_expected.add(exp_idx)
        
        # Handle extra words (spoken but not expected)
        for spk_idx, spoken_word in enumerate(spoken_words):
            if spk_idx not in matched_spoken:
                alignment.append(WordAlignment(
                    expected_word='',
                    spoken_word=spoken_word,
                    status='extra',
                    confidence=confidence_scores.get(spoken_word, 0.5),
                    feedback=f"Extra word: '{spoken_word}' was spoken unexpectedly."
                ))
        
        # Sort by expected word position
        alignment.sort(
            key=lambda x: (
                expected_words.index(x.expected_word) if x.expected_word in expected_words else 999
            )
        )
        
        return alignment
    
    def _evaluate_match(
        self,
        expected_word: str,
        spoken_word: str,
        confidence: float,
    ) -> Tuple[str, float]:
        """
        Evaluate if a matched word is actually correct.
        Returns (status, confidence).
        """
        if expected_word == spoken_word:
            return ('correct', confidence)
        
        # Check similarity using string distance
        similarity = SequenceMatcher(None, expected_word, spoken_word).ratio()
        
        # Check if it's a common confusion
        is_common_confusion = expected_word in self.COMMON_CONFUSIONS and \
                              spoken_word in self.COMMON_CONFUSIONS[expected_word]
        
        if similarity > 0.85:
            # Close match - likely minor pronunciation variation
            return ('correct', min(confidence, similarity))
        elif similarity > 0.60 and confidence > self.MIN_CONFIDENCE_THRESHOLD:
            # Reasonable similarity with decent confidence
            return ('mispronounced', confidence)
        elif is_common_confusion and confidence > 0.70:
            # Known confusion with high confidence
            return ('mispronounced', confidence)
        else:
            # Uncertain - too different to confidently call correct or mispronounced
            return ('uncertain', confidence)
    
    def _get_feedback(self, expected: str, spoken: Optional[str], status: str) -> str:
        """Generate feedback for a word alignment."""
        if status == 'correct':
            return "✓ Correctly pronounced"
        elif status == 'mispronounced':
            return f"Pronounced as '{spoken}' instead of '{expected}'"
        elif status == 'omitted':
            return f"Missed the word '{expected}'"
        elif status == 'extra':
            return f"Extra word '{spoken}' not in the passage"
        elif status == 'uncertain':
            return "Could not clearly determine pronunciation"
        return "No feedback available"
    
    def _calculate_score(self, alignment: List[WordAlignment]) -> PronunciationScore:
        """Calculate overall pronunciation score."""
        correct_count = sum(1 for a in alignment if a.status == 'correct')
        mispronounced_count = sum(1 for a in alignment if a.status == 'mispronounced')
        omitted_count = sum(1 for a in alignment if a.status == 'omitted')
        extra_count = sum(1 for a in alignment if a.status == 'extra')
        uncertain_count = sum(1 for a in alignment if a.status == 'uncertain')
        
        # Total expected words (correct + mispronounced + omitted + uncertain)
        total_expected = correct_count + mispronounced_count + omitted_count + uncertain_count
        
        # Calculate accuracy: correct words / total expected words
        accuracy = (correct_count / total_expected * 100) if total_expected > 0 else 0
        
        # Calculate completion: words spoken / total expected words
        completion = ((total_expected - omitted_count) / total_expected * 100) \
                     if total_expected > 0 else 0
        
        # Overall score: weighted combination
        # 70% accuracy (correct vs total), 30% completion (no omissions)
        overall = (accuracy * 0.7) + (completion * 0.3)
        
        return PronunciationScore(
            total_words=total_expected,
            correct_words=correct_count,
            mispronounced_words=mispronounced_count,
            omitted_words=omitted_count,
            extra_words=extra_count,
            pronunciation_accuracy=min(100, max(0, accuracy)),
            completion_rate=min(100, max(0, completion)),
            overall_score=min(100, max(0, overall))
        )
    
    def extract_common_issues(self, alignment: List[WordAlignment]) -> Dict[str, Any]:
        """
        Extract most common pronunciation issues from word alignment.
        
        Returns dict with most common mistakes and sound issues.
        """
        issues = {
            'mispronounced_words': [],
            'omitted_words': [],
            'common_sounds': {}
        }
        
        # Collect mispronounced and omitted words
        for alignment_item in alignment:
            if alignment_item.status == 'mispronounced':
                issues['mispronounced_words'].append({
                    'expected': alignment_item.expected_word,
                    'spoken': alignment_item.spoken_word,
                    'confidence': float(alignment_item.confidence)
                })
            elif alignment_item.status == 'omitted':
                issues['omitted_words'].append(alignment_item.expected_word)
        
        # Get most common issues
        if issues['mispronounced_words']:
            # Group by expected word
            word_errors = Counter(
                item['expected'] for item in issues['mispronounced_words']
            )
            issues['most_common_mistakes'] = [
                {'word': word, 'count': count}
                for word, count in word_errors.most_common(5)
            ]
        
        return issues
    
    def generate_strengths_feedback(
        self,
        alignment: List[WordAlignment],
        score: PronunciationScore,
    ) -> str:
        """Generate AI-powered strengths summary."""
        if score.overall_score < 50:
            return "Keep practicing! Focus on clear pronunciation of each word."
        elif score.overall_score < 70:
            return (
                "Good effort! You correctly pronounced most of the passage. "
                "Continue practicing the challenging words."
            )
        elif score.overall_score < 85:
            return (
                "Excellent reading! Your pronunciation accuracy is strong. "
                "A few minor adjustments and you'll achieve mastery."
            )
        else:
            return (
                "Outstanding! Your pronunciation is clear and accurate. "
                "You've demonstrated strong reading and pronunciation skills."
            )
    
    def generate_improvement_feedback(
        self,
        alignment: List[WordAlignment],
        common_issues: Dict[str, Any],
        score: PronunciationScore,
    ) -> str:
        """Generate actionable improvement suggestions."""
        suggestions = []
        
        if score.omitted_words > 0:
            suggestions.append(
                f"Slow down and ensure you pronounce all {score.omitted_words} missing words."
            )
        
        if score.mispronounced_words > 0:
            mispronounced = common_issues.get('mispronounced_words', [])
            if mispronounced:
                top_words = [item['expected'] for item in mispronounced[:3]]
                words_str = ', '.join(f"'{w}'" for w in top_words)
                suggestions.append(f"Practice the pronunciation of: {words_str}")
        
        if not suggestions:
            suggestions.append("Listen to native speakers for accent refinement.")
        
        return " ".join(suggestions)
