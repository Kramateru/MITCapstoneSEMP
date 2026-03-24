# Azure Setup

Use this guide only if you need Azure Speech configuration for this repository.

## Important Context

The active trainee assessment path is the upload-based route at `POST /api/trainee/asr/assess`. That path currently relies on the speech assessment service and can use OpenAI transcription when configured.

Azure support still exists in `backend/main.py` through the `/ws/speech` WebSocket endpoint and pronunciation-assessment helpers. Treat Azure as an optional integration layer, not the default trainee path.

## Required Environment Variables

Add these to `backend/.env`:

```env
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus
```

## How To Get The Values

1. Create or open an Azure Speech resource in Azure Portal.
2. Go to `Keys and Endpoint`.
3. Copy the speech key.
4. Copy the region.

## Local Validation

Start the backend:

```powershell
cd backend
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Then verify:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

If you are directly testing the Azure WebSocket path, use the `/ws/speech` endpoint exposed by `backend/main.py`.

## When Azure Does Not Affect The UI

If the trainee pages still behave the same after adding Azure credentials, that can be normal. The current practice flow uploads recordings to the backend assessment route instead of driving the UI through `/ws/speech`.

## Recommended Use

Use Azure here when you want to:

- test the legacy or experimental speech WebSocket endpoint
- compare Azure pronunciation assessment with the current upload-based flow
- keep the project ready for a future realtime speech upgrade

For the main platform startup and Supabase-backed operation, use the root [README.md](../README.md) and [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
