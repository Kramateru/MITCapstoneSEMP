export const CONNECTIVITY_ERROR_MESSAGE =
  'Unable to reach the application services. Make sure the frontend and backend servers are running, then refresh and try again.'

const RUNTIME_ASSET_RELOAD_MARKER_KEY = 'speech-enabler.runtime-asset-reload-at'
const RUNTIME_ASSET_RELOAD_COOLDOWN_MS = 15000

const connectivityErrorPatterns = [
  /failed to fetch/i,
  /fetch failed/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
  /unable to reach the backend service/i,
]

const runtimeAssetErrorPatterns = [
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /failed to load chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /_next\/static\/chunks\//i,
]

function normalizeMessage(value: string) {
  return value.trim()
}

export function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return normalizeMessage(error)
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return normalizeMessage(message)
    }
  }

  return ''
}

export function isConnectivityError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }

  const message = getErrorMessage(error)
  return connectivityErrorPatterns.some((pattern) => pattern.test(message))
}

export function isRecoverableRuntimeAssetError(error: unknown) {
  const message = getErrorMessage(error)
  return runtimeAssetErrorPatterns.some((pattern) => pattern.test(message))
}

export function createConnectivityError(cause?: unknown) {
  const error = new TypeError(CONNECTIVITY_ERROR_MESSAGE) as TypeError & { cause?: unknown }
  error.cause = cause
  return error
}

export function normalizeConnectivityError(error: unknown) {
  if (isConnectivityError(error)) {
    return createConnectivityError(error)
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(getErrorMessage(error) || 'Unexpected browser error.')
}

export function dedupeMessages(messages: string[]) {
  const seen = new Set<string>()
  const uniqueMessages: string[] = []

  for (const message of messages) {
    const normalized = normalizeMessage(message)
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueMessages.push(normalized)
  }

  return uniqueMessages
}

export function attemptRecoverFromRuntimeAssetError(error: unknown) {
  if (typeof window === 'undefined' || !isRecoverableRuntimeAssetError(error)) {
    return false
  }

  try {
    const previousAttempt = Number(window.sessionStorage.getItem(RUNTIME_ASSET_RELOAD_MARKER_KEY) || 0)
    if (Number.isFinite(previousAttempt) && Date.now() - previousAttempt < RUNTIME_ASSET_RELOAD_COOLDOWN_MS) {
      return false
    }

    window.sessionStorage.setItem(RUNTIME_ASSET_RELOAD_MARKER_KEY, String(Date.now()))
  } catch {
    // Ignore storage failures and still attempt a hard refresh.
  }

  window.location.reload()
  return true
}
