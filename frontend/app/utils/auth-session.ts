import type { User } from '@/app/context/AuthContext'

const ACCESS_TOKEN_COOKIE = 'spv_access_token'
const REFRESH_TOKEN_COOKIE = 'spv_refresh_token'
const USER_ROLE_COOKIE = 'spv_user_role'
const MUST_CHANGE_PASSWORD_COOKIE = 'spv_must_change_password'

type JwtPayload = {
  exp?: number
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  try {
    const normalized = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(normalized)) as JwtPayload
  } catch {
    return null
  }
}

function getCookieAttributes(expiresAt?: Date | null) {
  const attributes = ['Path=/', 'SameSite=Lax']
  if (expiresAt) {
    attributes.push(`Expires=${expiresAt.toUTCString()}`)
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    attributes.push('Secure')
  }
  return attributes.join('; ')
}

export function getTokenExpiryDate(token: string) {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp || !Number.isFinite(payload.exp)) {
    return null
  }

  const expiresAt = new Date(payload.exp * 1000)
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt
}

export function isTokenExpired(token?: string | null, now = Date.now()) {
  const expiresAt = token ? getTokenExpiryDate(token) : null
  if (!expiresAt) {
    return false
  }

  return expiresAt.getTime() <= now
}

function setCookie(name: string, value: string, expiresAt?: Date | null) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; ${getCookieAttributes(expiresAt)}`
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function writeAuthSessionCookies(token: string, user: User, refreshToken?: string | null) {
  if (typeof document === 'undefined' || !token || !user?.user_role) {
    return
  }

  const accessExpiresAt = getTokenExpiryDate(token)
  const sessionExpiresAt = getTokenExpiryDate(refreshToken || '') || accessExpiresAt
  setCookie(ACCESS_TOKEN_COOKIE, token, accessExpiresAt)
  if (refreshToken) {
    setCookie(REFRESH_TOKEN_COOKIE, refreshToken, sessionExpiresAt)
  } else {
    clearCookie(REFRESH_TOKEN_COOKIE)
  }
  setCookie(USER_ROLE_COOKIE, user.user_role, sessionExpiresAt)
  setCookie(
    MUST_CHANGE_PASSWORD_COOKIE,
    user.must_change_password ? '1' : '0',
    sessionExpiresAt,
  )
}

export function clearAuthSessionCookies() {
  clearCookie(ACCESS_TOKEN_COOKIE)
  clearCookie(REFRESH_TOKEN_COOKIE)
  clearCookie(USER_ROLE_COOKIE)
  clearCookie(MUST_CHANGE_PASSWORD_COOKIE)
}
