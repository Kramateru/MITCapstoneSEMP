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

export function getRoleHomePath(role?: UserRole | null) {
  if (!role) {
    return '/dashboard'
  }

  return ROLE_HOME[role] ?? '/dashboard'
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
