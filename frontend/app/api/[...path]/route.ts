import { NextRequest } from 'next/server'

import { getConfigValue } from '@/app/lib/assessment/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function getBackendBaseUrl() {
  const configuredUrl = getConfigValue(['BACKEND_URL'], 'http://127.0.0.1:8000').trim()
  return configuredUrl.replace(/\/+$/, '')
}

function buildTargetUrl(request: NextRequest) {
  const requestUrl = new URL(request.url)
  return `${getBackendBaseUrl()}${requestUrl.pathname}${requestUrl.search}`
}

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers()

  request.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return
    }

    headers.set(key, value)
  })

  return headers
}

function buildResponseHeaders(response: Response) {
  const headers = new Headers()

  response.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) {
      return
    }

    headers.set(key, value)
  })

  return headers
}

async function proxyToBackend(request: NextRequest) {
  const method = request.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const forwardedBody = hasBody ? await request.arrayBuffer() : undefined

  const backendResponse = await fetch(buildTargetUrl(request), {
    method,
    headers: buildForwardHeaders(request),
    body: forwardedBody,
    cache: 'no-store',
    redirect: 'manual',
  })

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: buildResponseHeaders(backendResponse),
  })
}

export async function GET(request: NextRequest) {
  return proxyToBackend(request)
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request)
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request)
}

export async function PATCH(request: NextRequest) {
  return proxyToBackend(request)
}

export async function DELETE(request: NextRequest) {
  return proxyToBackend(request)
}

export async function OPTIONS(request: NextRequest) {
  return proxyToBackend(request)
}

export async function HEAD(request: NextRequest) {
  return proxyToBackend(request)
}
