'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';

type MemberRow = {
  userId: string;
  nickname: string | null;
  role: string;
  capCredits: number | null;
  spentCredits: number;
};

type Status = 'idle' | 'saving' | 'saved' | 'saveFailed' | 'invalid';

function parseCap(value: string): number | null | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function toInputs(members: MemberRow[]): Record<string, string> {
  return Object.fromEntries(
    members.map((m) => [m.userId, m.capCredits === null ? '' : String(m.capCredits)]),
  );
}

/** Répartition du solde commun : un plafond mensuel par membre, fixé par l'administrateur. */
export function MemberCreditLimits({ orgId }: { orgId: string }): React.ReactElement {
  const { locale, t } = useI18n();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [splitTotal, setSplitTotal] = useState('');
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const endpoint = `/api/organizations/${encodeURIComponent(orgId)}/credit-limits`;

  const apply = useCallback((members: MemberRow[]) => {
    setRows(members);
    setCaps(toInputs(members));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('credit-limits');
      const body = (await response.json()) as { members?: MemberRow[] };
      apply(body.members ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [endpoint, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const split = (): void => {
    const total = parseCap(splitTotal);
    if (total === null || total === undefined || rows.length === 0) {
      setStatus('invalid');
      return;
    }
    const share = String(Math.floor((total / rows.length) * 100) / 100);
    setCaps(Object.fromEntries(rows.map((m) => [m.userId, share])));
    setStatus('idle');
  };

  const save = async (): Promise<void> => {
    const limits = rows.map((m) => ({
      userId: m.userId,
      capCredits: parseCap(caps[m.userId] ?? ''),
    }));
    if (limits.some((l) => l.capCredits === undefined)) {
      setStatus('invalid');
      return;
    }
    setStatus('saving');
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits }),
      });
      if (!response.ok) throw new Error('credit-limits-save');
      const body = (await response.json()) as { members?: MemberRow[] };
      apply(body.members ?? []);
      setStatus('saved');
    } catch {
      setStatus('saveFailed');
    }
  };

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <section className="mb-10 rounded-lg border bg-card p-6" aria-label={t('org.limits.title')}>
      <div className="mb-2 flex items-center gap-2">
        <Gauge className="h-5 w-5" />
        <h2 className="text-lg font-semibold">{t('org.limits.title')}</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('org.limits.help')}</p>
      {failed ? (
        <p className="text-sm text-destructive">{t('org.limits.loadFailed')}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">{t('org.limits.splitTotal')}</span>
              <Input
                inputMode="decimal"
                value={splitTotal}
                onChange={(event) => setSplitTotal(event.target.value)}
                className="w-40"
              />
            </label>
            <Button type="button" variant="outline" onClick={split}>
              {t('org.limits.split')}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-muted-foreground">
                  <th className="pb-2 font-medium">{t('org.limits.member')}</th>
                  <th className="pb-2 font-medium">{t('org.role')}</th>
                  <th className="pb-2 font-medium">{t('org.limits.spent')}</th>
                  <th className="pb-2 font-medium">{t('org.limits.cap')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((member) => {
                  const name = member.nickname ?? member.userId.slice(0, 8);
                  return (
                    <tr key={member.userId}>
                      <td className="py-3">{name}</td>
                      <td className="py-3">{t(`org.${member.role}`)}</td>
                      <td className="py-3 font-mono">
                        {number.format(member.spentCredits)} {t('org.credits.unit')}
                      </td>
                      <td className="py-3">
                        <Input
                          inputMode="decimal"
                          aria-label={`${t('org.limits.cap')} ${name}`}
                          placeholder={t('org.limits.unlimited')}
                          value={caps[member.userId] ?? ''}
                          onChange={(event) => {
                            setCaps((current) => ({
                              ...current,
                              [member.userId]: event.target.value,
                            }));
                            setStatus('idle');
                          }}
                          className="w-40"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={status === 'saving'}>
              {t('org.limits.save')}
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {status === 'saved' && t('org.limits.saved')}
              {status === 'saveFailed' && t('org.limits.saveFailed')}
              {status === 'invalid' && t('org.limits.invalid')}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
