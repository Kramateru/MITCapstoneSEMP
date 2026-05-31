'use client';

import {
  CalendarDays,
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Progress } from '@/app/components/ui/progress';
import { useAuth } from '@/app/context/AuthContext';

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'trainer' | 'trainee' | string;
  profile_image_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_login?: string | null;
  is_active?: boolean;
};

type PasswordForm = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const EMPTY_PASSWORD_FORM: PasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getInitials(name: string) {
  const tokens = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return tokens.length ? tokens.map((token) => token[0]?.toUpperCase()).join('') : 'U';
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return date.toLocaleString();
}

function getImageValidationError(file: File) {
  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
    return 'Profile picture must be JPG, JPEG, PNG, or WEBP.';
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    return 'Profile picture must be 5 MB or smaller.';
  }
  return null;
}

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

function getPasswordStrength(password: string) {
  const checks = getPasswordChecks(password);
  const passed = Object.values(checks).filter(Boolean).length;
  if (!password) {
    return { passed, label: 'Not started', value: 0 };
  }
  if (passed <= 2) {
    return { passed, label: 'Weak', value: 32 };
  }
  if (passed <= 4) {
    return { passed, label: 'Good', value: 68 };
  }
  return { passed, label: 'Strong', value: 100 };
}

async function readPayload<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export function ProfilePageContent({ roleLabel }: { roleLabel: string }) {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [fullName, setFullName] = useState('');
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const payload = await readPayload<ProfileRecord & { detail?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.detail || 'Unable to load your profile.');
      }
      setProfile(payload);
      setFullName(payload.full_name || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  const imageUrl = previewUrl || profile?.profile_image_url || user?.profile_image_url || null;
  const initials = getInitials(fullName || profile?.full_name || user?.user_name || 'User');
  const nameError = fullName.trim().length < 2
    ? 'Full name must be at least 2 characters.'
    : fullName.trim().length > 100
      ? 'Full name must be 100 characters or fewer.'
      : '';
  const passwordStrength = useMemo(() => getPasswordStrength(passwordForm.newPassword), [passwordForm.newPassword]);
  const passwordChecks = useMemo(() => getPasswordChecks(passwordForm.newPassword), [passwordForm.newPassword]);
  const canChangePassword = passwordStrength.passed === 5
    && passwordForm.oldPassword.length > 0
    && passwordForm.newPassword === passwordForm.confirmPassword;

  const syncProfile = (nextProfile: ProfileRecord) => {
    updateUser({
      user_name: nextProfile.full_name,
      email: nextProfile.email,
      profile_image_url: nextProfile.profile_image_url ?? null,
    });
  };

  const saveName = async () => {
    if (nameError) {
      toast.error(nameError);
      return;
    }
    setSavingName(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      const payload = await readPayload<ProfileRecord & { detail?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.detail || 'Unable to save profile name.');
      }
      setProfile(payload);
      setFullName(payload.full_name);
      syncProfile(payload);
      toast.success('Profile name updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save profile name.');
    } finally {
      setSavingName(false);
    }
  };

  const uploadProfilePicture = async () => {
    if (!selectedFile) {
      toast.error('Choose an image before uploading.');
      return;
    }
    const validationError = getImageValidationError(selectedFile);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await fetch('/api/users/me/profile-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const payload = await readPayload<{
        detail?: string;
        data?: { user?: ProfileRecord; profile_image_url?: string | null };
      }>(response);
      if (!response.ok) {
        throw new Error(payload.detail || 'Unable to upload profile picture.');
      }
      const nextProfile = payload.data?.user || {
        ...(profile as ProfileRecord),
        profile_image_url: payload.data?.profile_image_url ?? null,
      };
      setProfile(nextProfile);
      setSelectedFile(null);
      syncProfile(nextProfile);
      toast.success('Profile picture updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload profile picture.');
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async () => {
    if (!canChangePassword) {
      toast.error('Complete all password requirements before submitting.');
      return;
    }
    setChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          old_password: passwordForm.oldPassword,
          new_password: passwordForm.newPassword,
        }),
      });
      const payload = await readPayload<{ detail?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || 'Unable to change password.');
      }
      setPasswordForm(EMPTY_PASSWORD_FORM);
      toast.success('Password changed successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading profile...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Manage your identity, profile picture, and password for the {roleLabel} workspace.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Account Identity</CardTitle>
            <CardDescription>Visible account information from your authenticated profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center text-center">
              <Avatar className="size-32 ring-2 ring-border">
                {imageUrl ? <AvatarImage src={imageUrl} alt={fullName || 'Profile picture'} /> : null}
                <AvatarFallback className="bg-blue-100 text-3xl font-bold text-blue-800">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="mt-4 text-xl font-semibold text-slate-950">{fullName || 'User'}</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="size-4" />
                {profile?.email}
              </div>
              <Badge variant="info" className="mt-3 capitalize">{profile?.role}</Badge>
            </div>

            <div className="grid gap-3 border-t pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4" />
                  Created
                </span>
                <span className="text-right font-medium">{formatDateTime(profile?.created_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-4" />
                  Last Login
                </span>
                <span className="text-right font-medium">{formatDateTime(profile?.last_login)}</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                if (nextFile) {
                  const validationError = getImageValidationError(nextFile);
                  if (validationError) {
                    toast.error(validationError);
                    event.target.value = '';
                    return;
                  }
                }
                setSelectedFile(nextFile);
              }}
            />

            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Camera className="size-4" />
                Choose Picture
              </Button>
              <Button type="button" onClick={() => void uploadProfilePicture()} disabled={!selectedFile || uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload Picture
              </Button>
              {selectedFile ? (
                <p className="text-xs text-muted-foreground">
                  Previewing {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-5 text-primary" />
                Change Name
              </CardTitle>
              <CardDescription>Use 2 to 100 characters. This updates the name shown across the app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-full-name">Full Name</Label>
                <Input
                  id="profile-full-name"
                  value={fullName}
                  minLength={2}
                  maxLength={100}
                  onChange={(event) => setFullName(event.target.value)}
                  aria-invalid={Boolean(nameError)}
                />
                {nameError ? <p className="text-sm text-rose-600">{nameError}</p> : null}
              </div>
              <Button type="button" onClick={() => void saveName()} disabled={savingName || Boolean(nameError)}>
                {savingName ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Name
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                Change Password
              </CardTitle>
              <CardDescription>Use a strong password and confirm it before saving.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    aria-invalid={Boolean(passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword)}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Password strength</span>
                  <span className="font-semibold">{passwordStrength.label}</span>
                </div>
                <Progress value={passwordStrength.value} />
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {[
                    ['8 characters', passwordChecks.length],
                    ['Uppercase letter', passwordChecks.uppercase],
                    ['Lowercase letter', passwordChecks.lowercase],
                    ['Number', passwordChecks.number],
                    ['Special character', passwordChecks.special],
                    ['Passwords match', Boolean(passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword)],
                  ].map(([label, passed]) => (
                    <span key={String(label)} className="flex items-center gap-2">
                      <CheckCircle2 className={`size-4 ${passed ? 'text-emerald-600' : 'text-slate-300'}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <Button type="button" onClick={() => void changePassword()} disabled={!canChangePassword || changingPassword}>
                {changingPassword ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Update Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
