import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Comparaison de secrets en temps constant. Les deux valeurs sont d'abord condensées en
 * SHA-256 pour obtenir des longueurs égales (exigence de `timingSafeEqual`) sans révéler la
 * longueur du secret attendu.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
