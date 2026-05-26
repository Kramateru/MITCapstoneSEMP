'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

import { clearAuthSessionCookies, isTokenExpired, writeAuthSessionCookies } from '@/app/utils/auth-session'
import {
  getHttpErrorMessage,
  getUnexpectedJsonResponseMessage,
  readHttpResponse,
} from '@/app/utils/http-response'
import { normalizeConnectivityError } from '@/app/utils/runtime-errors'

export interface User {
  user_id: string
  user_role: 'admin' | 'trainer' | 'trainee'
  user_name: string
  email: string
  profile_image_url?: string | null
  must_change_password?: boolean
  batch_id?: string | null
  batch_name?: string | null
  wave_number?: number | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  refreshToken: () => Promise<string | null>
  updateUser: (updates: Partial<User>) => void
}

type AuthApiUserPayload = {
  id?: unknown
  role?: unknown
  full_name?: unknown
  email?: unknown
  profile_image_url?: unknown
}

type AuthApiPayload = {
  access_token?: unknown
  refresh_token?: unknown
  supabase_access_token?: unknown
  supabase_refresh_token?: unknown
  user?: AuthApiUserPayload
  must_change_password?: unknown
  batch_id?: unknown
  batch_name?: unknown
  wave_number?: unknown
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const SUPABASE_ACCESS_TOKEN_KEY = 'supabase_access_token'
const SUPABASE_REFRESH_TOKEN_KEY = 'supabase_refresh_token'
const expectedLoginErrorPatterns = [
  /^invalid email or password$/i,
  /^email is required\.?$/i,
  /^password is required\.?$/i,
  /^user account is inactive$/i,
  /^your supabase account does not have a platform profile\.?$/i,
  /^this supabase account is currently disabled\.?$/i,
]

function normalizeUserRole(value: unknown): User['user_role'] | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'trainer' || normalized === 'trainee') {
    return normalized
  }

  return null
}

function normalizeStoredUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const candidate = raw as Partial<User> & {
    id?: unknown
    role?: unknown
    name?: unknown
    full_name?: unknown
  }

  const userId =
    typeof candidate.user_id === 'string'
      ? candidate.user_id
      : typeof candidate.id === 'string'
        ? candidate.id
        : null
  const userRole = normalizeUserRole(candidate.user_role) ?? normalizeUserRole(candidate.role)
  const userName =
    typeof candidate.user_name === 'string'
      ? candidate.user_name
      : typeof candidate.name === 'string'
        ? candidate.name
        : typeof candidate.full_name === 'string'
          ? candidate.full_name
          : null
  const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : null
  const profileImageUrl =
    typeof candidate.profile_image_url === 'string' ? candidate.profile_image_url : null
  const batchId = typeof candidate.batch_id === 'string' ? candidate.batch_id : null
  const batchName = typeof candidate.batch_name === 'string' ? candidate.batch_name : null
  const waveNumber =
    typeof candidate.wave_number === 'number' && Number.isFinite(candidate.wave_number)
      ? candidate.wave_number
      : null

  if (!userId || !userRole || !userName || !email) {
    return null
  }

  return {
    user_id: userId,
    user_role: userRole,
    user_name: userName,
    email,
    profile_image_url: profileImageUrl,
    must_change_password: Boolean(candidate.must_change_password),
    batch_id: batchId,
    batch_name: batchName,
    wave_number: waveNumber,
  }
}

function clearStoredAuthState() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('refresh_token')
    window.localStorage.removeItem(SUPABASE_ACCESS_TOKEN_KEY)
    window.localStorage.removeItem(SUPABASE_REFRESH_TOKEN_KEY)
    window.localStorage.removeItem('user')
  } catch (storageError) {
    console.warn('Unable to clear cached auth state:', storageError)
  }

  clearAuthSessionCookies()
}

