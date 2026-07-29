-- Reading & Pronunciation Assessment Module Schema
-- Enables Trainees to read passages aloud and receive AI-powered pronunciation feedback

-- Table: reading_attempt
-- Stores each trainee's reading assessment attempt
CREATE TABLE IF NOT EXISTS reading_attempt (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  module_id TEXT NOT NULL REFERENCES microlearning_module(id) ON DELETE CASCADE,
  trainee_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,

-- Audio recording
audio_storage_path TEXT, -- e.g., "reading-assessments/{module_id}/{trainee_id}/{attempt_id}.webm"
audio_url TEXT, -- Public URL or signed URL to the audio
audio_duration_seconds DECIMAL, -- Duration of the recording

-- Transcript & text
audio_transcript TEXT, -- Raw speech-to-text output
expected_text TEXT NOT NULL, -- Original reading passage (denormalized for easy access)

-- Analysis results
total_words INTEGER, -- Total words in expected text
correct_words INTEGER DEFAULT 0,
mispronounced_words INTEGER DEFAULT 0,
omitted_words INTEGER DEFAULT 0,
extra_words INTEGER DEFAULT 0,

-- Scoring
pronunciation_score DECIMAL DEFAULT 0, -- 0-100 percentage
passing_score DECIMAL NOT NULL, -- Trainer's passing requirement
"status" TEXT DEFAULT 'in_progress' CHECK (
    "status" IN (
        'in_progress',
        'processing',
        'completed',
        'passed',
        'failed',
        'error'
    )
),

-- Feedback
strengths TEXT, -- AI-generated strengths summary
improvement_areas TEXT, -- AI-generated improvement suggestions
most_common_issues TEXT, -- JSON array of most mispronounced words/sounds

-- Timestamps
started_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_reading_attempt_module ON reading_attempt (module_id);

CREATE INDEX idx_reading_attempt_trainee ON reading_attempt (trainee_id);

CREATE INDEX idx_reading_attempt_status ON reading_attempt ("status");

CREATE UNIQUE INDEX uq_reading_attempt_sequence ON reading_attempt (
    module_id,
    trainee_id,
    attempt_number
);

-- Table: reading_word_analysis
-- Word-by-word analysis for each attempt
CREATE TABLE IF NOT EXISTS reading_word_analysis (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id TEXT NOT NULL REFERENCES reading_attempt(id) ON DELETE CASCADE,

-- Word position
word_index INTEGER NOT NULL, expected_word TEXT NOT NULL,

-- What was actually spoken
spoken_word TEXT,

-- Analysis result
"status" TEXT NOT NULL CHECK (
    "status" IN (
        'correct',
        'mispronounced',
        'omitted',
        'extra',
        'uncertain'
    )
),
confidence DECIMAL, -- 0-1 confidence score from speech engine

-- Phoneme/sound analysis (if available from speech service)
phoneme_data JSONB DEFAULT '{}',

-- Feedback specific to this word
feedback TEXT, created_at TIMESTAMP DEFAULT now() );

CREATE INDEX idx_reading_word_analysis_attempt ON reading_word_analysis (attempt_id);

CREATE INDEX idx_reading_word_analysis_status ON reading_word_analysis ("status");

-- Table: reading_pronunciation_issue
-- Aggregated pronunciation challenges across attempts
CREATE TABLE IF NOT EXISTS reading_pronunciation_issue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id TEXT NOT NULL REFERENCES reading_attempt(id) ON DELETE CASCADE,

-- Issue tracking
issue_type TEXT NOT NULL CHECK (
    issue_type IN ('word', 'sound', 'phoneme')
),
issue_text TEXT NOT NULL, -- The word or sound that was problematic

-- Frequency
occurrence_count INTEGER DEFAULT 1,

-- Additional data
examples JSONB DEFAULT '[]',  -- Array of example contexts where error occurred
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_reading_pronunciation_issue_attempt ON reading_pronunciation_issue (attempt_id);

CREATE INDEX idx_reading_pronunciation_issue_type ON reading_pronunciation_issue (issue_type);

-- Add reading_content to microlearning_module (for reading module specific data)
-- Note: May already exist as part of content_data JSONB; this documents the structure
-- The reading module should store in content_data or as dedicated columns:
-- - reading_content: The full passage text
-- - estimated_reading_time_minutes: Auto-calculated based on word count
-- - instructions: Optional reading instructions
-- - difficulty: Difficulty level of the passage

-- Table: reading_module_config (Optional - for reading-specific settings)
CREATE TABLE IF NOT EXISTS reading_module_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  module_id TEXT NOT NULL UNIQUE REFERENCES microlearning_module(id) ON DELETE CASCADE,

-- Reading passage
reading_content TEXT NOT NULL,
word_count INTEGER NOT NULL,
estimated_reading_time_minutes INTEGER,

-- Instructions
instructions TEXT,

-- Assessment settings
max_attempts INTEGER DEFAULT 3,
time_limit_seconds INTEGER, -- Optional: max recording time

-- Pronunciation settings
pronunciation_standard TEXT DEFAULT 'en-US', -- Language/accent standard

-- Difficulty
difficulty TEXT DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_reading_module_config_module ON reading_module_config (module_id);

-- Add RLS policies for security

-- Enable RLS on reading_attempt
ALTER TABLE reading_attempt ENABLE ROW LEVEL SECURITY;

-- Trainees can view only their own attempts
CREATE POLICY trainee_read_own_attempts ON reading_attempt
  FOR SELECT USING (trainee_id = auth.uid()::text);

-- Trainers can view attempts for their assigned trainees
CREATE POLICY trainer_read_trainee_attempts ON reading_attempt
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM microlearning_module m
      WHERE m.id = reading_attempt.module_id
        AND m.created_by = auth.uid()::text
    )
  );

