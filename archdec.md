# Architectural Decisions

Project: Speech-Enabled BPO Platform  
Date: 2026-08-09  
Status: Current system architecture analysis

## System Context

The system is a speech-enabled BPO training platform for admins, trainers, and trainees. It combines microlearning, MCQ and assessment workflows, call simulation, coaching, certification, analytics, audit logs, profile/media management, and realtime learning signals.

The implemented architecture is a two-application web system:

- `frontend/`: Next.js App Router application with React role workspaces.
- `backend/`: FastAPI application with SQLAlchemy models, service modules, and route modules.
- `supabase/`: SQL schemas, RLS policies, storage bucket setup, and realtime publication setup.
- `media/` and `backend/media/`: local development media fallback and generated audio artifacts.
- `model/`: bundled Vosk speech model assets for local/offline speech-related experimentation.
- Render deployment files: `render.yaml`, `dockerfile`, `scripts/start-backend.sh`, and `scripts/start-frontend.sh`.

## Architectural Drivers

- Support three user roles with different workflows: admin, trainer, trainee.
- Keep speech processing, scoring, privileged storage, and report generation on the server.
- Use Supabase as the production identity, database, object storage, RLS, and selected realtime substrate.
- Preserve local development startup with Windows launchers and Render production startup with Linux scripts.
- Allow optional AI provider configuration without making the whole app fail when a provider is absent.
- Keep browser-facing secrets public-only; keep service-role operations server-side.
- Make assessment, call simulation, and microlearning workflows auditable and reportable.

## ADR-001: Use A Split Frontend And Backend Architecture

Decision: Keep the user interface in a Next.js application and the business/API layer in a FastAPI application.

Rationale:

- Next.js is a good fit for role-scoped dashboard UX, server routes, static assets, and frontend build/deploy workflows.
- FastAPI is a good fit for Python speech libraries, SQLAlchemy, PDF generation, AI provider integrations, and long-running domain services.
- The split keeps Python-heavy speech and reporting dependencies out of the frontend runtime.

Consequences:

- The frontend must proxy or call backend APIs consistently.
- Environment variables must be mirrored between services where needed.
- Local startup requires two processes, handled by `run-backend.cmd` and `run-frontend.cmd`.

## ADR-002: Use Supabase As The Production Data, Auth, Storage, And Realtime Platform

Decision: Supabase is the production persistence and platform backend for Postgres, Auth, Storage, RLS, and selected realtime feeds.

Rationale:

- The schema files in `supabase/` define domain tables, RLS policies, storage bucket alignment, and realtime publication for assessment and simulation features.
- The README and startup scripts force `USE_LOCAL_SQLITE=0` for production-like runs.
- Supabase Auth is synchronized with local platform users so platform roles and Supabase sessions can coexist.

Consequences:

- Database schema changes must be managed as SQL migrations in `supabase/`.
- RLS must stay aligned with app-level authorization rules.
- Supabase project URL and keys must belong to the same project; both launchers and Next server adapters validate that.
- The platform depends on correct bucket provisioning for recordings, profile images, microlearning audio/assets, and attachments.

## ADR-003: Keep SQLAlchemy Models As The Backend Domain Model

Decision: Represent backend domain entities with SQLAlchemy models in `backend/models.py`, `backend/models_extended.py`, and `backend/models_reading.py`.

Rationale:

- The backend already models users, roles, sessions, audit logs, LOBs, KPI configuration, workspaces, scenarios, batches, courses, microlearning, MCQ, coaching, certification, call simulation, and reading assessment.
- SQLAlchemy gives the FastAPI service layer a consistent unit-of-work model through `SessionLocal` and `get_db`.
- JSON/JSONB variants preserve compatibility with Postgres while retaining limited SQLite compatibility for tests and local helpers.

Consequences:

- The ORM model names and Supabase SQL schemas must be kept synchronized.
- Large model files make domain ownership less obvious; future schema work should group new models by domain where practical.

## ADR-004: Organize Backend APIs By Role And Domain

Decision: FastAPI routers are grouped by role and domain, then mounted from `backend/main.py`.

Primary route groups include:

- Auth and user management: `/api/auth`, `/api/users`
- Admin: `/api/admin`
- Trainer: `/api/trainer`
- Trainee: `/api/trainee`
- Assessments: `/api/assessments`, `/api/assessment-module`
- Microlearning: `/api/microlearning`
- Call simulation: `/api/call-simulation`
- Analytics, reports, export, audit, notifications, workspace, settings, certification

Rationale:

- Role-specific route groups match the product workspaces.
- Domain-specific route groups keep major capabilities separately deployable inside the same backend process.
- FastAPI dependencies support role checks and database session injection.

