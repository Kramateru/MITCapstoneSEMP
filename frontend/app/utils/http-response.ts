const BACKEND_UNAVAILABLE_MESSAGE =
  'Unable to reach the backend service. Start the backend server and try again.'
const UNEXPECTED_HTML_MESSAGE =
  'The application returned an unexpected HTML page instead of JSON. Check the backend API URL and make sure the auth route is available.'

export type ParsedHttpResponse<T> = {
  contentType: string
  data: T | null
  isHtml: boolean
  isJson: boolean
  text: string
}

function isJsonContentType(contentType: string) {
  return contentType.includes('application/json') || contentType.includes('+json')
}

function isHtmlContentType(contentType: string) {
  return contentType.includes('text/html') || contentType.includes('application/xhtml+xml')
}

function looksLikeJson(text: string) {
  return text.startsWith('{') || text.startsWith('[')
}

export async function readHttpResponse<T>(response: Response): Promise<ParsedHttpResponse<T>> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const text = (await response.text().catch(() => '')).trim()
  const shouldParseJson = Boolean(text) && (isJsonContentType(contentType) || looksLikeJson(text))

  if (!shouldParseJson) {
    return {
      contentType,
      data: null,
      isHtml: isHtmlContentType(contentType) || text.startsWith('<!DOCTYPE') || text.startsWith('<html'),
      isJson: false,
      text,
    }
  }

  try {
    return {
      contentType,
      data: JSON.parse(text) as T,
      isHtml: false,
      isJson: true,
      text,
    }
  } catch {
    return {
      contentType,
      data: null,
      isHtml: isHtmlContentType(contentType) || text.startsWith('<!DOCTYPE') || text.startsWith('<html'),
      isJson: false,
      text,
    }
  }
}

export function getHttpErrorMessage<T>(
  response: Response,
  parsed: ParsedHttpResponse<T>,
  fallback: string,
) {
  const payload = parsed.data

  if (payload && typeof payload === 'object') {
    const candidate = payload as {
      detail?: unknown
      error?: unknown
      message?: unknown
    }

    for (const value of [candidate.message, candidate.detail, candidate.error]) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  if (parsed.isHtml) {
    return response.status >= 500 ? BACKEND_UNAVAILABLE_MESSAGE : UNEXPECTED_HTML_MESSAGE
  }

  if (parsed.text) {
    return response.status >= 500 ? BACKEND_UNAVAILABLE_MESSAGE : parsed.text
  }

  if (response.status >= 500) {
    return BACKEND_UNAVAILABLE_MESSAGE
  }

  return fallback
}

export function getUnexpectedJsonResponseMessage<T>(
  response: Response,
  parsed: ParsedHttpResponse<T>,
  fallback: string,
) {
  if (parsed.isHtml) {
    return UNEXPECTED_HTML_MESSAGE
  }

  if (!parsed.isJson) {
    return parsed.text || fallback
  }

  return fallback
}
