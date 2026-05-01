import 'server-only'

import { getConfigValue } from '@/app/lib/assessment/env'

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'
const DEFAULT_BACKEND_UNAVAILABLE_MESSAGE =
  'Unable to reach the backend service. Start the backend server and try again.'

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function normalizeConfigValue(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/\/+$/, '')
}

function normalizeBaseUrl(url: string) {
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.host}`
}

function pushLoopbackVariants(
  candidates: string[],
  seen: Set<string>,
  parsed: URL,
) {
  const protocol = parsed.protocol
  const portSegment = parsed.port ? `:${parsed.port}` : ''
  const hostname = parsed.hostname.toLowerCase()

  const pushVariant = (variantHostname: string) => {
    const baseUrl = `${protocol}//${variantHostname}${portSegment}`
    if (seen.has(baseUrl)) {
      return
    }

    seen.add(baseUrl)
    candidates.push(baseUrl)
  }

  if (hostname === '127.0.0.1') {
    pushVariant('localhost')
    return
  }

  if (hostname === 'localhost') {
    pushVariant('127.0.0.1')
    return
  }

  if (hostname === '0.0.0.0') {
    pushVariant('127.0.0.1')
    pushVariant('localhost')
  }
}

function pushBaseUrl(candidates: string[], seen: Set<string>, value?: string | null) {
  const normalized = normalizeConfigValue(value)
  if (!normalized) {
    return
  }

  try {
    const parsed = new URL(normalized)
    if (!/^https?:$/.test(parsed.protocol)) {
      return
    }

    const baseUrl = normalizeBaseUrl(parsed.toString())
    if (seen.has(baseUrl)) {
      return
    }

    seen.add(baseUrl)
    candidates.push(baseUrl)
    pushLoopbackVariants(candidates, seen, parsed)
  } catch {
    // Ignore malformed fallback candidates.
  }
}

function getBackendBaseUrlCandidates() {
  const configuredUrl = normalizeConfigValue(getConfigValue(['BACKEND_URL'], DEFAULT_BACKEND_URL))
  const candidates: string[] = []
  const seen = new Set<string>()
  pushBaseUrl(candidates, seen, configuredUrl)

  if (candidates.length === 0) {
    pushBaseUrl(candidates, seen, DEFAULT_BACKEND_URL)
  }

  return candidates
}

function buildTargetUrl(baseUrl: string, request: Request, pathnameOverride?: string) {
  const requestUrl = new URL(request.url)
  const targetUrl = new URL(baseUrl)
  targetUrl.pathname = pathnameOverride || requestUrl.pathname
  targetUrl.search = requestUrl.search
  return targetUrl.toString()
}

export function buildForwardHeaders(request: Request) {
  const headers = new Headers()

  request.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return
    }

    headers.set(key, value)
  })

  return headers
}

export function buildResponseHeaders(response: Response) {
  const headers = new Headers()

  response.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return
    }

    headers.set(key, value)
  })

  return headers
}

export function buildBackendUnavailableResponse(message = DEFAULT_BACKEND_UNAVAILABLE_MESSAGE) {
  return Response.json({ detail: message }, { status: 502 })
}

async function fetchAcrossBackendCandidates(
  requestBuilder: (baseUrl: string) => string,
  init: RequestInit,
) {
  const candidates = getBackendBaseUrlCandidates()
  let lastError: unknown = null

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(requestBuilder(baseUrl), {
        ...init,
        cache: 'no-store',
      })
      return response
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(DEFAULT_BACKEND_UNAVAILABLE_MESSAGE)
}

export async function fetchBackendPath(
  path: string,
  init: RequestInit = {},
  options: { search?: string; hostnames?: string[] } = {},
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return fetchAcrossBackendCandidates(
    (baseUrl) => {
      const targetUrl = new URL(baseUrl)
      targetUrl.pathname = normalizedPath
      targetUrl.search = options.search || ''
      return targetUrl.toString()
    },
    init,
  )
}

export async function proxyRequestToBackend(
  request: Request,
  options: {
    pathnameOverride?: string
    unavailableMessage?: string
  } = {},
) {
  const method = request.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const forwardedBody = hasBody ? await request.arrayBuffer() : undefined
  try {
    const backendResponse = await fetchAcrossBackendCandidates(
      (baseUrl) => buildTargetUrl(baseUrl, request, options.pathnameOverride),
      {
        method,
        headers: buildForwardHeaders(request),
        body: forwardedBody,
        redirect: 'manual',
      },
    )

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: buildResponseHeaders(backendResponse),
    })
  } catch (error) {
    console.error('Backend proxy request failed:', error)
    return buildBackendUnavailableResponse(options.unavailableMessage)
  }
}
