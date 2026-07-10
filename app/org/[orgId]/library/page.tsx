'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
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
  BookOpen,
  Copy,
  Eye,
  Library,
  Search,
  Share2,
  User,
} from 'lucide-react';
import type { OrgMemberRole, SceneType } from '@/lib/supabase/types';

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

const VISIBILITY_OPTIONS = ['private', 'organization', 'public'] as const;

export default function LibraryPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();

  const [classrooms, setClassrooms] = useState<SharedClassroom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [userRole, setUserRole] = useState<OrgMemberRole | null>(null);

  const canShare = userRole === 'admin' || userRole === 'manager' || userRole === 'formateur';

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
    const sharerIds = [...new Set(shared.filter((s) => s.shared_by).map((s) => s.shared_by as string))];
    const { data: profiles } = sharerIds.length > 0
      ? await supabase.from('profiles').select('id, nickname').in('id', sharerIds)
      : { data: [] };

    const stageMap = new Map((stages ?? []).map((s) => [s.id, s]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const enriched: SharedClassroom[] = shared.map((sc) => ({
      ...sc,
      visibility: sc.visibility as SharedClassroom['visibility'],
      stage: stageMap.get(sc.stage_id) ?? undefined,
      scene_count: sceneCounts.get(sc.stage_id) ?? 0,
      sharer_profile: sc.shared_by ? profileMap.get(sc.shared_by) ?? undefined : undefined,
    }));

    setClassrooms(enriched);
    setIsLoading(false);
  }, [orgId, user]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on mount */
  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
                  {classroom.stage?.name ?? 'Untitled'}
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
                <span>{classroom.scene_count ?? 0} scenes</span>
                <span>
                  {new Date(classroom.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <Eye className="mr-1 h-3 w-3" />
                  {t(`org.visibility.${classroom.visibility}`)}
                </Badge>

                {canShare && (
                  <Select
                    value={classroom.visibility}
                    onValueChange={(v) => handleChangeVisibility(classroom.id, v)}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                      <Share2 className="h-3 w-3" />
                      <span>{t('org.share')}</span>
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

                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
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
    </div>
  );
}
