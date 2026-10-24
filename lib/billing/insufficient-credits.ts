/**
 * Code stable de l'erreur « solde du tenant insuffisant ». Postgres lève
 * INSUFFICIENT_TENANT_CREDITS (00053, post_tenant_credit_entry) ; l'application
 * le traduit en INSUFFICIENT_CREDITS, que les jobs persistent et que l'interface
 * explique dans la langue de l'auteur.
 */
export const INSUFFICIENT_CREDITS_CODE = 'INSUFFICIENT_CREDITS';

const POSTGRES_MESSAGE = /INSUFFICIENT_TENANT_CREDITS/;
const MAX_CAUSE_DEPTH = 6;

export class InsufficientCreditsError extends Error {
  readonly code = INSUFFICIENT_CREDITS_CODE;
  readonly balanceMicrounits?: number;
  readonly requiredMicrounits?: number;

  constructor(
    message = 'INSUFFICIENT_TENANT_CREDITS',
    amounts?: { balanceMicrounits: number; requiredMicrounits: number },
  ) {
    super(message);
    this.balanceMicrounits = amounts?.balanceMicrounits;
    this.requiredMicrounits = amounts?.requiredMicrounits;
    this.name = 'InsufficientCreditsError';
  }
}

export function isInsufficientCreditsMessage(message: string | undefined): boolean {
  return typeof message === 'string' && POSTGRES_MESSAGE.test(message);
}

/** Parcourt message, code, cause et AggregateError : les enveloppes du SDK perdent souvent le texte d'origine. */
export function containsInsufficientCredits(error: unknown, depth = 0): boolean {
  if (depth > MAX_CAUSE_DEPTH || typeof error !== 'object' || error === null) {
    return typeof error === 'string' && isInsufficientCreditsMessage(error);
  }
  if (error instanceof InsufficientCreditsError) return true;
  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string' && isInsufficientCreditsMessage(record.message)) {
    return true;
  }
  if (containsInsufficientCredits(record.cause, depth + 1)) return true;
  return (
    Array.isArray(record.errors) &&
    record.errors.some((inner) => containsInsufficientCredits(inner, depth + 1))
  );
}
