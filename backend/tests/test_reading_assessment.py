"""
Unit Tests for Reading Pronunciation Assessment
Tests the core word alignment and scoring algorithms.
"""

import unittest
from backend.services.reading_assessment import (
    ReadingPronunciationAnalyzer,
    WordAlignment,
    PronunciationScore,
)


class TestReadingPronunciationAnalyzer(unittest.TestCase):
    """Test cases for pronunciation assessment algorithm."""
    
    def setUp(self):
        """Initialize analyzer for each test."""
        self.analyzer = ReadingPronunciationAnalyzer()
    
    def test_perfect_pronunciation(self):
        """Test when trainee reads passage perfectly."""
        expected = "Thank you for calling our customer service department."
        spoken = "Thank you for calling our customer service department."
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        self.assertEqual(score.correct_words, 8)
        self.assertEqual(score.mispronounced_words, 0)
        self.assertEqual(score.omitted_words, 0)
        self.assertEqual(score.pronunciation_accuracy, 100.0)
        self.assertTrue(score.overall_score > 95)
    
    def test_mispronounced_words(self):
        """Test when some words are mispronounced."""
        expected = "customer service"
        spoken = "costumer service"  # 'customer' mispronounced as 'costumer'
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # Should detect mispronunciation
        self.assertEqual(score.total_words, 2)
        self.assertGreater(score.mispronounced_words, 0)
    
    def test_omitted_words(self):
        """Test when trainee skips words."""
        expected = "Thank you for calling"
        spoken = "Thank you calling"  # Missing 'for'
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        self.assertEqual(score.omitted_words, 1)
        self.assertLess(score.pronunciation_accuracy, 100)
    
    def test_extra_words(self):
        """Test when trainee adds extra words."""
        expected = "Thank you"
        spoken = "Well thank you very much"  # Added 'well', 'very', 'much'
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # Should detect extra words
        self.assertEqual(score.extra_words, 3)
    
    def test_mixed_errors(self):
        """Test with combination of correct, wrong, omitted, and extra."""
        expected = "The quick brown fox"  # 4 words
        spoken = "The quik brown fox jumps"  # 'quik' instead of 'quick', extra 'jumps'
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        self.assertEqual(score.total_words, 4)
        self.assertGreater(score.correct_words, 0)
        self.assertGreater(score.mispronounced_words, 0)
        self.assertEqual(score.extra_words, 1)
    
    def test_long_passage(self):
        """Test with longer, realistic passage."""
        expected = (
            "Providing excellent customer service requires patience clear communication "
            "empathy and active listening. We must always prioritize the customer's needs "
            "and work towards resolving their issues promptly and professionally."
        )
        
        spoken = (
            "Providing excellent customer service requires patience clear communication "
            "empathy and active listening. We must always prioritize the customer's needs "
            "and work towards resolving their issues promptly and professionally."
        )
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # Should achieve high score on perfect match
        self.assertGreater(score.overall_score, 95)
        self.assertEqual(score.mispronounced_words, 0)
    
    def test_word_tokenization(self):
        """Test word tokenization and normalization."""
        text = "Thank you, for calling! Our service?"
        words = self.analyzer._tokenize_and_normalize(text)
        
        # Should remove punctuation and lowercase
        expected = ["thank", "you", "for", "calling", "our", "service"]
        self.assertEqual(words, expected)
    
    def test_common_confusion_detection(self):
        """Test detection of commonly confused words."""
        expected = "receive"
        spoken = "recieve"  # Common misspelling/mispronunciation
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # May be detected as mispronounced or uncertain depending on implementation
        self.assertGreater(score.mispronounced_words + len([a for a in alignment if a.status == 'uncertain']), 0)
    
    def test_empty_transcript(self):
        """Test behavior with empty transcript."""
        expected = "Test passage"
        spoken = ""
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # All words should be marked as omitted
        self.assertEqual(score.omitted_words, 2)
        self.assertEqual(score.overall_score, 0)
    
    def test_confidence_scoring(self):
        """Test confidence-based word matching."""
        expected = "customer"
        spoken = "costumer"
        
        # With low confidence
        confidence_scores = {"costumer": 0.4}
        alignment, score = self.analyzer.analyze_pronunciation(
            expected, spoken, confidence_scores
        )
        
        # May still mark as uncertain or mispronounced
        alignment_item = alignment[0]
        self.assertIn(alignment_item.status, ['mispronounced', 'uncertain'])
    
    def test_common_issues_extraction(self):
        """Test extraction of most common pronunciation issues."""
        expected = "customer customer communication technology technology technology"
        spoken = "costumer costumer comunication tecnology tecnology tecnology"
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        common_issues = self.analyzer.extract_common_issues(alignment)
        
        # Should identify most common mistakes
        self.assertIn('mispronounced_words', common_issues)
        self.assertGreater(len(common_issues.get('mispronounced_words', [])), 0)
    
    def test_strengths_feedback_excellent(self):
        """Test feedback generation for excellent score."""
        expected = "Thank you"
        spoken = "Thank you"
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        strengths = self.analyzer.generate_strengths_feedback(alignment, score)
        
        self.assertIn("Outstanding", strengths)
    
    def test_strengths_feedback_poor(self):
        """Test feedback generation for poor score."""
        expected = "Thank you for calling"
        spoken = ""  # No speech
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        strengths = self.analyzer.generate_strengths_feedback(alignment, score)
        
        self.assertIn("Keep practicing", strengths)
    
    def test_improvement_feedback_specificity(self):
        """Test that improvement feedback is specific and actionable."""
        expected = "customer communication technology"
        spoken = "costumer comunication"  # Mispronounced 2, missing 1
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        common_issues = self.analyzer.extract_common_issues(alignment)
        improvement = self.analyzer.generate_improvement_feedback(
            alignment, common_issues, score
        )
        
        # Should mention specific words or patterns, not generic advice
        self.assertTrue(len(improvement) > 0)
        # Should suggest practicing specific words
        self.assertIn("customer", improvement.lower())
    
    def test_case_insensitivity(self):
        """Test that algorithm is case-insensitive."""
        expected = "THANK YOU"
        spoken = "thank you"
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        self.assertEqual(score.correct_words, 2)
        self.assertEqual(score.pronunciation_accuracy, 100.0)
    
    def test_punctuation_removal(self):
        """Test that punctuation is ignored."""
        expected = "Thank you, sir!"
        spoken = "Thank you sir"
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # Should match even with different punctuation
        self.assertEqual(score.correct_words, 3)
        self.assertEqual(score.omitted_words, 0)
    
    def test_multiple_spaces(self):
        """Test handling of multiple spaces between words."""
        expected = "Thank    you"
        spoken = "Thank you"
        
        alignment, score = self.analyzer.analyze_pronunciation(expected, spoken)
        
        # Should handle multiple spaces correctly
        self.assertEqual(score.correct_words, 2)


