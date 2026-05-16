'use client';

import { AlertCircle, LogOut, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { attemptRecoverFromRuntimeAssetError, isRecoverableRuntimeAssetError } from '@/app/utils/runtime-errors';

function clearBrowserSession() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('refresh_token');
    window.localStorage.removeItem('supabase_access_token');
    window.localStorage.removeItem('supabase_refresh_token');
    window.localStorage.removeItem('user');
    window.localStorage.removeItem('user-dashboard-settings');
    window.sessionStorage.clear();
  } catch (storageError) {
    console.warn('Unable to clear cached browser data:', storageError);
  }
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page-level error:', error);
    attemptRecoverFromRuntimeAssetError(error);
  }, [error]);

  const errorMessage = error?.message || 'An unexpected error occurred';
  const errorStack = error?.stack || '';
  const requiresHardReload = isRecoverableRuntimeAssetError(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-6 text-white">
      <div className="w-full max-w-2xl space-y-6">
        {/* Error Card */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-950/30 p-8 shadow-2xl backdrop-blur">
          {/* Error Header */}
          <div className="mb-6 flex items-start gap-4">
            <div className="flex-shrink-0">
              <AlertCircle className="h-8 w-8 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Page Error</h1>
              <p className="mt-1 text-sm text-yellow-300/80">
                A browser-side error interrupted this page. Use the recovery options below to continue.
              </p>
            </div>
          </div>

          {/* Error Details */}
          <div className="mb-6 rounded-lg bg-slate-900/50 p-4 border border-slate-700/50">
            <p className="text-xs font-mono text-slate-400 mb-2">Error Details:</p>
            <p className="text-sm font-mono text-yellow-300 leading-relaxed break-words whitespace-pre-wrap">
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
                if (requiresHardReload) {
                  console.info('User clicked "Reload app" - forcing a full page refresh');
                  const didTriggerReload = attemptRecoverFromRuntimeAssetError(error, { force: true });
                  if (!didTriggerReload) {
                    window.location.replace(window.location.href);
                  }
                  return;
                }

                console.info('User clicked "Try again" - resetting error boundary');
                reset();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            >
              <RotateCcw className="h-4 w-4" />
              {requiresHardReload ? 'Reload App' : 'Try again'}
            </button>
            <button
              type="button"
              onClick={() => {
                console.info('User clicked "Return to Login" - clearing session');
                clearBrowserSession();
                window.location.replace('/login');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-400/30 bg-slate-900/50 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-slate-400/50"
            >
              <LogOut className="h-4 w-4" />
              Return to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
