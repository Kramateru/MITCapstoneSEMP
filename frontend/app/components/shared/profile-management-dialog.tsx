'use client';

import {
    Camera,
    KeyRound,
    Loader2,
    Mail,
    Save,
    ShieldCheck,
    Trash2,
    UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { useAuth } from '@/app/context/AuthContext';

type RoleName = 'admin' | 'trainer' | 'trainee';

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string;
  role: RoleName;
  profile_image_url?: string | null;
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
const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function getProfileImageValidationError(file: File) {
  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
    return 'Profile picture must be a JPG, PNG, or WEBP image.';
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    return 'Profile picture must be 5 MB or smaller.';
  }

  return null;
}

function buildInitialProfile(user: ReturnType<typeof useAuth>['user']): ProfileRecord | null {
  if (!user) {
    return null;
  }

  return {
    id: user.user_id,
    email: user.email,
    full_name: user.user_name,
    role: user.user_role,
    profile_image_url: user.profile_image_url ?? null,
  };
}

function initialsFromName(name: string) {
  const tokens = name
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return 'SP';
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? '').join('');
}

export default function ProfileManagementDialog() {
  const { user, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(() => buildInitialProfile(user));
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [localImagePreviewUrl, setLocalImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfile((current) => current ?? buildInitialProfile(user));
  }, [user]);

  useEffect(() => {
    if (!open || !user) {
      return;
    }

    let isMounted = true;
    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/users/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        const data = (await response.json()) as ProfileRecord & { detail?: string };
        if (!response.ok) {
          throw new Error(data.detail || 'Unable to load profile details');
        }

        if (isMounted) {
          setProfile({
            ...data,
            profile_image_url: data.profile_image_url ?? null,
          });
          setSelectedImageFile(null);
          setRemoveExistingImage(false);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load profile details';
        toast.error(message);
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [open, user]);

  useEffect(() => {
    if (!selectedImageFile) {
      setLocalImagePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedImageFile);
    setLocalImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImageFile]);

  const imagePreviewUrl = useMemo(() => {
    if (localImagePreviewUrl) {
      return localImagePreviewUrl;
    }
    if (removeExistingImage) {
      return null;
    }
    return profile?.profile_image_url ?? user?.profile_image_url ?? null;
  }, [localImagePreviewUrl, profile?.profile_image_url, removeExistingImage, user?.profile_image_url]);

  if (!user || !profile) {
    return null;
  }

  const initials = initialsFromName(profile.full_name || user.user_name);

  const syncAuthUser = (nextProfile: ProfileRecord) => {
    updateUser({
      user_name: nextProfile.full_name,
      email: nextProfile.email,
      profile_image_url: nextProfile.profile_image_url ?? null,
      must_change_password: false,
    });
  };

  const saveProfile = async () => {
    if (!profile) {
      return;
    }

    setSavingProfile(true);
    try {
      const token = localStorage.getItem('token');
      const profileResponse = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          full_name: profile.full_name,
          email: profile.email,
        }),
      });

      const updatedProfilePayload = (await profileResponse.json()) as ProfileRecord & { detail?: string };
      if (!profileResponse.ok) {
        throw new Error(updatedProfilePayload.detail || 'Unable to save profile details');
      }

      let finalProfile: ProfileRecord = {
        ...updatedProfilePayload,
        profile_image_url: updatedProfilePayload.profile_image_url ?? null,
      };
      setProfile((current) =>
        current
          ? {
              ...current,
              ...finalProfile,
              profile_image_url: finalProfile.profile_image_url ?? null,
            }
          : finalProfile,
      );
      syncAuthUser(finalProfile);

      if (selectedImageFile) {
        const formData = new FormData();
        formData.append('file', selectedImageFile);
        const uploadResponse = await fetch('/api/users/me/profile-image', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        });

        const uploadPayload = (await uploadResponse.json()) as {
          detail?: string;
          data?: { user?: ProfileRecord; profile_image_url?: string | null };
        };

        if (!uploadResponse.ok) {
          throw new Error(
            uploadPayload.detail || 'Profile details were saved, but the profile picture upload failed',
          );
        }

        if (uploadPayload.data?.user) {
          finalProfile = {
            ...uploadPayload.data.user,
            profile_image_url: uploadPayload.data.profile_image_url ?? uploadPayload.data.user.profile_image_url ?? null,
          };
        } else {
          finalProfile.profile_image_url = uploadPayload.data?.profile_image_url ?? finalProfile.profile_image_url ?? null;
        }
      } else if (removeExistingImage && finalProfile.profile_image_url) {
        const deleteResponse = await fetch('/api/users/me/profile-image', {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const deletePayload = (await deleteResponse.json()) as {
          detail?: string;
          data?: { user?: ProfileRecord };
        };
        if (!deleteResponse.ok) {
          throw new Error(
            deletePayload.detail || 'Profile details were saved, but the profile picture could not be removed',
          );
        }
        finalProfile = deletePayload.data?.user
          ? {
              ...deletePayload.data.user,
              profile_image_url: null,
            }
          : {
              ...finalProfile,
              profile_image_url: null,
            };
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              ...finalProfile,
              profile_image_url: finalProfile.profile_image_url ?? null,
            }
          : finalProfile,
      );
      setSelectedImageFile(null);
      setRemoveExistingImage(false);
      syncAuthUser(finalProfile);
      toast.success('Profile updated and saved to the database.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your profile';
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Complete the current, new, and confirm password fields first.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New password and confirm password do not match.');
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

      const payload = (await response.json()) as { detail?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || 'Unable to change password');
      }

      setPasswordForm(EMPTY_PASSWORD_FORM);
      updateUser({ must_change_password: false });
      toast.success('Password changed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change password';
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open profile management"
        title="Manage profile"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <Avatar className="size-11 ring-1 ring-border">
          {imagePreviewUrl ? <AvatarImage src={imagePreviewUrl} alt={profile.full_name} /> : null}
          <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-800">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-semibold text-foreground">
            {user.user_name || 'User'}
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {user.user_role}
          </div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="overflow-hidden rounded-3xl p-0">
          <div className="flex max-h-[min(92vh,900px)] flex-col">
            <DialogHeader className="border-b border-border px-4 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-14">
              <DialogTitle>Profile Management</DialogTitle>
              <DialogDescription className="max-w-3xl leading-6">
                Update your profile details, upload a profile picture, and change your password. These changes are saved to your account record.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto bg-muted/20 px-3 py-3 sm:px-5 sm:py-5">
              {loadingProfile ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading your profile details from the database...
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
                  <div className="space-y-4 rounded-3xl border border-border bg-card/95 p-4 shadow-sm sm:p-6 lg:sticky lg:top-0 lg:self-start">
                    <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:text-left lg:flex-col lg:text-center">
                      <Avatar className="size-24 ring-2 ring-border sm:size-28">
                        {imagePreviewUrl ? <AvatarImage src={imagePreviewUrl} alt={profile.full_name} /> : null}
                        <AvatarFallback className="bg-blue-100 text-xl font-bold text-blue-800 sm:text-2xl">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1 space-y-2 lg:flex-none">
                        <div className="truncate text-lg font-semibold text-foreground">{profile.full_name}</div>
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground md:justify-start lg:justify-center">
                          <Mail className="size-4 shrink-0" />
                          <span className="truncate">{profile.email}</span>
                        </div>
                        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                          {profile.role}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0] ?? null;
                          if (nextFile) {
                            const validationError = getProfileImageValidationError(nextFile);
                            if (validationError) {
                              toast.error(validationError);
                              event.target.value = '';
                              return;
                            }
                          }
                          setSelectedImageFile(nextFile);
                          if (nextFile) {
                            setRemoveExistingImage(false);
                          }
                        }}
                      />

                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera className="size-4" />
                          {imagePreviewUrl ? 'Change Profile Picture' : 'Upload Profile Picture'}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          disabled={!imagePreviewUrl}
                          onClick={() => {
                            setSelectedImageFile(null);
                            setRemoveExistingImage(true);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Remove Picture
                        </Button>
                      </div>

                      {selectedImageFile ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                          Selected file: <span className="font-semibold">{selectedImageFile.name}</span>
                          {' '}({(selectedImageFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </div>
                      ) : null}

                      {savingProfile && selectedImageFile ? (
                        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          Uploading your profile picture to Supabase Storage...
                        </div>
                      ) : null}
                    </div>

                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
                      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                        <UserRound className="size-4 text-primary" />
                        Profile Details
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="profile-full-name">Full Name</Label>
                          <Input
                            id="profile-full-name"
                            value={profile.full_name}
                            className="h-11"
                            onChange={(event) =>
                              setProfile((current) =>
                                current ? { ...current, full_name: event.target.value } : current,
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="profile-email">Email Address</Label>
                          <Input
                            id="profile-email"
                            type="email"
                            value={profile.email}
                            className="h-11"
                            onChange={(event) =>
                              setProfile((current) =>
                                current ? { ...current, email: event.target.value } : current,
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profile-role">Role</Label>
                          <Input
                            id="profile-role"
                            value={profile.role}
                            disabled
                            className="h-11 capitalize"
                          />
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm leading-6 text-muted-foreground">
                          Save your updated contact and profile information to your account record.
                        </p>
                        <Button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="w-full sm:w-auto">
                          {savingProfile ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          Save Profile Changes
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
                      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                        <KeyRound className="size-4 text-primary" />
                        Change Password
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="profile-current-password">Current Password</Label>
                          <Input
                            id="profile-current-password"
                            type="password"
                            value={passwordForm.oldPassword}
                            className="h-11"
                            onChange={(event) =>
                              setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profile-new-password">New Password</Label>
                          <Input
                            id="profile-new-password"
                            type="password"
                            value={passwordForm.newPassword}
                            className="h-11"
                            onChange={(event) =>
                              setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profile-confirm-password">Confirm New Password</Label>
                          <Input
                            id="profile-confirm-password"
                            type="password"
                            value={passwordForm.confirmPassword}
                            className="h-11"
                            onChange={(event) =>
                              setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-3 text-xs leading-6 text-muted-foreground xl:max-w-[520px]">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                          Use your current password first, then set a new one. The change is saved to your account record immediately.
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void changePassword()}
                          disabled={changingPassword}
                          className="w-full xl:w-auto"
                        >
                          {changingPassword ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <KeyRound className="size-4" />
                          )}
                          Update Password
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
