'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BookMarked, ExternalLink, Search } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  occupation: { id: string; uri: string; titles: Titles; iscoCode: string | null };
  essential: Skill[];
  optional: Skill[];
};

const SEARCH_DELAY_MS = 300;

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
  return { main, others: rest.filter((value) => value !== main) };
}

function escoPage(kind: 'occupation' | 'skill', uri: string, locale: Locale): string {
  const lang = locale === 'ar-MA' ? 'ar' : locale === 'en-US' ? 'en' : 'fr';
  return `https://esco.ec.europa.eu/${lang}/classification/${kind}?uri=${encodeURIComponent(uri)}`;
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function SkillList({
  title,
  skills,
  locale,
  emptyLabel,
}: {
  title: string;
  skills: Skill[];
  locale: Locale;
  emptyLabel: string;
}) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">
        {title} <span className="text-muted-foreground">({skills.length})</span>
      </h3>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {skills.map((skill) => {
            const { main, others } = titlesFor(skill.titles, locale);
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
                {skill.escoUri && (
                  <a
                    href={escoPage('skill', skill.escoUri, locale)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={main}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
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

  const selected = detail?.occupation.id === selectedId ? detail : null;
  const selectedTitles = selected ? titlesFor(selected.occupation.titles, locale) : null;

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

      {failed && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {t('referentiel.error')}
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
                <SkillList
                  title={t('referentiel.essential')}
                  skills={selected.essential}
                  locale={locale}
                  emptyLabel={t('referentiel.noSkills')}
                />
                <SkillList
                  title={t('referentiel.optional')}
                  skills={selected.optional}
                  locale={locale}
                  emptyLabel={t('referentiel.noSkills')}
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
