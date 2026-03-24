# System Optimization Notes

This file summarizes the current product structure and the intended module boundaries for the active platform.

## Role-Based Navigation Model

### Admin

- Command Center
- Overview
- Configuration
- Simulation Architect
- Scenario Flow
- Tree Builder
- Assessment
- TESDA
- Certification
- MCQ Manager
- Users & Access
- LOB Management
- Coaching
- Performance Hub
- System Governance

### Trainer

- Command Center
- Overview
- Scenario Authoring
- Workspace
- Simulation Lab
- Trainee Access
- Courses & Assessment
- Assign Content
- Coaching Hub
- Coaching Logs
- Grading
- MCQ Manager
- Live Analytics
- Reports
- Performance Hub

### Trainee

- Dashboard
- Overview
- Training Hub
- MCQ Assessment
- Sim Floor
- Microlearning
- My Coaching
- Performance Hub
- Assessments
- Certification
- Settings

## Optimization Direction

### 1. Keep the root README canonical

All setup, testing, and architecture summaries should point back to `README.md` instead of duplicating the same information in several files.

### 2. Keep role features data-driven

LOBs, MCQ categories, questions, user access, assignments, and scenario content should remain database-backed so the UI behaves consistently after refresh and across roles.

### 3. Separate operational docs from feature docs

- Setup and startup details belong in `README.md`, `QUICKSTART.md`, and backend setup docs.
- Feature behavior belongs in `AUDIO_PROCESSING.md` and `PRONUNCIATION_ASSESSMENT.md`.
- Release and readiness checks belong in `IMPLEMENTATION_CHECKLIST.md`.

### 4. Preserve one default speech path

The upload-based trainee assessment route should stay the primary documented speech workflow. Azure WebSocket behavior should be documented as secondary or experimental unless the product switches back to realtime speech as the default.

## Immediate Improvement Targets

- Remove stale references to the older speech-demo-only app
- Keep Supabase setup docs aligned with the active route set
- Keep local bootstrap-user behavior clearly marked as development-only
- Keep frontend role navigation docs aligned with the actual sidebar definitions
