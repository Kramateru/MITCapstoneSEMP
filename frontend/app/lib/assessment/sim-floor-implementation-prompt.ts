export const SIM_FLOOR_IMPLEMENTATION_PROMPT = `Develop a full-stack Sim Floor mock-call module inside the current codebase and align it to the existing trainer, trainee, KPI, analytics, coaching, reporting, and certificate flows.

Current stack and boundaries:
- Frontend: Next.js, React, Tailwind CSS.
- Backend: FastAPI, SQLAlchemy.
- Database/Auth/Storage/Realtime: Supabase.
- ASR provider: Google Cloud Speech-to-Text API.
- Browser recording: MediaRecorder.
- Existing trainer and trainee modules already exist. Extend them. Do not rebuild the platform from scratch.

Primary goal:
Build a production-ready Sim Floor experience for the trainee role where the trainee acts as the CSR, speaks through the mic one turn at a time, waits for the Member actor response between turns, and completes a full mock call that is recorded, transcribed, scored, coached, reported, and stored in Supabase end to end.

Non-negotiable business rules:
- Everything for Sim Floor must be connected to Supabase for create, update, upload, fetch, reporting, and playback workflows.
- Supabase is the source of truth for scenario records, KPI configuration references, session logs, trainer verdicts, coaching notes, reports, certificate linkage, and recording storage metadata.
- Every trainee Sim Floor activity must be recorded.
- Every CSR audio turn must be replayable by the trainer for coaching.
- All trainee logs must be visible to both trainer and trainee, including how many times the trainee attempted a specific scenario.
- If a trainee is marked competent, the result must also appear in certificate navigation and reports.
- All certificates must be included in trainee reports, and if the trainer views a per-trainee report, certificates must also be included there.

Scenario authoring requirements for trainer:
- Trainer can create Sim Floor scenarios manually.
- Trainer can modify existing Sim Floor scenarios.
- Trainer can upload and bulk upload scenarios.
- Trainer can publish and assign scenarios.
- A scenario is made of ordered turn-by-turn steps derived from uploaded or manually authored rows.
- Use the upload format with columns: Actor, Script, Score, and optional Branching Logic.
- Actor alternates between CSR and Member.
- CSR rows are trainee response turns that should be recorded and scored.
- Member rows are actor turns that should display the script and optionally play uploaded audio.
- Store scenario title, description, opening spiel target, expected keywords, KPI mapping, member profile, and optional NICE CXone or MAX style metadata.
- Allow ringtone audio, hold music audio, and per-member-turn uploaded audio assets.
- Scenario data, uploaded files, and metadata must be stored through Supabase-compatible persistence.

Trainer workflow requirements:
- Trainer has a Sim Floor scenario creation, modification, and upload workspace.
- Trainer can configure KPI scoring rules that the trainee result will use after the mock call.
- KPI configuration must align with the trainer module KPI configuration and support metrics such as opening spiel, verification, empathy, accuracy, closing, AHT, pacing, dead air, rate of speech, pronunciation, grammar, and keyword adherence.
- Trainer can review every attempt for a selected scenario and trainee.
- Trainer can replay recorded CSR audio turns and listen to the full saved session.
- Trainer can read transcript timeline, per-turn logs, and score breakdown.
- Trainer can add coaching notes.
- Trainer can submit a competency verdict using the exact business language Competent or Not Competent.
- Trainer can force a retake. A retake keeps the selected scenario open until the trainer eventually marks the trainee as Competent.
- Trainer analytics and reports must include Sim Floor performance, retake counts, competency outcomes, and certificate issuance visibility.

Trainee workflow requirements:
- Trainee sees assigned or available Sim Floor scenarios in a scenario dashboard.
- Trainee selects a scenario and enters a pre-call state with status, incoming call cue, and start simulation action.
- Trainee must click the mic icon to start the selected scenario in Sim Floor.
- The trainee begins by speaking the opening spiel as the CSR.
- After the trainee finishes that CSR turn, the system must pause CSR input and wait.
- The Member actor then speaks the next script from the scenario uploaded or created in Sim Floor.
- While the Member is speaking, the UI must show the Member script clearly and the CSR mic must be disabled.
- After the Member turn ends, the trainee must click the mic icon again to continue the mock call.
- This ping-pong flow continues until the final scenario step.
- The trainee should clearly see when CSR is speaking versus when Member is speaking.
- The UI should include call timer, scenario title, mic controls, mute, hold, hang-up, waveform or listening indicator, member CRM card, and script assistant.
- If the trainee speaks too differently from the expected scripted CSR line, the system must save that attempt, keep the same CSR step active, and respond with: Repeat, I can't understand what you're saying.

Required ping-pong turn logic:
1. Trainee clicks the mic icon for a CSR turn.
2. Browser records audio for that CSR turn.
3. Google Cloud Speech-to-Text transcribes the CSR response.
4. The CSR turn recording is uploaded and linked to the active attempt.
5. Transcript, timing, keywords, and turn scoring are saved.
5a. Even failed or retry CSR turns must still be stored so the trainer can replay and coach them later.
6. CSR input pauses automatically.
7. The system switches to Member-speaking mode.
8. The Member script is shown on screen.
9. If uploaded actor audio exists, play it; otherwise use TTS as fallback.
10. When the Member turn finishes, return control to the trainee.
11. Trainee clicks the mic icon again for the next CSR turn.
12. Continue until the scenario ends.

Post-call behavior:
- As soon as the trainee finishes the mock call, automatically display insight about the trainee's performance aligned with the KPI configuration defined by the trainer.
- Show a post-call scorecard with overall score, KPI breakdown, transcript insight, ASR quality indicators, and actionable feedback.
- Hanging up must save the full mock-call recording first, then finalize the session and display the post-call insight.
- Persist the completed session so trainers can coach and evaluate later.
- The final trainee result must feed trainee performance result views, trainer analytics, and trainer reports.

Competency, coaching, and retake rules:
- After the trainee finishes, trainers can coach the agent and submit whether the trainee is Competent or Not Competent for the selected Sim Floor scenario.
- Trainer coaching must support notes, verdict timestamp, evaluator identity, and replay of the recording being coached.
- Trainer can click retake so the trainee can retake the selected mock-call scenario until the trainer gives a Competent verdict.
- Keep full attempt history. Do not overwrite old attempts.
- Store all retakes, verdicts, coaching notes, and timestamps in Supabase.

Reporting and certificate requirements:
- All Sim Floor performance must appear in the trainee performance result area.
- All Sim Floor performance must also feed trainer analytics and reports.
- Trainer reports should support viewing results per trainee, including scenario attempts, retake count, competency result, coaching history, and linked certificates.
- If the trainee gets a Competent grade or remarks, the certificate must appear in the trainee certificate navigation.
- Certificates issued from Sim Floor competency must also appear in trainee reports.
- If a trainer selects a per-trainee report, Sim Floor certificates must be included there as well.

Required persistence model:
- Store all scenario, session, coaching, analytics, and certificate linkage data in Supabase-compatible tables.
- Save every attempt with:
  - attempt_id
  - trainee_id
  - scenario_id
  - batch_id if applicable
  - full transcript
  - transcript timeline
  - per-turn logs
  - per-turn audio path
  - consolidated session recording metadata
  - score summary
  - KPI breakdown
  - trainer verdict
  - competency state
  - retake flag
  - attempt number
  - created_at, started_at, completed_at, updated_at
- Use a recording storage path convention like recordings/{trainee_id}/{scenario_id}/{attempt_id}/{timestamp}.webm.
- Ensure trainers can securely replay recordings from Supabase Storage.

Required technical implementation details:
- Create or extend a reusable useSpeechToText hook for Google Cloud Speech-to-Text integration.
- Use a clear state machine with at least:
  - idle
  - ringing
  - connected
  - member-speaking
  - csr-speaking
  - processing
  - completed
- Use Supabase Realtime so trainer verdict changes, retake requirements, and certificate availability can update the trainee UI without a full refresh.
- Add secure Supabase Storage policies for recordings and scenario audio assets.
- Keep code maintainable and extend existing trainer and trainee routes, pages, and Supabase helpers instead of duplicating architecture.

Scoring requirements:
- Start with keyword match and fuzzy match based scoring for CSR turns.
- Example:
  - keyword_match_percent = matched_keywords / target_keywords * 100
- Also compute and persist:
  - opening spiel compliance
  - verification compliance
  - empathy
  - accuracy
  - closing compliance
  - AHT
  - pacing
  - rate of speech
  - dead air
  - pronunciation
  - grammar
  - ASR confidence or speech-to-text accuracy
  - sentiment placeholder or future Google Natural Language integration point

Required deliverables:
- Backend API updates for scenario create, edit, publish, assign, bulk upload, session start, per-turn submission, session finalize, trainer coaching, trainer verdict, retake handling, analytics rollups, and certificate issuance.
- Frontend trainer pages for scenario authoring, modification, upload, assignment, review, coaching, and verdict submission.
- Frontend trainee pages for scenario selection, ping-pong mock-call handling, live transcript, turn-by-turn recording, post-call insights, and attempt history.
- Supabase SQL schema updates and storage policies.
- Google ASR integration hook and upload flow.
- KPI scoring and post-call insight logic.
- Report and certificate integration across trainee and trainer views.

Acceptance criteria:
- Trainer can create, modify, upload, publish, and assign Sim Floor scenarios.
- Trainee starts a selected scenario by clicking the mic icon for the CSR turn.
- After the opening spiel or any CSR turn, the system pauses and waits for the Member actor response before allowing the next CSR turn.
- Member speaking state is visible, script is shown, and CSR mic is disabled during Member playback.
- Every CSR turn is recorded, uploaded, saved, and replayable by the trainer.
- Every attempt and retake is stored in Supabase and visible in trainee and trainer history.
- Post-call KPI insights display automatically after the trainee completes the mock call.
- Trainer can coach, mark Competent or Not Competent, and require retakes until competency is achieved.
- Sim Floor performance appears in trainee performance results, trainer analytics, trainer reports, and per-trainee reports.
- Competent outcomes create or expose certificates in certificate navigation and trainee reporting.`

export function getSimFloorImplementationPrompt() {
  return SIM_FLOOR_IMPLEMENTATION_PROMPT
}
