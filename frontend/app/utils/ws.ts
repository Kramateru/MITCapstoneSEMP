export function getBackendWebSocketUrl(path: string) {
  const explicitBase = process.env.NEXT_PUBLIC_BACKEND_WS_URL;
  const fallbackBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000`;
  const base = explicitBase || fallbackBase;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