Consequences:

- Route files such as `call_simulation_routes.py`, `admin_routes.py`, `trainer_routes.py`, and `analytics_routes.py` are very large and carry orchestration complexity.
- Future work should extract more orchestration into services before adding substantial new route behavior.

## ADR-005: Use A Service Layer For Speech, Learning, Analytics, And Cross-Cutting Concerns

Decision: Keep domain logic in `backend/services/` rather than embedding all behavior directly in route handlers.

Important services include:

- `speech_assessment.py`, `speech_pipeline.py`, `audio_transcription.py`
- `audio_tts.py`, `tts_service.py`, `gemini_tts.py`, `gemini_evaluation.py`
- `microlearning.py`, `microlearning_catalog.py`, `microlearning_delete.py`
- `branching_engine.py`, `coaching.py`, `certificate_service.py`, `certificate_awards.py`
- `session_service.py`, `supabase_auth_service.py`, `audit.py`, `notifications.py`
- Admin/trainer learning analytics services

Rationale:

- Speech and scoring workflows require provider fallback, deterministic scoring, and persistence coordination.
- Analytics/reporting logic is reused by role dashboards and exports.
- Auth/session logic is cross-cutting and should not be duplicated across routes.

Consequences:

- Service modules are the correct place for tests.
- Some routes still contain significant domain code; refactoring pressure remains.

## ADR-006: Use Next.js App Router For Role-Scoped Workspaces

Decision: The frontend uses Next.js App Router directories for role-specific workspaces:

- `/admin/*`
- `/trainer/*`
- `/trainee/*`
- `/login`
- shared `app/components`, `app/lib`, `app/utils`, and `app/api`

Rationale:

- The product is naturally divided by role.
- Separate route trees make navigation, dashboards, and access checks easier to reason about.
- Shared UI and service helpers reduce duplication across role workspaces.

Consequences:

- Route protection must be consistent across client code, proxy middleware, Next API routes, and backend dependencies.
- Role navigation files are the source of truth for sidebar structure.

## ADR-007: Use Client Auth Context Plus Cookie-Based Route Guarding

Decision: Use `AuthContext` for client session state and `frontend/proxy.ts` for route-level role redirection.

Rationale:

- The client needs token storage, login/logout, refresh, user role state, and session activity tracking.
- The proxy can redirect unauthenticated users away from role routes before page rendering.
- Role home paths map directly to `/admin/dashboard`, `/trainer/dashboard`, and `/trainee/dashboard`.

Consequences:

- Browser storage and cookies must remain synchronized.
- Backend token verification remains authoritative for API access.
- Refresh-token presence allows proxy-level "active enough to route" behavior even if access token renewal happens client-side.

## ADR-008: Use Next API Routes As A Backend Proxy And BFF Layer

Decision: The frontend contains Next API routes that proxy generic backend traffic and provide server-only BFF operations for selected modules.

Examples:

- `frontend/app/api/[...path]/route.ts` proxies general `/api/*` traffic to FastAPI.
- `frontend/app/api/call-simulation/[...path]/route.ts` proxies call simulation traffic with a domain-specific unavailable message.
- Assessment module routes use server-only Supabase clients and backend session verification.

Rationale:

- Browser code can call same-origin `/api/*` endpoints without hardcoding backend hosts.
- The proxy can try multiple backend base URL candidates for local and production environments.
- Server-only Next routes can safely use service-role credentials when needed.

Consequences:

- Some business logic exists in Next server routes as well as FastAPI.
- Developers must know whether a feature is implemented in FastAPI, a Next route, or both.
- The BFF layer is useful for Supabase realtime and assessment workflows, but it should not become an unbounded second backend.

## ADR-009: Keep Privileged Supabase Access Server-Side

Decision: Supabase service-role access is only used in backend/server-side code, never in browser-facing frontend env files.

Rationale:

- README explicitly warns not to put the service-role key in frontend env files.
- `frontend/app/lib/assessment/supabase-admin.ts` is marked `server-only`.
- The adapter validates service-role/public keys and project refs before creating clients.

Consequences:

- Browser code must use public keys, user tokens, or proxied server routes.
- Server routes must enforce platform role checks before service-role operations.
- Misconfigured Supabase credentials fail with explicit 503/configuration errors rather than silent data leaks.

## ADR-010: Model Speech Workflows As Browser Capture Plus Server Assessment

Decision: Capture trainee audio in the browser and send audio blobs to backend/server routes for transcription, scoring, persistence, and feedback.

Rationale:

