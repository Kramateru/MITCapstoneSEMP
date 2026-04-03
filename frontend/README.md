# Frontend Notes

This frontend is the Next.js application for the active Speech-Enabled BPO Platform.

The canonical project overview lives in the root [README.md](../README.md). Use this file for frontend-specific commands and structure only.

## Commands

Install dependencies:

```powershell
cd frontend
npm install
```

Run the development server:

```powershell
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Create a production build:

```powershell
cd frontend
npm run build
```

## Runtime Notes

- The frontend expects the backend at `http://127.0.0.1:8000` when started through the root `run-frontend.cmd`.
- Authenticated pages rely on the backend APIs for role, LOB, MCQ, assignment, and reporting data.
- The shared dashboard shell in `app/components/DashboardLayout.tsx` powers the responsive sidebar behavior across roles.

## Key Frontend Areas

- `app/admin/`: admin role pages
- `app/trainer/`: trainer role pages
- `app/trainee/`: trainee role pages
- `app/components/`: shared UI and dashboard components
- `hooks/`: reusable client hooks such as `useAudioCapture`

## When To Use Other Docs

- Use the root [README.md](../README.md) for system overview and startup.
- Use [../TESTING_GUIDE.md](../TESTING_GUIDE.md) for smoke testing.
- Use [../AUDIO_PROCESSING.md](../AUDIO_PROCESSING.md) for the speech workflow.
