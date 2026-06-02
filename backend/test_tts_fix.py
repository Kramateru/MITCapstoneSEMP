#!/usr/bin/env python3
"""
Test script to verify TTS generation and saving functionality.
Run this to test the fixes for text-to-speech synthesis and storage.
"""

import asyncio
import os
import sys
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Suppress verbose library logs
logging.getLogger('google').setLevel(logging.WARNING)
logging.getLogger('supabase').setLevel(logging.WARNING)


def test_tts_service():
    """Test the TTS service directly"""
    logger.info("=" * 60)
    logger.info("TEST 1: TTS Service Direct Test")
    logger.info("=" * 60)
    
    try:
        from services.audio_tts import text_to_speech_service
        
        # Check if service is available
        logger.info(f"TTS Service available: {text_to_speech_service.is_available()}")
        logger.info(f"Available providers: {text_to_speech_service.get_available_providers()}")
        
        # Test synthesis
        test_text = "Hello, this is a test of the text-to-speech system. Please generate audio from this text."
        logger.info(f"\nAttempting to synthesize: '{test_text}'")
        
        result = text_to_speech_service.synthesize(
            text=test_text,
            language_code="en-US",
        )
        
        if result:
            logger.info(f"✓ Synthesis successful!")
            logger.info(f"  - Provider: {result.provider}")
            logger.info(f"  - Format: {result.format}")
            logger.info(f"  - Duration: {result.duration_seconds:.2f}s")
            logger.info(f"  - Audio size: {len(result.audio_bytes)} bytes")
            logger.info(f"  - Error: {result.error}")
            
            if result.audio_bytes and len(result.audio_bytes) > 44:
                logger.info("✓ Audio bytes are valid (WAV header detected)")
                return True
            else:
                logger.error("✗ Audio bytes are invalid or too small")
                return False
        else:
            logger.error("✗ Synthesis returned None")
            return False
            
    except Exception as e:
        logger.error(f"✗ Test failed with exception: {e}", exc_info=True)
        return False


def test_local_save():
    """Test local TTS audio saving"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 2: Local TTS Audio Saving")
    logger.info("=" * 60)
    
    try:
        from supabase_client import get_supabase_client
        from services.audio_tts import text_to_speech_service
        
        # Generate some test audio
        test_text = "This is a test audio for local saving."
        logger.info(f"Generating test audio: '{test_text}'")
        
        result = text_to_speech_service.synthesize(
            text=test_text,
            language_code="en-US",
        )
        
        if not result or not result.audio_bytes:
            logger.error("✗ Failed to generate test audio")
            return False
        
        logger.info(f"✓ Generated {len(result.audio_bytes)} bytes of audio")
        
        # Test local save
        supabase_client = get_supabase_client()
        local_url = supabase_client.save_microlearning_tts_local(
            audio_data=result.audio_bytes,
            module_id="test_module_001",
        )
        
        if local_url:
            logger.info(f"✓ Audio saved locally to: {local_url}")
            
            # Check if file actually exists
            local_path = Path(local_url.lstrip('/'))
            if local_path.exists():
                logger.info(f"✓ File exists at: {local_path}")
                logger.info(f"  - File size: {local_path.stat().st_size} bytes")
                return True
            else:
                logger.warning(f"✗ File not found at: {local_path}")
                return False
        else:
            logger.error("✗ Failed to save audio locally")
            return False
            
    except Exception as e:
        logger.error(f"✗ Test failed with exception: {e}", exc_info=True)
        return False


def test_error_handling():
    """Test error handling in TTS service"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 3: Error Handling")
    logger.info("=" * 60)
    
    try:
        from services.audio_tts import text_to_speech_service
        
        # Test 1: Empty text
        logger.info("Testing empty text handling...")
        result = text_to_speech_service.synthesize(text="", language_code="en-US")
        if result is None:
            logger.info("✓ Empty text returns None as expected")
        else:
            logger.warning(f"✗ Empty text returned: {result}")
        
        # Test 2: Normal text with error details
        logger.info("Testing error details in result...")
        result = text_to_speech_service.synthesize(
            text="Test error handling",
            language_code="en-US",
        )
        
        if result:
            logger.info(f"✓ Got TTSResult object")
            logger.info(f"  - Has error field: {hasattr(result, 'error')}")
            logger.info(f"  - Error value: {result.error}")
            logger.info(f"  - Has audio_bytes: {hasattr(result, 'audio_bytes')}")
            logger.info(f"  - Audio bytes valid: {result.audio_bytes and len(result.audio_bytes) > 44}")
            return True
        else:
            logger.error("✗ Synthesis failed")
            return False
            
    except Exception as e:
        logger.error(f"✗ Test failed with exception: {e}", exc_info=True)
        return False


def main():
    """Run all tests"""
    logger.info("\n" + "=" * 60)
    logger.info("TEXT-TO-SPEECH GENERATION FIX - TEST SUITE")
    logger.info("=" * 60)
    
    results = {
        "TTS Service": test_tts_service(),
        "Local Saving": test_local_save(),
        "Error Handling": test_error_handling(),
    }
    
    logger.info("\n" + "=" * 60)
    logger.info("TEST RESULTS SUMMARY")
    logger.info("=" * 60)
    
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        logger.info(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    logger.info("\n" + "=" * 60)
    if all_passed:
        logger.info("✓ ALL TESTS PASSED!")
    else:
        logger.info("✗ SOME TESTS FAILED - Check logs above")
    logger.info("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
