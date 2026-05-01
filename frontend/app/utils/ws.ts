export function getBackendWebSocketUrl(path: string) {
  const explicitSocketBase = process.env.NEXT_PUBLIC_BACKEND_WS_URL?.trim();
  const explicitHttpBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  const normalizeSocketBase = (value: string) => {
    try {
      const parsed = new URL(value);
      parsed.protocol = parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return value.replace(/\/+$/, '');
    }
  };

  const fallbackBase = `${protocol}://127.0.0.1:8000`;
  const base =
    explicitSocketBase
    || (explicitHttpBase ? normalizeSocketBase(explicitHttpBase) : '')
    || fallbackBase;

  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
