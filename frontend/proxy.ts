import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type UserRole = 'admin' | 'trainer' | 'trainee'

const ACCESS_TOKEN_COOKIE = 'spv_access_token'
const REFRESH_TOKEN_COOKIE = 'spv_refresh_token'
const USER_ROLE_COOKIE = 'spv_user_role'

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  trainer: '/trainer/dashboard',
  trainee: '/trainee/dashboard',
}

type JwtPayload = {
  exp?: number
  role?: string
}

function normalizeRole(value?: string | null): UserRole | null {
  if (value === 'admin' || value === 'trainer' || value === 'trainee') {
    return value
  }
  return null
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

function getActiveSession(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() || ''
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value?.trim() || ''
  const roleCookie = request.cookies.get(USER_ROLE_COOKIE)?.value?.trim() || ''
  const payload = token ? decodeJwtPayload(token) : null
  const expiresAt = typeof payload?.exp === 'number' ? payload.exp * 1000 : 0
  const role = normalizeRole(roleCookie) || normalizeRole(payload?.role)
  const hasValidAccessToken = Boolean(token && role && expiresAt > Date.now())
  const hasRefreshSession = Boolean(refreshToken && role)

  return {
    role,
    hasValidAccessToken,
    hasRefreshSession,
    isActive: hasValidAccessToken || hasRefreshSession,
  }
}

function redirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  return NextResponse.redirect(url)
}

function roleMatchesPath(pathname: string, role: UserRole) {
  if (pathname.startsWith('/admin')) {
    return role === 'admin'
  }
  if (pathname.startsWith('/trainer')) {
    return role === 'trainer'
  }
  if (pathname.startsWith('/trainee')) {
    return role === 'trainee'
  }
  return true
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = getActiveSession(request)

  if (pathname === '/login') {
    if (session.isActive && session.role) {
      return redirect(request, ROLE_HOME[session.role])
    }
    return NextResponse.next()
  }

  if (pathname === '/' || pathname === '/dashboard') {
    if (session.isActive && session.role) {
      return redirect(request, ROLE_HOME[session.role])
    }
    return redirect(request, '/login')
  }

  const isRoleScopedPath =
    pathname.startsWith('/admin')
    || pathname.startsWith('/trainer')
    || pathname.startsWith('/trainee')

  if (!isRoleScopedPath) {
    return NextResponse.next()
  }

  if (!session.isActive || !session.role) {
    return redirect(request, '/login')
  }

  if (!roleMatchesPath(pathname, session.role)) {
    return redirect(request, ROLE_HOME[session.role])
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/dashboard', '/admin/:path*', '/trainer/:path*', '/trainee/:path*'],
}
