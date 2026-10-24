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

/** Forfait de jetons d'entrée par partie multimodale (image, fichier, audio), au-delà des octets sérialisés. */
export const MULTIMODAL_PART_TOKEN_ALLOWANCE = 8192;

/** Octets comptés pour un outil dont le schéma ne se sérialise pas : borne prudente, jamais zéro. */
export const TOOL_SCHEMA_FALLBACK_BYTES = 4096;

/**
 * Borne supérieure prudente de l'entrée : un jeton couvre au moins un octet, donc les octets du
 * prompt système, de l'historique et des schémas d'outils sérialisés bornent leurs jetons, et
 * chaque partie multimodale reçoit un forfait documenté.
 */
export function estimateMaxInputTokens(
  serializedByteLength: number,
  extras: { toolSchemaBytes?: number; multimodalParts?: number } = {},
): number {
  return (
    serializedByteLength +
    (extras.toolSchemaBytes ?? 0) +
    (extras.multimodalParts ?? 0) * MULTIMODAL_PART_TOKEN_ALLOWANCE +
    INPUT_TOKEN_ESTIMATE_SLACK
  );
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

/**
 * DÉCISION D'AMINE (2026-10-24, SOP-015) : le règlement est plafonné à la quantité réservée, sans
 * débit complémentaire. Risque accepté : si l'estimation d'entrée est inférieure à la facturation
 * réelle du fournisseur, la différence n'est pas débitée. Raison : une formation déjà générée peut
 * voir son accès bloqué, car les usages (chat, voix, médias) consomment aussi des crédits et
 * s'arrêtent quand le solde est épuisé. Chaque dépassement est compté par tenant
 * (reservation-overruns.ts). Déclencheur de réexamen : dépassements fréquents d'un même tenant.
 * Une génération déjà payée au fournisseur ne doit pas échouer parce que la mesure dépasse l'estimation.
 */
export function clampToReservedQuantity(
  actual: number,
  reserved: number,
): { quantity: number; clamped: boolean } {
  return actual > reserved
    ? { quantity: reserved, clamped: true }
    : { quantity: actual, clamped: false };
}
