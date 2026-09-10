'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

const pageSchema = z.object({
  success: z.literal(true),
  agents: z.array(z.object({ id: z.string(), name: z.string() })).max(50),
  nextCursor: z.string().nullable(),
});
export function RecoverableTenantAgents({
  orgId,
  onChange,
}: {
  orgId: string;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  async function load() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/marketplace/agents/recoverable?orgId=${orgId}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error();
      const page = pageSchema.parse(await response.json());
      if (page.nextCursor !== null && page.nextCursor === cursor) throw new Error();
      setAgents((current) => (cursor ? [...current, ...page.agents] : page.agents));
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  async function reclaim(id: string) {
    setPending(true);
    setError(false);
    try {
      const response = await fetch('/api/marketplace/agents/recoverable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, agentId: id }),
      });
      const result = await response.json();
      if (
        !response.ok ||
        result.success !== true ||
        result.reclaimed !== true ||
        result.agentId !== id
      )
        throw new Error();
      setAgents((current) => current.filter((agent) => agent.id !== id));
      onChange();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mb-4 rounded-lg border p-4" aria-label={t('marketplace.recoverableTitle')}>
      <h2 className="font-semibold">{t('marketplace.recoverableTitle')}</h2>
      <p className="my-2 text-sm">{t('marketplace.recoverableHint')}</p>
      <Button variant="outline" disabled={pending} onClick={load}>
        {t('catalog.loadOrphaned')}
      </Button>
      {error && <p role="alert">{t('marketplace.ownedError')}</p>}
      {loaded && agents.length === 0 && <p>{t('marketplace.recoverableEmpty')}</p>}
      <ul className="mt-3 space-y-2">
        {agents.map((agent) => (
          <li key={agent.id} className="flex items-center justify-between gap-3">
            <span>{agent.name}</span>
            <Button disabled={pending} onClick={() => reclaim(agent.id)}>
              {t('catalog.reclaim')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