-- Trainees can create attempts
CREATE POLICY trainee_create_attempts ON reading_attempt
  FOR INSERT WITH CHECK (trainee_id = auth.uid()::text);

-- Trainees can update their own in-progress attempts
CREATE POLICY trainee_update_own_attempts ON reading_attempt
  FOR UPDATE USING (trainee_id = auth.uid()::text)
  WITH CHECK (trainee_id = auth.uid()::text);

-- Enable RLS on reading_word_analysis
ALTER TABLE reading_word_analysis ENABLE ROW LEVEL SECURITY;

-- Users can view word analysis for attempts they own or created
CREATE POLICY view_word_analysis ON reading_word_analysis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reading_attempt ra
      WHERE ra.id = reading_word_analysis.attempt_id
        AND (ra.trainee_id = auth.uid()::text OR
             EXISTS (SELECT 1 FROM microlearning_module m 
                     WHERE m.id = ra.module_id AND m.created_by = auth.uid()::text))
    )
  );

-- Enable RLS on reading_pronunciation_issue
ALTER TABLE reading_pronunciation_issue ENABLE ROW LEVEL SECURITY;

CREATE POLICY view_pronunciation_issues ON reading_pronunciation_issue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reading_attempt ra
      WHERE ra.id = reading_pronunciation_issue.attempt_id
        AND (ra.trainee_id = auth.uid()::text OR
             EXISTS (SELECT 1 FROM microlearning_module m 
                     WHERE m.id = ra.module_id AND m.created_by = auth.uid()::text))
    )
  );

-- Comments for documentation
COMMENT ON
TABLE reading_attempt IS 'Stores each trainee reading assessment attempt with scoring and feedback';

COMMENT ON
TABLE reading_word_analysis IS 'Word-by-word analysis showing correct/incorrect words, mispronunciations, omissions';

COMMENT ON
TABLE reading_pronunciation_issue IS 'Aggregated pronunciation challenges and common errors';

COMMENT ON
TABLE reading_module_config IS 'Reading-specific configuration for modules (passage text, word count, time limits)';