class TestPronunciationScore(unittest.TestCase):
    """Test pronunciation score calculation."""
    
    def test_score_calculation_perfect(self):
        """Test perfect score calculation."""
        analyzer = ReadingPronunciationAnalyzer()
        
        expected = "test"
        spoken = "test"
        
        alignment, score = analyzer.analyze_pronunciation(expected, spoken)
        
        self.assertEqual(score.overall_score, 100.0)
    
    def test_score_calculation_partial(self):
        """Test partial score calculation."""
        analyzer = ReadingPronunciationAnalyzer()
        
        expected = "one two three four five"  # 5 words
        spoken = "one two three"  # 3 correct, 2 omitted
        
        alignment, score = analyzer.analyze_pronunciation(expected, spoken)
        
        # Score should be: 3/5 = 60% * 0.7 + 3/5 = 60% * 0.3 = 60%
        self.assertGreater(score.overall_score, 50)
        self.assertLess(score.overall_score, 70)
    
    def test_score_bounds(self):
        """Test that score stays within 0-100."""
        analyzer = ReadingPronunciationAnalyzer()
        
        # Test various scenarios
        test_cases = [
            ("", ""),  # Both empty
            ("test", ""),  # All omitted
            ("", "test"),  # All extra
            ("a b c d e", "a b c d e f g h"),  # Many extras
        ]
        
        for expected, spoken in test_cases:
            if expected or spoken:  # Skip if both empty
                alignment, score = analyzer.analyze_pronunciation(expected, spoken)
                self.assertGreaterEqual(score.overall_score, 0)
                self.assertLessEqual(score.overall_score, 100)


if __name__ == '__main__':
    unittest.main()
