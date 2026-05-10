// Helper functions for API calls with authentication token
import { normalizeConnectivityError } from '@/app/utils/runtime-errors'

export interface ApiResponse<T> {
  status?: string
  message?: string
  data?: T
  [key: string]: unknown
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }

  const text = await response.text().catch(() => '')
  return text.trim() || null
}

function getPayloadErrorMessage(payload: unknown): string | null {
  if (!payload) {
    return null
  }

  if (typeof payload === 'string') {
    return payload
  }

  if (typeof payload === 'object') {
    const candidate = payload as {
      detail?: unknown
      error?: unknown
      message?: unknown
    }

    for (const value of [candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  return null
}

export async function apiFetch<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers,
    })
  } catch (error) {
    throw normalizeConnectivityError(error)
  }

  const payload = await readResponsePayload(response)

  if (!response.ok) {
    const message = getPayloadErrorMessage(payload)
    if (message) {
      throw new Error(message)
    }

    if (response.status >= 500) {
      throw new Error('Unable to reach the backend service right now.')
    }

    throw new Error(response.statusText || 'Request failed.')
  }

  if (response.status === 204 || payload === null || payload === undefined) {
    return undefined as T
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiResponse<T>).data as T
  }
  return payload as T
}

function getDownloadFileName(response: Response, fallbackFileName: string) {
  const disposition = response.headers.get('content-disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i)
  return fileNameMatch?.[1] || fallbackFileName
}

export async function downloadApiFile(
  input: RequestInfo,
  fallbackFileName: string,
  init?: RequestInit,
) {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...(init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined) || {}),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch (error) {
    throw normalizeConnectivityError(error)
  }

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    const message = getPayloadErrorMessage(payload)
    if (message) {
      throw new Error(message)
    }
    throw new Error(response.statusText || 'Unable to download the file.')
  }

  const blob = await response.blob()
  const downloadUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = getDownloadFileName(response, fallbackFileName)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(downloadUrl)
}

export async function post<T>(url: string, body: unknown) {
  return apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body) })
}

export async function get<T>(url: string, params?: Record<string, string | number | boolean>) {
  const query = params
    ? '?' + new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
          acc[k] = String(v)
          return acc
        }, {})
      ).toString()
    : ''
  return apiFetch<T>(url + query, { method: 'GET' })
}

export async function put<T>(url: string, body: unknown) {
  return apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(body) })
}

export async function del<T>(url: string) {
  return apiFetch<T>(url, { method: 'DELETE' })
}
