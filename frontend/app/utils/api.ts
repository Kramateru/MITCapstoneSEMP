// Helper functions for API calls with authentication token

export interface ApiResponse<T> {
  status?: string
  message?: string
  data?: T
  [key: string]: unknown
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

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const rtext = await response.text()
    throw new Error(rtext || response.statusText)
  }

  const payload = await response.json()
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiResponse<T>).data as T
  }
  return payload as T
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
