'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookMarked,
  Check,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Locale } from '@/lib/i18n/types';

type Titles = { fr: string; ar: string | null; en: string | null };

type OccupationSummary = {
  id: string;
  uri: string;
  titles: Titles;
  iscoCode: string | null;
  essentialCount: number;
  optionalCount: number;
};

type Skill = { uri: string; escoUri: string | null; titles: Titles };

type OccupationDetail = {
  occupation: {
    id: string;
    uri: string;
    titles: Titles;
    iscoCode: string | null;
    referentielVersion: string;
  };
  essential: Skill[];
  optional: Skill[];
};

type CourseOption = { id: string; title: string };

/** Lien d'une formation vers une compétence, tel que la route `/api/courses/<id>/competencies` le rend. */
type CourseLink = {
  competency_uri: string;
  referential_version: string;
  isco_08: string | null;
  nature: 'essentielle' | 'optionnelle';
};

type SceneInfo = { id: string; title: string | null; type: string };

type SceneLink = {
  scene_id: string;
  competency_uri: string;
  referential_version: string;
  nature: 'travaillee' | 'evaluee';
  statut: 'propose' | 'confirme';
};

/** Ce que la route `/api/courses/<id>/competencies` rend pour une formation. */
type CourseData = {
  course: CourseLink[];
  scenes: SceneLink[];
  sceneList: SceneInfo[];
  titles: Record<string, Titles>;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SEARCH_DELAY_MS = 300;
const OPTIONAL_VISIBLE = 10;

/** Titre dans la langue de l'interface, puis les autres langues en information secondaire. */
function titlesFor(titles: Titles, locale: Locale): { main: string; others: string[] } {
  const order: (keyof Titles)[] =
    locale === 'ar-MA'
      ? ['ar', 'fr', 'en']
      : locale === 'en-US'
        ? ['en', 'fr', 'ar']
        : ['fr', 'ar', 'en'];
  const values = order.map((key) => titles[key]).filter((value): value is string => Boolean(value));
  const [main = titles.fr, ...rest] = values;
  return {
    main,
    others: rest.filter((value, index) => value !== main && rest.indexOf(value) === index),
  };
}

function escoPage(kind: 'occupation' | 'skill', uri: string, locale: Locale): string {
  const lang = locale === 'ar-MA' ? 'ar' : locale === 'en-US' ? 'en' : 'fr';
  return `https://esco.ec.europa.eu/${lang}/classification/${kind}?uri=${encodeURIComponent(uri)}`;
}

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function SkillList({
  title,
  skills,
  locale,
  emptyLabel,
  linked,
  onToggle,
  visibleCount,
  t,
}: {
  title: string;
  skills: Skill[];
  locale: Locale;
  emptyLabel: string;
  /** Compétences déjà visées par la formation choisie ; null tant qu'aucune formation n'est choisie. */
  linked: ReadonlySet<string> | null;
  onToggle: (skill: Skill) => void;
  visibleCount: number;
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? skills : skills.slice(0, visibleCount);
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">
        {title} <span className="text-muted-foreground">({skills.length})</span>
      </h3>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {shown.map((skill) => {
            const { main, others } = titlesFor(skill.titles, locale);
            const isLinked = linked?.has(skill.uri) ?? false;
            const actionLabel = isLinked ? t('referentiel.unlink') : t('referentiel.link');
            return (
              <li key={skill.uri} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm" dir="auto">
                    {main}
                  </p>
                  {others.map((other) => (
                    <p key={other} className="text-xs text-muted-foreground" dir="auto">
                      {other}
                    </p>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {linked && (
                    <Button
                      type="button"
                      size="icon"
                      variant={isLinked ? 'default' : 'outline'}
                      className="h-7 w-7"
                      aria-pressed={isLinked}
                      aria-label={actionLabel}
                      title={actionLabel}
                      onClick={() => onToggle(skill)}
                    >
                      {isLinked ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  )}
                  {skill.escoUri && (
                    <a
                      href={escoPage('skill', skill.escoUri, locale)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={main}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {skills.length > visibleCount && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t('referentiel.showLess')
            : t('referentiel.showMore', { count: skills.length - visibleCount })}
        </Button>
      )}
    </section>
  );
}

export default function ReferentielPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [isco, setIsco] = useState('');
  const [results, setResults] = useState<OccupationSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OccupationDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [dataByCourse, setDataByCourse] = useState<Record<string, CourseData>>({});
  const [proposing, setProposing] = useState(false);
  const [proposeNote, setProposeNote] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (!text && !isco) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (text) params.set('q', text);
      if (isco) params.set('isco', isco);
      readJson<{ occupations: OccupationSummary[] }>(
        `/api/referentiel/occupations?${params}`,
        controller.signal,
      )
        .then((payload) => {
          setFailed(false);
          setResults(payload.occupations);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setFailed(true);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isco]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    readJson<OccupationDetail>(`/api/referentiel/occupations/${selectedId}`, controller.signal)
      .then((payload) => {
        setFailed(false);
        setDetail(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    readJson<{ courses: CourseOption[] }>(
      `/api/referentiel/courses?orgId=${encodeURIComponent(orgId)}`,
      controller.signal,
    )
      .then((payload) => setCourses(payload.courses))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCourses([]);
      });
    return () => controller.abort();
  }, [orgId]);

  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    readJson<CourseData>(`/api/courses/${courseId}/competencies`, controller.signal)
      .then((payload) => setDataByCourse((current) => ({ ...current, [courseId]: payload })))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSaveFailed(true);
      });
    return () => controller.abort();
  }, [courseId]);

  const selected = detail?.occupation.id === selectedId ? detail : null;
  const selectedTitles = selected ? titlesFor(selected.occupation.titles, locale) : null;
  const courseData = courseId ? dataByCourse[courseId] : undefined;
  const links = courseData?.course;
  const linked = links ? new Set(links.map((link) => link.competency_uri)) : null;

  const toggle = async (skill: Skill, nature: CourseLink['nature']) => {
    if (!courseId || !links || !selected) return;
    const next: CourseLink[] = linked?.has(skill.uri)
      ? links.filter((link) => link.competency_uri !== skill.uri)
      : [
          ...links,
          {
            competency_uri: skill.uri,
            referential_version: selected.occupation.referentielVersion,
            isco_08: selected.occupation.iscoCode,
            nature,
          },
        ];
    try {
      const response = await fetch(`/api/courses/${courseId}/competencies`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          course: next.map((link) => ({
            uri: link.competency_uri,
            version: link.referential_version,
            isco08: link.isco_08 ?? undefined,
            nature: link.nature,
          })),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSaveFailed(false);
      setDataByCourse((current) => {
        const existing = current[courseId];
        return existing ? { ...current, [courseId]: { ...existing, course: next } } : current;
      });
    } catch {
      setSaveFailed(true);
    }
  };

  const reloadCourse = async () => {
    if (!courseId) return;
    const payload = await readJson<CourseData>(`/api/courses/${courseId}/competencies`);
    setDataByCourse((current) => ({ ...current, [courseId]: payload }));
  };

  const proposeLinks = async () => {
    if (!courseId || proposing) return;
    setProposing(true);
    setProposeNote(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/competencies/propose`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { proposed } = (await response.json()) as { proposed: number };
      await reloadCourse();
      setSaveFailed(false);
      setProposeNote(
        proposed > 0
          ? t('referentiel.proposedCount', { count: proposed })
          : t('referentiel.noProposal'),
      );
    } catch {
      setProposeNote(t('referentiel.proposeError'));
    } finally {
      setProposing(false);
    }
  };

  const confirmLink = async (link: SceneLink) => {
    if (!courseId) return;
    try {
      const response = await fetch(`/api/courses/${courseId}/competencies`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scenes: [
            {
              sceneId: link.scene_id,
              uri: link.competency_uri,
              version: link.referential_version,
              nature: link.nature,
              statut: 'confirme',
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSaveFailed(false);
      await reloadCourse();
    } catch {
      setSaveFailed(true);
    }
  };

  const removeLink = async (link: SceneLink) => {
    if (!courseId) return;
    try {
      const response = await fetch(`/api/courses/${courseId}/competencies`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sceneId: link.scene_id,
          uri: link.competency_uri,
          nature: link.nature,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSaveFailed(false);
      await reloadCourse();
    } catch {
      setSaveFailed(true);
    }
  };

  const covered = (skills: Skill[]) => skills.filter((skill) => linked?.has(skill.uri)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-2 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/org/${orgId}/admin`)}>
          <ArrowLeft className="rtl-flip h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('referentiel.title')}</h1>
        </div>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">{t('referentiel.source')}</p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('referentiel.searchPlaceholder')}
            className="ps-10"
            dir="auto"
          />
        </div>
        <Input
          value={isco}
          onChange={(event) => setIsco(event.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder={t('referentiel.iscoPlaceholder')}
          inputMode="numeric"
          className="w-40"
        />
      </div>

      {(failed || saveFailed) && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {failed ? t('referentiel.error') : t('referentiel.saveError')}
        </p>
      )}

      {!query.trim() && !isco ? (
        <p className="text-muted-foreground">{t('referentiel.hint')}</p>
      ) : results === null ? null : results.length === 0 ? (
        <p className="text-muted-foreground">{t('referentiel.noResult')}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="max-h-[70vh] divide-y overflow-y-auto rounded-md border">
            {results.map((occupation) => {
              const { main, others } = titlesFor(occupation.titles, locale);
              const active = occupation.id === selectedId;
              return (
                <li key={occupation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(occupation.id)}
                    aria-current={active}
                    className={`w-full px-3 py-2 text-start hover:bg-muted ${active ? 'bg-muted' : ''}`}
                  >
                    <p className="text-sm font-medium" dir="auto">
                      {main}
                    </p>
                    {others[0] && (
                      <p className="text-xs text-muted-foreground" dir="auto">
                        {others[0]}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {occupation.iscoCode &&
                        `${t('referentiel.iscoGroup', { code: occupation.iscoCode })} · `}
                      {t('referentiel.essentialCount', { count: occupation.essentialCount })} ·{' '}
                      {t('referentiel.optionalCount', { count: occupation.optionalCount })}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0">
            {selected && selectedTitles ? (
              <>
                <h2 className="text-xl font-semibold" dir="auto">
                  {selectedTitles.main}
                </h2>
                {selectedTitles.others.map((other) => (
                  <p key={other} className="text-sm text-muted-foreground" dir="auto">
                    {other}
                  </p>
                ))}
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {selected.occupation.iscoCode && (
                    <span className="rounded bg-muted px-2 py-0.5">
                      {t('referentiel.iscoGroup', { code: selected.occupation.iscoCode })}
                    </span>
                  )}
                  <a
                    href={escoPage('occupation', selected.occupation.uri, locale)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t('referentiel.openEsco')}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </p>

                <div className="mt-4 rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">{t('referentiel.course')}</p>
                  {courses && courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('referentiel.noCourse')}</p>
                  ) : (
                    <Select
                      value={courseId ?? undefined}
                      onValueChange={(value) => {
                        setSaveFailed(false);
                        setCourseId(value);
                      }}
                    >
                      <SelectTrigger aria-label={t('referentiel.course')}>
                        <SelectValue placeholder={t('referentiel.coursePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(courses ?? []).map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {linked && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('referentiel.coverageTitle')} :{' '}
                      {t('referentiel.coverageEssential', {
                        covered: covered(selected.essential),
                        total: selected.essential.length,
                      })}{' '}
                      ·{' '}
                      {t('referentiel.coverageOptional', {
                        covered: covered(selected.optional),
                        total: selected.optional.length,
                      })}
                    </p>
                  )}
                </div>

                {courseData && (
                  <div className="mt-4 rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t('referentiel.scenes')}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={proposing || courseData.course.length === 0}
                        onClick={() => void proposeLinks()}
                      >
                        <Sparkles className="me-1 h-4 w-4" />
                        {proposing ? t('referentiel.proposing') : t('referentiel.propose')}
                      </Button>
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('referentiel.sceneHint')}
                    </p>
                    {courseData.course.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('referentiel.chooseFirst')}
                      </p>
                    )}
                    {proposeNote && (
                      <p role="status" className="mb-2 text-sm">
                        {proposeNote}
                      </p>
                    )}
                    <ul className="divide-y rounded-md border">
                      {courseData.sceneList.map((scene) => {
                        const sceneLinks = courseData.scenes.filter(
                          (link) => link.scene_id === scene.id,
                        );
                        return (
                          <li key={scene.id} className="px-3 py-2">
                            <p className="text-sm font-medium" dir="auto">
                              {scene.title || scene.id}
                            </p>
                            {sceneLinks.map((link) => {
                              const skillTitles = courseData.titles[link.competency_uri];
                              const label = skillTitles
                                ? titlesFor(skillTitles, locale).main
                                : (link.competency_uri.split('/').pop() ?? link.competency_uri);
                              const confirmed = link.statut === 'confirme';
                              return (
                                <div
                                  key={`${link.competency_uri}-${link.nature}`}
                                  className="mt-1 flex items-center justify-between gap-2"
                                >
                                  <p className="min-w-0 text-sm" dir="auto">
                                    {label}{' '}
                                    <span className="text-xs text-muted-foreground">
                                      ·{' '}
                                      {link.nature === 'evaluee'
                                        ? t('referentiel.natureEvaluee')
                                        : t('referentiel.natureTravaillee')}{' '}
                                      ·{' '}
                                      {confirmed
                                        ? t('referentiel.statusConfirm')
                                        : t('referentiel.statusPropose')}
                                    </span>
                                  </p>
                                  <div className="flex shrink-0 gap-1">
                                    {!confirmed && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7"
                                        aria-label={t('referentiel.confirmLink')}
                                        title={t('referentiel.confirmLink')}
                                        onClick={() => void confirmLink(link)}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      aria-label={t('referentiel.removeLink')}
                                      title={t('referentiel.removeLink')}
                                      onClick={() => void removeLink(link)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <SkillList
                  key={`${selected.occupation.id}-essential`}
                  title={t('referentiel.essential')}
                  skills={selected.essential}
                  locale={locale}
                  emptyLabel={t('referentiel.noSkills')}
                  linked={linked}
                  onToggle={(skill) => void toggle(skill, 'essentielle')}
                  visibleCount={selected.essential.length}
                  t={t}
                />
                <SkillList
                  key={`${selected.occupation.id}-optional`}
                  title={t('referentiel.optional')}
                  skills={selected.optional}
                  locale={locale}
                  emptyLabel={t('referentiel.noSkills')}
                  linked={linked}
                  onToggle={(skill) => void toggle(skill, 'optionnelle')}
                  visibleCount={OPTIONAL_VISIBLE}
                  t={t}
                />
              </>
            ) : (
              <p className="text-muted-foreground">{t('referentiel.selectPrompt')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
