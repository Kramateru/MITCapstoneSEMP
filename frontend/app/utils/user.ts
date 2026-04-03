'use client';

import { useAuth } from '@/app/context/AuthContext';
import type { AppUser, UserRole } from '@/app/types/user';

export function useAppUser(fallbackRole: UserRole = 'trainee'): AppUser {
  void fallbackRole;
  const { user } = useAuth();
  if (!user) {
    return {};
  }

  return {
    id: user.user_id,
    user_id: user.user_id,
    name: user.user_name,
    user_name: user.user_name,
    email: user.email,
    role: user.user_role,
    user_role: user.user_role,
  };
}
