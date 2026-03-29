'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ChevronDown, ChevronUp, Users, FileText, Globe, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

// ── Category helpers ────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  pedagogy: '\u{1F4D0}', // 📐
  domain: '\u{1F3E5}',   // 🏥
  interaction: '\u{1F4AC}', // 💬
  assessment: '\u{1F4CB}',  // 📋
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

  const [skills, setSkills] = useState<SkillData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/skills?locale=${locale}`);
      const json = (await res.json()) as { success: boolean; skills: SkillData[] };
      if (json.success) {
        setSkills(json.skills);
      }
    } catch {
      // silent fail — empty list
    } finally {
      setIsLoading(false);
    }
  }, [locale]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on locale change */
  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleDetails = (skillId: string): void => {
    setExpandedSkill((prev) => (prev === skillId ? null : skillId));
  };

  const handleUseSkill = (skillId: string): void => {
    router.push(`/?skill=${skillId}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">{t('skills.title')}</h1>
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
                      <Badge className={cn('text-[10px]', categoryClass)}>
                        {skill.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{skill.version}</span>
                      <span className="text-xs text-muted-foreground">
                        &mdash; {skill.author}
                      </span>
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
                                  /* eslint-disable-next-line @next/next/no-img-element */
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
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleUseSkill(skill.id)}
                >
                  <Sparkles className="h-4 w-4" />
                  {t('skills.use')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
