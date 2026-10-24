'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCredits, type CreditStatusView } from '@/lib/billing/credit-status-view';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Solde insuffisant (alerte, annoncée tout de suite) ou solde bas (statut, discret).
 * Le bouton de revérification permet de reprendre après une recharge sans recharger la page.
 */
export function CreditStatusNotice({
  id = 'credit-status-notice',
  status,
  onRecheck,
  rechecking = false,
}: {
  id?: string;
  status: CreditStatusView | null;
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const { t, locale } = useI18n();
  if (!status || (!status.blocked && !status.lowBalance)) return null;

  const params = {
    balance: formatCredits(status.balanceCredits, locale),
    required: formatCredits(status.minimumRequiredCredits ?? 0, locale),
  };
  return (
    <div
      role={status.blocked ? 'alert' : 'status'}
      id={id}
      data-testid="credit-status-notice"
      className="flex w-full items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="flex-1">
        {status.blocked
          ? t('billing.credits.insufficient', params)
          : t('billing.credits.low', params)}
      </p>
      {onRecheck && (
        <Button type="button" variant="outline" size="sm" onClick={onRecheck} disabled={rechecking}>
          <RefreshCw className="me-2 size-3.5" aria-hidden="true" />
          {t('billing.credits.recheck')}
        </Button>
      )}
    </div>
  );
}
