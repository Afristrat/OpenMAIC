/** Vue client du solde : types, lecture de la réponse 402 et formatage, sans import serveur. */
export type CreditStatusView = {
  balanceCredits: number;
  enforcementEnabled: boolean;
  blocked: boolean;
  lowBalance: boolean;
  minimumRequiredCredits: number | null;
  lowBalanceThresholdCredits: number | null;
};

export function formatCredits(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const MICROUNITS_PER_CREDIT = 1_000_000;

/** Montants portés par la réponse 402 du pré-contrôle serveur, en crédits ; null si ce n'est pas cette erreur. */
export function readInsufficientCredits(body: unknown): {
  balanceCredits: number | null;
  requiredCredits: number | null;
} | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as { errorCode?: unknown; details?: unknown };
  if (record.errorCode !== 'INSUFFICIENT_CREDITS') return null;
  let amounts: { balanceMicrounits?: unknown; requiredMicrounits?: unknown } = {};
  if (typeof record.details === 'string') {
    try {
      amounts = JSON.parse(record.details);
    } catch {
      amounts = {};
    }
  }
  const toCredits = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value / MICROUNITS_PER_CREDIT : null;
  return {
    balanceCredits: toCredits(amounts.balanceMicrounits),
    requiredCredits: toCredits(amounts.requiredMicrounits),
  };
}
