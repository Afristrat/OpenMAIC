import { describe, expect, it } from 'vitest';
import {
  MULTIMODAL_PART_TOKEN_ALLOWANCE,
  TOOL_SCHEMA_FALLBACK_BYTES,
  DEFAULT_METERED_MAX_OUTPUT_TOKENS,
  INPUT_TOKEN_ESTIMATE_SLACK,
  clampToReservedQuantity,
  estimateMaxInputTokens,
  resolveMeteredMaxOutputTokens,
  serializeRequestForReservation,
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

  it('ajoute les schémas d’outils et un forfait par partie multimodale à la borne d’entrée', () => {
    const base = estimateMaxInputTokens(10_000);
    expect(estimateMaxInputTokens(10_000, { toolSchemaBytes: 3_000 })).toBe(base + 3_000);
    expect(estimateMaxInputTokens(10_000, { multimodalParts: 2 })).toBe(
      base + 2 * MULTIMODAL_PART_TOKEN_ALLOWANCE,
    );
    expect(TOOL_SCHEMA_FALLBACK_BYTES).toBeGreaterThan(0);
  });
});

describe("sérialisation d'une requête pour la réservation", () => {
  const imageRequest = (image: unknown) => ({
    system: 'Vérifie la cohérence.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Narration' },
          { type: 'image', image },
        ],
      },
    ],
  });

  it("ne compte pas les octets d'une image comme du texte (une capture de 100 Ko ne réserve pas 40 crédits)", () => {
    for (const image of [
      Buffer.alloc(100_000, 7),
      new Uint8Array(100_000),
      `data:image/png;base64,${'A'.repeat(130_000)}`,
    ]) {
      const serialized = serializeRequestForReservation(imageRequest(image));
      expect(serialized.length).toBeLessThan(500);
      expect(serialized).toContain('Narration');
    }
  });

  it("garde sa taille entière à un texte qui commence par data: ou qui imite la forme d'un Buffer", () => {
    const longText = `data: ${'x'.repeat(50_000)}`;
    expect(
      serializeRequestForReservation({
        messages: [{ role: 'user', content: [{ type: 'text', text: longText }] }],
      }).length,
    ).toBeGreaterThan(50_000);
    expect(
      serializeRequestForReservation({
        messages: [{ role: 'user', content: longText }],
        metadata: { type: 'Buffer', data: new Array(20_000).fill(1) },
      }).length,
    ).toBeGreaterThan(50_000);
  });

  it("ne touche qu'au champ image des parties de type image", () => {
    const file = { type: 'file', data: 'A'.repeat(30_000), mediaType: 'application/pdf' };
    const serialized = serializeRequestForReservation({
      messages: [{ role: 'user', content: [file] }],
    });
    expect(serialized.length).toBeGreaterThan(30_000);
    expect(serializeRequestForReservation({ text: 'Bonjour' })).toBe('{"text":"Bonjour"}');
  });
});
