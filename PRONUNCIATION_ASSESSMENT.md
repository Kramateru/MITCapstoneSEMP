# Pronunciation And Speech Assessment

This project currently evaluates trainee speech as part of the broader BPO training workflow. The assessment output is designed for coaching, grading, and practice review rather than a single raw pronunciation number.

## Assessment Inputs

Each attempt is scored against one of these inputs:

- A scenario-derived gold-standard script
- A manually provided reference text

The backend normalizes the text, compares the attempt against expected wording, and applies speech-quality heuristics to produce structured feedback.

## Current Output Model

The active response includes:

- `transcription`
- `transcription_confidence`
- `overall_score`
- `scores.phonetic_accuracy`
- `scores.fluency`
- `scores.grammar_precision`
- `scores.keyword_adherence`
- `word_feedback`
- `detected_errors`
- `detected_disfluencies`
- `coaching_tips`

## How To Read The Scores

### Overall score

A blended indicator for training readiness on the specific script or scenario.

### Phonetic accuracy

How closely spoken words match the expected wording and pronunciation patterns.

### Fluency

How naturally and continuously the trainee speaks, including pacing and hesitation handling.

### Grammar precision

How well the spoken response preserves professional language quality and sentence structure.

### Keyword adherence

How well the response includes the important scenario terms or resolution language.

## Word Feedback

Word-level feedback is returned when the service can align the transcript against the reference script. Each item may include:

- the spoken word
- the expected word
- an accuracy score
- an error type
- a color hint for UI display
- optional timing metadata

## Disfluency Detection

The service also tracks conversational problems that matter in a BPO setting, including:

- filler words
- repeated words
- stutters
- hesitation counts

These signals help trainers coach for professionalism, clarity, and call control.

## Live Provider Versus Fallback

When a live ASR provider is configured, the assessment has stronger transcript quality and richer provider metadata. When no live ASR provider is available, the platform can still return a usable fallback result so the workflow does not block.

## Azure In This Repository

Azure Speech support still exists in `backend/main.py`, but the active trainee route currently uses the upload-based speech assessment service in `backend/services/speech_assessment.py`. Keep that distinction in mind when testing or documenting results.
