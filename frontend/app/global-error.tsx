'use client';

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

  return (
    <html lang="en">
      <body className="bg-slate-950 text-white">
        <div className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-bold">Application error</h2>
            <p className="mt-3 text-sm text-slate-200">
              The app hit an unexpected client-side error while loading. You can retry immediately or clear the saved browser session and go back to login.
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
      </body>
    </html>
  );
}
