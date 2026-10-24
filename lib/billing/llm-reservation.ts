/**
 * Dimensionnement de la réservation de crédits d'un appel LLM.
 *
 * Une réservation doit rester une borne supérieure vraie de la consommation
 * (le règlement refuse une quantité supérieure à la réservation), mais pas un
 * pire cas théorique : le 2026-10-24, 32 768 jetons de sortie plus deux fois
 * les octets de la requête réservaient environ 22,5 crédits pour 0,7 à 1,1
 * consommé, et refusaient un tenant doté de 22,01 crédits.
 */

// Mesure de production sur 973 appels réglés : sortie max 14 855 jetons (p99 5 465),
// entrée max 27 195. 16 384 couvre le maximum observé et la sortie est effectivement
// plafonnée à cette valeur chez le fournisseur (max_tokens), donc la borne reste vraie.
const FALLBACK_MAX_OUTPUT_TOKENS = 16_384;

function readConfiguredMaxOutputTokens(): number {
  const raw = Number(process.env.METERED_DEFAULT_MAX_OUTPUT_TOKENS);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : FALLBACK_MAX_OUTPUT_TOKENS;
}

export const DEFAULT_METERED_MAX_OUTPUT_TOKENS: number = readConfiguredMaxOutputTokens();

/** Marge fixe pour les définitions d'outils et l'enveloppe du protocole, absentes du texte sérialisé. */
export const INPUT_TOKEN_ESTIMATE_SLACK = 8192;

/** Un jeton couvre au moins un octet : les octets sérialisés bornent l'entrée sans les doubler. */
export function estimateMaxInputTokens(serializedByteLength: number): number {
  return serializedByteLength + INPUT_TOKEN_ESTIMATE_SLACK;
}

/**
 * Les appelants passent la fenêtre de sortie du modèle (32 768 pour kimi-k2.6, 128 000 pour
 * d'autres) : c'est cette valeur, et non le défaut, qui a produit la réservation de 22,5
 * crédits du 2026-10-24. Toute demande est donc bornée au plafond mesuré, et le même plafond
 * est transmis au fournisseur pour que la réservation reste une borne vraie.
 */
export function resolveMeteredMaxOutputTokens(requested: number | undefined): number {
  return typeof requested === 'number' && Number.isFinite(requested) && requested > 0
    ? Math.min(requested, DEFAULT_METERED_MAX_OUTPUT_TOKENS)
    : DEFAULT_METERED_MAX_OUTPUT_TOKENS;
}

/** Une génération déjà payée au fournisseur ne doit pas échouer parce que la mesure dépasse l'estimation. */
export function clampToReservedQuantity(
  actual: number,
  reserved: number,
): { quantity: number; clamped: boolean } {
  return actual > reserved
    ? { quantity: reserved, clamped: true }
    : { quantity: actual, clamped: false };
}
