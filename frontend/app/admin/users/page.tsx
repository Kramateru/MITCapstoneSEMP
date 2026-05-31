'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { apiFetch } from '@/app/utils/api';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type UserRole = 'admin' | 'trainer' | 'trainee';
type RoleFilter = UserRole | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name' | 'email' | 'role' | 'created_at' | 'last_login' | 'status';
type SortOrder = 'asc' | 'desc';

type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  lob?: string | null;
  department?: string | null;
  language_dialect?: string | null;
  profile_image_url?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  last_login?: string | null;
};

type UsersPayload = {
  users: UserRecord[];
  total: number;
  count: number;
  skip: number;
  limit: number;
};

type CreateForm = {
  email: string;
  full_name: string;
  role: 'admin' | 'trainer';
};

const DEFAULT_PASSWORDS: Record<CreateForm['role'], string> = {
  admin: 'SPVAdmin2026',
  trainer: 'SPVTrainer2026',
};

const PAGE_SIZE = 10;

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((part) => part[0]?.toUpperCase()).join('') : 'U';
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function roleBadgeVariant(role: UserRole) {
  if (role === 'admin') return 'danger' as const;
  if (role === 'trainer') return 'info' as const;
  return 'success' as const;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [createForm, setCreateForm] = useState<CreateForm>({
    email: '',
    full_name: '',
    role: 'trainer',
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      skip: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('is_active', statusFilter === 'active' ? 'true' : 'false');
    return `/api/admin/users?${params.toString()}`;
  }, [page, roleFilter, search, sortBy, sortOrder, statusFilter]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<UsersPayload>(queryUrl, { cache: 'no-store' });
      setUsers(payload.users || []);
      setTotal(payload.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [queryUrl]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(0);
  }, [roleFilter, search, sortBy, sortOrder, statusFilter]);

  const createUser = async () => {
    const fullName = createForm.full_name.trim();
    if (fullName.length < 2 || fullName.length > 100) {
      toast.error('Full name must be 2 to 100 characters.');
      return;
    }
    if (!createForm.email.trim()) {
      toast.error('Email address is required.');
      return;
    }
    setCreating(true);
    try {
      const payload = await apiFetch<{ temporary_password?: string }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createForm.email.trim(),
          full_name: fullName,
          role: createForm.role,
        }),
      });
      toast.success(`Account created. Temporary password: ${payload.temporary_password || DEFAULT_PASSWORDS[createForm.role]}`);
      setCreateForm({ email: '', full_name: '', role: createForm.role });
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create user.');
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (user: UserRecord, updates: Partial<Pick<UserRecord, 'role' | 'is_active' | 'full_name'>>) => {
    setSavingUserId(user.id);
    try {
      const payload = await apiFetch<{ user: UserRecord }>(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      const nextUser = payload.user;
      setUsers((current) => current.map((row) => (row.id === nextUser.id ? nextUser : row)));
      setSelectedUser((current) => (current?.id === nextUser.id ? nextUser : current));
      toast.success('User account updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update user.');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage platform accounts, profile visibility, roles, and active status.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-5 text-primary" />
                Create Admin or Trainer
              </CardTitle>
              <CardDescription>New accounts are synced to Supabase Auth with a temporary password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Default password for <span className="font-semibold capitalize">{createForm.role}</span>: {DEFAULT_PASSWORDS[createForm.role]}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-email">Email Address</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-name">Full Name</Label>
                <Input
                  id="new-user-name"
                  value={createForm.full_name}
                  minLength={2}
                  maxLength={100}
                  onChange={(event) => setCreateForm((current) => ({ ...current, full_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-role">Role</Label>
                <select
                  id="new-user-role"
                  value={createForm.role}
                  onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as CreateForm['role'] }))}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="button" onClick={() => void createUser()} disabled={creating} className="w-full">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Create Account
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                All Users
              </CardTitle>
              <CardDescription>Search, filter, sort, paginate, and manage access for every role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px_120px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or email"
                    className="pl-9"
                  />
                </div>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="trainer">Trainer</option>
                  <option value="trainee">Trainee</option>
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="created_at">Created date</option>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="role">Role</option>
                  <option value="last_login">Last login</option>
                  <option value="status">Status</option>
                </select>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>

              {loading ? (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading users...
                </div>
              ) : users.length ? (
                <div className="overflow-hidden rounded-2xl border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-sm">
                      <thead className="bg-muted/70 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3">Last Login</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.map((user) => (
                          <tr key={user.id} className="bg-white">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="size-11">
                                  {user.profile_image_url ? <AvatarImage src={user.profile_image_url} alt={user.full_name} /> : null}
                                  <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-slate-950">{user.full_name}</div>
                                  <div className="text-xs text-muted-foreground">{user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={user.role}
                                disabled={savingUserId === user.id}
                                onChange={(event) => void updateUser(user, { role: event.target.value as UserRole })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
                              >
                                <option value="admin">Admin</option>
                                <option value="trainer">Trainer</option>
                                <option value="trainee">Trainee</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={user.is_active ? 'success' : 'neutral'}>
                                {user.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.last_login)}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedUser(user)}>
                                  <Eye className="size-4" />
                                  View
                                </Button>
                                <Button
                                  type="button"
                                  variant={user.is_active ? 'destructive' : 'outline'}
                                  size="sm"
                                  disabled={savingUserId === user.id}
                                  onClick={() => void updateUser(user, { is_active: !user.is_active })}
                                >
                                  {savingUserId === user.id ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                                  {user.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                  No users match the current filters.
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {users.length} of {total} users. Page {page + 1} of {pageCount}.
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button type="button" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedUser ? (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>Selected user account details and profile picture.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="flex flex-col items-center rounded-2xl border bg-muted/20 p-5 text-center">
                <Avatar className="size-28">
                  {selectedUser.profile_image_url ? <AvatarImage src={selectedUser.profile_image_url} alt={selectedUser.full_name} /> : null}
                  <AvatarFallback className="text-2xl">{getInitials(selectedUser.full_name)}</AvatarFallback>
                </Avatar>
                <div className="mt-3 font-semibold">{selectedUser.full_name}</div>
                <Badge variant={roleBadgeVariant(selectedUser.role)} className="mt-2 capitalize">{selectedUser.role}</Badge>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div><span className="text-muted-foreground">Email:</span> {selectedUser.email}</div>
                <div><span className="text-muted-foreground">Status:</span> {selectedUser.is_active ? 'Active' : 'Inactive'}</div>
                <div><span className="text-muted-foreground">Created:</span> {formatDateTime(selectedUser.created_at)}</div>
                <div><span className="text-muted-foreground">Updated:</span> {formatDateTime(selectedUser.updated_at)}</div>
                <div><span className="text-muted-foreground">Last login:</span> {formatDateTime(selectedUser.last_login)}</div>
                <div><span className="text-muted-foreground">Language:</span> {selectedUser.language_dialect || 'en-US'}</div>
                <div><span className="text-muted-foreground">Department:</span> {selectedUser.department || 'Not set'}</div>
                <div><span className="text-muted-foreground">LOB:</span> {selectedUser.lob || 'Not set'}</div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