- Browser APIs such as `MediaRecorder` are the natural way to capture microphone audio.
- Backend Python services can coordinate Google Speech-to-Text, OpenAI transcription, heuristic fallback, Azure Speech, Gemini/OpenAI/Azure TTS, and local Windows TTS fallback.
- Server-side scoring provides consistent KPI calculations independent of browser environment.

Consequences:

- Browser support and microphone permissions are user-facing dependencies.
- Uploaded audio format, duration, and fallback transcript handling must stay compatible with backend services.
- Provider credentials are optional, but production-quality ASR/TTS depends on at least one configured provider.

## ADR-011: Use Deterministic Scoring With AI/ASR Provider Inputs

Decision: Speech assessment and reading assessment use ASR outputs as input, then apply deterministic scoring logic for transcript similarity, keyword compliance, pacing, fluency, pronunciation, completion, and feedback.

Rationale:

- Deterministic scoring is more inspectable for training/certification workflows than fully opaque model scoring.
- The reading assessment analyzer records word-level analysis, common issues, score breakdowns, and recommendations.
- Call simulation records transcript logs, turn logs, KPI scores, trainer verdicts, and certificate linkage.

Consequences:

- Scoring rules must be versioned carefully because score changes affect certification and reporting.
- Trainer review/coaching features remain important where ASR confidence is imperfect.

## ADR-012: Store Media In Supabase Storage With Local Fallback For Development

Decision: Use Supabase Storage buckets as the production media store, with local media directories only as fallback/development support.

Relevant buckets:

- `microlearning-audio`
- `profile-pictures`
- `recordings`
- `call-simulation-audio`
- `attachments`

Rationale:

- Production deployments need durable object storage independent of local filesystem lifecycle.
- Supabase storage policies can align with user roles and assignment access.
- Local fallback is useful for Windows development and demos when storage credentials are incomplete.

Consequences:

- Production should set `ALLOW_LOCAL_MEDIA_FALLBACK=false`.
- Bucket setup and policies must be applied before relying on upload-heavy features.
- Local files in `media/` are not a production persistence strategy.

## ADR-013: Use Realtime Selectively

Decision: Use a mix of WebSockets, server-sent streams, and Supabase realtime only where live updates are product-critical.

Examples:

- FastAPI WebSocket endpoint for speech pipeline interaction.
- Trainer and trainee live-update WebSocket routes.
- Next assessment stream routes backed by Supabase realtime channels.
- Notification stream endpoint.

Rationale:

- Live training, call simulation, assessment progress, and notifications benefit from realtime updates.
- Supabase realtime can reduce custom socket code for table-backed events.
- WebSockets remain useful for speech/audio turn workflows.

Consequences:

- Realtime authorization must be checked at stream creation and per-event filtering.
- Operational debugging spans browser, Next server, FastAPI, and Supabase realtime.

## ADR-014: Prefer Degraded Startup Over Total Process Failure Unless Strict Mode Is Enabled

Decision: Backend startup validates environment and database reachability but can bind its port in degraded mode unless strict validation is requested.

Rationale:

- Render and local launchers can start the process and expose `/health` diagnostics even if the database is temporarily unavailable.
- Startup can attempt schema/profile compatibility work and Supabase auth synchronization without permanently blocking all diagnostics.

Consequences:

- `/health` can return `503 degraded` even while the server is listening.
- Operators must check health response details, not only port binding.
- Strict validation flags should be used in environments where fail-fast startup is preferred.

## ADR-015: Deploy Backend And Frontend As Separate Render Web Services

Decision: Render deployment defines a Dockerized backend service and a Node frontend service.

Rationale:

- Backend uses Python 3.12 slim with system packages such as `ffmpeg` and `espeak` for audio/TTS support.
- Frontend builds with Node and Next.js independently.
- `render.yaml` wires frontend Supabase/backend env values from the backend service to reduce project drift.

Consequences:

- Backend and frontend can scale/restart independently.
- Cross-service URLs must be correct for proxying, health checks, and WebSocket URLs.
- Free-tier service cold starts or resource limits can affect audio and build-heavy workflows.

## ADR-016: Normalize Environment Aliases At Startup

Decision: Startup scripts normalize multiple historical/public env variable names into the names each runtime expects.

Examples:

- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL`, `REACT_APP_SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`
- `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_BACKEND_WS_URL`

Rationale:

- The codebase has evolved through multiple frontend conventions and Supabase key names.
- Normalization reduces startup failures caused by using the wrong alias.

Consequences:

- Env loading is forgiving but complex.
- Documentation should keep one recommended canonical set while retaining aliases for compatibility.

## ADR-017: Use Shared UI Components And Role-Specific Composition

Decision: Build frontend pages from shared UI primitives and shared workspace components, then compose role-specific pages around them.

Rationale:

- `app/components/ui` contains reusable Radix/lucide/Tailwind-style primitives.
- Shared profile, settings, status, certificate, MCQ, and layout components reduce duplication.
- Role pages can focus on workflow composition.

Consequences:

- Shared components must stay role-neutral where possible.
- Large page components should be split when they accumulate backend orchestration, UI state, and domain calculations.

## ADR-018: Generate Reports And Certificates Server-Side

Decision: Generate PDFs, exports, certificate records, and verification artifacts on the backend/server side.

Rationale:

- ReportLab and server-side data aggregation are better suited to Python backend services.
- Certificates and QR/verification tokens are authoritative records and should not be browser-generated.
- Export routes can enforce role and data-scope rules before producing files.

Consequences:

- Report generation can be CPU/memory intensive.
- Long-running exports may eventually need background jobs if report volume grows.

## ADR-019: Keep Database Authorization Defense-In-Depth

Decision: Use app-level role checks plus Supabase RLS policies for sensitive tables.

Rationale:

- FastAPI dependencies enforce platform roles and current-user access.
- Next server routes verify backend sessions before direct Supabase operations.
- Supabase SQL files enable RLS for assessment, reading, call simulation, user/profile, storage, and related tables.

Consequences:

- App authorization and RLS policies must evolve together.
- Service-role operations bypass RLS and therefore require stricter server route checks.

## ADR-020: Use Focused Automated Tests Around High-Risk Logic

Decision: Keep tests focused on session behavior, assessment/scoring logic, microlearning flows, analytics helpers, auth helpers, and frontend assessment requirements.

Observed tests:

- Backend pytest files under `backend/tests/`
- Frontend Playwright test under `frontend/tests/assessment-requirements.spec.ts`

Rationale:

- Speech scoring, session handling, auth, and assessment routing are higher-risk than static page rendering.
- Focused tests are realistic for a capstone-scale system with broad feature surface.

Consequences:

- End-to-end coverage is still limited relative to the number of workflows.
- More integration tests are recommended for login, role routing, media upload, call simulation, assessment submission, and certificate issuance.

## Current Risks And Follow-Up Decisions

1. Large backend route files

   Several route modules contain thousands of lines. This increases merge risk and makes domain boundaries harder to enforce. Future work should move orchestration into domain services and keep routes thin.

2. Mixed FastAPI and Next server business logic

   The BFF pattern is useful, but ownership should be explicit. Decide per feature whether FastAPI or Next server routes are authoritative.

3. Duplicate or overlapping assessment models

   The repo contains legacy assessment tables, redesigned training assessment tables, MCQ certification tables, and reading assessment tables. A future decision should define canonical assessment terminology and deprecation paths.

4. Environment alias complexity

   Alias normalization protects deployments, but the recommended canonical env contract should be documented and enforced in CI.

5. Health endpoint clarity

   `backend/main.py` contains multiple `/health` definitions. Confirm whether both are intentional and ensure the health contract is unambiguous for Render, launchers, and operators.

6. Provider fallback quality

   ASR/TTS fallback keeps the app usable, but production training quality depends on configured provider credentials and measured confidence. Provider choice and scoring thresholds should be reviewed before certification use.

7. Local media fallback

   Local media fallback is useful for development but unsafe as production persistence. Keep production configured for Supabase Storage.

8. Realtime authorization

   Realtime streams must keep filtering events by user/role/batch/category. This is especially important when service-role clients subscribe server-side.

9. Background work

   Report generation, TTS generation, speech processing, and bulk uploads may eventually need a queue if usage grows.

## Source Files Reviewed

- `README.md`
- `FILES_MANIFEST.md`
- `run-backend.cmd`
- `run-frontend.cmd`
- `dockerfile`
- `render.yaml`
- `scripts/start-backend.sh`
- `scripts/start-frontend.sh`
- `backend/main.py`
- `backend/database.py`
- `backend/auth_utils.py`
- `backend/supabase_client.py`
- `backend/models.py`
- `backend/models_extended.py`
- `backend/models_reading.py`
- `backend/routes/*`
- `backend/services/*`
- `backend/requirements.txt`
- `supabase/*.sql`
- `frontend/package.json`
- `frontend/next.config.ts`
- `frontend/proxy.ts`
- `frontend/app/layout.tsx`
- `frontend/app/context/AuthContext.tsx`
- `frontend/app/lib/backend-proxy.ts`
- `frontend/app/lib/assessment/backend-auth.ts`
- `frontend/app/lib/assessment/supabase-admin.ts`
- `frontend/app/api/*`
- `frontend/app/components/*`
- `frontend/hooks/useSpeechToText.ts`

