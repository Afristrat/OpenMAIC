'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Crown,
  Shield,
  GraduationCap,
  BookOpen,
  UserPlus,
  Trash2,
  Settings,
  Users,
  Building2,
  Link2,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import type { Organization, OrgMemberRole, OrgSector } from '@/lib/supabase/types';

interface MemberWithProfile {
  id: string;
  user_id: string;
  role: OrgMemberRole;
  created_at: string;
  profile: {
    id: string;
    nickname: string | null;
    avatar: string | null;
  };
}

interface OrgWithRole extends Organization {
  userRole: OrgMemberRole;
}

const SECTORS: OrgSector[] = ['healthcare', 'legal', 'tech', 'finance', 'education', 'industry'];
const ROLES: OrgMemberRole[] = ['admin', 'manager', 'formateur', 'apprenant'];
const LOCALES = ['fr-FR', 'ar-MA', 'en-US', 'zh-CN'];

const ROLE_ICONS: Record<OrgMemberRole, typeof Crown> = {
  admin: Crown,
  manager: Shield,
  formateur: GraduationCap,
  apprenant: BookOpen,
};

const ROLE_COLORS: Record<OrgMemberRole, string> = {
  admin: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  formateur: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  apprenant: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function OrgAdminPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();

  const [org, setOrg] = useState<OrgWithRole | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Settings form
  const [editName, setEditName] = useState('');
  const [editSector, setEditSector] = useState<string>('');
  const [editLocale, setEditLocale] = useState('fr-FR');
  const [saving, setSaving] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgMemberRole>('apprenant');
  const [inviting, setInviting] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);

  // Dashboard metrics
  const [metrics, setMetrics] = useState<{
    membersCount: number;
    stagesCount: number;
    avgScore: number | null;
    completionRate: number | null;
  }>({ membersCount: 0, stagesCount: 0, avgScore: null, completionRate: null });

  const isAdmin = org?.userRole === 'admin';

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}`);
      if (!res.ok) {
        router.push('/app');
        return;
      }
      const data = await res.json();
      const orgData = data.organization as OrgWithRole;
      setOrg(orgData);
      setEditName(orgData.name);
      setEditSector(orgData.sector ?? '');
      setEditLocale(orgData.default_locale);
    } catch {
      router.push('/app');
    }
  }, [orgId, router]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      if (!res.ok) return;
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      // Ignore
    }
  }, [orgId]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/reports?dateFrom=2000-01-01&dateTo=2099-12-31`);
      if (!res.ok) return;
      const data = await res.json();
      setMetrics({
        membersCount: data.totalLearners ?? 0,
        stagesCount: data.activeClassrooms ?? 0,
        avgScore: data.avgScore ?? null,
        completionRate: data.completionRate ?? null,
      });
    } catch {
      // Metrics are optional — fail silently
    }
  }, [orgId]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on mount */
  useEffect(() => {
    Promise.all([fetchOrg(), fetchMembers(), fetchMetrics()]).then(() => setIsLoading(false));
  }, [fetchOrg, fetchMembers, fetchMetrics]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          sector: editSector || null,
          default_locale: editLocale,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrg(data.organization);
        toast.success(t('org.saved'));
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        toast.success(t('org.inviteSent'));
        setInviteEmail('');
        await fetchMembers();
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setInviting(false);
    }
  };

  const handleCopyInviteLink = async () => {
    setCopyingLink(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.inviteUrl);
        toast.success(t('org.inviteLinkCopied'));
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setCopyingLink(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: OrgMemberRole) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, role: newRole }),
      });
      if (res.ok) {
        await fetchMembers();
        toast.success(t('org.saved'));
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(t('org.confirmRemove'))) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      });
      if (res.ok) {
        await fetchMembers();
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleDeleteOrg = async () => {
    if (!confirm(t('org.confirmDelete'))) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/app');
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    } catch {
      toast.error('Network error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!org) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/app')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{org.name}</h1>
          {org.sector && (
            <Badge variant="secondary">{t(`org.sectors.${org.sector}`)}</Badge>
          )}
        </div>
      </div>

      {/* Dashboard Metrics */}
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-blue-50/50 p-4 dark:bg-blue-950/20">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Users className="h-5 w-5" />
          </div>
          <p className="mt-2 text-2xl font-bold">{members.length}</p>
          <p className="text-xs text-muted-foreground">{t('org.dashboardMembers')}</p>
        </div>
        <div className="rounded-lg border bg-green-50/50 p-4 dark:bg-green-950/20">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <BookOpen className="h-5 w-5" />
          </div>
          <p className="mt-2 text-2xl font-bold">{metrics.stagesCount}</p>
          <p className="text-xs text-muted-foreground">{t('org.dashboardStages')}</p>
        </div>
        <div className="rounded-lg border bg-amber-50/50 p-4 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {metrics.avgScore !== null ? `${Math.round(metrics.avgScore)}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">{t('org.dashboardAvgScore')}</p>
        </div>
        <div className="rounded-lg border bg-purple-50/50 p-4 dark:bg-purple-950/20">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {metrics.completionRate !== null ? `${Math.round(metrics.completionRate)}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">{t('org.dashboardCompletion')}</p>
        </div>
      </section>

      {/* Settings Section */}
      {isAdmin && (
        <section className="mb-10 rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{t('org.settings')}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('org.name')}</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('org.sector')}</label>
              <Select value={editSector} onValueChange={setEditSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`org.sectors.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('org.defaultLocale')}</label>
              <Select value={editLocale} onValueChange={setEditLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? t('common.loading') : t('org.save')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteOrg}>
              {t('org.deleteOrg')}
            </Button>
          </div>
        </section>
      )}

      {/* Members Section */}
      <section className="mb-10 rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="text-lg font-semibold">{t('org.members')}</h2>
          <Badge variant="outline" className="ml-auto">
            {members.length}
          </Badge>
        </div>

        {/* Invite Form */}
        {(isAdmin || org.userRole === 'manager') && (
          <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border bg-muted/50 p-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span className="text-sm font-medium">{t('org.inviteByEmail')}</span>
            </div>
            <div className="flex flex-1 flex-wrap items-end gap-3">
              <Input
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="min-w-[200px] flex-1"
              />
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as OrgMemberRole)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`org.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? t('common.loading') : t('org.invite')}
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyInviteLink}
                disabled={copyingLink}
                className="gap-1.5"
              >
                <Link2 className="h-4 w-4" />
                {copyingLink ? t('common.loading') : t('org.copyInviteLink')}
              </Button>
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">{t('org.members')}</th>
                <th className="pb-2 font-medium">{t('org.role')}</th>
                {isAdmin && <th className="pb-2 font-medium text-right">{t('org.settings')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((member) => {
                const RoleIcon = ROLE_ICONS[member.role];
                const isCurrentUser = member.user_id === user?.id;
                return (
                  <tr key={member.id} className="group">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {member.profile.nickname?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.profile.nickname ?? member.user_id.slice(0, 8)}
                            {isCurrentUser && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({t('common.you')})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      {isAdmin && !isCurrentUser ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            handleChangeRole(member.id, v as OrgMemberRole)
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t(`org.${r}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={ROLE_COLORS[member.role]}>
                          <RoleIcon className="mr-1 h-3 w-3" />
                          {t(`org.${member.role}`)}
                        </Badge>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-3 text-right">
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
