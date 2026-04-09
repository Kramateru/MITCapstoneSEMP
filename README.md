# Speech-Enabled BPO Platform

A full-stack application for speech-enabled BPO training with a React/Next.js frontend and FastAPI backend using WebSocket communication and Google Gemini API for real-time conversational AI, automated assessment, and content generation.

## Project Structure

```
.
├── backend/              # FastAPI backend server
│   ├── main.py          # WebSocket endpoint for audio streaming
│   ├── requirements.txt  # Python dependencies
│   ├── venv/            # Python virtual environment
│   └── ...
└── frontend/            # Next.js React application
    ├── app/
    │   ├── page.tsx     # Main page
    │   └── components/
    │       └── SpeechRecorder.tsx  # Speech recording UI
    ├── hooks/
    │   └── useAudioCapture.ts  # Custom hook for audio capture
    ├── package.json
    └── ...
```

## Backend Setup

### 1. Environment Setup

Create a `.env` file in the backend directory and add your Gemini API key:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Install Dependencies

```bash
cd backend
venv\Scripts\activate  # Activate virtual environment
pip install -r requirements.txt
```

### 2. Run the Server

```bash
uvicorn main:app --reload
```

The server will start at `http://127.0.0.1:8000`

#### Available Endpoints:
- **GET** `/` - Health check endpoint
- **WebSocket** `/ws/speech` - Audio streaming WebSocket

You can also access:
- **API Docs**: `http://127.0.0.1:8000/docs` (Swagger UI)
- **ReDoc**: `http://127.0.0.1:8000/redoc` (Alternative API docs)

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Sim Floor Prompt and Spec

The codebase now includes a reusable Sim Floor implementation prompt and supporting schema notes for the full stack mock-call platform described in this project.

- Prompt module: `frontend/app/lib/assessment/sim-floor-implementation-prompt.ts`
- Prompt API: `GET /api/sim-floor/implementation-prompt`
- Supabase schema: `backend/sim_floor_schema.sql`
- Trainee Sim Floor UI: `frontend/app/trainee/sim-floor/page.tsx`
- Trainer Sim Floor UI: `frontend/app/trainer/sim-floor/page.tsx`
- Google ASR hook: `frontend/hooks/useSpeechToText.ts`

The Sim Floor spec covers:
- Google ASR for CSR speech capture
- Supabase-backed recordings, transcripts, logs, reports, and certificates
- Trainer scenario creation, editing, and upload
- Ping-pong CSR and Member turn logic
- Post-call KPI insights
- Competent vs retake workflow
- Certificate visibility in trainee reporting

## Microlearning Prompt and Seed Pack

The codebase now also includes a reusable Microlearning implementation prompt and a Supabase-ready BPO seed pack for trainer and trainee microlearning workflows.

- Prompt module: `frontend/app/lib/assessment/microlearning-implementation-prompt.ts`
- Prompt API: `GET /api/microlearning/implementation-prompt`
- Prompt document: `MICROLEARNING_FULLSTACK_IMPLEMENTATION_PROMPT.md`
- Supabase SQL seed: `supabase/microlearning_seed.sql`
- Trainer microlearning UI: `frontend/app/trainer/microlearning/page.tsx`
- Trainee microlearning UI: `frontend/app/trainee/microlearning/page.tsx`

The Microlearning spec covers:
- trainer topic category CRUD
- trainer module authoring and Supabase asset upload
- trainer assignment of selected modules to a batch or a trainee
- trainee completion, passing score, certificate unlock, and accomplishment reporting
- trainer progress reporting by batch and by trainee
- a default 10-module BPO seed pack with answers for language, grammar, tone, empathy, pronunciation, escalation, billing, and product knowledge

## How It Works

### Audio Capture Flow:

1. **User clicks "Start Recording"** in the SpeechRecorder component
2. **Browser requests microphone permission** using `navigator.mediaDevices.getUserMedia()`
3. **MediaRecorder API captures audio** in real-time
4. **Audio chunks are streamed** to the backend via WebSocket
5. **Backend receives audio data** and processes it using Gemini Live API for real-time conversational AI
6. **Gemini provides human-like responses** and assessment feedback

### WebSocket Communication:

- **Frontend → Backend**: Audio data (binary chunks)
- **Backend → Frontend**: Processing status, transcribed text, and AI responses

## Key Components

### Backend (main.py)

```python
@app.websocket("/ws/speech")
async def speech_endpoint(websocket: WebSocket):
    # Accept WebSocket connection
    # Receive audio chunks
    # Process with Gemini Live API for real-time conversation
    # Send AI responses and assessment feedback
```

### Frontend Hook (useAudioCapture.ts)

A custom React hook that handles:
- Microphone permission requests
- Audio stream recording
- WebSocket connection management
- Error handling

Usage:
```typescript
const { startRecording, stopRecording, isRecording, isConnected, error } =
  useAudioCapture();
```

## Next Steps

### 1. Integrate Gemini API
Modify `main.py` to use Google Gemini Live API for real-time conversational AI:

```python
# Example with Gemini Live API
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

@app.websocket("/ws/speech")
async def speech_endpoint(websocket: WebSocket):
    await websocket.accept()
    # Stream audio to Gemini Live API
    # Receive real-time responses
    # Send responses back to client
```

