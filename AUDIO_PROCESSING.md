# Audio Processing

This document describes the current audio workflow used by the active platform.

## Active Assessment Path

The main trainee flow is not a raw WebSocket stream. It is a browser recording and upload workflow:

1. The frontend captures microphone input with `MediaRecorder`.
2. The trainee stops recording.
3. The frontend uploads the file to `POST /api/trainee/asr/assess`.
4. The backend transcribes and scores the response.
5. The backend saves the practice session to the database.
6. Trainer and trainee pages fetch the saved results.

## Frontend Responsibilities

The recording workflow lives in `frontend/hooks/useAudioCapture.ts`.

Key tasks:

- Request microphone permission
- Record audio with `MediaRecorder`
- Track recording size and audio level
- Package `scenario_id` or `reference_text`
- Submit the audio file to the backend
- Return transcript, scores, and coaching feedback to the UI

## Backend Responsibilities

The assessment route lives in `backend/routes/trainee_routes.py`.

Key tasks:

- Accept multipart form uploads
- Validate `scenario_id` or `reference_text`
- Build the gold-standard script for comparison
- Call the speech assessment service
- Save a `PracticeSession`
- Broadcast live training updates

The scoring service lives in `backend/services/speech_assessment.py`.

## Provider Selection

The current provider order is:

1. OpenAI transcription, when `OPENAI_API_KEY` is configured
2. Heuristic fallback scoring when no live ASR provider is available

That means the app still works in local development even without a live ASR key, but the transcript quality and metadata will be limited.

## What Gets Scored

The service produces:

- Transcript
- Transcription confidence
- Overall score
- Phonetic accuracy
- Fluency
- Grammar precision
- Keyword adherence
- Word-level feedback
- Detected disfluencies
- Coaching tips

## Practice Session Persistence

When a valid scenario-backed assessment is submitted, the backend stores:

- User ID
- Scenario ID
- Transcript
- Score components
- Attempt number
- Status such as `completed` or `needs_review`
- Raw assessment payload in `assessment_data`

This is what powers trainer review, reporting, performance pages, and completion tracking.

## Legacy Azure WebSocket Path

`backend/main.py` still exposes `/ws/speech` and Azure pronunciation-assessment helpers. Treat that path as a direct speech integration endpoint for experiments, debugging, or future realtime work. It is not the primary flow used by the current trainee practice pages.

## Operational Notes

- Use Chrome or Edge for the most reliable recording behavior.
- Keep recordings clear and reasonably short.
- Make sure the trainee submits against a valid scenario or reference script.
- If you want live transcription, configure `OPENAI_API_KEY`.

## Quick Troubleshooting

### No recording starts

- Browser microphone permission is blocked
- No microphone is available
- The page is not running in a supported browser

### Recording uploads but scores look generic

- No live ASR provider is configured
- The service used heuristic fallback scoring

### Submission fails

- Token missing or expired
- Empty file upload
- Missing `scenario_id` and `reference_text`
- Invalid scenario
