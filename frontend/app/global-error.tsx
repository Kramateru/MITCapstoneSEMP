'use client';

import { AlertCircle, LogOut, RotateCcw } from 'lucide-react';

function clearBrowserSession() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('refresh_token');
    window.localStorage.removeItem('user');
    window.localStorage.removeItem('user-dashboard-settings');
    window.sessionStorage.clear();
  } catch (storageError) {
    console.warn('Unable to clear cached browser data:', storageError);
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('Global app error:', error);

  const errorMessage = error?.message || 'An unexpected error occurred';
  const errorStack = error?.stack || '';

  return (
    <html lang="en">
      <head>
        <title>Application Error - Speech-Enabled BPO Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-slate-950 text-white font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center px-4 py-6">
          <div className="w-full max-w-2xl space-y-6">
            {/* Error Card */}
            <div className="rounded-2xl border border-red-500/20 bg-red-950/30 p-8 shadow-2xl backdrop-blur">
              {/* Error Header */}
              <div className="mb-6 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-white">Application Error</h1>
                  <p className="mt-1 text-sm text-red-300/80">
                    A browser-side error interrupted the page. We added a recovery view so you can retry without a blank screen.
                  </p>
                </div>
              </div>

              {/* Error Details */}
              <div className="mb-6 rounded-lg bg-slate-900/50 p-4 border border-slate-700/50">
                <p className="text-xs font-mono text-slate-400 mb-2">Error Details:</p>
                <p className="text-sm font-mono text-red-300 leading-relaxed break-words whitespace-pre-wrap">
                  {errorMessage}
                </p>
                {process.env.NODE_ENV === 'development' && errorStack && (
                  <details className="mt-3">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      Stack Trace (Development)
                    </summary>
                    <pre className="mt-2 text-xs text-slate-500 overflow-auto max-h-40 bg-slate-950 p-2 rounded">
                      {errorStack}
                    </pre>
                  </details>
                )}
              </div>

              {/* Recovery Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    console.info('User clicked "Try again" - resetting error boundary');
                    reset();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.info('User clicked "Return to Login" - clearing session');
                    clearBrowserSession();
                    window.location.href = '/login';
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-400/30 bg-slate-900/50 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-slate-400/50"
                >
                  <LogOut className="h-4 w-4" />
                  Return to Login
                </button>
              </div>

              {/* Help Text */}
              <div className="mt-6 border-t border-slate-700/50 pt-6">
                <p className="text-xs text-slate-400 leading-relaxed">
                  <strong>Troubleshooting:</strong> If the error persists after retrying:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-400">
                  <li>Click "Return to Login" to clear your cached session</li>
                  <li>Ensure the backend server is running (check http://127.0.0.1:8000)</li>
                  <li>Check your browser console (F12) for detailed error information</li>
                  <li>Try clearing your browser cache and refreshing the page</li>
                </ul>
              </div>
            </div>

            {/* Status Information */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4 text-xs text-slate-400">
              <p><strong>Platform:</strong> Speech-Enabled BPO Training Platform</p>
              <p className="mt-1"><strong>Error ID:</strong> {error?.digest || 'No digest available'}</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