### 2. Implement Automated Assessment
Use Gemini 1.5 Pro for performance evaluation:

- Transcribe audio and analyze for BPO metrics
- Detect tone and sentiment
- Generate structured feedback JSON

### 3. Add Training Content Generation
Use Gemini for microlearning content:

- Generate customer complaint scenarios
- Create audio prompts with Gemini-TTS

### 4. Add Transcription Display
Update `SpeechRecorder.tsx` to show transcribed text and AI responses in real-time

### 5. Add User Authentication
Implement JWT-based authentication to secure the WebSocket endpoint

### 6. Deploy
- **Backend**: Deploy to AWS, Azure, or Heroku
- **Frontend**: Deploy to Vercel or Netlify

## Technology Stack

**Frontend:**
- Next.js 14+
- React 18
- TypeScript
- Tailwind CSS
- MediaRecorder API
- WebSocket API

**Backend:**
- FastAPI
- Uvicorn (ASGI server)
- WebSockets
- Python 3.12
- Google Gemini API (Live API, 1.5 Pro, TTS)

## CORS Configuration

The backend includes CORS middleware to allow requests from your frontend. In production, update this to your specific domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Gemini API Integration

The Gemini API is integrated across multiple functions of the system:

### 1. Real-Time Conversational AI (Gemini Live API)
- Enables voice-to-voice agent for trainees to practice customer calls
- Low latency human-like responses
- Multimodal input processing raw audio streams
- Barge-in support for natural interruptions

### 2. Automated Assessment & Scoring
- Uses Gemini 1.5 Pro or Flash to evaluate trainee performance
- Transcription analysis for BPO metrics (Opening/Closing, Problem Identification, Resolution Quality)
- Tone and sentiment detection via Audio Understanding
- Returns structured JSON feedback with scores and improvement tips

### 3. Training Content Generation (Microlearning)
- Generates fresh customer complaint scenarios
- Uses Gemini-TTS to create audio prompts for trainees

### 4. Technical Integration
- API key stored securely in `.env` file
- Backend proxies audio to Gemini Live API via WebSockets
- Frontend captures microphone audio and streams to backend

## Gemini API Integration

The Gemini API is integrated across multiple functions of the system:

### 1. Real-Time Conversational AI (Gemini Live API)
- Enables voice-to-voice agent for trainees to practice customer calls
- Low latency human-like responses
- Multimodal input processing raw audio streams
- Barge-in support for natural interruptions

### 2. Automated Assessment & Scoring
- Uses Gemini 1.5 Pro or Flash to evaluate trainee performance
- Transcription analysis for BPO metrics (Opening/Closing, Problem Identification, Resolution Quality)
- Tone and sentiment detection via Audio Understanding
- Returns structured JSON feedback with scores and improvement tips

### 3. Training Content Generation (Microlearning)
- Generates fresh customer complaint scenarios
- Uses Gemini-TTS to create audio prompts for trainees

### 4. Technical Integration
- API key stored securely in `.env` file
- Backend proxies audio to Gemini Live API via WebSockets
- Frontend captures microphone audio and streams to backend

## Troubleshooting

### Microphone Permission Failed
- Check browser microphone permissions
- Ensure HTTPS in production (WebSocket WSS)
- Test microphone works in other apps

### WebSocket Connection Failed
- Verify backend is running on `127.0.0.1:8000`
- Check browser console for connection errors
- Ensure no firewall blocking port 8000

### Audio Not Streaming
- Check WebSocket connection status in browser DevTools
- Verify `startRecording()` was called
- Check browser console for JavaScript errors

### Gemini API Errors
- Verify `GEMINI_API_KEY` is set in `.env` file
- Check API key validity and quota limits
- Ensure internet connection for API calls
- Review Gemini API documentation for rate limits and usage

## License

MIT License - See LICENSE file for details

## Database Data

The backend no longer creates demo users or sample records automatically on startup.

All admin, trainer, and trainee views now read from the active database only. To load the reusable sample dataset into the currently configured database, run:

```bash
python -m backend.seed_supabase
```

Sample accounts are created only when you run the seed script against the target database.

That seed command now also creates the trainer-owned microlearning topic categories and the default 10-module BPO microlearning pack in the active database. If `DATABASE_URL` points to Supabase and `USE_LOCAL_SQLITE=0`, those microlearning records are written to and read from Supabase as well.

If you want to upload only the BPO microlearning pack without running the full sample dataset, use:

```bash
python -m backend.seed_microlearning
```

If you want to seed the BPO microlearning library directly from the Supabase SQL editor for a specific trainer account, run the SQL helper in `supabase/microlearning_seed.sql` and then execute:

```sql
select public.seed_bpo_microlearning_pack('trainer@st.peterville.edu.ph');
```

That seed command now also creates trainer workspace libraries in the active database, including
database-backed empathy statements, probing questions, forbidden words, and required keywords.
If `DATABASE_URL` points to Supabase and `USE_LOCAL_SQLITE=0`, those workspace libraries are
written to and read from Supabase as well.

Default passwords for newly created users
- Trainee: SPVTrainee2026
- Admin: SPVAdmin2026
- Trainer: SPVTrainer2026
"# SpeechEnablerMicrolearningPlatformMIT" 
