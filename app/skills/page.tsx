'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useIsSuperAdmin } from '@/lib/hooks/use-super-admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Users,
  FileText,
  Globe,
  Sparkles,
  Upload,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MAX_MANIFEST_BYTES = 256 * 1024;
const E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

// ── Types ───────────────────────────────────────────────────────────

interface SkillAgent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  personaPreview: string;
}

interface SkillTemplate {
  id: string;
  name: string;
  description: string;
}

interface SkillData {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  supportedLanguages: string[];
  agentCount: number;
  templateCount: number;
  agents: SkillAgent[];
  templates: SkillTemplate[];
  source: 'system' | 'organization';
}

// ── Category helpers ────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  pedagogy: '\u{1F4D0}', // 📐
  domain: '\u{1F3E5}', // 🏥
  interaction: '\u{1F4AC}', // 💬
  assessment: '\u{1F4CB}', // 📋
};

const CATEGORY_COLORS: Record<string, string> = {
  pedagogy: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  domain: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  interaction: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  assessment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const ROLE_COLORS: Record<string, string> = {
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  student: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  assistant: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

// ── Component ───────────────────────────────────────────────────────

export default function SkillsPage(): React.ReactElement {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { currentOrg } = useOrganizations();
  const { isSuperAdmin } = useIsSuperAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [skills, setSkills] = useState<SkillData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [removingSkillId, setRemovingSkillId] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const canManageSkills = Boolean(
    currentOrg &&
      (isSuperAdmin || currentOrg.userRole === 'admin' || currentOrg.userRole === 'manager'),
  );

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams({ locale });
      if (currentOrg && !E2E_TEST_MODE) searchParams.set('orgId', currentOrg.id);
      const res = await fetch(`/api/skills?${searchParams.toString()}`);
      const json = (await res.json()) as { success: boolean; skills: SkillData[] };
      if (res.ok && json.success) {
        setSkills(json.skills);
      }
    } catch {
      // silent fail — empty list
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg, locale]);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  const toggleDetails = (skillId: string): void => {
    setExpandedSkill((prev) => (prev === skillId ? null : skillId));
  };

  const handleUseSkill = (skillId: string): void => {
    router.push(`/app?skill=${encodeURIComponent(skillId)}`);
  };

  const handleInstallSkill = async (file: File): Promise<void> => {
    if (!currentOrg) return;
    if (file.size > MAX_MANIFEST_BYTES) {
      toast.error(t('skills.fileTooLarge'));
      return;
    }
    setIsInstalling(true);
    try {
      const manifest = JSON.parse(await file.text()) as unknown;
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: currentOrg.id, manifest }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t('skills.installFailed'));
      toast.success(t('skills.installed'));
      await fetchSkills();
    } catch (error) {
      toast.error(
        error instanceof SyntaxError
          ? t('skills.invalidFile')
          : error instanceof Error
            ? error.message
            : t('skills.installFailed'),
      );
    } finally {
      setIsInstalling(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveSkill = async (skill: SkillData): Promise<void> => {
    if (!currentOrg || !window.confirm(t('skills.removeConfirm'))) return;
    setRemovingSkillId(skill.id);
    try {
      const searchParams = new URLSearchParams({ orgId: currentOrg.id, skillId: skill.id });
      const response = await fetch(`/api/skills?${searchParams.toString()}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t('skills.removeFailed'));
      toast.success(t('skills.removed'));
      await fetchSkills();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('skills.removeFailed'));
    } finally {
      setRemovingSkillId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t('skills.title')}</h1>
            {canManageSkills && (
              <p className="mt-1 text-sm text-muted-foreground">{t('skills.installHint')}</p>
            )}
          </div>
        </div>
        {canManageSkills && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label={t('skills.add')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleInstallSkill(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isInstalling}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {isInstalling ? t('skills.installing') : t('skills.add')}
            </Button>
          </>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && skills.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Sparkles className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">Aucun skill disponible</p>
        </div>
      )}

      {/* Skills Grid */}
      {!isLoading && skills.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {skills.map((skill) => {
            const isExpanded = expandedSkill === skill.id;
            const emoji = CATEGORY_EMOJI[skill.category] ?? '\u{1F9E9}'; // 🧩
            const categoryClass = CATEGORY_COLORS[skill.category] ?? 'bg-gray-100 text-gray-800';

            return (
              <div
                key={skill.id}
                className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                {/* Top: icon + name + category badge */}
                <div className="mb-3 flex items-start gap-3">
                  <span className="text-3xl leading-none">{emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{skill.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge className={cn('text-[10px]', categoryClass)}>{skill.category}</Badge>
                      {skill.source === 'organization' && (
                        <Badge variant="outline" className="text-[10px]">
                          {t('skills.organizationBadge')}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">v{skill.version}</span>
                      <span className="text-xs text-muted-foreground">&mdash; {skill.author}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">
                  {skill.description}
                </p>

                {/* Tags: agents, templates, languages */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    {skill.agentCount} {t('skills.agents')}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <FileText className="h-3 w-3" />
                    {skill.templateCount} {t('skills.templates')}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Globe className="h-3 w-3" />
                    {skill.supportedLanguages.join(', ')}
                  </Badge>
                </div>

                {/* Expandable details */}
                <button
                  type="button"
                  onClick={() => toggleDetails(skill.id)}
                  className="mb-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  {t('skills.details')}
                </button>

                {isExpanded && (
                  <div className="mb-4 space-y-4 rounded-lg bg-muted/50 p-4">
                    {/* Agents */}
                    {skill.agents.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('skills.agents')} ({skill.agents.length})
                        </h3>
                        <div className="space-y-2">
                          {skill.agents.map((agent) => (
                            <div key={agent.id} className="flex items-start gap-2">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                                style={{ backgroundColor: agent.color, color: '#fff' }}
                              >
                                {agent.avatar.startsWith('/') || agent.avatar.startsWith('http') ? (
                                  <img
                                    src={agent.avatar}
                                    alt={agent.name}
                                    className="h-full w-full rounded-full object-cover"
                                  />
                                ) : (
                                  <span>{agent.avatar}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{agent.name}</span>
                                  <Badge
                                    className={cn(
                                      'text-[10px]',
                                      ROLE_COLORS[agent.role] ?? 'bg-gray-100 text-gray-700',
                                    )}
                                  >
                                    {agent.role}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {agent.personaPreview}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Templates */}
                    {skill.templates.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('skills.templates')} ({skill.templates.length})
                        </h3>
                        <div className="space-y-2">
                          {skill.templates.map((tpl) => (
                            <div key={tpl.id} className="rounded-md border bg-background p-3">
                              <p className="text-sm font-medium">{tpl.name}</p>
                              <p className="text-xs text-muted-foreground">{tpl.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Use button */}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => handleUseSkill(skill.id)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {t('skills.use')}
                  </Button>
                  {canManageSkills && skill.source === 'organization' && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label={t('skills.remove')}
                      disabled={removingSkillId === skill.id}
                      onClick={() => void handleRemoveSkill(skill)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
