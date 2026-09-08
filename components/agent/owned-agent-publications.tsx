'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

const responseSchema = z.object({
  success: z.literal(true),
  agents: z.array(z.object({ id: z.string(), name: z.string(), published: z.boolean() })),
  pagination: z.object({ totalPages: z.number().int().nonnegative() }),
});

export function OwnedAgentPublications({ onWithdraw }: { onWithdraw: () => void }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<z.infer<typeof responseSchema> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/marketplace/agents/owned?page=${page}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load publications');
        const parsed = responseSchema.parse(await response.json());
        if (!controller.signal.aborted) { setData(parsed); setError(false); }
      })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);

  async function withdraw(id: string) {
    setPending(id);
    setError(false);
    try {
      const response = await fetch('/api/marketplace/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, isPublished: false }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || result.published !== false || result.agentId !== id) {
        throw new Error('Withdrawal not confirmed');
      }
      setData((current) => current ? {
        ...current, agents: current.agents.map((agent) => agent.id === id ? { ...agent, published: false } : agent),
      } : current);
      onWithdraw();
    } catch { setError(true); }
    finally { setPending(null); }
  }

  return (
    <section className="mb-8 rounded-lg border p-4" aria-label={t('marketplace.ownedTitle')}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">{t('marketplace.ownedTitle')}</h2>
        <Button variant="outline" disabled={loading || pending !== null} onClick={() => {
          setLoading(true); setRevision((value) => value + 1);
        }}>{t('marketplace.refreshOwned')}</Button>
      </div>
      {error && <p role="alert">{t('marketplace.ownedError')}</p>}
      {loading ? <p role="status">{t('common.loading')}</p> : data && (
        <>
          {data.agents.length === 0 && <p className="mt-3">{t('marketplace.ownedEmpty')}</p>}
          <ul className="mt-3 space-y-2">
            {data.agents.map((agent) => (
              <li key={agent.id} className="flex items-center justify-between gap-4">
                <span>{agent.name} — {t(agent.published ? 'marketplace.published' : 'marketplace.privateAgent')}</span>
                {agent.published && <Button variant="outline" disabled={pending !== null}
                  onClick={() => withdraw(agent.id)}>{t('marketplace.withdraw')}</Button>}
              </li>
            ))}
          </ul>
          {data.pagination.totalPages > 1 && <div className="mt-3 flex items-center gap-3">
            <Button disabled={page <= 1 || pending !== null} onClick={() => { setLoading(true); setPage(page - 1); }}>
              {t('marketplace.previousPage')}
            </Button>
            <span>{page} / {data.pagination.totalPages}</span>
            <Button disabled={page >= data.pagination.totalPages || pending !== null} onClick={() => { setLoading(true); setPage(page + 1); }}>
              {t('marketplace.nextPage')}
            </Button>
          </div>}
        </>
      )}
    </section>
  );
}
