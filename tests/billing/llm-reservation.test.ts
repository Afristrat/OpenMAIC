import { describe, expect, it } from 'vitest';
import {
  DEFAULT_METERED_MAX_OUTPUT_TOKENS,
  INPUT_TOKEN_ESTIMATE_SLACK,
  clampToReservedQuantity,
  estimateMaxInputTokens,
  resolveMeteredMaxOutputTokens,
} from '@/lib/billing/llm-reservation';

// Débit mesuré en production (973 appels réglés) : sortie max 14 855 jetons, entrée max 27 195.
// Taux plateforme : 400 microcrédits par jeton de sortie, 95 par jeton d'entrée.
const OUTPUT_MICROCREDITS = 400;
const INPUT_MICROCREDITS = 95;
const WALLET_MICROCREDITS = 22_013_390;

describe('réservation LLM réaliste', () => {
  it('ne réserve plus le pire cas de 32 768 jetons de sortie', () => {
    expect(DEFAULT_METERED_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(16_384);
    expect(DEFAULT_METERED_MAX_OUTPUT_TOKENS).toBeGreaterThan(14_855);
  });

  it("borne l'entrée par les octets sérialisés (un jeton couvre au moins un octet), sans doubler", () => {
    expect(estimateMaxInputTokens(45_000)).toBe(45_000 + INPUT_TOKEN_ESTIMATE_SLACK);
    expect(estimateMaxInputTokens(0)).toBe(INPUT_TOKEN_ESTIMATE_SLACK);
  });

  it('le cas du 2026-10-24 (requête de 45 ko) tient dans un solde de 22,01 crédits (11,6 crédits réservés contre 22,5 auparavant)', () => {
    const reserved =
      estimateMaxInputTokens(45_000) * INPUT_MICROCREDITS +
      DEFAULT_METERED_MAX_OUTPUT_TOKENS * OUTPUT_MICROCREDITS;
    expect(reserved).toBeLessThan(WALLET_MICROCREDITS * 0.6);
  });

  it('respecte un plafond de sortie explicite de l’appelant, sans le relever', () => {
    expect(resolveMeteredMaxOutputTokens(2_048)).toBe(2_048);
  });

  it('borne la fenêtre de sortie du modèle que les appelants transmettent (32 768 ou 128 000)', () => {
    expect(resolveMeteredMaxOutputTokens(32_768)).toBe(DEFAULT_METERED_MAX_OUTPUT_TOKENS);
    expect(resolveMeteredMaxOutputTokens(128_000)).toBe(DEFAULT_METERED_MAX_OUTPUT_TOKENS);
  });

  it('valeur par défaut quand rien n’est demandé', () => {
    expect(resolveMeteredMaxOutputTokens(undefined)).toBe(DEFAULT_METERED_MAX_OUTPUT_TOKENS);
  });

  it('ignore une valeur invalide', () => {
    expect(resolveMeteredMaxOutputTokens(0)).toBe(DEFAULT_METERED_MAX_OUTPUT_TOKENS);
    expect(resolveMeteredMaxOutputTokens(Number.NaN)).toBe(DEFAULT_METERED_MAX_OUTPUT_TOKENS);
  });

  it('plafonne le règlement à la quantité réservée sans jamais la dépasser', () => {
    expect(clampToReservedQuantity(100, 500)).toEqual({ quantity: 100, clamped: false });
    expect(clampToReservedQuantity(900, 500)).toEqual({ quantity: 500, clamped: true });
  });
});
