'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { useEffect, useMemo, useState } from 'react';

type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

type AdminRole = 'admin' | 'trainer';

const DEFAULT_PASSWORDS: Record<AdminRole, string> = {
  admin: 'SPVAdmin2026',
  trainer: 'SPVTrainer2026',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'trainer' as AdminRole,
  });

  const sidebarItems = adminSidebarItems;

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users', { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) {
      setStatus('Unable to load admin and trainer accounts right now.');
      return;
    }

    const data = await res.json();
    setUsers(data.users || []);
  };

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(
    () => users.filter((user) => user.role === 'admin' || user.role === 'trainer'),
    [users],
  );

  const defaultPassword = DEFAULT_PASSWORDS[form.role];

  const createUser = async () => {
    setStatus('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        email: form.email,
        full_name: form.full_name,
        role: form.role,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setStatus(data?.detail || 'Failed to create account.');
      return;
    }

    setStatus(`Account created. Default password: ${data?.temporary_password || defaultPassword}`);
    setForm({
      email: '',
      full_name: '',
      role: form.role,
    });
    await loadUsers();
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="admin">
      <h2 className="mb-2 text-2xl font-bold text-gray-900">Users & Access</h2>
      <p className="mb-6 text-gray-600">
        Create and manage Administrator and Trainer accounts with full access to all LOBs.
      </p>

      {status && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {status}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Create Admin or Trainer</h3>
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Default password for <span className="font-semibold capitalize">{form.role}</span>:
            <span className="ml-1 font-semibold">{defaultPassword}</span>
          </div>
          <div className="space-y-3">
            <input
              className="w-full rounded border px-3 py-2"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="w-full rounded border px-3 py-2"
              placeholder="Full name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <select
              className="w-full rounded border px-3 py-2"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
            >
              <option value="trainer">Trainer</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="w-full rounded border bg-gray-50 px-3 py-2 text-gray-600"
              value={defaultPassword}
              readOnly
            />
            <button
              onClick={createUser}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Create Account
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Admin and Trainer Accounts</h3>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {filteredUsers.map((user) => (
              <div key={user.id} className="rounded border p-3">
                <div className="font-medium text-gray-900">{user.full_name}</div>
                <div className="text-xs text-gray-600">
                  {user.email} | role: {user.role}
                </div>
              </div>
            ))}
            {!filteredUsers.length && (
              <div className="text-sm text-gray-500">No admin or trainer accounts available.</div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
