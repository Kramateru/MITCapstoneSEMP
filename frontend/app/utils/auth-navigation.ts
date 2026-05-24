import type { UserRole } from '@/app/types/user'

type AuthenticatedUserLike = {
  user_role?: UserRole | null
  must_change_password?: boolean | null
}

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  trainer: '/trainer/dashboard',
  trainee: '/trainee/dashboard',
}

function normalizeRole(role?: string | null): UserRole | null {
  if (typeof role !== 'string') {
    return null
  }

  const normalized = role.trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'trainer' || normalized === 'trainee') {
    return normalized
  }

  return null
}

export function getRoleHomePath(role?: UserRole | null) {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) {
    return '/dashboard'
  }

  return ROLE_HOME[normalizedRole] ?? '/dashboard'
}

export function getPostLoginPath(user?: AuthenticatedUserLike | null) {
  return getRoleHomePath(user?.user_role ?? 'trainee')
}

export function navigateToPath(path: string, options?: { replace?: boolean }) {
  if (typeof window === 'undefined') {
    return false
  }

  if (options?.replace === false) {
    window.location.assign(path)
    return true
  }

  window.location.replace(path)
  return true
}
