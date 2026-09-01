'use client';

import { useCallback, useEffect, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

type CreditEntry = {
  id: string;
  entry_type: 'allocation' | 'debit' | 'refund' | 'correction';
  delta_microunits: number | string;
  billable_unit: string | null;
  quantity: number | string | null;
  reason: string;
  created_at: string;
};

export function TenantCreditLedger({ orgId }: { orgId: string }): React.ReactElement {
  const { locale, t } = useI18n();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/billing/credits?orgId=${encodeURIComponent(orgId)}`);
      if (!response.ok) throw new Error('credit-ledger');
      const body = (await response.json()) as {
        balanceCredits?: number;
        entries?: CreditEntry[];
      };
      setBalance(body.balanceCredits ?? 0);
      setEntries(body.entries ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  return (
    <section className="mb-10 rounded-lg border bg-card p-6" aria-label={t('org.credits.title')}>
      <div className="mb-4 flex items-center gap-2">
        <WalletCards className="h-5 w-5" />
        <h2 className="text-lg font-semibold">{t('org.credits.title')}</h2>
        <span className="ms-auto text-lg font-semibold">
          {number.format(balance)} {t('org.credits.unit')}
        </span>
      </div>
      {failed ? (
        <p className="text-sm text-destructive">{t('org.credits.loadFailed')}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('org.credits.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="pb-2 font-medium">{t('org.credits.date')}</th>
                <th className="pb-2 font-medium">{t('org.credits.type')}</th>
                <th className="pb-2 font-medium">{t('org.credits.reason')}</th>
                <th className="pb-2 text-end font-medium">{t('org.credits.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-3">{new Date(entry.created_at).toLocaleDateString(locale)}</td>
                  <td className="py-3">{t(`org.credits.entry.${entry.entry_type}`)}</td>
                  <td className="py-3">{entry.reason}</td>
                  <td className="py-3 text-end font-mono">
                    {number.format(Number(entry.delta_microunits) / 1_000_000)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
