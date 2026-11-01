'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { z } from 'zod';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CompetencyFrameworkInput } from '@/lib/referentiel/plan-framework';
import { cn } from '@/lib/utils';

const titles = z.object({ fr: z.string(), ar: z.string().nullable(), en: z.string().nullable() });
const searchSchema = z.object({
  occupations: z.array(
    z.object({
      id: z.string(),
      uri: z.string(),
      titles,
      iscoCode: z.string().nullable(),
      essentialCount: z.number(),
      optionalCount: z.number(),
    }),
  ),
});
const skillSchema = z.object({ uri: z.string(), titles });
const detailSchema = z.object({
  occupation: z.object({
    id: z.string(),
    uri: z.string(),
    titles,
    iscoCode: z.string().nullable(),
  }),
  essential: z.array(skillSchema),
  optional: z.array(skillSchema),
});

type Detail = z.infer<typeof detailSchema>;
type SearchHit = z.infer<typeof searchSchema>['occupations'][number];
type Titles = z.infer<typeof titles>;

const ESCO_OCCUPATION_PREFIX = 'http://data.europa.eu/esco/occupation/';
const MIN_QUERY_LENGTH = 2;

function pickTitle(value: Titles, locale: string): string {
  if (locale.startsWith('ar') && value.ar) return value.ar;
  if (locale.startsWith('en') && value.en) return value.en;
  return value.fr;
}

/**
 * Métier ESCO visé et compétences travaillées : exigés dès le plan. La personne cherche un métier du
 * référentiel (code ISCO-08 compris), toutes ses compétences essentielles sont retenues d'emblée et
 * elle retire ou ajoute celles qu'elle veut, une au moins devant rester.
 */
export function CompetencyFrameworkPicker({
  value,
  onChange,
  invalid = false,
}: {
  value: CompetencyFrameworkInput | null;
  onChange: (next: CompetencyFrameworkInput | null) => void;
  invalid?: boolean;
}): React.ReactElement {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);

  const loadDetail = useCallback(async (occupationUri: string, selectAllEssential: boolean) => {
    setFailed(false);
    try {
      const id = occupationUri.replace(ESCO_OCCUPATION_PREFIX, '');
      const response = await fetch(`/api/referentiel/occupations/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Occupation unavailable');
      const parsed = detailSchema.parse(await response.json());
      setDetail(parsed);
      if (selectAllEssential) {
        onChange({
          occupationUri: parsed.occupation.uri,
          skillUris: parsed.essential.map((skill) => skill.uri),
        });
      }
    } catch {
      setFailed(true);
    }
    // onChange vient du parent : sa stabilité n'est pas garantie, la lecture ne dépend que de l'identifiant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value && !detail) void loadDetail(value.occupationUri, false);
  }, [value, detail, loadDetail]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/referentiel/occupations?q=${encodeURIComponent(text)}&limit=8`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Search failed');
          setHits(searchSchema.parse(await response.json()).occupations);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setFailed(true);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const chosen = new Set(value?.skillUris ?? []);
  const toggle = (uri: string): void => {
    if (!value) return;
    const next = chosen.has(uri)
      ? value.skillUris.filter((item) => item !== uri)
      : [...value.skillUris, uri];
    if (next.length === 0) return;
    onChange({ occupationUri: value.occupationUri, skillUris: next });
  };

  const skillRow = (skill: z.infer<typeof skillSchema>): React.ReactElement => (
    <li key={skill.uri}>
      <label className="flex items-start gap-2 py-1 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={chosen.has(skill.uri)}
          onChange={() => toggle(skill.uri)}
          className="mt-1 size-4 accent-purple-600"
        />
        <span>{pickTitle(skill.titles, locale)}</span>
      </label>
    </li>
  );

  return (
    <section
      aria-label={t('framework.title')}
      data-invalid={invalid}
      className={cn(
        'rounded-xl border p-4 text-left',
        invalid
          ? 'border-red-400 bg-red-50/40 dark:bg-red-950/20'
          : 'border-gray-200 dark:border-gray-700',
      )}
    >
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {t('framework.title')} <span aria-hidden="true">*</span>
      </h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('framework.hint')}</p>

      {!value || !detail ? (
        <div className="mt-3">
          <label className="relative block">
            <span className="sr-only">{t('framework.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('framework.search')}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 ps-9 pe-3 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
          {query.trim().length >= MIN_QUERY_LENGTH && hits.length === 0 && !failed && (
            <p className="mt-2 text-xs text-gray-500">{t('framework.noResult')}</p>
          )}
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {hits.map((hit) => (
              <li key={hit.uri}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setHits([]);
                    void loadDetail(hit.uri, true);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span>{pickTitle(hit.titles, locale)}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {hit.iscoCode ? `ISCO-08 ${hit.iscoCode}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('framework.selected', {
                title: pickTitle(detail.occupation.titles, locale),
                isco: detail.occupation.iscoCode ?? '',
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                setDetail(null);
                onChange(null);
              }}
              className="text-xs font-medium text-purple-700 underline dark:text-purple-300"
            >
              {t('framework.change')}
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('framework.skills', { n: String(value.skillUris.length) })}
          </p>
          <ul className="mt-1 max-h-56 overflow-y-auto">{detail.essential.map(skillRow)}</ul>
          {detail.optional.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('framework.optional', { n: String(detail.optional.length) })}
              </summary>
              <ul className="mt-1 max-h-56 overflow-y-auto">{detail.optional.map(skillRow)}</ul>
            </details>
          )}
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {t('framework.loadError')}
        </p>
      )}
      {invalid && !failed && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {t('framework.required')}
        </p>
      )}
    </section>
  );
}
