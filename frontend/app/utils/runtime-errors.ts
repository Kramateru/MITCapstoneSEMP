export const CONNECTIVITY_ERROR_MESSAGE =
  'Unable to reach the application services. Make sure the frontend and backend servers are running, then refresh and try again.'

const RUNTIME_ASSET_RELOAD_MARKER_KEY = 'speech-enabler.runtime-asset-reload-at'
const RUNTIME_ASSET_RELOAD_COUNT_KEY = 'speech-enabler.runtime-asset-reload-count'
const RUNTIME_ASSET_RELOAD_COOLDOWN_MS = 15000
const RUNTIME_ASSET_RELOAD_QUERY_PARAM = '__asset_reload'
const MAX_RUNTIME_ASSET_AUTO_RELOADS = 2

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

function collectErrorMessages(error: unknown, seen = new Set<unknown>()) {
  if (error == null || seen.has(error)) {
    return [] as string[]
  }

  if (typeof error === 'string') {
    const normalized = normalizeMessage(error)
    return normalized ? [normalized] : []
  }

  if (typeof error !== 'object') {
    return []
  }

  seen.add(error)
  const candidate = error as Record<string, unknown>
  const messages: string[] = []
  const keys = [
    'message',
    'name',
    'stack',
    'filename',
    'path',
    'request',
    'href',
    'src',
    'sourceURL',
    'moduleId',
    'chunkId',
    'chunkName',
  ]

  for (const key of keys) {
    const value = candidate[key]
    if (typeof value === 'string') {
      const normalized = normalizeMessage(value)
      if (normalized) {
        messages.push(normalized)
      }
    }
  }

  if ('reason' in candidate) {
    messages.push(...collectErrorMessages(candidate.reason, seen))
  }

  if ('error' in candidate) {
    messages.push(...collectErrorMessages(candidate.error, seen))
  }

  if ('cause' in candidate) {
    messages.push(...collectErrorMessages(candidate.cause, seen))
  }

  return dedupeMessages(messages)
}

export function getErrorMessage(error: unknown) {
  return collectErrorMessages(error)[0] || ''
}

export function isConnectivityError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }

  const messages = collectErrorMessages(error)
  return messages.some((message) => connectivityErrorPatterns.some((pattern) => pattern.test(message)))
}

export function isRecoverableRuntimeAssetError(error: unknown) {
  const messages = collectErrorMessages(error)
  return messages.some((message) => runtimeAssetErrorPatterns.some((pattern) => pattern.test(message)))
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

export function clearRuntimeAssetRecoveryState() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(RUNTIME_ASSET_RELOAD_MARKER_KEY)
    window.sessionStorage.removeItem(RUNTIME_ASSET_RELOAD_COUNT_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function clearRuntimeAssetRecoveryQueryParam() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const nextUrl = new URL(window.location.href)
    if (!nextUrl.searchParams.has(RUNTIME_ASSET_RELOAD_QUERY_PARAM)) {
      return
    }

    nextUrl.searchParams.delete(RUNTIME_ASSET_RELOAD_QUERY_PARAM)
    window.history.replaceState(window.history.state, '', nextUrl.toString())
  } catch {
    // Ignore URL parsing failures.
  }
}

export function markRuntimeAssetLoadSuccessful() {
  clearRuntimeAssetRecoveryState()
  clearRuntimeAssetRecoveryQueryParam()
}

function buildRuntimeAssetRecoveryUrl() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set(RUNTIME_ASSET_RELOAD_QUERY_PARAM, String(Date.now()))
  return nextUrl.toString()
}

function forceRuntimeAssetReload() {
  const nextUrl = buildRuntimeAssetRecoveryUrl()
  const cacheStorage = window.caches

  if (!cacheStorage) {
    window.location.replace(nextUrl)
    return
  }

  void cacheStorage
    .keys()
    .then((keys) => Promise.allSettled(keys.map((key) => cacheStorage.delete(key))))
    .catch(() => undefined)
    .finally(() => {
      window.location.replace(nextUrl)
    })
}

export function attemptRecoverFromRuntimeAssetError(
  error: unknown,
  options?: {
    force?: boolean
  },
) {
  if (typeof window === 'undefined' || !isRecoverableRuntimeAssetError(error)) {
    return false
  }

  try {
    const previousAttempt = Number(window.sessionStorage.getItem(RUNTIME_ASSET_RELOAD_MARKER_KEY) || 0)
    const previousCount = Number(window.sessionStorage.getItem(RUNTIME_ASSET_RELOAD_COUNT_KEY) || 0)
    const force = Boolean(options?.force)

    if (
      !force
      && Number.isFinite(previousAttempt)
      && Date.now() - previousAttempt < RUNTIME_ASSET_RELOAD_COOLDOWN_MS
    ) {
      return false
    }

    if (!force && Number.isFinite(previousCount) && previousCount >= MAX_RUNTIME_ASSET_AUTO_RELOADS) {
      return false
    }

    window.sessionStorage.setItem(RUNTIME_ASSET_RELOAD_MARKER_KEY, String(Date.now()))
    window.sessionStorage.setItem(RUNTIME_ASSET_RELOAD_COUNT_KEY, String(previousCount + 1))
  } catch {
    // Ignore storage failures and still attempt a hard refresh.
  }

  forceRuntimeAssetReload()
  return true
}
