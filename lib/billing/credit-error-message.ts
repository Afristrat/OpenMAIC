import {
  containsInsufficientCredits,
  INSUFFICIENT_CREDITS_CODE,
} from '@/lib/billing/insufficient-credits';

/** Clé i18n (fr-FR, ar-MA, en-US) qui explique qu'une action est suspendue faute de solde. */
export const CREDITS_BLOCKED_I18N_KEY = 'billing.credits.consumptionBlocked';

type Translate = (key: string) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Vrai pour la réponse d'une route de consommation refusée faute de solde : corps JSON
 * `{ errorCode }` ou évènement de flux `{ code }`.
 */
export function isInsufficientCreditsPayload(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    (payload.errorCode === INSUFFICIENT_CREDITS_CODE || payload.code === INSUFFICIENT_CREDITS_CODE)
  );
}

/**
 * Message à montrer à l'utilisateur : l'explication traduite pour un solde épuisé, sinon le
 * message brut du serveur, sinon le repli fourni par l'appelant.
 */
export function resolveErrorMessage(payload: unknown, t: Translate, fallback: string): string {
  if (isInsufficientCreditsPayload(payload)) return t(CREDITS_BLOCKED_I18N_KEY);
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error) {
    return payload.error;
  }
  return fallback;
}

/**
 * Données d'un évènement `error` de flux SSE : le message brut, et le code stable quand
 * l'échec vient d'un solde épuisé, pour que le client affiche l'explication traduite.
 */
export function streamErrorData(error: unknown): { message: string; code?: string } {
  const message = error instanceof Error ? error.message : String(error);
  return containsInsufficientCredits(error)
    ? { message, code: INSUFFICIENT_CREDITS_CODE }
    : { message };
}

/** Échec côté client d'un appel de consommation refusé faute de solde. */
export class CreditsBlockedError extends Error {
  constructor() {
    super(INSUFFICIENT_CREDITS_CODE);
    this.name = 'CreditsBlockedError';
  }
}

/**
 * Message d'une exception interceptée : l'explication traduite quand l'appel a été refusé faute
 * de solde, sinon le message de repli que l'appelant aurait affiché.
 */
export function creditsAwareMessage(error: unknown, t: Translate, fallback: string): string {
  return error instanceof CreditsBlockedError ? t(CREDITS_BLOCKED_I18N_KEY) : fallback;
}

/**
 * Lit le corps d'une réponse d'erreur et lève CreditsBlockedError quand il porte le code de solde
 * épuisé. Sans effet sinon : le corps n'est consommé que sur un clone.
 */
export async function throwIfCreditsBlocked(response: Response): Promise<void> {
  if (response.status !== 402) return;
  const payload: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (isInsufficientCreditsPayload(payload)) throw new CreditsBlockedError();
}
