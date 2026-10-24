import { assertCreditsAvailable } from '@/lib/billing/credit-preflight';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';

const log = createLogger('CreditGate');

/**
 * Pré-contrôle avant de créer un job de génération : un solde sous la réservation
 * d'un seul appel LLM ne peut mener qu'à un échec, autant le dire avant de partir.
 * La base reste l'autorité : si la lecture du solde échoue, la génération n'est pas
 * bloquée (la réservation tranchera) et l'incident est journalisé.
 */
export async function rejectIfInsufficientCredits(orgId: string): Promise<Response | null> {
  try {
    await assertCreditsAvailable(orgId);
    return null;
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return apiError(
        'INSUFFICIENT_CREDITS',
        402,
        'INSUFFICIENT_CREDITS',
        JSON.stringify({
          balanceMicrounits: error.balanceMicrounits,
          requiredMicrounits: error.requiredMicrounits,
        }),
      );
    }
    const divergence = error instanceof Error && /divergence/i.test(error.message);
    (divergence ? log.error : log.warn).call(
      log,
      `Credit pre-check unavailable for ${orgId}; the reservation will decide:`,
      error,
    );
    return null;
  }
}