function readStoredAuthState() {
  if (typeof window === 'undefined') {
    return {
      token: null,
      refreshToken: null,
      user: null,
    }
  }

  try {
    const savedToken = window.localStorage.getItem('token')
    const savedRefreshToken = window.localStorage.getItem('refresh_token')
    const savedUser = window.localStorage.getItem('user')

    if (!savedToken || !savedUser) {
      return {
        token: savedToken,
        refreshToken: savedRefreshToken,
        user: null,
      }
    }

    const parsedUser = normalizeStoredUser(JSON.parse(savedUser))
    if (!parsedUser) {
      clearStoredAuthState()
      return {
        token: null,
        refreshToken: null,
        user: null,
      }
    }

    return {
      token: savedToken,
      refreshToken: savedRefreshToken,
      user: parsedUser,
    }
  } catch (storageError) {
    console.warn('Ignoring invalid cached auth state:', storageError)
    clearStoredAuthState()
    return {
      token: null,
      refreshToken: null,
      user: null,
    }
  }
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const parsed = await readHttpResponse<Record<string, unknown>>(response)
  return getHttpErrorMessage(response, parsed, fallback)
}

function buildUserFromResponse(payload: AuthApiPayload): User {
  const user = payload.user
  const userId = typeof user?.id === 'string' ? user.id : ''
  const userRole = normalizeUserRole(user?.role)
  const userName = typeof user?.full_name === 'string' ? user.full_name.trim() : ''
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''

  if (!userId || !userRole || !userName || !email) {
    throw new Error('Failed to process user data from login response')
  }

  return {
    user_id: userId,
    user_role: userRole,
    user_name: userName,
    email,
    profile_image_url: typeof user?.profile_image_url === 'string' ? user.profile_image_url : null,
    must_change_password: Boolean(payload.must_change_password),
    batch_id: typeof payload.batch_id === 'string' ? payload.batch_id : null,
    batch_name: typeof payload.batch_name === 'string' ? payload.batch_name : null,
    wave_number:
      typeof payload.wave_number === 'number' && Number.isFinite(payload.wave_number)
        ? payload.wave_number
        : null,
  }
}

function getStoredSupabaseRefreshToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(SUPABASE_REFRESH_TOKEN_KEY)
}

function getAccessTokenFromPayload(payload: AuthApiPayload) {
  return typeof payload.access_token === 'string' ? payload.access_token : ''
}

function getRefreshTokenFromPayload(payload: AuthApiPayload, fallbackValue?: string | null) {
  return typeof payload.refresh_token === 'string' ? payload.refresh_token : fallbackValue || null
}

function isExpectedLoginError(error: Error) {
  const message = error.message.trim()
  if (!message) {
    return false
  }

  return expectedLoginErrorPatterns.some((pattern) => pattern.test(message))
}

async function parseAuthSuccessResponse(response: Response, fallbackMessage: string) {
  const parsed = await readHttpResponse<AuthApiPayload>(response)
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error(getUnexpectedJsonResponseMessage(response, parsed, fallbackMessage))
  }

  return parsed.data
}

