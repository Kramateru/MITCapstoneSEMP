export type UserRole = 'admin' | 'trainer' | 'trainee';

export interface AppUser {
  id?: string;
  user_id?: string;
  name?: string;
  user_name?: string;
  email?: string;
  role?: UserRole;
  user_role?: UserRole;
  lob?: string;
  batchId?: string;
  language?: string;
}

export function getUserId(user?: AppUser) {
  return user?.id ?? user?.user_id ?? '';
}

export function getUserName(user?: AppUser) {
  return user?.name ?? user?.user_name ?? 'User';
}

export function getUserRole(user?: AppUser) {
  return user?.role ?? user?.user_role;
}
