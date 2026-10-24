import { containsInsufficientCredits } from '@/lib/billing/insufficient-credits';
import { apiError } from '@/lib/server/api-response';

/**
 * Réponse stable d'une route de consommation (chat, voix, médias, génération unitaire) dont
 * l'appel a été refusé faute de solde : 402 et code INSUFFICIENT_CREDITS, jamais une erreur
 * générique. Renvoie null pour toute autre erreur, que l'appelant traite comme avant.
 */
export function creditsErrorResponse(error: unknown): Response | null {
  return containsInsufficientCredits(error) ? insufficientCreditsResponse() : null;
}

/** La même réponse 402, pour les routes qui apprennent le blocage par un rapport plutôt que par une exception. */
export function insufficientCreditsResponse(): Response {
  return apiError('INSUFFICIENT_CREDITS', 402, 'INSUFFICIENT_CREDITS');
}
