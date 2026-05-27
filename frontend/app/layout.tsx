import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";
import { RuntimeResilience } from "@/app/components/runtime-resilience";

export const metadata: Metadata = {
  title: "Speech-Enabled Microlearning Platform",
  description: "Speech-enabled language assessment, microlearning, coaching, and certification workflow.",
};

const runtimeAssetGuardScript = `
(() => {
  const markerKey = 'speech-enabler.runtime-asset-reload-at';
  const countKey = 'speech-enabler.runtime-asset-reload-count';
  const queryParam = '__asset_reload';
  const cooldownMs = 15000;
  const maxReloads = 2;
  const patterns = [
    /chunkloaderror/i,
    /loading chunk [\\w-]+ failed/i,
    /failed to load chunk/i,
    /failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /importing a module script failed/i,
    /_next\\/static\\/chunks\\//i,
  ];

  const normalize = (value) => typeof value === 'string' ? value.trim() : '';
  const dedupe = (values) => {
    const seen = new Set();
    return values.filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const collectMessages = (input, seen = new Set()) => {
    if (input == null || seen.has(input)) {
      return [];
    }
    if (typeof input === 'string') {
      const normalized = normalize(input);
      return normalized ? [normalized] : [];
    }
    if (typeof input !== 'object') {
      return [];
    }

    seen.add(input);
    const candidate = input;
    const keys = ['message', 'name', 'stack', 'filename', 'path', 'request', 'href', 'src', 'sourceURL', 'moduleId', 'chunkId', 'chunkName'];
    const messages = [];

    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === 'string') {
        const normalized = normalize(value);
        if (normalized) {
          messages.push(normalized);
        }
      }
    }

    if ('reason' in candidate) {
      messages.push(...collectMessages(candidate.reason, seen));
    }
    if ('error' in candidate) {
      messages.push(...collectMessages(candidate.error, seen));
    }
    if ('cause' in candidate) {
      messages.push(...collectMessages(candidate.cause, seen));
    }

    return dedupe(messages);
  };

  const isRecoverable = (input) => collectMessages(input).some((message) => patterns.some((pattern) => pattern.test(message)));
  const clearSuccessState = () => {
    try {
      window.sessionStorage.removeItem(markerKey);
      window.sessionStorage.removeItem(countKey);

      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.has(queryParam)) {
        nextUrl.searchParams.delete(queryParam);
        window.history.replaceState(window.history.state, '', nextUrl.toString());
      }
    } catch {}
  };

  const hardReload = () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(queryParam, String(Date.now()));
    const targetUrl = nextUrl.toString();
    const cacheStorage = window.caches;

    if (!cacheStorage) {
      window.location.replace(targetUrl);
      return;
    }

    cacheStorage.keys()
      .then((keys) => Promise.allSettled(keys.map((key) => cacheStorage.delete(key))))
      .catch(() => undefined)
      .finally(() => {
        window.location.replace(targetUrl);
      });
  };

  const attemptRecovery = (input) => {
    if (!isRecoverable(input)) {
      return false;
    }

    try {
      const previousAttempt = Number(window.sessionStorage.getItem(markerKey) || 0);
      const previousCount = Number(window.sessionStorage.getItem(countKey) || 0);

      if (Number.isFinite(previousAttempt) && Date.now() - previousAttempt < cooldownMs) {
        return false;
      }

      if (Number.isFinite(previousCount) && previousCount >= maxReloads) {
        return false;
      }

      window.sessionStorage.setItem(markerKey, String(Date.now()));
      window.sessionStorage.setItem(countKey, String(previousCount + 1));
    } catch {}

    hardReload();
    return true;
  };

  window.addEventListener('error', (event) => {
    const target = event.target;
    const source =
      target instanceof HTMLScriptElement && target.src
        ? target.src
        : target instanceof HTMLLinkElement && target.href
          ? target.href
          : event.error || event.message || event.filename;

    if (attemptRecovery(source)) {
      event.preventDefault();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (attemptRecovery(event.reason)) {
      event.preventDefault();
    }
  });

  if (document.readyState === 'complete') {
    window.setTimeout(clearSuccessState, 0);
  } else {
    window.addEventListener('load', clearSuccessState, { once: true });
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          id="runtime-asset-guard"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: runtimeAssetGuardScript }}
        />
      </head>
      <body className="antialiased">
        <RuntimeResilience />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