function persistAuthState(payload: AuthApiPayload, nextUser: User, fallbackRefreshToken?: string | null) {
  const accessToken = getAccessTokenFromPayload(payload)
  if (!accessToken) {
    throw new Error('Invalid login response: missing access token')
  }

  const refreshToken = getRefreshTokenFromPayload(payload, fallbackRefreshToken)

  localStorage.setItem('token', accessToken)
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken)
  } else {
    localStorage.removeItem('refresh_token')
  }
  if (typeof payload.supabase_access_token === 'string' && payload.supabase_access_token.trim()) {
    localStorage.setItem(SUPABASE_ACCESS_TOKEN_KEY, payload.supabase_access_token)
  } else {
    localStorage.removeItem(SUPABASE_ACCESS_TOKEN_KEY)
  }
  if (typeof payload.supabase_refresh_token === 'string' && payload.supabase_refresh_token.trim()) {
    localStorage.setItem(SUPABASE_REFRESH_TOKEN_KEY, payload.supabase_refresh_token)
  } else {
    localStorage.removeItem(SUPABASE_REFRESH_TOKEN_KEY)
  }
  localStorage.setItem('user', JSON.stringify(nextUser))
  writeAuthSessionCookies(accessToken, nextUser, refreshToken)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      const storedAuth = readStoredAuthState()

      if (!storedAuth.token || !storedAuth.user) {
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      setToken(storedAuth.token)
      setRefreshTokenValue(storedAuth.refreshToken)
      setUser(storedAuth.user)
      writeAuthSessionCookies(storedAuth.token, storedAuth.user, storedAuth.refreshToken)

      if (!storedAuth.refreshToken || !isTokenExpired(storedAuth.token)) {
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      try {
        const supabaseRefreshToken = getStoredSupabaseRefreshToken()

        const response = await fetch('/api/auth/refresh-token', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            Authorization: `Bearer ${storedAuth.refreshToken}`,
            ...(supabaseRefreshToken
              ? { 'X-Supabase-Refresh-Token': supabaseRefreshToken }
              : {}),
          },
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Session expired. Please sign in again.'))
        }

        const payload = await parseAuthSuccessResponse(
          response,
          'Invalid refresh response from the backend.',
        )
        const nextAccessToken = getAccessTokenFromPayload(payload)
        if (!nextAccessToken) {
          throw new Error('Invalid refresh response: missing access token')
        }

        const nextUser = payload.user ? buildUserFromResponse(payload) : storedAuth.user
        const nextRefreshToken = getRefreshTokenFromPayload(payload, storedAuth.refreshToken)

        if (!isMounted) {
          return
        }

        setToken(nextAccessToken)
        setRefreshTokenValue(nextRefreshToken)
        setUser(nextUser)
        persistAuthState(payload, nextUser, storedAuth.refreshToken)
      } catch (initializationError) {
        console.error('Session bootstrap refresh failed:', initializationError)
        if (isMounted) {
          setUser(null)
          setToken(null)
          setRefreshTokenValue(null)
        }
        clearStoredAuthState()
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void initializeAuth()
    return () => {
      isMounted = false
    }
  }, [])

  const login = async (email: string, password: string): Promise<User> => {
    try {
      const trimmedEmail = email.trim().toLowerCase()
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ email: trimmedEmail, password }),
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Login failed'))
      }

      const payload = await parseAuthSuccessResponse(
        response,
        'Invalid login response from the backend.',
      )
      if (!payload.user) {
        throw new Error('Invalid login response: missing user data')
      }

      const nextAccessToken = getAccessTokenFromPayload(payload)
      if (!nextAccessToken) {
        throw new Error('Invalid login response: missing access token')
      }

      const nextUser = buildUserFromResponse(payload)

      setToken(nextAccessToken)
      setRefreshTokenValue(getRefreshTokenFromPayload(payload))
      setUser(nextUser)

      try {
        persistAuthState(payload, nextUser)
      } catch (storageError) {
        console.warn('Unable to cache auth state:', storageError)
      }

      return nextUser
    } catch (error) {
      const normalizedError = normalizeConnectivityError(error)
      if (!isExpectedLoginError(normalizedError)) {
        console.error('Login error:', normalizedError)
      }
      throw normalizedError
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setRefreshTokenValue(null)
    clearStoredAuthState()
  }

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem('user', JSON.stringify(next))
        if (token) {
          writeAuthSessionCookies(token, next, refreshTokenValue)
        }
      } catch (storageError) {
        console.warn('Unable to update cached user:', storageError)
      }
      return next
    })
  }

  const refreshToken = async () => {
    try {
      const tokenForRefresh = refreshTokenValue || token
      if (!tokenForRefresh) {
        return null
      }

      const supabaseRefreshToken = getStoredSupabaseRefreshToken()
      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          Authorization: `Bearer ${tokenForRefresh}`,
          ...(supabaseRefreshToken
            ? { 'X-Supabase-Refresh-Token': supabaseRefreshToken }
            : {}),
        },
        cache: 'no-store',
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Session expired. Please sign in again.')
        logout()
        throw new Error(message)
      }

      const payload = await parseAuthSuccessResponse(
        response,
        'Invalid refresh response from the backend.',
      )
      const nextAccessToken = getAccessTokenFromPayload(payload)
      if (!nextAccessToken) {
        throw new Error('Invalid refresh response: missing access token')
      }

      const nextUser = payload.user ? buildUserFromResponse(payload) : user
      if (!nextUser) {
        throw new Error('Invalid refresh response: missing user data')
      }

      const nextRefreshToken = getRefreshTokenFromPayload(payload, tokenForRefresh)
      setToken(nextAccessToken)
      setRefreshTokenValue(nextRefreshToken)
      setUser(nextUser)

      try {
        persistAuthState(payload, nextUser, tokenForRefresh)
      } catch (storageError) {
        console.warn('Unable to cache refreshed auth state:', storageError)
      }

      return nextAccessToken
    } catch (error) {
      console.error('Token refresh error:', error)
      logout()
      return null
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshToken,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
