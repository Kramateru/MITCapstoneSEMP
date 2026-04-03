'use client';

import { useEffect } from 'react';

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

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <h2 className="text-2xl font-bold">Application error</h2>
        <p className="mt-3 text-sm text-slate-200">
          A browser-side error interrupted the page. We added a recovery view here so you can retry the app without a blank screen.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              clearBrowserSession();
              window.location.href = '/login';
            }}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Clear cached session
          </button>
        </div>
      </div>
    </div>
  );
}
