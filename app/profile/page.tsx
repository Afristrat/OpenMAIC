'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { tryCreateClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { KeyRound, Trash2, Loader2, Mail, User, Save, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProfilePage(): React.ReactElement {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const storeAvatar = useUserProfileStore((s) => s.avatar);
  const storeNickname = useUserProfileStore((s) => s.nickname);
  const storeBio = useUserProfileStore((s) => s.bio);
  const setStoreAvatar = useUserProfileStore((s) => s.setAvatar);
  const setStoreNickname = useUserProfileStore((s) => s.setNickname);
  const setStoreBio = useUserProfileStore((s) => s.setBio);

  // Local form state (edits stay local until explicit save)
  const [avatar, setAvatar] = useState(storeAvatar);
  const [nickname, setNickname] = useState(storeNickname);
  const [bio, setBio] = useState(storeBio);
  const [saving, setSaving] = useState(false);

  // Sync local state when store changes externally (e.g. hydration)
  useEffect(() => { setAvatar(storeAvatar); }, [storeAvatar]);
  useEffect(() => { setNickname(storeNickname); }, [storeNickname]);
  useEffect(() => { setBio(storeBio); }, [storeBio]);

  // Dirty tracking
  const isDirty = useMemo(
    () => avatar !== storeAvatar || nickname !== storeNickname || bio !== storeBio,
    [avatar, storeAvatar, nickname, storeNickname, bio, storeBio],
  );

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      // Persist to Zustand (and localStorage)
      setStoreAvatar(avatar);
      setStoreNickname(nickname);
      setStoreBio(bio);

      // If authenticated, persist to Supabase profiles table
      if (user) {
        const supabase = tryCreateClient();
        if (supabase) {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              { id: user.id, avatar, nickname, bio, updated_at: new Date().toISOString() },
              { onConflict: 'id' },
            );
          if (error) throw error;
        }
      }

      toast.success(t('profile.saved'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [isDirty, avatar, nickname, bio, user, t, setStoreAvatar, setStoreNickname, setStoreBio]);

  // Password change
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Account deletion
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) return;
    setChangingPassword(true);
    try {
      const supabase = tryCreateClient();
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('profile.passwordChanged'));
      setShowPasswordDialog(false);
      setNewPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
  }, [newPassword, t]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    try {
      const supabase = tryCreateClient();
      if (!supabase) throw new Error('Supabase not configured');
      // Mark user metadata as deleted (actual deletion requires admin/server-side)
      await supabase.auth.updateUser({
        data: { deleted: true, deleted_at: new Date().toISOString() },
      });
      toast.success(t('profile.accountDeleted'));
      await signOut();
      router.push('/app');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }, [signOut, router, t]);

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <User className="size-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{t('nav.login')}</p>
          <Button onClick={() => router.push('/auth')}>{t('nav.login')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>

        {/* Avatar selection */}
        <section className="space-y-3">
          <Label className="text-sm font-medium">Avatar</Label>
          <div className="flex flex-wrap gap-3">
            {AVATAR_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setAvatar(opt)}
                className={cn(
                  'size-14 rounded-full overflow-hidden border-2 transition-all hover:scale-105',
                  avatar === opt
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-transparent hover:border-muted-foreground/30',
                )}
              >
                <img src={opt} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </section>

        {/* Nickname */}
        <section className="space-y-2">
          <Label htmlFor="nickname" className="text-sm font-medium">
            {t('nav.profile')}
          </Label>
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nickname"
            maxLength={50}
            className="max-w-sm"
          />
        </section>

        {/* Bio */}
        <section className="space-y-2">
          <Label htmlFor="bio" className="text-sm font-medium">
            Bio
          </Label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Bio"
            maxLength={300}
            rows={3}
            className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </section>

        {/* Email (read-only) */}
        <section className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Mail className="size-4" />
            Email
          </Label>
          <Input value={user.email ?? ''} readOnly className="max-w-sm bg-muted" />
        </section>

        {/* Save button */}
        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={cn(
              'gap-2 min-w-[160px] transition-colors',
              isDirty
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isDirty ? (
              <Save className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
            {isDirty ? t('profile.save') : t('profile.noChanges')}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowPasswordDialog(true)} className="gap-2">
            <KeyRound className="size-4" />
            {t('profile.changePassword')}
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="gap-2">
            <Trash2 className="size-4" />
            {t('profile.deleteAccount')}
          </Button>
        </div>
      </div>

      {/* Password change dialog */}
      <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('profile.changePassword')}</AlertDialogTitle>
            <AlertDialogDescription>
              <Input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-2"
                minLength={6}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || newPassword.length < 6}
            >
              {changingPassword && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t('common.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('profile.deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription>{t('profile.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t('profile.deleteAccount')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
