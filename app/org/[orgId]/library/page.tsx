'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Copy, Eye, Library, Search, Share2, User } from 'lucide-react';
import type { OrgMemberRole } from '@/lib/supabase/types';

interface SharedClassroom {
  id: string;
  stage_id: string;
  org_id: string;
  shared_by: string | null;
  visibility: 'private' | 'organization' | 'public';
  created_at: string;
  stage?: {
    id: string;
    name: string;
    description: string | null;
    language: string;
    owner_id: string | null;
    created_at: string;
  };
  scene_count?: number;
  sharer_profile?: {
    nickname: string | null;
  };
}

interface OrganizationMember {
  user_id: string;
  profile?: { nickname?: string | null };
}

const VISIBILITY_OPTIONS = ['private', 'organization', 'public'] as const;

export default function LibraryPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();

  const [classrooms, setClassrooms] = useState<SharedClassroom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Reserved for future scene-type filtering (see comment below) — not wired yet.
  const [_filterType, _setFilterType] = useState<string>('all');
  const [userRole, setUserRole] = useState<OrgMemberRole | null>(null);
  const [shareTarget, setShareTarget] = useState<SharedClassroom | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [recipientUserId, setRecipientUserId] = useState('');
  const [isSubmittingTransmission, setIsSubmittingTransmission] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInvitingRecipient, setIsInvitingRecipient] = useState(false);

  const canShare = userRole === 'admin' || userRole === 'manager' || userRole === 'formateur';
  const canInvite = userRole === 'admin' || userRole === 'manager';

  const fetchLibrary = useCallback(async () => {
    const supabase = createClient();

    // Check membership and role
    if (user) {
      const { data: membership } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .single();
      if (membership) {
        setUserRole(membership.role as OrgMemberRole);
      }
    }

    // Fetch shared classrooms
    const { data: shared, error } = await supabase
      .from('shared_classrooms')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error || !shared) {
      setIsLoading(false);
      return;
    }

    // Fetch stages for these shared classrooms
    const stageIds = shared.map((s) => s.stage_id);
    if (stageIds.length === 0) {
      setClassrooms([]);
      setIsLoading(false);
      return;
    }

    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, description, language, owner_id, created_at')
      .in('id', stageIds);

    // Fetch scene counts
    const { data: scenes } = await supabase
      .from('scenes')
      .select('stage_id')
      .in('stage_id', stageIds);

    const sceneCounts = new Map<string, number>();
    for (const scene of scenes ?? []) {
      sceneCounts.set(scene.stage_id, (sceneCounts.get(scene.stage_id) ?? 0) + 1);
    }

    // Fetch sharer profiles
    const sharerIds = [
      ...new Set(shared.filter((s) => s.shared_by).map((s) => s.shared_by as string)),
    ];
    const { data: profiles } =
      sharerIds.length > 0
        ? await supabase.from('profiles').select('id, nickname').in('id', sharerIds)
        : { data: [] };

    const stageMap = new Map((stages ?? []).map((s) => [s.id, s]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const enriched: SharedClassroom[] = shared.map((sc) => ({
      ...sc,
      visibility: sc.visibility as SharedClassroom['visibility'],
      stage: stageMap.get(sc.stage_id) ?? undefined,
      scene_count: sceneCounts.get(sc.stage_id) ?? 0,
      sharer_profile: sc.shared_by ? (profileMap.get(sc.shared_by) ?? undefined) : undefined,
    }));

    setClassrooms(enriched);
    setIsLoading(false);
  }, [orgId, user]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const filtered = useMemo(() => {
    return classrooms.filter((c) => {
      if (searchQuery) {
        const name = c.stage?.name?.toLowerCase() ?? '';
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }
      // filterType is for future scene-type filtering
      return true;
    });
  }, [classrooms, searchQuery]);

  const handleChangeVisibility = async (classroomId: string, newVisibility: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('shared_classrooms')
      .update({ visibility: newVisibility })
      .eq('id', classroomId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('org.saved'));
    await fetchLibrary();
  };

  const openTransmissionDialog = async (classroom: SharedClassroom) => {
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/members`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { members?: OrganizationMember[]; error?: string };
      if (!response.ok || !payload.members) throw new Error(payload.error ?? 'Members unavailable');
      setMembers(payload.members.filter((member) => member.user_id !== user?.id));
      setRecipientUserId('');
      setInviteEmail('');
      setShareTarget(classroom);
    } catch {
      toast.error(t('org.shareFailed'));
    }
  };

  const inviteRecipient = async () => {
    if (!inviteEmail.trim()) return;
    setIsInvitingRecipient(true);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: 'apprenant' }),
      });
      const payload = (await response.json()) as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl)
        throw new Error(payload.error ?? 'Invitation unavailable');
      await navigator.clipboard.writeText(payload.inviteUrl);
      setInviteEmail('');
      toast.success(t('org.inviteLinkCopied'));
    } catch {
      toast.error(t('org.shareFailed'));
    } finally {
      setIsInvitingRecipient(false);
    }
  };

  const submitTransmission = async () => {
    if (!shareTarget || !recipientUserId) return;
    setIsSubmittingTransmission(true);
    try {
      const response = await fetch('/api/transmissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: shareTarget.stage_id, recipientUserId }),
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
        existing?: boolean;
      };
      if (!response.ok || !payload.url)
        throw new Error(payload.error ?? 'Transmission unavailable');
      await navigator.clipboard.writeText(payload.url);
      toast.success(payload.existing ? t('transmission.existing') : t('transmission.created'));
      setShareTarget(null);
    } catch {
      toast.error(t('transmission.failed'));
    } finally {
      setIsSubmittingTransmission(false);
    }
  };

  const copyPublicLink = async (classroom: SharedClassroom) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/classroom/${encodeURIComponent(classroom.stage_id)}`,
      );
      toast.success(t('org.linkCopied'));
    } catch {
      toast.error(t('org.shareFailed'));
    }
  };

  const handleClone = async (stageId: string) => {
    // Clone by navigating to the classroom — the user will have a copy in their personal space
    router.push(`/classroom/${stageId}?clone=true`);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/org/${orgId}/admin`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Library className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('org.library')}</h1>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('org.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Classrooms Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t('org.noOrganizations')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((classroom) => (
            <div
              key={classroom.id}
              className="group rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="mb-3">
                <h3 className="font-semibold leading-tight">
                  {classroom.stage?.name ?? t('org.untitled')}
                </h3>
                {classroom.stage?.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {classroom.stage.description}
                  </p>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {classroom.sharer_profile?.nickname && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {classroom.sharer_profile.nickname}
                  </span>
                )}
                <span>{t('org.sceneCount', { count: classroom.scene_count ?? 0 })}</span>
                <span>{new Date(classroom.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canShare && (
                  <Select
                    value={classroom.visibility}
                    onValueChange={(v) => handleChangeVisibility(classroom.id, v)}
                  >
                    <SelectTrigger
                      className="h-7 w-auto gap-1 text-xs"
                      aria-label={t('org.visibility')}
                    >
                      <Eye className="h-3 w-3" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILITY_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(`org.visibility.${v}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {canShare && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => openTransmissionDialog(classroom)}
                  >
                    <Share2 className="h-3 w-3" />
                    {t('transmission.share')}
                  </Button>
                )}

                {classroom.visibility === 'public' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => copyPublicLink(classroom)}
                  >
                    <Copy className="h-3 w-3" />
                    {t('transmission.copyPublicLink')}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 gap-1 text-xs"
                  onClick={() => handleClone(classroom.stage_id)}
                >
                  <Copy className="h-3 w-3" />
                  {t('org.clone')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(shareTarget)} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transmission.share')}</DialogTitle>
            <DialogDescription>{shareTarget?.stage?.name ?? t('org.untitled')}</DialogDescription>
          </DialogHeader>
          {members.length > 0 ? (
            <Select value={recipientUserId} onValueChange={setRecipientUserId}>
              <SelectTrigger aria-label={t('transmission.recipient')}>
                <SelectValue placeholder={t('transmission.recipient')} />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.profile?.nickname ?? t('transmission.unnamedRecipient')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {t('transmission.noEligibleRecipients')}
            </p>
          )}
          {canInvite && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{t('transmission.inviteRecipient')}</p>
              <p className="text-sm text-muted-foreground">
                {t('transmission.inviteRecipientHint')}
              </p>
              <div className="flex gap-2">
                <Input
                  aria-label={t('auth.email')}
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder={t('auth.email')}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!inviteEmail.trim() || isInvitingRecipient}
                  onClick={inviteRecipient}
                >
                  {isInvitingRecipient
                    ? t('transmission.invitingRecipient')
                    : t('transmission.inviteRecipient')}
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!recipientUserId || isSubmittingTransmission}
              onClick={submitTransmission}
            >
              {isSubmittingTransmission ? t('transmission.submitting') : t('transmission.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
