-- Call Scenarios Schema for Trainer-authored call simulations
-- This schema adds the call_scenarios table with script_flow for trainee interactions

-- Table for call scenarios authored by trainers
CREATE TABLE IF NOT EXISTS public.call_scenarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_scenario_id text,
    trainer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text,
    topic text NOT NULL,
    description text,
    target_kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Script flow: array of objects containing step_id, suggested_csr_script, 
    -- member_response_text, and point_value
    script_flow jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Audio URLs for the scenario
    ringer_audio_url text,
    hold_audio_url text,
    -- Configuration
    difficulty text DEFAULT 'intermediate',
    estimated_duration_seconds integer DEFAULT 300,
    passing_score numeric(6,2) DEFAULT 80.0,
    -- Status
    is_published boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    -- Metadata
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.call_scenarios
ADD COLUMN IF NOT EXISTS source_scenario_id text;

ALTER TABLE public.call_scenarios
ADD COLUMN IF NOT EXISTS title text;

-- Table for trainee call simulation sessions
CREATE TABLE IF NOT EXISTS public.call_simulation_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trainee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    call_scenario_id uuid NOT NULL REFERENCES public.call_scenarios(id) ON DELETE CASCADE,
    -- Session state
    status text NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'ringing', 'in_progress', 'on_hold', 'completed', 'abandoned')
    ),
    current_step_index integer NOT NULL DEFAULT 0,
    -- Timing
    started_at timestamptz,
    ended_at timestamptz,
    total_duration_seconds integer DEFAULT 0,
    -- Transcript log: array of {step, speaker, text, timestamp}
    transcript_log jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Full conversation transcript for AI evaluation
    full_transcript text,
    -- Scores
    total_score numeric(6,2) DEFAULT 0,
    script_accuracy_score numeric(6,2) DEFAULT 0,
    grammar_score numeric(6,2) DEFAULT 0,
    pronunciation_score numeric(6,2) DEFAULT 0,
    soft_skills_score numeric(6,2) DEFAULT 0,
    pacing_score numeric(6,2) DEFAULT 0,
    -- AI Evaluation
    ai_evaluation jsonb,
    ai_feedback text,
    -- Pass/Fail
    passed boolean NOT NULL DEFAULT false,
    -- Certificate
    certificate_id uuid REFERENCES public.certificates(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Table for individual turns in a call simulation
CREATE TABLE IF NOT EXISTS public.call_simulation_turns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.call_simulation_sessions(id) ON DELETE CASCADE,
    step_index integer NOT NULL,
    step_id text NOT NULL,
    -- Who spoke: 'csr' (trainee) or 'member' (AI)
    speaker text NOT NULL CHECK (speaker IN ('csr', 'member')),
    -- The script the trainee should have said
    suggested_csr_script text,
    -- What the trainee actually said (transcribed)
    trainee_transcript text,
    -- The AI member's response
    member_response text,
    -- Point value for this step
    point_value numeric(6,2) DEFAULT 0,
    -- Timing
    turn_duration_seconds integer DEFAULT 0,
    -- Evaluation
    step_score numeric(6,2) DEFAULT 0,
    keywords_matched text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_scenarios_trainer ON public.call_scenarios (trainer_id);

CREATE INDEX IF NOT EXISTS idx_call_scenarios_published ON public.call_scenarios (is_published, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_scenarios_source_scenario_id ON public.call_scenarios (source_scenario_id);

CREATE INDEX IF NOT EXISTS idx_call_simulation_sessions_trainee ON public.call_simulation_sessions (trainee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_simulation_sessions_scenario ON public.call_simulation_sessions (
    call_scenario_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_call_simulation_turns_session ON public.call_simulation_turns (session_id, step_index);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_call_scenarios_updated_at ON public.call_scenarios;

CREATE TRIGGER trg_call_scenarios_updated_at
BEFORE UPDATE ON public.call_scenarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_call_simulation_sessions_updated_at ON public.call_simulation_sessions;

CREATE TRIGGER trg_call_simulation_sessions_updated_at
BEFORE UPDATE ON public.call_simulation_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.call_scenarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_simulation_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_simulation_turns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_scenarios
DROP POLICY IF EXISTS "call_scenarios_trainer_manage" ON public.call_scenarios;

CREATE POLICY "call_scenarios_trainer_manage" ON public.call_scenarios FOR ALL USING (
    trainer_id = auth.uid ()
    OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

DROP POLICY IF EXISTS "call_scenarios_trainee_read" ON public.call_scenarios;

CREATE POLICY "call_scenarios_trainee_read" ON public.call_scenarios FOR
SELECT USING (
        is_published = true
        AND is_active = true
    );

-- RLS Policies for call_simulation_sessions
DROP POLICY IF EXISTS "call_simulation_sessions_trainee_manage" ON public.call_simulation_sessions;

CREATE POLICY "call_simulation_sessions_trainee_manage" ON public.call_simulation_sessions FOR ALL USING (
    trainee_id = auth.uid ()
    OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE
            id = auth.uid ()
            AND role IN ('trainer', 'admin')
    )
);

-- RLS Policies for call_simulation_turns
DROP POLICY IF EXISTS "call_simulation_turns_session_access" ON public.call_simulation_turns;

CREATE POLICY "call_simulation_turns_session_access" ON public.call_simulation_turns FOR ALL USING (
    session_id IN (
        SELECT id
        FROM public.call_simulation_sessions
        WHERE
            trainee_id = auth.uid ()
            OR EXISTS (
                SELECT 1
                FROM public.profiles
                WHERE
                    id = auth.uid ()
                    AND role IN ('trainer', 'admin')
            )
    )
);

-- Comments for documentation
COMMENT ON
TABLE public.call_scenarios IS 'Trainer-authored call scenarios with script flow for trainee interactions';

COMMENT ON COLUMN public.call_scenarios.source_scenario_id IS 'Optional source scenario identifier from the platform database for Supabase score sync.';

COMMENT ON COLUMN public.call_scenarios.title IS 'Human-readable scenario title shown in the trainee dialer.';

COMMENT ON
TABLE public.call_simulation_sessions IS 'Trainee call simulation sessions tracking state and scores';

COMMENT ON
TABLE public.call_simulation_turns IS 'Individual turns in a call simulation session';

COMMENT ON COLUMN public.call_scenarios.script_flow IS 'Array of objects: {step_id, suggested_csr_script, member_response_text, point_value, expected_keywords?}';
