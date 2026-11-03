'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';

interface SharedItem {
  stageId: string;
  name: string;
  description: string | null;
}

/** Formations reçues une par une. Section masquée tant qu'aucune formation n'a été partagée avec la personne. */
export function SharedWithMeSection() {
  const { t } = useI18n();
  const [items, setItems] = useState<SharedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/shared-with-me')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { classrooms?: SharedItem[] } | null) => {
        if (!cancelled) setItems(payload?.classrooms ?? []);
      })
      .catch(() => {
        // Aucune formation reçue affichée : l'espace reste simplement masqué.
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      className="mx-auto mt-10 w-full max-w-5xl px-4"
      aria-label={t('sharedWithMe.title')}
      data-testid="shared-with-me"
    >
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('sharedWithMe.title')}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.stageId} className="rounded-xl border bg-card p-4">
            <h3 className="line-clamp-2 text-sm font-medium">{item.name}</h3>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
            ) : null}
            <Link
              href={`/classroom/${encodeURIComponent(item.stageId)}`}
              className="mt-3 inline-block text-xs font-medium underline-offset-2 hover:underline"
            >
              {t('sharedWithMe.open')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
